import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertTaskSchema,
  insertNotificationSchema,
  insertUserMetricsSchema,
  insertAiInsightSchema,
  insertUserAppLinkSchema,
  InsertTask,
} from "../shared/schema";
import {
  analyzeNotification,
  optimizeWorkflow,
  generateWellnessInsights,
  analyzeNotificationForTask,
  analyzeEmailForMultipleTasks,
} from "./openai";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { smartScheduler } from "./scheduler";
import { taskNotificationScheduler } from "./notificationScheduler";
import nodemailer from 'nodemailer';
import cookieParser from 'cookie-parser';
import {
  generateTokens,
  verifyToken,
  hashPassword,
  verifyPassword,
  authenticateToken,
  optionalAuth,
  setAuthCookies,
  clearAuthCookies,
  rateLimitAuth,
  trackFailedAuth,
  type AuthenticatedRequest
} from "./auth";

// Store connected user email addresses per session - with proper user isolation
const userEmails = new Map<string, string>();

// Store processed email IDs per user to prevent duplicates - with proper user isolation
const processedEmailIds = new Map<string, Set<string>>();

// Define the redirect URI for Google OAuth
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://flowhub-production-409c.up.railway.app/auth/gmail/callback';

export async function registerRoutes(app: Express): Promise<Server> {
  // Add cookie parser middleware
  app.use(cookieParser());

  // Authentication routes
  app.post('/auth/register', rateLimitAuth(), async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, and password are required'
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Hash password and create user
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword,
      });

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name
      });

      // Set HTTP-only cookies
      setAuthCookies(res, accessToken, refreshToken);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          profileImageUrl: user.profileImageUrl
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to register user'
      });
    }
  });

  app.post('/auth/login', rateLimitAuth(), async (req, res) => {
    try {
      const { email, password } = req.body;
      const ip = req.ip || req.connection.remoteAddress || 'unknown';

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Special demo login
      if (email === 'demo@flowhub.com' && !password) {
        let demoUser = await storage.getUserByEmail('demo@flowhub.com');
        if (!demoUser) {
          // Create demo user if it doesn't exist
          demoUser = await storage.createUser({
            id: 'demo-user',
            name: 'Demo User',
            email: 'demo@flowhub.com',
            role: 'user'
          });
        }

        const { accessToken, refreshToken } = generateTokens({
          id: demoUser.id,
          email: demoUser.email,
          name: demoUser.name
        });

        setAuthCookies(res, accessToken, refreshToken);

        return res.json({
          success: true,
          message: 'Demo login successful',
          user: {
            id: demoUser.id,
            name: demoUser.name,
            email: demoUser.email,
            role: demoUser.role,
            profileImageUrl: demoUser.profileImageUrl
          }
        });
      }

      // Regular login
      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        trackFailedAuth(ip);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      const isValidPassword = await verifyPassword(password, user.password);
      if (!isValidPassword) {
        trackFailedAuth(ip);
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name
      });

      // Set HTTP-only cookies
      setAuthCookies(res, accessToken, refreshToken);

      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          profileImageUrl: user.profileImageUrl
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to login'
      });
    }
  });

  app.post('/auth/logout', (req, res) => {
    clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.post('/auth/refresh', async (req, res) => {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ success: false, message: 'Refresh token required' });
      }

      const decoded = verifyToken(refreshToken);
      if (!decoded || decoded.type !== 'refresh') {
        return res.status(403).json({ success: false, message: 'Invalid refresh token' });
      }

      const user = await storage.getUser(decoded.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name
      });

      // Set new HTTP-only cookies
      setAuthCookies(res, accessToken, newRefreshToken);

      res.json({ success: true, message: 'Tokens refreshed successfully' });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ success: false, message: 'Failed to refresh token' });
    }
  });

  app.get('/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Get fresh user data from database
    const freshUser = await storage.getUser(req.user.id);
    if (!freshUser) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Parse name into first and last name
    const nameParts = (freshUser.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    res.json({
      user: {
        id: freshUser.id,
        name: freshUser.name,
        email: freshUser.email,
        role: freshUser.role || null,
        profileImageUrl: freshUser.profileImageUrl || null,
        profilePicture: freshUser.profileImageUrl || null,
        firstName,
        lastName
      }
    });
  });

  // Add API version of auth endpoints for frontend
  app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      // Clear any stale data for unauthorized requests
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Get fresh user data from database with strict user ID matching
    const freshUser = await storage.getUser(req.user.id);
    if (!freshUser) {
      // Clear user data if user not found
      clearUserData(req.user.id);
      return res.status(401).json({ message: 'User not found' });
    }

    // Parse name into first and last name
    const nameParts = (freshUser.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    res.json({
      user: {
        id: freshUser.id,
        name: freshUser.name,
        email: freshUser.email,
        role: freshUser.role || null,
        profileImageUrl: freshUser.profileImageUrl || null,
        profilePicture: freshUser.profileImageUrl || null,
        firstName,
        lastName
      }
    });
  });

  // Profile update endpoint
  app.put('/api/auth/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      const { firstName, lastName, email, profilePicture } = req.body;

      // Build update object with only provided fields
      const updates: Partial<any> = {};

      // Handle name updates - always combine first and last name if either is provided
      if (firstName !== undefined || lastName !== undefined) {
        const newName = [firstName || '', lastName || ''].filter(Boolean).join(' ').trim();
        if (newName) {
          updates.name = newName;
        }
      }

      if (email !== undefined && email.trim()) {
        updates.email = email.trim();
      }

      if (profilePicture !== undefined) {
        updates.profileImageUrl = profilePicture;
      }

      // Only update if there are actual changes
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      console.log('Updating user profile:', req.user.id, updates);
      const updatedUser = await storage.updateUser(req.user.id, updates);
      console.log('Profile updated successfully:', updatedUser);

      // Parse the updated name for response
      const nameParts = (updatedUser.name || '').split(' ');
      const firstName_response = nameParts[0] || '';
      const lastName_response = nameParts.slice(1).join(' ') || '';

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          profileImageUrl: updatedUser.profileImageUrl,
          profilePicture: updatedUser.profileImageUrl,
          firstName: firstName_response,
          lastName: lastName_response
        }
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      });
    }
  });
  // Waitlist join endpoint - no authentication required
  app.post('/api/waitlist/join', async (req, res) => {
    try {
      const { userEmail, plan } = req.body;

      // Use provided email or fallback
      const submittingEmail = userEmail || 'demo@flowhub.com';
      const submittingPlan = plan || 'professional';

      console.log(`[Waitlist] New signup: ${submittingEmail} for ${submittingPlan} plan`);

      // Always log waitlist signup for debugging
      console.log('=== NEW WAITLIST SIGNUP ===');
      console.log(`User Email: ${submittingEmail}`);
      console.log(`Requested Plan: ${submittingPlan}`);
      console.log(`Timestamp: ${new Date().toISOString()}`);
      console.log('===========================');

      // Try to send email notification if configured, but don't fail if it doesn't work
      try {
        if (process.env.GMAIL_APP_PASSWORD) {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: 'chavanuday407@gmail.com',
              pass: process.env.GMAIL_APP_PASSWORD
            }
          });

          const mailOptions = {
            from: 'chavanuday407@gmail.com',
            to: 'chavanuday407@gmail.com',
            subject: 'FlowHub Premium Upgrade Request',
            html: `
              <h2>New Premium Upgrade Request</h2>
              <p><strong>User Email:</strong> ${submittingEmail}</p>
              <p><strong>Requested Plan:</strong> ${submittingPlan}</p>
              <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
              <br>
              <p>Please follow up with this user for premium upgrade.</p>
            `,
            text: `
              New Premium Upgrade Request
              User Email: ${submittingEmail}
              Requested Plan: ${submittingPlan}
              Timestamp: ${new Date().toISOString()}
              Please follow up with this user for premium upgrade.
            `
          };

          await transporter.sendMail(mailOptions);
          console.log('Waitlist email sent successfully');
        }
      } catch (emailError) {
        console.error('Waitlist email sending failed (non-critical):', emailError);
      }

      res.json({ 
        success: true, 
        message: 'Successfully joined waitlist' 
      });
    } catch (error) {
      console.error('Waitlist signup error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to join waitlist' 
      });
    }
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // User routes
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get user AI tasks limit
  app.get("/api/users/:id/ai-tasks-limit", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;

      // Ensure user can only access their own data or is admin
      if (req.user?.id !== userId && req.user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const limitData = await storage.checkAiTaskLimit(userId);
      res.json(limitData);
    } catch (error) {
      console.error("Error fetching AI tasks limit:", error);
      res.status(500).json({ message: "Failed to fetch AI tasks limit" });
    }
  });

  // Task routes with authentication
  app.get("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const requestedUserId = req.query.userId as string;
      const authenticatedUserId = req.user?.id;

      // Ensure user can only access their own tasks
      if (!authenticatedUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // If userId provided in query, verify it matches authenticated user
      if (requestedUserId && requestedUserId !== authenticatedUserId) {
        return res.status(403).json({ message: "Access denied: can only access your own tasks" });
      }

      const userId = authenticatedUserId; // Always use authenticated user ID
      const tasks = await storage.getUserTasks(userId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const taskData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(taskData);

      // Schedule reminders for the new task
      await taskNotificationScheduler.scheduleTaskReminders(task);

      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const updates = req.body;
      const task = await storage.updateTask(req.params.id, updates);

      // If due date was updated, reschedule reminders
      if (updates.dueAt) {
        taskNotificationScheduler.removeTaskReminders(req.params.id);
        await taskNotificationScheduler.scheduleTaskReminders(task);
      }

      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.post("/api/tasks/:id/start", async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.id, {
        status: "in_progress" as any,
        startedAt: new Date(),
      });

      // Trigger smart rescheduling when starting a task
      try {
        await smartScheduler.rescheduleUserTasks(task.userId);
      } catch (scheduleError) {
        // Auto-rescheduling failed, but task started successfully
      }

      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to start task" });
    }
  });

  app.post("/api/tasks/:id/stop", async (req, res) => {
    try {
      // Calculate actual minutes spent on task
      const existingTask = await storage.getTaskById(req.params.id);
      let actualMinutes = undefined;

      if (existingTask?.startedAt) {
        const startTime = new Date(existingTask.startedAt);
        const endTime = new Date();
        actualMinutes = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      }

      const task = await storage.updateTask(req.params.id, {
        status: "completed" as any,
        completedAt: new Date(),
        actualMinutes,
      });

      // Remove reminders for completed task
      taskNotificationScheduler.removeTaskReminders(req.params.id);

      // Trigger smart rescheduling after task completion
      try {
        const reschedulingResult = await smartScheduler.rescheduleUserTasks(task.userId, req.params.id);

        // Create AI insight about the rescheduling if tasks were rescheduled
        if (reschedulingResult.rescheduledTasks.length > 0) {
          await storage.createAiInsight({
            userId: task.userId,
            type: "task_rescheduling",
            title: "Tasks Auto-Rescheduled",
            description: `Completed task influenced rescheduling of ${reschedulingResult.rescheduledTasks.length} upcoming tasks. ${reschedulingResult.insights.join(' ')}`,
            priority: "normal" as any,
            metadata: {
              rescheduledTasks: reschedulingResult.rescheduledTasks,
              completedTaskId: req.params.id,
              timeSaved: reschedulingResult.totalTimeSaved
            },
          });
        }
      } catch (scheduleError) {
        // Auto-rescheduling failed, but task completed successfully
      }

      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "Failed to stop task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      await storage.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Create task manually without AI

  // Create task from natural language input
  app.post("/api/tasks/create-from-text", async (req, res) => {
    try {
      const { userId, naturalLanguageInput } = req.body;

      if (!userId || !naturalLanguageInput) {
        return res.status(400).json({ message: "userId and naturalLanguageInput are required" });
      }

      // Check AI task limits before proceeding
      const limitCheck = await storage.checkAiTaskLimit(userId);
      if (!limitCheck.withinLimit) {
        return res.status(429).json({
          message: "AI task limit exceeded",
          error: "PLAN_LIMIT_EXCEEDED",
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          planType: limitCheck.planType,
          upgradeRequired: true
        });
      }

      // Try AI analysis first (wait for it to complete)
      let aiAnalysis;
      try {
        aiAnalysis = await analyzeNotificationForTask({
          title: naturalLanguageInput,
          description: naturalLanguageInput,
          sourceApp: "manual"
        });
      } catch (error) {
        console.error("AI analysis failed:", error);
        // Continue with fallback if AI fails
      }

      // Use AI results if available, otherwise use fallback
      const taskData: InsertTask = {
        userId,
        title: aiAnalysis?.title || naturalLanguageInput.slice(0, 60).trim() || "New Task",
        description: aiAnalysis?.description || naturalLanguageInput,
        priority: (aiAnalysis?.priority as any) || "important",
        status: "pending" as any,
        estimatedMinutes: aiAnalysis?.estimatedMinutes || 30,
        dueAt: aiAnalysis?.dueAt || null,
        sourceApp: "manual" as any,
        metadata: {
          aiGenerated: !!aiAnalysis?.title, // True if AI provided a title
          originalInput: naturalLanguageInput,
          manuallyCreated: true,
          processingAI: false, // Processing is complete
          ...(aiAnalysis && { aiAnalysis })
        }
      };

      const task = await storage.createAiTaskWithLimit(taskData);
      if (!task) {
        return res.status(429).json({
          message: "AI task limit exceeded",
          error: "PLAN_LIMIT_EXCEEDED",
          upgradeRequired: true,
        });
      }

      // Schedule reminders for the task
      await taskNotificationScheduler.scheduleTaskReminders(task);

      console.log(`Task ${task.id} created with AI analysis: ${task.title}`);

      // Return success with the completed task (AI-processed or fallback)
      res.json({ success: true, task });

    } catch (error) {
      console.error("Task creation error:", error);
      res.status(500).json({ message: "Failed to create task from natural language" });
    }
  });

  // Convert notification to task using Gemini AI
  app.post("/api/notifications/:id/convert-to-task", async (req, res) => {
    try {
      const notificationId = req.params.id;
      const notification = await storage.getNotificationById(notificationId);

      if (!notification) {
        return res.status(404).json({ message: "Notification not found" });
      }

      // Check AI task limits before proceeding
      const limitCheck = await storage.checkAiTaskLimit(notification.userId);
      if (!limitCheck.withinLimit) {
        return res.status(429).json({
          message: "AI task limit exceeded",
          error: "PLAN_LIMIT_EXCEEDED",
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          planType: limitCheck.planType,
          upgradeRequired: true
        });
      }

      // Use full email content from notification metadata if available
      const fullContent = notification.metadata?.fullEmailContent || notification.description;

      // NEW: Use multi-task analysis to detect multiple deadlines in emails
      const taskAnalyses = await analyzeEmailForMultipleTasks({
        title: notification.title,
        description: fullContent || undefined,
        sourceApp: notification.sourceApp || undefined
      });

      console.log(`[SingleConversion] Found ${taskAnalyses.length} tasks from email analysis`);

      // Create multiple tasks if multiple deadlines detected
      const createdTasks = [];
      for (const [index, aiAnalysis] of taskAnalyses.entries()) {
        // Force urgent priority for tasks from priority person emails
        const finalPriority = notification.metadata?.isPriorityPerson ? "urgent" : aiAnalysis.priority;

        const taskData: InsertTask = {
          userId: notification.userId,
          title: aiAnalysis.title,
          description: fullContent || aiAnalysis.description, // Use full content as description
          priority: finalPriority as any,
          status: "pending" as any,
          estimatedMinutes: aiAnalysis.estimatedMinutes,
          dueAt: aiAnalysis.dueAt,
          sourceApp: notification.sourceApp as any,
          metadata: {
            sourceNotificationId: notification.id,
            aiGenerated: true,
            originalContent: fullContent,
            emailSubject: notification.metadata?.emailSubject,
            emailFrom: notification.metadata?.emailFrom,
            emailDate: notification.metadata?.emailDate,
            multiTask: taskAnalyses.length > 1,
            taskIndex: index + 1,
            totalTasks: taskAnalyses.length,
            isPriorityPerson: notification.metadata?.isPriorityPerson || false
          }
        };

        const task = await storage.createAiTaskWithLimit(taskData);
        if (!task) {
          // stop further creations and return 429 with partial results
          return res.status(429).json({
            message: "AI task limit exceeded",
            error: "PLAN_LIMIT_EXCEEDED",
            createdTasks,
            upgradeRequired: true,
          });
        }
        createdTasks.push(task);

        // Schedule reminders for each task
        await taskNotificationScheduler.scheduleTaskReminders(task);
      }

      // Create email conversion tracking record for Emails Converted page BEFORE dismissing
      if (notification.sourceApp === "gmail") {
        const taskTitles = createdTasks.map(t => t.title).join(", ");
        const taskDescription = createdTasks.length > 1
          ? `Email split into ${createdTasks.length} tasks: ${taskTitles}`
          : `Email converted to task: ${createdTasks[0].title}`;

        await storage.createNotification({
          userId: notification.userId,
          title: `Email converted: ${notification.title}`,
          description: taskDescription,
          type: "email_converted",
          sourceApp: "system",
          aiSummary: `Email from ${notification.metadata?.emailFrom || 'unknown sender'} converted to ${createdTasks.length} task(s)`,
          actionableInsights: ["View in tasks", "Edit task", "Mark complete"],
          metadata: {
            sourceNotificationId: notification.id,
            taskIds: createdTasks.map(t => t.id),
            convertedAt: new Date().toISOString(),
            from: notification.metadata?.emailFrom,
            subject: notification.title,
            originalEmailId: notification.metadata?.emailId,
            originalContent: fullContent,
            tasksCount: createdTasks.length,
            taskTitles: taskTitles
          }
        });
      }

      // Dismiss the original notification since it's been converted to task
      await storage.dismissNotification(notificationId);

      res.json({
        success: true,
        tasks: createdTasks,
        tasksCount: createdTasks.length,
        multiTask: createdTasks.length > 1
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to convert notification to task" });
    }
  });

  // Batch convert multiple notifications to tasks
  app.post("/api/notifications/batch-convert-to-tasks", async (req, res) => {
    try {
      const { userId, notifications } = req.body;

      if (!notifications || !Array.isArray(notifications)) {
        return res.status(400).json({ message: "Invalid notifications array" });
      }

      // Check AI task limits before proceeding with batch conversion
      const limitCheck = await storage.checkAiTaskLimit(userId);
      if (!limitCheck.withinLimit) {
        return res.status(429).json({
          message: "AI task limit exceeded",
          error: "PLAN_LIMIT_EXCEEDED",
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          planType: limitCheck.planType,
          upgradeRequired: true
        });
      }

      console.log(`[BatchProcessing] Converting ${notifications.length} notifications to tasks for user ${userId}`);

      const createdTasks = [];
      const errors = [];

      // Process notifications in parallel batches of 5 to avoid overwhelming AI
      const batchSize = 5;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);

        const batchPromises = batch.map(async (notificationData: any) => {
          try {
            const notification = await storage.getNotificationById(notificationData.id);
            if (!notification) {
              errors.push({ id: notificationData.id, error: "Notification not found" });
              return null;
            }

            // Use full email content from notification metadata if available
            const fullContent = notification.metadata?.fullEmailContent || notification.description;

            // Use AI analysis for batch processing
            const aiAnalysis = await analyzeNotificationForTask({
              title: notification.title,
              description: fullContent || undefined,
              sourceApp: notification.sourceApp || undefined
            });

            // Force urgent priority for tasks from priority person emails
            const finalPriority = notification.metadata?.isPriorityPerson ? "urgent" : aiAnalysis.priority;

            // Create task from AI analysis, preserving full email content
            const taskData: InsertTask = {
              userId: notification.userId,
              title: aiAnalysis.title,
              description: fullContent || aiAnalysis.description, // Use full content as description
              priority: finalPriority as any,
              status: "pending" as any,
              estimatedMinutes: aiAnalysis.estimatedMinutes,
              dueAt: aiAnalysis.dueAt,
              sourceApp: notification.sourceApp as any,
              metadata: {
                sourceNotificationId: notification.id,
                aiGenerated: true,
                batchProcessed: true,
                originalContent: fullContent,
                emailSubject: notification.metadata?.emailSubject,
                emailFrom: notification.metadata?.emailFrom,
                emailDate: notification.metadata?.emailDate,
                isPriorityPerson: notification.metadata?.isPriorityPerson || false,
                ...notificationData.metadata
              }
            };

            // Use transactional function to reserve capacity and create task atomically
            const task = await storage.createAiTaskWithLimit(taskData);
            if (!task) {
              errors.push({ id: notificationData.id, error: "AI task limit exceeded" });
              return null;
            }

            // Schedule reminders for batch-converted task
            await taskNotificationScheduler.scheduleTaskReminders(task);

            // Create email conversion tracking record for batch-converted emails BEFORE dismissing
            if (notification.sourceApp === "gmail") {
              await storage.createNotification({
                userId: notification.userId,
                title: `Email converted: ${notification.title}`,
                description: `Batch converted email to task: ${aiAnalysis.title}`,
                type: "email_converted",
                sourceApp: "system",
                aiSummary: `Email from ${notification.metadata?.emailFrom || 'unknown sender'} batch converted to task`,
                actionableInsights: ["View in tasks", "Edit task", "Mark complete"],
                metadata: {
                  sourceNotificationId: notification.id,
                  taskId: task.id,
                  convertedAt: new Date().toISOString(),
                  from: notification.metadata?.emailFrom,
                  subject: notification.title,
                  originalEmailId: notification.metadata?.emailId,
                  batchProcessed: true,
                  originalContent: fullContent,
                  taskTitle: aiAnalysis.title,
                  taskDescription: aiAnalysis.description
                }
              });
            }

            // Dismiss the original notification since it's been converted to task
            await storage.dismissNotification(notification.id);

            return task;
          } catch (error) {
            console.error(`Error processing notification ${notificationData.id}:`, error);
            errors.push({ id: notificationData.id, error: error.message });
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        createdTasks.push(...batchResults.filter(task => task !== null));
      }

      console.log(`[BatchProcessing] Successfully converted ${createdTasks.length}/${notifications.length} notifications to tasks`);

      res.json({
        success: true,
        tasksCreated: createdTasks.length,
        totalNotifications: notifications.length,
        tasks: createdTasks,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Batch conversion error:", error);
      res.status(500).json({ message: "Failed to batch convert notifications to tasks" });
    }
  });

  // Notification routes with authentication
  app.get("/api/notifications", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const requestedUserId = req.query.userId as string;
      const authenticatedUserId = req.user?.id;

      // Ensure user can only access their own notifications
      if (!authenticatedUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // If userId provided in query, verify it matches authenticated user
      if (requestedUserId && requestedUserId !== authenticatedUserId) {
        return res.status(403).json({ message: "Access denied: can only access your own notifications" });
      }

      const userId = authenticatedUserId; // Always use authenticated user ID
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const type = req.query.type as string;

      let notifications = await storage.getUserNotifications(userId, limit);

      // Filter by type if provided (e.g., type=email_converted)
      if (type) {
        notifications = notifications.filter(n => n.type === type);
      }

      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(notificationData);
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  app.post("/api/notifications/analyze", async (req, res) => {
    try {
      const { title, content, sourceApp, userId } = req.body;

      if (!title || !content || !sourceApp || !userId) {
        return res.status(400).json({
          message: "title, content, sourceApp, and userId are required"
        });
      }

      const analysis = await analyzeNotification(title, content, sourceApp);

      // Create notification with AI analysis
      const notification = await storage.createNotification({
        userId,
        title,
        description: content,
        type: analysis.priority,
        sourceApp: sourceApp as any,
        aiSummary: analysis.summary,
        actionableInsights: analysis.actionableInsights,
      });

      res.json({ notification, analysis });
    } catch (error) {
      res.status(500).json({ message: "Failed to analyze notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/:id/dismiss", async (req, res) => {
    try {
      await storage.dismissNotification(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to dismiss notification" });
    }
  });

  // Bulk delete notifications for Emails Converted page
  app.post('/api/notifications/bulk-delete', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid request format' });
      }

      for (const id of ids) {
        await storage.dismissNotification(id);
      }

      res.json({ success: true, deletedCount: ids.length });
    } catch (error) {
      console.error('Error bulk deleting notifications:', error);
      res.status(500).json({ error: 'Failed to delete notifications' });
    }
  });

  // Retrieve emails back to notification section
  app.post('/api/notifications/retrieve-emails', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid request format' });
      }

      const retrievedEmails = [];

      for (const id of ids) {
        // Get the converted email notification
        const convertedEmail = await storage.getNotificationById(id);
        if (!convertedEmail) continue;

        // Create a new notification in the notification feed with original email data
        const originalNotification = await storage.createNotification({
          userId: convertedEmail.userId,
          title: convertedEmail.metadata?.subject || convertedEmail.title,
          description: convertedEmail.metadata?.originalContent || convertedEmail.description,
          type: "urgent",
          sourceApp: "gmail",
          aiSummary: `Retrieved email from: ${convertedEmail.metadata?.from || 'unknown sender'}`,
          actionableInsights: ["Convert to task", "Mark as read"],
          metadata: {
            emailId: convertedEmail.metadata?.originalEmailId || `retrieved-${Date.now()}`,
            from: convertedEmail.metadata?.from,
            subject: convertedEmail.metadata?.subject || convertedEmail.title,
            retrievedFromConverted: true,
            retrievedAt: new Date().toISOString()
          }
        });

        // Dismiss the converted email record
        await storage.dismissNotification(id);

        retrievedEmails.push(originalNotification);
      }

      res.json({ success: true, retrievedCount: retrievedEmails.length, emails: retrievedEmails });
    } catch (error) {
      console.error('Error retrieving emails:', error);
      res.status(500).json({ error: 'Failed to retrieve emails' });
    }
  });

  // Connected Apps routes with authentication
  app.get("/api/connected-apps", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const requestedUserId = req.query.userId as string;
      const authenticatedUserId = req.user?.id;

      // Ensure user can only access their own connected apps
      if (!authenticatedUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // If userId provided in query, verify it matches authenticated user
      if (requestedUserId && requestedUserId !== authenticatedUserId) {
        return res.status(403).json({ message: "Access denied: can only access your own connected apps" });
      }

      const userId = authenticatedUserId; // Always use authenticated user ID
      const apps = await storage.getUserConnectedApps(userId);
      res.json(apps);
    } catch (error) {
      // Error fetching connected apps
      res.status(500).json({ message: "Failed to fetch connected apps" });
    }
  });

  // User Usage Analytics endpoint for plan limits
  app.get("/api/usage", async (req, res) => {
    try {
      const userId = req.query.userId as string || "demo-user";
      const limitCheck = await storage.checkAiTaskLimit(userId);

      res.json({
        currentCount: limitCheck.currentCount,
        limit: limitCheck.limit,
        planType: limitCheck.planType,
        withinLimit: limitCheck.withinLimit,
        remainingTasks: Math.max(0, limitCheck.limit - limitCheck.currentCount),
        usagePercentage: Math.round((limitCheck.currentCount / limitCheck.limit) * 100)
      });
    } catch (error) {
      console.error("Error fetching user usage:", error);
      res.status(500).json({ message: "Failed to fetch usage data" });
    }
  });

  // Time Saved Analytics endpoint
  app.get("/api/analytics/time-saved", async (req, res) => {
    try {
      const userId = req.query.userId as string || "demo-user";

      // Get all tasks and notifications for analytics
      const tasks = await storage.getUserTasks(userId);
      const notifications = await storage.getUserNotifications(userId);

      // Calculate statistics
      const emailConversions = notifications.filter(n =>
        n.sourceApp === "gmail" && n.metadata?.convertedFromEmail
      ).length;

      const naturalLanguageTasks = tasks.filter(t =>
        t.metadata?.aiGenerated || t.sourceApp === "manual"
      ).length;

      const urgentTasksHandled = tasks.filter(t => t.priority === "urgent").length;
      const completedTasks = tasks.filter(t => t.status === "completed").length;

      // Calculate estimated time saved (conservative estimates)
      // These calculations are based on assumptions and can be refined.
      // For example, time saved from AI tasks could be based on average manual task completion time.
      const emailTimeSaved = emailConversions * 5; // Estimated 5 minutes saved per email conversion
      const nlTimeSaved = naturalLanguageTasks * 3; // Estimated 3 minutes saved per natural language task creation
      const priorityTimeSaved = urgentTasksHandled * 10; // Estimated 10 minutes saved per urgent task handled proactively

      const totalTimeSavedMinutes = emailTimeSaved + nlTimeSaved + priorityTimeSaved;

      const stats = {
        totalEmailsConverted: emailConversions,
        totalTasksCreatedFromNaturalLanguage: naturalLanguageTasks,
        totalTimeSavedMinutes,
        conversionBreakdown: {
          emailConversions,
          naturalLanguageConversions: naturalLanguageTasks,
          urgentTasksHandled,
          completedTasks
        }
      };

      res.json(stats);
    } catch (error) {
      console.error("Error calculating time saved stats:", error);
      res.status(500).json({ message: "Failed to fetch time saved analytics" });
    }
  });

  // User Metrics routes
  app.get("/api/metrics", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const date = req.query.date ? new Date(req.query.date as string) : undefined;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const metrics = await storage.getUserMetrics(userId, date);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  app.post("/api/metrics", async (req, res) => {
    try {
      const metricsData = insertUserMetricsSchema.parse(req.body);
      const metrics = await storage.createUserMetrics(metricsData);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to create metrics" });
    }
  });

  // AI Insights routes
  app.get("/api/ai-insights", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const insights = await storage.getUserAiInsights(userId, limit);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch AI insights" });
    }
  });

  app.post("/api/workflow/optimize", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      // Get user's pending tasks
      const tasks = await storage.getTasksByStatus(userId, "pending");

      const taskData = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description || "",
        priority: task.priority || "normal",
        estimatedMinutes: task.estimatedMinutes || 30,
        dueAt: task.dueAt?.toISOString(),
      }));

      const optimization = await optimizeWorkflow(taskData, new Date());

      // Apply the optimized priorities to the tasks
      for (const optimizedTask of optimization.optimizedTasks) {
        await storage.updateTask(optimizedTask.taskId, {
          priority: optimizedTask.newPriority as any,
        });
      }

      // Create AI insights about the optimization
      await storage.createAiInsight({
        userId,
        type: "workflow_optimization",
        title: "Workflow Optimized",
        description: `AI has intelligently reorganized ${optimization.optimizedTasks.length} tasks. ${optimization.insights.join(' ')} Estimated time saving: ${optimization.estimatedTimeSaving} minutes.`,
        priority: "high" as any,
        metadata: {
          optimizedTasks: optimization.optimizedTasks,
          insights: optimization.insights,
          timeSaving: optimization.estimatedTimeSaving
        },
      });

      res.json({
        success: true,
        message: `Successfully optimized ${optimization.optimizedTasks.length} tasks`,
        ...optimization
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to optimize workflow" });
    }
  });

  // Auto-reschedule tasks based on completion patterns and system time
  app.post("/api/workflow/auto-reschedule", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const reschedulingResult = await smartScheduler.rescheduleUserTasks(userId);

      // Create AI insights about the rescheduling
      if (reschedulingResult.rescheduledTasks.length > 0) {
        await storage.createAiInsight({
          userId,
          type: "smart_rescheduling",
          title: "Smart Task Rescheduling Applied",
          description: `Auto-rescheduled ${reschedulingResult.rescheduledTasks.length} tasks based on your work patterns and current system time. ${reschedulingResult.insights.join(' ')}`,
          priority: "normal" as any,
          metadata: {
            rescheduledTasks: reschedulingResult.rescheduledTasks,
            timeSaved: reschedulingResult.totalTimeSaved
          },
        });
      }

      res.json({
        success: true,
        message: reschedulingResult.rescheduledTasks.length > 0
          ? `Successfully rescheduled ${reschedulingResult.rescheduledTasks.length} tasks`
          : "No tasks needed rescheduling",
        ...reschedulingResult
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to auto-reschedule tasks" });
    }
  });

  app.post("/api/wellness/insights", async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const metrics = await storage.getUserMetrics(userId);

      if (!metrics) {
        return res.status(404).json({ message: "User metrics not found" });
      }

      const insights = await generateWellnessInsights({
        focusScore: metrics.focusScore || 0,
        workloadCapacity: metrics.workloadCapacity || 0,
        stressLevel: metrics.stressLevel || "low",
        activeHours: metrics.activeHours || 0,
        tasksCompleted: metrics.tasksCompleted || 0,
      });

      // Update metrics with new break recommendation
      await storage.updateUserMetrics(metrics.id, {
        nextBreakIn: insights.nextBreakRecommendation,
      });

      res.json(insights);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate wellness insights" });
    }
  });

  app.post("/api/ai-insights/:id/apply", async (req, res) => {
    try {
      await storage.applyAiInsight(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to apply AI insight" });
    }
  });

  app.post("/api/ai-insights/:id/dismiss", async (req, res) => {
    try {
      await storage.dismissAiInsight(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to dismiss AI insight" });
    }
  });



  // Priority Emails routes
  app.get("/api/priority-emails", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || "demo-user";
      const priorityEmails = await storage.getUserPriorityEmails(userId);
      res.json(priorityEmails);
    } catch (error) {
      console.error("Error fetching priority emails:", error);
      res.status(500).json({ message: "Failed to fetch priority emails" });
    }
  });

  app.post("/api/priority-emails", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { email } = req.body;
      const userId = req.user?.id || "demo-user";

      if (!email) {
        return res.status(400).json({ message: "email is required" });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      const priorityEmail = await storage.createPriorityEmail({
        userId,
        email: email.toLowerCase().trim()
      });

      res.json(priorityEmail);
    } catch (error) {
      console.error("Error creating priority email:", error);
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({ message: "This email is already in your priority list" });
      }
      res.status(500).json({ message: "Failed to create priority email" });
    }
  });

  app.delete("/api/priority-emails/:id", async (req, res) => {
    try {
      await storage.deletePriorityEmail(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting priority email:", error);
      res.status(500).json({ message: "Failed to delete priority email" });
    }
  });

  // Feedback route - no authentication required for demo
  app.post("/api/feedback/submit", async (req, res) => {
    try {
      const { userId, feedback, timestamp } = req.body;

      if (!feedback || feedback.trim().length < 10) {
        return res.status(400).json({ message: "Feedback must be at least 10 characters long" });
      }

      // Use provided userId or demo-user as fallback
      const submittingUserId = userId || "demo-user";
      const userEmail = userEmails.get(submittingUserId) || 'demo@flowhub.com';

      console.log(`[Feedback] Submitting feedback from user: ${submittingUserId}, email: ${userEmail}`);

      // Always log feedback to console for debugging
      console.log('=== NEW FEEDBACK RECEIVED ===');
      console.log(`User ID: ${submittingUserId}`);
      console.log(`User Email: ${userEmail}`);
      console.log(`Timestamp: ${timestamp}`);
      console.log(`Feedback: ${feedback}`);
      console.log('==========================');

      // Try to send feedback email if configured, but don't fail if it doesn't work
      try {
        if (process.env.GMAIL_APP_PASSWORD) {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: 'chavanuday407@gmail.com',
              pass: process.env.GMAIL_APP_PASSWORD
            }
          });

          const mailOptions = {
            from: 'chavanuday407@gmail.com',
            to: 'chavanuday407@gmail.com',
            replyTo: userEmail, // Allow direct reply to user
            subject: `New FlowHub Feedback from ${userEmail}`,
            html: `
              <h2>New Feedback from FlowHub User</h2>
              <p><strong>From:</strong> ${userEmail}</p>
              <p><strong>User ID:</strong> ${submittingUserId}</p>
              <p><strong>Timestamp:</strong> ${timestamp}</p>
              <br>
              <h3>Feedback:</h3>
              <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #007bff; margin: 10px 0;">
                ${feedback.replace(/\n/g, '<br>')}
              </div>
              <br>
              <p><em>Reply to this email to respond directly to ${userEmail}</em></p>
              <p><em>This feedback was submitted through the FlowHub feedback system.</em></p>
            `,
            text: `
              New Feedback from FlowHub User
              From: ${userEmail}
              User ID: ${submittingUserId}
              Timestamp: ${timestamp}
              Feedback: ${feedback}
              
              Reply to this email to respond directly to ${userEmail}
            `
          };

          await transporter.sendMail(mailOptions);
          console.log('Feedback email sent successfully');
        }
      } catch (emailError) {
        console.error('Email sending failed (non-critical):', emailError);
      }

      res.json({
        success: true,
        message: 'Feedback received successfully'
      });
    } catch (error) {
      console.error('Feedback submission error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to submit feedback' 
      });
    }
  });

  // User App Links routes
  app.get("/api/user-app-links", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      let links = await storage.getUserAppLinks(userId);

      // If no links exist for any user, create default ones
      if (links.length === 0) {
        const defaultAppLinks = [
          { userId: userId, name: 'GitHub', url: 'https://github.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg' },
          { userId: userId, name: 'Zoom', url: 'https://zoom.us', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/zoom.svg' },
          { userId: userId, name: 'Google', url: 'https://google.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/google.svg' },
          { userId: userId, name: 'Slack', url: 'https://slack.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg' },
          { userId: userId, name: 'Jira', url: 'https://atlassian.com/software/jira', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/jira.svg' },
          { userId: userId, name: 'Trello', url: 'https://trello.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/trello.svg' },
          { userId: userId, name: 'LinkedIn', url: 'https://linkedin.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg' },
        ];

        // Create all default app links
        for (const linkData of defaultAppLinks) {
          await storage.createUserAppLink(linkData);
        }

        // Fetch the newly created links
        links = await storage.getUserAppLinks(userId);
      }

      res.json(links);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user app links" });
    }
  });

  app.post("/api/user-app-links", async (req, res) => {
    try {
      const linkData = insertUserAppLinkSchema.parse(req.body);
      const link = await storage.createUserAppLink(linkData);
      res.json(link);
    } catch (error) {
      res.status(500).json({ message: "Failed to create user app link" });
    }
  });

  app.delete("/api/user-app-links/:id", async (req, res) => {
    try {
      await storage.deleteUserAppLink(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user app link" });
    }
  });

  // Gmail OAuth configuration
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID || "218067632703-he0j6m3595542fekbiue0g8hd1bci6m.apps.googleusercontent.com",
    process.env.GOOGLE_CLIENT_SECRET || "GOCSPX-IWTHxLW7qMj6kdlqmbTn6KeC8",
    GOOGLE_REDIRECT_URI
  );

  // Store user OAuth clients and intervals
  const userGmailClients = new Map<string, OAuth2Client>();
  const userGmailIntervals = new Map<string, NodeJS.Timeout>();

  // Helper function to clear user-specific data
  function clearUserData(userId: string) {
    userEmails.delete(userId);
    processedEmailIds.delete(userId);
    if (userGmailClients.has(userId)) {
      userGmailClients.delete(userId);
    }
    if (userGmailIntervals.has(userId)) {
      clearInterval(userGmailIntervals.get(userId));
      userGmailIntervals.delete(userId);
    }
  }

  // Gmail Integration routes
  app.post("/api/gmail/connect", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || "guest-user"; // Use authenticated user ID or guest

      // Generate OAuth URL for real Gmail API
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: userId, // Pass userId in state parameter
        prompt: 'consent'
      });

      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: "Failed to start Gmail connection" });
    }
  });

  // Real Gmail OAuth callback
  app.get("/auth/gmail/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        res.send(`
          <script>
            window.opener.postMessage({ success: false, error: '${error}' }, '*');
            window.close();
          </script>
        `);
        return;
      }

      if (!code || !state) {
        res.send(`
          <script>
            window.opener.postMessage({ success: false, error: 'Missing authorization code or state' }, '*');
            window.close();
          </script>
        `);
        return;
      }

      const userId = state as string;

      // Create a COMPLETELY FRESH OAuth2Client using google.auth.OAuth2 (not separately imported OAuth2Client)
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code as string);

      // Set credentials on the client
      oauth2Client.setCredentials(tokens);

      // Get the user's email from Google Profile using the authenticated client
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      // Create user client for long-term storage with the same tokens
      const userClient = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );
      userClient.setCredentials(tokens);
      const userEmail = profile.email || 'unknown@user.com';

      // Extract a proper name from the email
      const extractNameFromEmail = (email: string) => {
        const username = email.split('@')[0];
        // Convert dots and underscores to spaces and capitalize each word
        return username
          .replace(/[._]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      // Create unique user ID based on email to ensure each Google account gets its own user
      const uniqueUserId = `user-${Buffer.from(userEmail).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)}`;

      // Create or get the user based on their unique email and set authentication cookies
      let user = await storage.getUserByEmail(userEmail);
      const extractedName = profile.name || extractNameFromEmail(userEmail);

      if (!user) {
        user = await storage.createUser({
          id: uniqueUserId,
          name: extractedName,
          email: userEmail,
          role: 'user'
        });
      } else {
        // Always update user info on each login to keep it fresh
        user = await storage.updateUser(user.id, {
          name: extractedName
        });
      }

      // Store user client and email mappings ONLY for the current user
      userGmailClients.set(user.id, userClient);
      userEmails.set(user.id, userEmail); // Store the real connected email

      // Generate authentication tokens for the authenticated user
      const { accessToken, refreshToken } = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name
      });

      // Set HTTP-only cookies for authentication
      setAuthCookies(res, accessToken, refreshToken);

      console.log(`[Gmail] Starting email fetching for user: ${user.id}, email: ${userEmail}`);
      // Start fetching emails directly with authenticated user info
      startRealGmailFetching(user.id, userClient, userEmail);

      res.send(`
        <script>
          // Set authentication state and notify parent window
          localStorage.setItem('gmailConnected', 'true');
          localStorage.setItem('userEmail', '${userEmail}');
          localStorage.setItem('currentUserId', '${user.id}');
          localStorage.setItem('currentUserEmail', '${userEmail}');

          // Notify the parent window about successful authentication
          window.opener.postMessage({
            success: true,
            email: '${userEmail}',
            userId: '${user.id}',
            name: '${extractedName}',
            message: 'Gmail connected successfully!',
            authenticated: true,
            redirect: '/dashboard'
          }, '*');

          // Close popup and redirect parent to dashboard
          setTimeout(() => {
            window.opener.location.href = '/dashboard';
            window.close();
          }, 1000);
        </script>
      `);
    } catch (error) {
      console.error('Gmail OAuth callback error:', error);
      res.send(`
        <script>
          window.opener.postMessage({ success: false, error: 'OAuth callback failed' }, '*');
          window.close();
        </script>
      `);
    }
  });

  // Disconnect Gmail
  app.post("/api/gmail/disconnect", async (req, res) => {
    try {
      // Disconnect all Gmail connections for simplicity in demo
      const userIds = Array.from(userGmailClients.keys());

      userIds.forEach(userId => {
        userGmailClients.delete(userId);
        if (userGmailIntervals.has(userId)) {
          clearInterval(userGmailIntervals.get(userId));
          userGmailIntervals.delete(userId);
        }
      });

      res.json({ success: true, message: "Gmail disconnected successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to disconnect Gmail" });
    }
  });

  // Function to start real Gmail email fetching
  async function startRealGmailFetching(userId: string, authClient: OAuth2Client, userEmail: string) {

    let lastCheckTime = new Date();

    // Function to fetch and process unread emails
    const fetchUnreadEmails = async () => {
      try {
        console.log(`[Gmail] Fetching emails for user ${userId} (${userEmail})`);
        console.log(`[Gmail] Last check time: ${lastCheckTime.toISOString()}`);
        // Create a COMPLETELY FRESH OAuth2Client for each request to ensure proper auth headers
        const freshOAuth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          GOOGLE_REDIRECT_URI
        );

        // Get current credentials from stored client
        const currentAuthClient = userGmailClients.get(userId) || authClient;
        const credentials = currentAuthClient.credentials;

        // Ensure we have valid credentials
        if (!credentials.access_token) {
          return;
        }

        // Set fresh credentials on the new client
        freshOAuth2Client.setCredentials({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token,
          expiry_date: credentials.expiry_date,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/gmail.readonly'
        });

        // Create Gmail API instance with fresh authenticated client
        const gmail = google.gmail({ version: 'v1', auth: freshOAuth2Client });

        // Get ALL unread messages from primary inbox since last check (don't filter by priority)
        const query = `is:unread category:primary after:${Math.floor(lastCheckTime.getTime() / 1000)}`;

        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 20  // Increased to handle more emails
        });

        const messages = response.data.messages || [];
        console.log(`[Gmail] Found ${messages.length} unread messages`);

        for (const message of messages) {
          try {
            // Deduplicate based on message ID - check and add atomically
            if (!processedEmailIds.has(userId)) {
              processedEmailIds.set(userId, new Set());
            }
            if (processedEmailIds.get(userId)!.has(message.id)) {
              console.log(`[Gmail] Skipping already processed email: ${message.id}`);
              continue;
            }

            // Add to processed set immediately to prevent race conditions
            processedEmailIds.get(userId)!.add(message.id!);

            // Check if notification already exists with this email ID to prevent database duplicates
            const existingNotifications = await storage.getUserNotifications(userId, 100);
            const emailAlreadyExists = existingNotifications.some(notification =>
              notification.metadata?.emailId === message.id
            );

            if (emailAlreadyExists) {
              console.log(`[Gmail] Email notification already exists in database: ${message.id}`);
              continue;
            }

            // Get full message details
            const messageData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id!,
              format: 'full'
            });

            const msg = messageData.data;
            const headers = msg.payload?.headers || [];

            // Extract email details
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';

            // Get email body (simplified - gets first text part)
            let body = '';
            if (msg.payload?.body?.data) {
              body = Buffer.from(msg.payload.body.data, 'base64').toString();
            } else if (msg.payload?.parts) {
              const textPart = msg.payload.parts.find(part => part.mimeType === 'text/plain');
              if (textPart?.body?.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString();
              }
            }

            // Store both full and truncated body
            const truncatedBody = body.length > 200 ? body.substring(0, 200) + '...' : body;
            const fullEmailContent = `Subject: ${subject}\n\n${body}`;

            // Extract email address consistently for priority checking
            let fromEmail = from.toLowerCase().trim();

            // Try to extract email from angle brackets first (e.g., "Name <email@domain.com>")
            const emailMatch = from.match(/<([^>]+)>/);
            if (emailMatch) {
              fromEmail = emailMatch[1].toLowerCase().trim();
            } else if (from.includes('@')) {
              // If no angle brackets but contains @, extract the email part
              const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
              const match = from.match(emailRegex);
              if (match) {
                fromEmail = match[1].toLowerCase().trim();
              }
            }

            console.log(`[Gmail] Extracted email for priority check: "${fromEmail}" from "${from}"`);
            const isPriorityContact = await storage.isPriorityEmail(userId, fromEmail);
            console.log(`[Gmail] Priority check result: ${isPriorityContact} for email: ${fromEmail}`);

            // Use AI to analyze and determine priority
            let priority: "urgent" | "important" | "informational" = "informational";
            let isPriorityPerson = false;

            if (isPriorityContact) {
              priority = "urgent";
              isPriorityPerson = true;
              console.log(`[Gmail] Priority person detected: ${fromEmail} - setting priority to urgent`);
            } else {
              console.log(`[Gmail] Normal email from: ${fromEmail} - will analyze with AI`);
              try {
                const taskAnalysis = await analyzeNotificationForTask({
                  title: `New email from ${from}`,
                  description: `${subject}: ${body}`,
                  sourceApp: "gmail"
                });
                priority = taskAnalysis.priority as "urgent" | "important" | "informational";
              } catch (error) {
                console.log(`[Gmail] AI analysis failed for email from ${fromEmail}, using fallback logic`);
                // Fallback to simple keyword matching if AI fails
                const casualKeywords = ['hi', 'hello', 'hey', 'wassup', 'what\'s up', 'how are you', 'how r u', 'good morning', 'good afternoon', 'good evening', 'hangout', 'chat', 'let\'s play', 'game'];
                const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately', 'in 5 min', 'in 10 min', 'in 30 min'];
                const importantKeywords = ['important', 'meeting', 'deadline', 'review', 'approval', 'join', 'schedule', 'conference', 'call', 'in 1 hour', 'in 2 hours', 'in 3 hours', 'today', 'tomorrow'];

                const fullText = (subject + ' ' + body).toLowerCase();
                if (casualKeywords.some(keyword => fullText.includes(keyword))) {
                  priority = "informational";  // Use informational for casual messages (maps to normal in UI)
                } else if (urgentKeywords.some(keyword => fullText.includes(keyword))) {
                  priority = "urgent";
                } else if (importantKeywords.some(keyword => fullText.includes(keyword))) {
                  priority = "important";
                }
                console.log(`[Gmail] Fallback analysis result: ${priority} for email from ${fromEmail}`);
              }
            }

            console.log(`[Gmail] Creating notification for email: ${subject} from ${from} (Priority: ${priority}, isPriorityPerson: ${isPriorityPerson})`);

            // Create notification with full content in metadata - this should work for ALL emails
            await storage.createNotification({
              userId,
              title: `New email from ${from}`,
              description: `${subject}: ${truncatedBody}`,
              type: priority,
              sourceApp: "gmail",
              aiSummary: `Email from ${from} with subject: ${subject}`,
              metadata: {
                fullEmailContent,
                emailSubject: subject,
                emailFrom: from,
                emailDate: headers.find(h => h.name === 'Date')?.value || '', // Add date to metadata
                emailId: message.id, // Store email ID for deduplication
                isPriorityPerson: isPriorityPerson, // Mark if from priority contact
                priorityReason: isPriorityPerson ? "Priority Contact" : "Normal Email",
                fromEmail: fromEmail // Store extracted email for debugging
              },
              actionableInsights: ["Reply to email", "Mark as read", "Archive email"],
            });

            console.log(`[Gmail] Notification created successfully for ${fromEmail}`);

          } catch (msgError) {
            console.error(`[Gmail] Error processing message ${message.id}:`, msgError);
          }
        }

        // Update lastCheckTime only if emails were processed to avoid missing emails between fetches
        if (messages.length > 0) {
          lastCheckTime = new Date();
        }


      } catch (error) {
        // Error fetching Gmail

        // If token is expired, try to refresh
        if ((error as any)?.code === 401) {
          try {
            const refreshResponse = await authClient.refreshAccessToken();

            // Set the full credentials including access_token and refresh_token
            const newCredentials = {
              access_token: refreshResponse.credentials.access_token,
              refresh_token: refreshResponse.credentials.refresh_token,
              expiry_date: refreshResponse.credentials.expiry_date,
              token_type: 'Bearer',
              scope: 'https://www.googleapis.com/auth/gmail.readonly'
            };

            authClient.setCredentials(newCredentials);

            // Update the stored client with new credentials
            userGmailClients.set(userId, authClient);

            // Create a COMPLETELY FRESH Gmail API client with updated auth for retry
            const retryFreshOAuth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              GOOGLE_REDIRECT_URI
            );

            // Set the refreshed credentials on the new client
            retryFreshOAuth2Client.setCredentials(newCredentials);

            const refreshedGmail = google.gmail({ version: 'v1', auth: retryFreshOAuth2Client });

            // Try fetching again immediately with the refreshed client
            try {
              // Get ALL unread messages consistently in retry
              const retryQuery = `is:unread category:primary after:${Math.floor(lastCheckTime.getTime() / 1000)}`;
              const retryResponse = await refreshedGmail.users.messages.list({
                userId: 'me',
                q: retryQuery,
                maxResults: 20  // Increased to handle more emails
              });

              const retryMessages = retryResponse.data.messages || [];

              // Process any messages found in the retry
              for (const message of retryMessages) {
                // Deduplicate based on message ID
                if (!processedEmailIds.has(userId)) {
                  processedEmailIds.set(userId, new Set());
                }
                if (processedEmailIds.get(userId)!.has(message.id)) {
                  console.log(`[Gmail] Skipping already processed email during retry: ${message.id}`);
                  continue;
                }

                // Add to processed set immediately to prevent race conditions
                processedEmailIds.get(userId)!.add(message.id!);

                try {
                  // Check if notification already exists with this email ID
                  const existingNotifications = await storage.getUserNotifications(userId, 100);
                  const emailAlreadyExists = existingNotifications.some(notification =>
                    notification.metadata?.emailId === message.id
                  );

                  if (emailAlreadyExists) {
                    console.log(`[Gmail] Email notification already exists in database during retry: ${message.id}`);
                    continue;
                  }

                  const messageData = await refreshedGmail.users.messages.get({
                    userId: 'me',
                    id: message.id!,
                    format: 'full'
                  });

                  const msg = messageData.data;
                  const headers = msg.payload?.headers || [];

                  const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                  const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';

                  let body = '';
                  if (msg.payload?.body?.data) {
                    body = Buffer.from(msg.payload.body.data, 'base64').toString();
                  } else if (msg.payload?.parts) {
                    const textPart = msg.payload.parts.find(part => part.mimeType === 'text/plain');
                    if (textPart?.body?.data) {
                      body = Buffer.from(textPart.body.data, 'base64').toString();
                    }
                  }

                  const truncatedBody = body.length > 200 ? body.substring(0, 200) + '...' : body;

                  // Extract email address consistently for priority checking
                  let fromEmail = from.toLowerCase().trim();

                  // Try to extract email from angle brackets first (e.g., "Name <email@domain.com>")
                  const emailMatch = from.match(/<([^>]+)>/);
                  if (emailMatch) {
                    fromEmail = emailMatch[1].toLowerCase().trim();
                  } else if (from.includes('@')) {
                    // If no angle brackets but contains @, extract the email part
                    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
                    const match = from.match(emailRegex);
                    if (match) {
                      fromEmail = match[1].toLowerCase().trim();
                    }
                  }

                  console.log(`[Gmail] Extracted email for priority check (retry): "${fromEmail}" from "${from}"`);
                  const isPriorityContact = await storage.isPriorityEmail(userId, fromEmail);
                  console.log(`[Gmail] Priority check result (retry): ${isPriorityContact} for email: ${fromEmail}`);

                  let priority: "urgent" | "important" | "informational" = "informational";
                  let isPriorityPerson = false;

                  if (isPriorityContact) {
                    priority = "urgent";
                    isPriorityPerson = true;
                    console.log(`[Gmail] Priority person detected in retry: ${fromEmail} - setting priority to urgent`);
                  } else {
                    console.log(`[Gmail] Normal email in retry from: ${fromEmail} - will analyze with AI`);
                    try {
                      const taskAnalysis = await analyzeNotificationForTask({
                        title: `New email from ${from}`,
                        description: `${subject}: ${body}`,
                        sourceApp: "gmail"
                      });
                      priority = taskAnalysis.priority as "urgent" | "important" | "informational";
                    } catch (error) {
                      console.log(`[Gmail] AI analysis failed for email from ${fromEmail} during retry, using fallback logic`);
                      // Fallback to simple keyword matching if AI fails
                      const casualKeywords = ['hi', 'hello', 'hey', 'wassup', 'what\'s up', 'how are you', 'how r u', 'good morning', 'good afternoon', 'good evening', 'hangout', 'chat', 'let\'s play', 'game'];
                      const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately', 'in 5 min', 'in 10 min', 'in 30 min'];
                      const importantKeywords = ['important', 'meeting', 'deadline', 'review', 'approval', 'join', 'schedule', 'conference', 'call', 'in 1 hour', 'in 2 hours', 'in 3 hours', 'today', 'tomorrow'];

                      const fullText = (subject + ' ' + body).toLowerCase();
                      if (casualKeywords.some(keyword => fullText.includes(keyword))) {
                        priority = "informational";  // Use informational for casual messages (maps to normal in UI)
                      } else if (urgentKeywords.some(keyword => fullText.includes(keyword))) {
                        priority = "urgent";
                      } else if(importantKeywords.some(keyword => fullText.includes(keyword))) {
                        priority = "important";
                      }
                      console.log(`[Gmail] Fallback analysis result (retry): ${priority} for email from ${fromEmail}`);
                    }
                  }

                  console.log(`[Gmail] Creating notification for email during retry: ${subject} from ${from} (Priority: ${priority}, isPriorityPerson: ${isPriorityPerson})`);

                  await storage.createNotification({
                    userId,
                    title: `New email from ${from}`,
                    description: `${subject}: ${truncatedBody}`,
                    type: priority,
                    sourceApp: "gmail",
                    aiSummary: `Email from ${from} with subject: ${subject}`,
                    metadata: {
                      fullEmailContent: `Subject: ${subject}\n\n${body}`,
                      emailSubject: subject,
                      emailFrom: from,
                      emailDate: headers.find(h => h.name === 'Date')?.value || '', // Add date to metadata
                      emailId: message.id, // Store email ID for deduplication
                      isPriorityPerson: isPriorityPerson, // Mark if from priority contact
                      priorityReason: isPriorityPerson ? "Priority Contact" : "Normal Email",
                      fromEmail: fromEmail // Store extracted email for debugging
                    },
                    actionableInsights: ["Reply to email", "Mark as read", "Archive email"],
                  });

                  console.log(`[Gmail] Notification created successfully during retry for ${fromEmail}`);

                } catch (msgError) {
                  console.error(`[Gmail] Error processing message ${message.id} during retry:`, msgError);
                }
              }

              // Update lastCheckTime only if emails were processed in retry
              if (retryMessages.length > 0) {
                lastCheckTime = new Date();
              }

            } catch (retryError) {
              // Error in retry fetch after token refresh
            }

          } catch (refreshError) {
            // Failed to refresh token
            // Create a notification about the connection issue
            await storage.createNotification({
              userId,
              title: "Gmail Connection Lost",
              description: "Your Gmail connection has expired. Please reconnect to continue receiving email notifications.",
              type: "important",
              sourceApp: "gmail",
              aiSummary: "Gmail OAuth token expired",
              actionableInsights: ["Reconnect Gmail", "Check authentication"],
            });

            // Stop fetching for this user
            if (userGmailIntervals.has(userId)) {
              clearInterval(userGmailIntervals.get(userId));
              userGmailIntervals.delete(userId);
            }
            userGmailClients.delete(userId);
          }
        }
      }
    };

    // Initial fetch
    await fetchUnreadEmails();

    // Set up periodic fetching every 10 seconds
    const interval = setInterval(fetchUnreadEmails, 10000);
    userGmailIntervals.set(userId, interval);
  }

  const httpServer = createServer(app);
  return httpServer;
}
