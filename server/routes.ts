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
import { calendarService } from "./calendarService";
import { SecureTokenStorage } from "./tokenStorage";
import { Resend } from 'resend';
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

// Store processed email IDs per user with timestamps to allow reprocessing after time window
const processedEmailIds = new Map<string, Map<string, number>>();

// Store recent sender emails per user for smart deduplication (15 second window)
const processedSenderEmails = new Map<string, Map<string, number>>();

// Define the redirect URI for Google OAuth
// Railway provides RAILWAY_STATIC_URL or construct from environment
const getGoogleRedirectUri = () => {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  
  // Railway environment - use the static URL provided by Railway
  if (process.env.RAILWAY_STATIC_URL) {
    return `https://${process.env.RAILWAY_STATIC_URL}/auth/gmail/callback`;
  }
  
  // Fallback for development or other environments
  const host = process.env.HOST || '0.0.0.0';
  const port = process.env.PORT || '5000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  return `${protocol}://${host}:${port}/auth/gmail/callback`;
};

const GOOGLE_REDIRECT_URI = getGoogleRedirectUri();

export async function registerRoutes(app: Express): Promise<Server> {
  // Add cookie parser middleware
  app.use(cookieParser());

  // Fast Resend Email Service - No SMTP timeouts!
  const createResendClient = () => {
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.log('No RESEND_API_KEY configured');
      return null;
    }

    return new Resend(resendApiKey);
  };

  const sendNotificationEmail = async (subject: string, htmlContent: string, textContent: string) => {
    try {
      console.log('Attempting to send email via Resend...');
      console.log('Resend API configured:', !!process.env.RESEND_API_KEY);

      const resend = createResendClient();

      if (!resend) {
        console.log('No Resend API key configured. Logging notification instead.');
        console.log('=== EMAIL NOTIFICATION (NOT SENT) ===');
        console.log(`Subject: ${subject}`);
        console.log(`Content: ${textContent}`);
        console.log('====================================');
        return false;
      }

      console.log('Sending email via Resend with subject:', subject);

      const result = await resend.emails.send({
        from: process.env.FROM_EMAIL || 'chavanuday407@gmail.com',
        to: process.env.NOTIFICATION_EMAIL || 'chavanuday407@gmail.com',
        subject: subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`Email sent successfully via Resend: ${subject}`, result.data?.id);
      return true;
    } catch (error) {
      console.error(`Resend email sending failed for: ${subject}`);
      console.error('Error details:', error);

      // Log the notification content even if email fails
      console.log('=== EMAIL NOTIFICATION (FAILED TO SEND) ===');
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${textContent}`);
      console.log('==========================================');

      return false;
    }
  };

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

      // Create instant login notification for Windows notifications
      try {
        await storage.createNotification({
          userId: user.id,
          title: "🔔 FlowHub Login Successful",
          description: "Welcome back! Your Windows notifications are active and ready. You should see this notification in your Windows notification center.",
          type: "normal",
          sourceApp: "manual",
          aiSummary: "User login notification for Windows notification testing",
          actionableInsights: ["Check Windows notification center", "Notifications are working"],
          metadata: {
            taskId: `login-${Date.now()}`,
            reminderType: "login",
            sourceType: "system",
            browserNotification: true,
            loginNotification: true,
            timestamp: new Date().toISOString()
          }
        });
        console.log(`[Login] Created Windows notification for user: ${user.id}`);
      } catch (notificationError) {
        console.error('Failed to create login notification:', notificationError);
      }

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
  // Waitlist route removed - now using Google Forms directly

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Test notification endpoint
  app.post("/api/test-notification", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;

      await storage.createNotification({
        userId: userId,
        title: "🔔 Windows Notification Test",
        description: "This is a test notification to verify Windows notifications are working properly. You should see this in your Windows notification center.",
        type: "normal",
        sourceApp: "manual",
        aiSummary: "Test notification for Windows notification system verification",
        actionableInsights: ["Windows notifications are working", "Check notification center", "System is ready"],
        metadata: {
          taskId: `test-task-${Date.now()}`,
          reminderType: "test",
          sourceType: "manual",
          browserNotification: true,
          testNotification: true,
          timestamp: new Date().toISOString()
        }
      });

      console.log(`[TestNotification] Created test notification for user: ${userId}`);
      res.json({ success: true, message: "Test notification created successfully", userId });
    } catch (error) {
      console.error("Failed to create test notification:", error);
      res.status(500).json({ error: "Failed to create test notification" });
    }
  });

  // Test task deadline endpoint - creates a task with 2 minute deadline for testing
  app.post("/api/test-task-deadline", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.user.id;

      // Create a test task due in 2 minutes
      const dueAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now

      const task = await storage.createTask({
        userId: userId,
        title: "Test Deadline Task",
        description: "This is a test task to verify deadline notifications are working. It's due in 2 minutes.",
        priority: "urgent",
        status: "pending",
        estimatedMinutes: 30,
        dueAt: dueAt,
        sourceApp: "manual",
        metadata: {
          testTask: true,
          createdForTesting: true
        }
      });

      // Schedule reminders for this test task
      await taskNotificationScheduler.scheduleTaskReminders(task);

      console.log(`[TestTask] Created test task with deadline: ${task.title}, due at: ${dueAt.toISOString()}`);
      res.json({
        success: true,
        message: "Test task with 2-minute deadline created successfully",
        task: {
          id: task.id,
          title: task.title,
          dueAt: task.dueAt,
          timeUntilDue: "2 minutes"
        }
      });
    } catch (error) {
      console.error("Failed to create test task:", error);
      res.status(500).json({ error: "Failed to create test task" });
    }
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

  app.post("/api/tasks", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const task = insertTaskSchema.parse(req.body);
      const userId = req.user?.id || task.userId || "demo-user"; // Use authenticated user's ID
      const taskWithUser = { ...task, userId };

      const createdTask = await storage.createTask(taskWithUser);

      // Create calendar event if user has calendar connected and task has due date
      if (createdTask.dueAt && calendarService.hasUserClient(userId)) {
        try {
          const calendarEventId = await calendarService.createTaskEvent(createdTask);
          if (calendarEventId) {
            await storage.updateTask(createdTask.id, {
              metadata: {
                ...createdTask.metadata,
                calendarEventId
              }
            });
            console.log(`[Calendar] Created event for task: ${createdTask.title}`);
          }
        } catch (calendarError) {
          console.error("[Calendar] Failed to create event for task:", calendarError);
          // Continue without failing the task creation
        }
      }

      res.json(createdTask);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update task
  app.patch("/api/tasks/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.user?.id || updates.userId || "demo-user";

      // Verify task belongs to user
      const existingTask = await storage.getTaskById(id);
      if (!existingTask || existingTask.userId !== req.user?.id) {
        return res.status(404).json({ message: "Task not found or access denied" });
      }

      const updatedTask = await storage.updateTask(id, updates);
      if (!updatedTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Handle calendar event updates if user has calendar connected
      if (calendarService.hasUserClient(userId)) {
        const calendarEventId = existingTask.metadata?.calendarEventId;

        try {
          if (calendarEventId && updatedTask.dueAt) {
            // Update existing calendar event
            await calendarService.updateTaskEvent(updatedTask, calendarEventId);
            console.log(`[Calendar] Updated event for task: ${updatedTask.title}`);
          } else if (!calendarEventId && updatedTask.dueAt) {
            // Create new calendar event if task now has due date
            const newCalendarEventId = await calendarService.createTaskEvent(updatedTask);
            if (newCalendarEventId) {
              await storage.updateTask(updatedTask.id, {
                metadata: {
                  ...updatedTask.metadata,
                  calendarEventId: newCalendarEventId
                }
              });
              console.log(`[Calendar] Created new event for updated task: ${updatedTask.title}`);
            }
          } else if (calendarEventId && !updatedTask.dueAt) {
            // Delete calendar event if due date was removed
            await calendarService.deleteTaskEvent(userId, calendarEventId);
            await storage.updateTask(updatedTask.id, {
              metadata: {
                ...updatedTask.metadata,
                calendarEventId: undefined
              }
            });
            console.log(`[Calendar] Deleted event for task: ${updatedTask.title}`);
          }
        } catch (calendarError) {
          console.error("[Calendar] Failed to update calendar event:", calendarError);
          // Continue without failing the task update
        }
      }

      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/tasks/:id/start", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const task = await storage.updateTask(req.params.id, {
        status: "in_progress",
        startedAt: new Date(),
      });

      res.json(task);
    } catch (error) {
      console.error("Error starting task:", error);
      res.status(500).json({ message: "Failed to start task", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/tasks/:id/stop", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const task = await storage.getTaskById(id);
      if (!task || task.userId !== userId) {
        return res.status(404).json({ message: "Task not found or access denied" });
      }

      // Calculate actual minutes spent on task
      let actualMinutes = undefined;
      if (task.startedAt) {
        const startTime = new Date(task.startedAt);
        const endTime = new Date();
        actualMinutes = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60));
      }

      const completedTask = await storage.updateTask(id, {
        status: "completed",
        completedAt: new Date(),
        actualMinutes,
      });

      // Remove reminders for completed task
      taskNotificationScheduler.removeTaskReminders(req.params.id);

      // Delete calendar event for completed task
      const calendarEventId = task.metadata?.calendarEventId;
      if (calendarEventId) {
        try {
          const success = await calendarService.deleteTaskEvent(userId, calendarEventId);
          if (success) {
            console.log(`[TaskComplete] Deleted calendar event for completed task: ${task.title}`);
          }
        } catch (calendarError) {
          console.error("[TaskComplete] Failed to delete calendar event:", calendarError);
        }
      }

      

      res.json(completedTask);
    } catch (error) {
      console.error("Error stopping task:", error);
      res.status(500).json({ message: "Failed to stop task", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/tasks/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const taskId = req.params.id;
      const task = await storage.getTaskById(taskId);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      if (task.userId !== userId) {
        return res.status(403).json({ message: "Access denied: cannot delete tasks that do not belong to you" });
      }

      // Delete calendar event if it exists
      const calendarEventId = task.metadata?.calendarEventId;
      if (calendarEventId) {
        try {
          await calendarService.deleteTaskEvent(userId, calendarEventId);
          console.log(`[TaskDelete] Deleted calendar event for task: ${task.title}`);
        } catch (calendarError) {
          console.error("[TaskDelete] Failed to delete calendar event:", calendarError);
        }
      }

      await storage.deleteTask(taskId);
      res.json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Create task manually without AI

  // Create task from natural language input
  app.post("/api/tasks/create-from-text", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId, naturalLanguageInput } = req.body;
      const authenticatedUserId = req.user?.id;

      if (!authenticatedUserId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Ensure user can only create tasks for themselves
      if (userId && userId !== authenticatedUserId) {
        return res.status(403).json({ message: "Access denied: cannot create tasks for other users" });
      }

      const currentUserId = authenticatedUserId;

      // Check AI task limits before proceeding
      const limitCheck = await storage.checkAiTaskLimit(currentUserId);
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
        userId: currentUserId,
        title: aiAnalysis?.title || naturalLanguageInput.slice(0, 60).trim() || "New Task",
        description: aiAnalysis?.description || naturalLanguageInput,
        priority: (aiAnalysis?.priority as any) || "important",
        status: "pending",
        estimatedMinutes: aiAnalysis?.estimatedMinutes || 30,
        dueAt: aiAnalysis?.dueAt || null,
        sourceApp: "manual",
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

      // Create calendar event for the task if it has a due date
      if (task.dueAt && calendarService.hasUserClient(currentUserId)) {
        try {
          const calendarEventId = await calendarService.createTaskEvent(task);
          if (calendarEventId) {
            await storage.updateTask(task.id, {
              metadata: {
                ...task.metadata,
                calendarEventId
              }
            });
            console.log(`[NaturalLanguageTask] Created calendar event for task: ${task.title}`);
          }
        } catch (calendarError) {
          console.error("[NaturalLanguageTask] Failed to create calendar event:", calendarError);
          // Continue without failing the task creation
        }
      }

      console.log(`Task ${task.id} created with AI analysis: ${task.title}`);

      // Return success with the completed task (AI-processed or fallback)
      res.json({ success: true, task });

    } catch (error) {
      console.error("Task creation from text error:", error);
      res.status(500).json({ message: "Failed to create task from natural language", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Convert notification to task using Gemini AI
  app.post("/api/notifications/:id/convert-to-task", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const notificationId = req.params.id;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const notification = await storage.getNotificationById(notificationId);
      if (!notification || notification.userId !== userId) {
        return res.status(404).json({ message: "Notification not found or access denied" });
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
        try {
          // Force urgent priority for tasks from priority person emails
          const finalPriority = notification.metadata?.isPriorityPerson ? "urgent" : aiAnalysis.priority;

          // Ensure dueAt is properly converted to Date object or null
          let dueAtDate = null;
          if (aiAnalysis.dueAt) {
            if (aiAnalysis.dueAt instanceof Date) {
              dueAtDate = aiAnalysis.dueAt;
            } else if (typeof aiAnalysis.dueAt === 'string') {
              dueAtDate = new Date(aiAnalysis.dueAt);
            }

            // Validate the date is valid
            if (dueAtDate && isNaN(dueAtDate.getTime())) {
              console.error(`[TaskCreation] Invalid date for task: ${aiAnalysis.dueAt}`);
              dueAtDate = null;
            }
          }

          const taskData: InsertTask = {
            userId: userId,
            title: aiAnalysis.title,
            description: fullContent || aiAnalysis.description, // Use full content as description
            priority: finalPriority as any,
            status: "pending",
            estimatedMinutes: aiAnalysis.estimatedMinutes,
            dueAt: dueAtDate,
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

          console.log(`[TaskCreation] Creating task with dueAt: ${dueAtDate ? dueAtDate.toISOString() : 'null'}`);
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

          // Create calendar event for the task
          if (task.dueAt && calendarService.hasUserClient(userId)) {
            try {
              const calendarEventId = await calendarService.createTaskEvent(task);
              if (calendarEventId) {
                await storage.updateTask(task.id, {
                  metadata: {
                    ...task.metadata,
                    calendarEventId
                  }
                });
                console.log(`[ConvertedTask] Created calendar event for converted task: ${task.title}`);
              }
            } catch (calendarError) {
              console.error("[ConvertedTask] Failed to create calendar event:", calendarError);
              // Continue without failing the task creation
            }
          }
        } catch (taskError) {
          console.error(`Error creating AI task with limit check: ${taskError}`);
          throw taskError;
        }
      }

      // Create proper email conversion record in convertedEmails table
      if (notification.sourceApp === "gmail") {
        try {
          const taskTitles = createdTasks.map(t => t.title).join(", ");

          await storage.createConvertedEmail({
            userId: userId,
            gmailMessageId: notification.metadata?.emailId || `notification-${notification.id}`,
            gmailThreadId: notification.metadata?.threadId || null,
            subject: notification.metadata?.emailSubject || notification.title,
            sender: notification.metadata?.emailFrom || "Unknown Sender",
            senderEmail: notification.metadata?.fromEmail || notification.metadata?.emailFrom || "unknown@sender.com",
            receivedAt: new Date(notification.metadata?.emailDate || notification.createdAt),
            rawSnippet: fullContent?.substring(0, 500) || notification.description,
            status: "converted",
            taskIds: createdTasks.map(t => t.id),
            metadata: {
              sourceNotificationId: notification.id,
              convertedAt: new Date().toISOString(),
              originalContent: fullContent,
              tasksCount: createdTasks.length,
              taskTitles: taskTitles,
              isPriorityPerson: notification.metadata?.isPriorityPerson || false
            }
          });
          console.log(`[ConversionTracking] Created convertedEmail record for notification: ${notification.id}`);
        } catch (conversionError) {
          console.error("Error creating converted email record:", conversionError);
          // Continue with dismissal even if tracking fails
        }
      }

      // Dismiss the original notification since it's been converted to task
      try {
        await storage.dismissNotification(notificationId);
        console.log(`[NotificationDismissal] Successfully dismissed notification: ${notificationId}`);
      } catch (dismissError) {
        console.error("Error dismissing notification:", dismissError);
        // Don't fail the entire conversion if dismissal fails
      }

      res.json({
        success: true,
        tasks: createdTasks,
        tasksCount: createdTasks.length,
        multiTask: createdTasks.length > 1
      });
    } catch (error) {
      console.error("Error converting notification to task:", error);
      res.status(500).json({ message: "Failed to convert notification to task", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Batch convert multiple notifications to tasks
  app.post("/api/notifications/batch-convert-to-tasks", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { notifications } = req.body;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

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
            if (!notification || notification.userId !== userId) {
              errors.push({ id: notificationData.id, error: "Notification not found or access denied" });
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
              userId: userId,
              title: aiAnalysis.title,
              description: fullContent || aiAnalysis.description, // Use full content as description
              priority: finalPriority as any,
              status: "pending",
              estimatedMinutes: aiAnalysis.estimatedMinutes,
              dueAt: aiAnalysis.dueAt ? new Date(aiAnalysis.dueAt) : null,
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

            // Create calendar event for the batch-converted task
            if (task.dueAt && calendarService.hasUserClient(userId)) {
              try {
                const calendarEventId = await calendarService.createTaskEvent(task);
                if (calendarEventId) {
                  await storage.updateTask(task.id, {
                    metadata: {
                      ...task.metadata,
                      calendarEventId
                    }
                  });
                  console.log(`[BatchConvertedTask] Created calendar event for batch task: ${task.title}`);
                }
              } catch (calendarError) {
                console.error("[BatchConvertedTask] Failed to create calendar event:", calendarError);
                // Continue without failing the task creation
              }
            }

            // Create email conversion tracking record for batch-converted emails BEFORE dismissing
            if (notification.sourceApp === "gmail") {
              await storage.createConvertedEmail({
                userId: userId,
                gmailMessageId: notification.metadata?.emailId || `batch-${notification.id}`,
                gmailThreadId: notification.metadata?.threadId || null,
                subject: notification.metadata?.emailSubject || notification.title,
                sender: notification.metadata?.emailFrom || "Unknown Sender",
                senderEmail: notification.metadata?.fromEmail || notification.metadata?.emailFrom || "unknown@sender.com",
                receivedAt: new Date(notification.metadata?.emailDate || notification.createdAt),
                rawSnippet: fullContent?.substring(0, 500) || notification.description,
                status: "converted",
                taskIds: [task.id],
                metadata: {
                  sourceNotificationId: notification.id,
                  convertedAt: new Date().toISOString(),
                  originalContent: fullContent,
                  tasksCount: 1,
                  taskTitles: aiAnalysis.title,
                  isPriorityPerson: notification.metadata?.isPriorityPerson || false,
                  batchProcessed: true
                }
              });
              console.log(`[BatchConversion] Created convertedEmail record for notification: ${notification.id}`);
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
      res.status(500).json({ message: "Failed to batch convert notifications to tasks", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Notification routes with authentication
  app.get("/api/notifications", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Disable caching to prevent 304 responses that break Windows notifications
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.removeHeader('ETag');

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
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/notifications", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const notificationData = insertNotificationSchema.parse({ ...req.body, userId });
      const notification = await storage.createNotification(notificationData);
      res.json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ message: "Failed to create notification", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/notifications/analyze", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const { title, content, sourceApp } = req.body;

      if (!title || !content || !sourceApp) {
        return res.status(400).json({
          message: "title, content, and sourceApp are required"
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
      console.error("Error analyzing notification:", error);
      res.status(500).json({ message: "Failed to analyze notification", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const notificationId = req.params.id;

      // Optionally verify ownership if needed, though typically read status is user-specific
      // const notification = await storage.getNotificationById(notificationId);
      // if (!notification || notification.userId !== userId) {
      //   return res.status(404).json({ message: "Notification not found or access denied" });
      // }

      await storage.markNotificationRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "Failed to mark notification as read", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Calendar sync endpoint
  app.post("/api/calendar/sync", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      await calendarService.syncCalendarEvents(userId);

      res.json({
        success: true,
        message: "Calendar sync completed successfully"
      });
    } catch (error) {
      console.error("Calendar sync error:", error);
      res.status(500).json({
        message: "Failed to sync calendar events", error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get calendar integration status
  app.get("/api/calendar/status", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hasCalendarAccess = calendarService.hasUserClient(userId);

      res.json({
        connected: hasCalendarAccess,
        message: hasCalendarAccess ? "Calendar integration active" : "Calendar not connected"
      });
    } catch (error) {
      console.error("Error checking calendar status:", error);
      res.status(500).json({
        connected: false,
        message: "Failed to check calendar status", error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.patch("/api/notifications/:id/dismiss", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const notificationId = req.params.id;

      // Optionally verify ownership if needed
      // const notification = await storage.getNotificationById(notificationId);
      // if (!notification || notification.userId !== userId) {
      //   return res.status(404).json({ message: "Notification not found or access denied" });
      // }

      await storage.dismissNotification(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing notification:", error);
      res.status(500).json({ message: "Failed to dismiss notification", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Bulk delete notifications for Emails Converted page
  app.post('/api/notifications/bulk-delete', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid request format' });
      }

      // Add check to ensure notifications belong to the user
      const userNotifications = await storage.getUserNotifications(userId);
      const userNotificationIds = new Set(userNotifications.map(n => n.id));

      const deletableIds = ids.filter(id => userNotificationIds.has(id));
      const nonDeletableIds = ids.filter(id => !userNotificationIds.has(id));

      if (nonDeletableIds.length > 0) {
        console.warn(`[BulkDelete] User ${userId} attempted to delete notifications they don't own: ${nonDeletableIds.join(', ')}`);
        // Proceed with deleting only the ones that belong to the user
      }

      for (const id of deletableIds) {
        await storage.dismissNotification(id);
      }

      res.json({ success: true, deletedCount: deletableIds.length, ignoredCount: nonDeletableIds.length });
    } catch (error) {
      console.error('Error bulk deleting notifications:', error);
      res.status(500).json({ error: 'Failed to delete notifications', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get converted emails endpoint
  app.get('/api/converted-emails', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const convertedEmails = await storage.getUserConvertedEmails(userId, limit);
      res.json(convertedEmails);
    } catch (error) {
      console.error('Error fetching converted emails:', error);
      res.status(500).json({ error: 'Failed to fetch converted emails' });
    }
  });

  // Bulk delete converted emails
  app.post('/api/converted-emails/bulk-delete', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid request format' });
      }

      // Get user's converted emails to verify ownership
      const userConvertedEmails = await storage.getUserConvertedEmails(userId);
      const userConvertedEmailIds = new Set(userConvertedEmails.map(e => e.id));

      const deletableIds = ids.filter(id => userConvertedEmailIds.has(id));
      const nonDeletableIds = ids.filter(id => !userConvertedEmailIds.has(id));

      if (nonDeletableIds.length > 0) {
        console.warn(`[BulkDelete] User ${userId} attempted to delete converted emails they don't own: ${nonDeletableIds.join(', ')}`);
      }

      for (const id of deletableIds) {
        await storage.deleteConvertedEmail(id);
      }

      res.json({ success: true, deletedCount: deletableIds.length, ignoredCount: nonDeletableIds.length });
    } catch (error) {
      console.error('Error bulk deleting converted emails:', error);
      res.status(500).json({ error: 'Failed to delete converted emails' });
    }
  });

  // Retrieve converted emails back to notification section (correct endpoint)
  app.post('/api/converted-emails/retrieve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid request format' });
      }

      const retrievedEmails = [];
      
      // Get user's converted emails to verify ownership
      const userConvertedEmails = await storage.getUserConvertedEmails(userId);
      const userConvertedEmailIds = new Set(userConvertedEmails.map(e => e.id));

      for (const id of ids) {
        if (!userConvertedEmailIds.has(id)) {
          console.warn(`[RetrieveEmail] User ${userId} attempted to retrieve converted email ${id} they don't own.`);
          continue; // Skip if the converted email doesn't belong to the user
        }

        // Get the converted email record
        const convertedEmail = await storage.getConvertedEmailById(id);
        if (!convertedEmail) {
          console.warn(`[RetrieveEmail] Converted email ${id} not found.`);
          continue;
        }

        // Determine priority based on email content and sender
        let originalPriority: "urgent" | "important" | "normal" = "normal";
        
        // Check if it was from a priority person (VIP) - check metadata first
        if (convertedEmail.metadata?.isPriorityPerson) {
          originalPriority = "urgent";
        } else {
          // Analyze content for priority keywords
          const emailContent = (convertedEmail.subject + ' ' + (convertedEmail.rawSnippet || '')).toLowerCase();
          
          if (emailContent.includes('urgent') || emailContent.includes('asap') || emailContent.includes('emergency') || emailContent.includes('immediate')) {
            originalPriority = "urgent";
          } else if (emailContent.includes('important') || emailContent.includes('meeting') || emailContent.includes('deadline') || emailContent.includes('reminder')) {
            originalPriority = "important";
          }
        }

        // Get the full email content from metadata or use rawSnippet as fallback
        const fullEmailContent = convertedEmail.metadata?.originalContent || convertedEmail.rawSnippet || 'Email content not available';
        
        // Create a new notification in the notification feed with complete email data
        const originalNotification = await storage.createNotification({
          userId: userId,
          title: convertedEmail.subject,
          description: fullEmailContent, // Use complete content instead of truncated snippet
          type: originalPriority, // Use determined priority
          sourceApp: "gmail",
          aiSummary: `Retrieved email from: ${convertedEmail.sender}`,
          actionableInsights: ["Convert to task", "Mark as read"],
          metadata: {
            emailId: convertedEmail.gmailMessageId,
            emailSubject: convertedEmail.subject,
            emailFrom: convertedEmail.sender,
            emailDate: convertedEmail.receivedAt.toISOString(),
            fullEmailContent: fullEmailContent, // Store complete content
            fromEmail: convertedEmail.senderEmail,
            isPriorityPerson: convertedEmail.metadata?.isPriorityPerson || false,
            retrievedFromConverted: true,
            retrievedAt: new Date().toISOString(),
            convertedEmailId: convertedEmail.id,
            gmailThreadId: convertedEmail.gmailThreadId
          }
        });

        // Delete the converted email record since it's back in notifications
        await storage.deleteConvertedEmail(id);

        retrievedEmails.push(originalNotification);
        console.log(`[RetrieveEmail] Successfully retrieved converted email ${id} back to notifications as ${originalNotification.id} with priority: ${originalPriority}`);
      }

      res.json({ success: true, retrievedCount: retrievedEmails.length, emails: retrievedEmails });
    } catch (error) {
      console.error('Error retrieving converted emails:', error);
      res.status(500).json({ error: 'Failed to retrieve converted emails', details: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Retrieve emails back to notification section (old endpoint - deprecated)
  app.post('/api/notifications/retrieve-emails', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid request format' });
      }

      const retrievedEmails = [];
      const userNotifications = await storage.getUserNotifications(userId);
      const userNotificationIds = new Set(userNotifications.map(n => n.id));

      for (const id of ids) {
        if (!userNotificationIds.has(id)) {
          console.warn(`[RetrieveEmail] User ${userId} attempted to retrieve notification ${id} they don't own.`);
          continue; // Skip if the notification doesn't belong to the user
        }

        // Get the converted email notification
        const convertedEmail = await storage.getNotificationById(id);
        if (!convertedEmail) continue; // Should not happen if already in userNotificationIds, but good safety check

        // Determine original priority based on email content and sender
        let originalPriority: "urgent" | "important" | "normal" = "normal";
        
        // Check if it was from a priority person (VIP)
        if (convertedEmail.metadata?.isPriorityPerson) {
          originalPriority = "urgent";
        } else {
          // Analyze content for priority keywords
          const emailContent = (convertedEmail.metadata?.subject + ' ' + convertedEmail.metadata?.originalContent || '').toLowerCase();
          
          if (emailContent.includes('urgent') || emailContent.includes('asap') || emailContent.includes('emergency')) {
            originalPriority = "urgent";
          } else if (emailContent.includes('important') || emailContent.includes('meeting') || emailContent.includes('deadline')) {
            originalPriority = "important";
          }
        }

        // Create a new notification in the notification feed with original email data
        const originalNotification = await storage.createNotification({
          userId: userId,
          title: convertedEmail.metadata?.subject || convertedEmail.title,
          description: convertedEmail.metadata?.originalContent || convertedEmail.description,
          type: originalPriority, // Use determined priority instead of always urgent
          sourceApp: "gmail",
          aiSummary: `Retrieved email from: ${convertedEmail.metadata?.from || 'unknown sender'}`,
          actionableInsights: ["Convert to task", "Mark as read"],
          metadata: {
            emailId: convertedEmail.metadata?.originalEmailId || `retrieved-${Date.now()}`,
            emailSubject: convertedEmail.metadata?.subject || convertedEmail.title,
            emailFrom: convertedEmail.metadata?.from,
            emailDate: convertedEmail.receivedAt?.toISOString() || new Date().toISOString(),
            fullEmailContent: convertedEmail.metadata?.originalContent,
            fromEmail: convertedEmail.senderEmail,
            isPriorityPerson: convertedEmail.metadata?.isPriorityPerson || false,
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
      res.status(500).json({ error: 'Failed to retrieve emails', error: error instanceof Error ? error.message : 'Unknown error' });
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
      console.error("Error fetching connected apps:", error);
      res.status(500).json({ message: "Failed to fetch connected apps", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // User Usage Analytics endpoint for plan limits
  app.get("/api/usage", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.query.userId as string || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const limitCheck = await storage.checkAiTaskLimit(userId);

      res.json({
        currentCount: limitCheck.currentCount,
        limit: limitCheck.limit,
        planType: limitCheck.planType,
        withinLimit: limitCheck.withinLimit,
        remainingTasks: Math.max(0, limitCheck.limit - limitCheck.currentCount),
        usagePercentage: limitCheck.limit > 0 ? Math.round((limitCheck.currentCount / limitCheck.limit) * 100) : 0
      });
    } catch (error) {
      console.error("Error fetching user usage:", error);
      res.status(500).json({ message: "Failed to fetch usage data", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Time Saved Analytics endpoint
  app.get("/api/analytics/time-saved", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get all tasks and notifications for analytics
      const tasks = await storage.getUserTasks(userId);
      const notifications = await storage.getUserNotifications(userId);

      // Calculate statistics
      const emailConversions = notifications.filter(n =>
        n.sourceApp === "gmail" && n.type === "email_converted"
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
      res.status(500).json({ message: "Failed to fetch time saved analytics", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // User Metrics routes
  app.get("/api/metrics", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.query.userId as string || req.user?.id;
      const date = req.query.date ? new Date(req.query.date as string) : undefined;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const metrics = await storage.getUserMetrics(userId, date);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/metrics", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const metricsData = insertUserMetricsSchema.parse({ ...req.body, userId });
      const metrics = await storage.createUserMetrics(metricsData);
      res.json(metrics);
    } catch (error) {
      console.error("Error creating metrics:", error);
      res.status(500).json({ message: "Failed to create metrics", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // AI Insights routes
  app.get("/api/ai-insights", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.query.userId as string || req.user?.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const insights = await storage.getUserAiInsights(userId, limit);
      res.json(insights);
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      res.status(500).json({ message: "Failed to fetch AI insights", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/workflow/optimize", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get user's pending tasks
      const tasks = await storage.getTasksByStatus(userId, "pending");

      const taskData = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description || "",
        priority: task.priority || "normal",
        estimatedMinutes: task.estimatedMinutes || 30,
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : undefined,
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
        priority: "high",
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
      console.error("Error optimizing workflow:", error);
      res.status(500).json({ message: "Failed to optimize workflow", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Auto-reschedule tasks based on completion patterns and system time
  app.post("/api/workflow/auto-reschedule", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const reschedulingResult = await smartScheduler.rescheduleUserTasks(userId);

      // Create AI insights about the rescheduling
      if (reschedulingResult.rescheduledTasks.length > 0) {
        await storage.createAiInsight({
          userId,
          type: "smart_rescheduling",
          title: "Smart Task Rescheduling Applied",
          description: `Auto-rescheduled ${reschedulingResult.rescheduledTasks.length} tasks based on your work patterns and current system time. ${reschedulingResult.insights.join(' ')}`,
          priority: "normal",
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
      console.error("Error auto-rescheduling tasks:", error);
      res.status(500).json({ message: "Failed to auto-reschedule tasks", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/wellness/insights", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
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
      console.error("Error generating wellness insights:", error);
      res.status(500).json({ message: "Failed to generate wellness insights", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/ai-insights/:id/apply", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      await storage.applyAiInsight(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error applying AI insight:", error);
      res.status(500).json({ message: "Failed to apply AI insight", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/ai-insights/:id/dismiss", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      await storage.dismissAiInsight(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing AI insight:", error);
      res.status(500).json({ message: "Failed to dismiss AI insight", error: error instanceof Error ? error.message : 'Unknown error' });
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
      res.status(500).json({ message: "Failed to fetch priority emails", error: error instanceof Error ? error.message : 'Unknown error' });
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
      res.status(500).json({ message: "Failed to create priority email", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/priority-emails/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const priorityEmailId = req.params.id;

      // Check if the priority email belongs to the user before deleting
      const priorityEmail = await storage.getPriorityEmailById(priorityEmailId);
      if (!priorityEmail || priorityEmail.userId !== userId) {
        return res.status(403).json({ message: "Access denied: cannot delete priority emails that do not belong to you" });
      }

      await storage.deletePriorityEmail(priorityEmailId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting priority email:", error);
      res.status(500).json({ message: "Failed to delete priority email", error: error instanceof Error ? error.message : 'Unknown error' });
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
      console.log('===========================');

      // Send feedback email using new email service
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #3b82f6; margin-bottom: 20px; text-align: center;">💬 New FlowHub Feedback Received</h2>

            <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">User Information:</h3>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${userEmail}</p>
              <p style="margin: 5px 0;"><strong>User ID:</strong> ${submittingUserId}</p>
              <p style="margin: 5px 0;"><strong>Submitted:</strong> ${timestamp}</p>
            </div>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <h3 style="color: #374151; margin-top: 0;">Feedback Content:</h3>
              <div style="background-color: white; padding: 15px; border-radius: 6px; line-height: 1.6; color: #111827;">
                ${feedback.replace(/\n/g, '<br>')}
              </div>
            </div>

            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #92400e; margin-top: 0;">📋 Action Items:</h3>
              <ul style="margin: 5px 0; color: #92400e;">
                <li>Review feedback for product improvements</li>
                <li>Consider replying to user at: ${userEmail}</li>
                <li>Track feedback trends for feature prioritization</li>
              </ul>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px;">This feedback was automatically collected by FlowHub</p>
              <p style="color: #6b7280; font-size: 12px;">Reply directly to this email to contact the user</p>
            </div>
          </div>
        </div>
      `;

      const textContent = `
        💬 New FlowHub Feedback Received

        User Information:
        Email: ${userEmail}
        User ID: ${submittingUserId}
        Submitted: ${timestamp}

        Feedback Content:
        ${feedback}

        Action Items:
        - Review feedback for product improvements
        - Consider replying to user at: ${userEmail}
        - Track feedback trends for feature prioritization

        This feedback was automatically collected by FlowHub
        Reply directly to this email to contact the user
      `;

      await sendNotificationEmail(
        `💬 FlowHub Feedback from ${userEmail}`,
        htmlContent,
        textContent
      );

      res.json({
        success: true,
        message: 'Feedback received successfully'
      });
    } catch (error) {
      console.error('Feedback submission error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit feedback', error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // User App Links routes
  app.get("/api/user-app-links", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.query.userId as string || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
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
      console.error("Error fetching user app links:", error);
      res.status(500).json({ message: "Failed to fetch user app links", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/user-app-links", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const linkData = insertUserAppLinkSchema.parse({ ...req.body, userId });
      const link = await storage.createUserAppLink(linkData);
      res.json(link);
    } catch (error) {
      console.error("Error creating user app link:", error);
      res.status(500).json({ message: "Failed to create user app link", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/user-app-links/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const linkId = req.params.id;

      // Check ownership before deleting
      const link = await storage.getUserAppLink(linkId);
      if (!link || link.userId !== userId) {
        return res.status(403).json({ message: "Access denied: cannot delete app links that do not belong to you" });
      }

      await storage.deleteUserAppLink(linkId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user app link:", error);
      res.status(500).json({ message: "Failed to delete user app link", error: error instanceof Error ? error.message : 'Unknown error' });
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
    processedSenderEmails.delete(userId);
    if (userGmailClients.has(userId)) {
      userGmailClients.delete(userId);
    }
    calendarService.removeUserClient(userId);
    if (userGmailIntervals.has(userId)) {
      clearInterval(userGmailIntervals.get(userId));
      userGmailIntervals.delete(userId);
    }
  }

  // Gmail Integration routes
  app.post("/api/gmail/connect", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || "guest-user"; // Use authenticated user ID or guest

      // Generate OAuth URL for real Gmail API and Google Calendar
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ];

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: userId, // Pass userId in state parameter
        prompt: 'consent'
      });

      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating Gmail connect URL:", error);
      res.status(500).json({ message: "Failed to start Gmail connection", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Gmail OAuth callback
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
      const freshOAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
      );

      // Exchange code for tokens
      const { tokens } = await freshOAuth2Client.getToken(code as string);

      // Set credentials on the client
      freshOAuth2Client.setCredentials(tokens);

      // Get the user's email from Google Profile using the authenticated client
      const oauth2 = google.oauth2({ version: 'v2', auth: freshOAuth2Client });
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

      // Store Gmail tokens persistently in database
      try {
        await storage.storeEncryptedGmailTokens(user.id, JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope,
          userEmail: userEmail,
          createdAt: new Date().toISOString()
        }));
        console.log(`[Gmail] Stored encrypted tokens for user: ${user.id}`);
      } catch (tokenError) {
        console.error('Failed to store Gmail tokens:', tokenError);
        // Continue without failing the entire OAuth flow
      }

      // Store user client and email mappings ONLY for the current user
      userGmailClients.set(user.id, userClient);
      userEmails.set(user.id, userEmail); // Store the real connected email

      // Set calendar service client for calendar operations
      calendarService.setUserClient(user.id, userClient);
      console.log(`[Calendar] Calendar service connected for user: ${user.id}`);

      // Generate authentication tokens for the authenticated user
      const { accessToken, refreshToken } = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name
      });

      // Set HTTP-only cookies for authentication
      setAuthCookies(res, accessToken, refreshToken);

      console.log(`[Gmail] Starting email fetching for user: ${user.id}, email: ${userEmail}`);

      // Create instant login notification for Windows notifications
      try {
        await storage.createNotification({
          userId: user.id,
          title: "🔔 Gmail Connected to FlowHub",
          description: "Gmail connection successful! You should see this notification in your Windows notification center. Email notifications are now active.",
          type: "normal",
          sourceApp: "manual",
          aiSummary: "Gmail connection notification for Windows notification testing",
          actionableInsights: ["Check Windows notification center", "Gmail notifications active"],
          metadata: {
            taskId: `gmail-login-${Date.now()}`,
            reminderType: "gmail_connect",
            sourceType: "system",
            browserNotification: true,
            gmailConnectNotification: true,
            timestamp: new Date().toISOString()
          }
        });
        console.log(`[Gmail] Created Windows notification for Gmail connection: ${user.id}`);
      } catch (notificationError) {
        console.error('Failed to create Gmail connection notification:', notificationError);
      }

      // Start fetching emails directly with authenticated user info
      startRealGmailFetching(user.id, userClient, userEmail);

      // Start calendar sync for the user
      setTimeout(() => {
        calendarService.syncCalendarEvents(user.id);
      }, 2000); // Wait 2 seconds for initial setup

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
  app.post("/api/gmail/disconnect", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Clear specific user's data
      clearUserData(userId);

      console.log(`[Gmail] Disconnected Gmail for user: ${userId}`);

      res.json({ success: true, message: "Gmail disconnected successfully" });
    } catch (error) {
      console.error("Error disconnecting Gmail:", error);
      res.status(500).json({ message: "Failed to disconnect Gmail", error: error instanceof Error ? error.message : 'Unknown error' });
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
        // Create a COMPLETELY FRESH OAuth2Client using google.auth.OAuth2 for each request to ensure proper auth headers
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
          console.log(`[Gmail] No valid access token for user ${userId}. Stopping fetch.`);
          return;
        }

        // Set fresh credentials on the new client
        freshOAuth2Client.setCredentials({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token,
          expiry_date: credentials.expiry_date,
          token_type: 'Bearer',
          scope: 'https://www.googleapis.com/auth/gmail.readonly' // Scope needed for reading messages
        });

        // Create Gmail API instance with fresh authenticated client
        const gmail = google.gmail({ version: 'v1', auth: freshOAuth2Client });

        // Get ALL unread messages from primary inbox since last check (don't filter by priority)
        // Convert lastCheckTime to Unix timestamp (seconds)
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
            // Time-based deduplication - allow reprocessing after 10 seconds for new notifications
            const now = Date.now();
            const processingWindow = 10 * 1000; // 10 seconds for faster processing

            if (!processedEmailIds.has(userId)) {
              processedEmailIds.set(userId, new Map());
            }

            const userProcessedEmails = processedEmailIds.get(userId)!;
            const lastProcessedTime = userProcessedEmails.get(message.id!);

            // Skip only if processed recently (within 10 seconds) to prevent race conditions
            // but allow reprocessing for legitimate new notifications
            if (lastProcessedTime && (now - lastProcessedTime) < processingWindow) {
              console.log(`[Gmail] Skipping recently processed email: ${message.id} (${Math.round((now - lastProcessedTime) / 1000)}s ago)`);
              continue;
            }

            // Note: Email will be marked as processed ONLY AFTER successful persistence (moved below)

            // Clean up old entries (older than 1 hour) to prevent memory leaks
            const cleanupWindow = 60 * 60 * 1000; // 1 hour
            for (const [emailId, timestamp] of userProcessedEmails.entries()) {
              if (now - timestamp > cleanupWindow) {
                userProcessedEmails.delete(emailId);
              }
            }

            // Get message details early for smart deduplication
            const messageData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id!,
              format: 'full'
            });
            const msg = messageData.data;
            const headers = msg.payload?.headers || [];
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
            
            // Extract sender email for smart deduplication
            let fromEmail = from.toLowerCase().trim();
            const emailMatch = from.match(/<([^>]+)>/);
            if (emailMatch) {
              fromEmail = emailMatch[1].toLowerCase().trim();
            } else if (from.includes('@')) {
              const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
              const match = from.match(emailRegex);
              if (match) {
                fromEmail = match[1].toLowerCase().trim();
              }
            }

            // Remove sender-based deduplication to allow continuous fetching from same email

            // Check if notification already exists with this email ID to prevent database duplicates
            const existingNotifications = await storage.getUserNotifications(userId, 100); // Fetch recent notifications
            const emailAlreadyExists = existingNotifications.some(notification =>
              notification.metadata?.emailId === message.id
            );

            if (emailAlreadyExists) {
              console.log(`[Gmail] Email notification already exists in database: ${message.id}`);
              continue;
            }

            // Use already fetched message data (no duplicate fetch needed for speed optimization!)
            // msg and headers are already available from the earlier fetch at lines 2598-2600

            // Extract additional email details we need
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';

            // Get email body (simplified - gets first text part)
            let body = '';
            if (msg.payload?.body?.data) {
              body = Buffer.from(msg.payload.body.data, 'base64').toString();
            } else if (msg.payload?.parts) {
              const textPart = msg.payload.parts.find(part => part.mimeType === 'text/plain');
              if (textPart?.body?.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString();
              } else {
                // Try finding HTML part if text/plain is not available
                const htmlPart = msg.payload.parts.find(part => part.mimeType === 'text/html');
                if (htmlPart?.body?.data) {
                  // Basic HTML to text conversion (can be improved)
                  body = Buffer.from(htmlPart.body.data, 'base64').toString().replace(/<[^>]*>/g, '');
                }
              }
            }

            // Store full body content without truncation
            const fullEmailContent = `Subject: ${subject}\n\n${body}`;

            // fromEmail already extracted earlier for smart deduplication - no need to duplicate this logic

            // Enhanced filtering: Skip non-actionable emails based on sender patterns
            // Only filter obvious automated/system emails, allow all personal/work emails
            const nonActionableSenderPatterns = [
              /^no-reply@/i,
              /^noreply@/i,
              /^donotreply@/i,
              /^do-not-reply@/i,
              /^security@.*\.google\.com$/i,
              /^security@.*\.microsoft\.com$/i,
              /^security@.*\.apple\.com$/i,
              /^.*@accounts\.google\.com$/i,
              /^.*@facebookmail\.com$/i,
              /^.*@mail\.twitter\.com$/i,
              /^.*@notification\.amazon\.com$/i
            ];

            // IMPORTANT: Only skip if it's clearly an automated system email
            if (nonActionableSenderPatterns.some(pattern => pattern.test(fromEmail))) {
              console.log(`[Gmail] Skipping automated system sender: ${fromEmail}`);
              continue;
            }

            // Skip ONLY obvious security/verification emails - be very specific
            const securityKeywords = [
              'security alert',
              'verification code',
              'two-factor authentication code',
              'login verification',
              'account verification code',
              'confirm your email address',
              'verify your account'
            ];

            const emailContent = (subject + ' ' + body).toLowerCase();

            // Only skip if it contains specific security keywords AND is clearly automated
            const isSecurityEmail = securityKeywords.some(keyword => emailContent.includes(keyword)) &&
                                   (emailContent.includes('code:') || emailContent.includes('verification code') ||
                                    emailContent.includes('click here to verify') || emailContent.includes('confirm your'));

            if (isSecurityEmail) {
              console.log(`[Gmail] Skipping security/verification email: ${subject}`);
              continue;
            }

            // WORK EMAIL DETECTION: Allow ALL emails with work-related content
            const workIndicators = [
              'deadline', 'task', 'project', 'meeting', 'deliverable', 'report', 'campaign',
              'vendor', 'coordinate', 'assist', 'prepare', 'draft', 'confirm', 'negotiate',
              'training', 'session', 'conference', 'calendar', 'schedule', 'analysis',
              'strategy', 'action required', 'follow up', 'review', 'approval', 'budget',
              'timeline', 'milestone', 'presentation', 'proposal', 'contract', 'client',
              'customer', 'stakeholder', 'team', 'department', 'urgent', 'asap'
            ];

            const hasWorkContent = workIndicators.some(indicator => emailContent.includes(indicator));

            // Force process work emails regardless of other patterns
            if (hasWorkContent) {
              console.log(`[Gmail] Processing work email: ${subject}`);
              // Continue to process this email - don't skip
            }

            console.log(`[Gmail] Extracted email for priority check: "${fromEmail}" from "${from}"`);
            const isPriorityContact = await storage.isPriorityEmail(userId, fromEmail);
            console.log(`[Gmail] Priority check result: ${isPriorityContact} for email: ${fromEmail}`);

            // Use AI to analyze and determine priority - optimized for speed
            let priority: "urgent" | "important" | "normal" = "normal";
            let isPriorityPerson = false;

            if (isPriorityContact) {
              priority = "urgent";
              isPriorityPerson = true;
              console.log(`[Gmail] Priority person detected: ${fromEmail} - setting priority to urgent`);
            } else {
              // Skip AI analysis for faster processing, use keyword-based priority
              const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately'];
              const importantKeywords = ['important', 'meeting', 'deadline', 'review', 'approval', 'schedule', 'conference'];
              const fullText = (subject + ' ' + body).toLowerCase();
              
              if (urgentKeywords.some(keyword => fullText.includes(keyword))) {
                priority = "urgent";
              } else if (importantKeywords.some(keyword => fullText.includes(keyword))) {
                priority = "important";
              }
              console.log(`[Gmail] Fast keyword analysis result: ${priority} for email from ${fromEmail}`);
            }

            console.log(`[Gmail] Creating notification for email: ${subject} from ${from} (Priority: ${priority}, isPriorityPerson: ${isPriorityPerson})`);

            // Create notification with full content in metadata - this should work for ALL emails
            await storage.createNotification({
              userId,
              title: `New email from ${from}`,
              description: `${subject}: ${body.length > 200 ? body.substring(0, 200) + '...' : body}`,
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

            // Mark email as processed ONLY after successful persistence
            userProcessedEmails.set(message.id!, Date.now());
            console.log(`[Gmail] Email ${message.id} marked as processed after successful storage`);

          } catch (msgError) {
            console.error(`[Gmail] Error processing message ${message.id}:`, msgError);
          }
        }

        // Update lastCheckTime properly to prevent duplicate processing
        // Only update if we successfully processed emails to prevent endless loops
        if (messages.length > 0) {
          lastCheckTime = new Date(); // Set to current time, no going back
          console.log(`[Gmail] Updated lastCheckTime to: ${lastCheckTime.toISOString()}`);
        }

      } catch (error) {
        // Error fetching Gmail
        console.error(`[Gmail] Error fetching emails for user ${userId}:`, error);

        // If token is expired, try to refresh
        if ((error as any)?.code === 401) {
          try {
            console.log(`[Gmail] Access token expired for user ${userId}. Attempting to refresh.`);
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
                // Time-based deduplication for retry - fast processing
                const now = Date.now();
                const processingWindow = 10 * 1000; // 10 seconds

                if (!processedEmailIds.has(userId)) {
                  processedEmailIds.set(userId, new Map());
                }

                const userProcessedEmails = processedEmailIds.get(userId)!;
                const lastProcessedTime = userProcessedEmails.get(message.id!);

                // Skip only if processed recently (within 10 seconds)
                if (lastProcessedTime && (now - lastProcessedTime) < processingWindow) {
                  console.log(`[Gmail] Skipping recently processed email during retry: ${message.id} (${Math.round((now - lastProcessedTime) / 1000)}s ago)`);
                  continue;
                }

                // Update last processed time
                userProcessedEmails.set(message.id!, now);

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
                    } else {
                      const htmlPart = msg.payload.parts.find(part => part.mimeType === 'text/html');
                      if (htmlPart?.body?.data) {
                        body = Buffer.from(htmlPart.body.data, 'base64').toString().replace(/<[^>]*>/g, '');
                      }
                    }
                  }

                  // Keep full email content without truncation

                  // Extract email address consistently for priority checking
                  let fromEmail = from.toLowerCase().trim();
                  const emailMatch = from.match(/<([^>]+)>/);
                  if (emailMatch) {
                    fromEmail = emailMatch[1].toLowerCase().trim();
                  } else if (from.includes('@')) {
                    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
                    const match = from.match(emailRegex);
                    if (match) {
                      fromEmail = match[1].toLowerCase().trim();
                    }
                  }

                  // Enhanced filtering: Skip non-actionable emails based on sender patterns (retry section)
                  // Only filter obvious automated/system emails, allow all personal/work emails
                  const nonActionableSenderPatterns = [
                    /^no-reply@/i,
                    /^noreply@/i,
                    /^donotreply@/i,
                    /^do-not-reply@/i,
                    /^security@.*\.google\.com$/i,
                    /^security@.*\.microsoft\.com$/i,
                    /^security@.*\.apple\.com$/i,
                    /^.*@accounts\.google\.com$/i,
                    /^.*@facebookmail\.com$/i,
                    /^.*@mail\.twitter\.com$/i,
                    /^.*@notification\.amazon\.com$/i
                  ];

                  // IMPORTANT: Only skip if it's clearly an automated system email
                  if (nonActionableSenderPatterns.some(pattern => pattern.test(fromEmail))) {
                    console.log(`[Gmail] Skipping automated system sender (retry): ${fromEmail}`);
                    continue;
                  }

                  // Skip ONLY obvious security/verification emails - be very specific (retry section)
                  const securityKeywords = [
                    'security alert',
                    'verification code',
                    'two-factor authentication code',
                    'login verification',
                    'account verification code',
                    'confirm your email address',
                    'verify your account'
                  ];

                  const emailContent = (subject + ' ' + body).toLowerCase();

                  // Only skip if it contains specific security keywords AND is clearly automated
                  const isSecurityEmail = securityKeywords.some(keyword => emailContent.includes(keyword)) &&
                                         (emailContent.includes('code:') || emailContent.includes('verification code') ||
                                          emailContent.includes('click here to verify') || emailContent.includes('confirm your'));

                  if (isSecurityEmail) {
                    console.log(`[Gmail] Skipping security/verification email (retry): ${subject}`);
                    continue;
                  }

                  // WORK EMAIL DETECTION: Allow ALL emails with work-related content (retry section)
                  const workIndicators = [
                    'deadline', 'task', 'project', 'meeting', 'deliverable', 'report', 'campaign',
                    'vendor', 'coordinate', 'assist', 'prepare', 'draft', 'confirm', 'negotiate',
                    'training', 'session', 'conference', 'calendar', 'schedule', 'analysis',
                    'strategy', 'action required', 'follow up', 'review', 'approval', 'budget',
                    'timeline', 'milestone', 'presentation', 'proposal', 'contract', 'client',
                    'customer', 'stakeholder', 'team', 'department', 'urgent', 'asap'
                  ];

                  const hasWorkContent = workIndicators.some(indicator => emailContent.includes(indicator));

                  // Force process work emails regardless of other patterns
                  if (hasWorkContent) {
                    console.log(`[Gmail] Processing work email (retry): ${subject}`);
                    // Continue to process this email - don't skip
                  }

                  console.log(`[Gmail] Extracted email for priority check (retry): "${fromEmail}" from "${from}"`);
                  const isPriorityContact = await storage.isPriorityEmail(userId, fromEmail);
                  console.log(`[Gmail] Priority check result (retry): ${isPriorityContact} for email: ${fromEmail}`);

                  let priority: "urgent" | "important" | "normal" = "normal";
                  let isPriorityPerson = false;

                  if (isPriorityContact) {
                    priority = "urgent";
                    isPriorityPerson = true;
                    console.log(`[Gmail] Priority person detected in retry: ${fromEmail} - setting priority to urgent`);
                  } else {
                    // Fast keyword-based priority for retry
                    const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately'];
                    const importantKeywords = ['important', 'meeting', 'deadline', 'review', 'approval', 'schedule', 'conference'];
                    const fullText = (subject + ' ' + body).toLowerCase();
                    
                    if (urgentKeywords.some(keyword => fullText.includes(keyword))) {
                      priority = "urgent";
                    } else if (importantKeywords.some(keyword => fullText.includes(keyword))) {
                      priority = "important";
                    }
                    console.log(`[Gmail] Fast keyword analysis result (retry): ${priority} for email from ${fromEmail}`);
                  }

                  console.log(`[Gmail] Creating notification for email during retry: ${subject} from ${from} (Priority: ${priority}, isPriorityPerson: ${isPriorityPerson})`);

                  await storage.createNotification({
                    userId,
                    title: `New email from ${from}`,
                    description: `${subject}: ${body.length > 200 ? body.substring(0, 200) + '...' : body}`,
                    type: priority,
                    sourceApp: "gmail",
                    aiSummary: `Email from ${from} with subject: ${subject}`,
                    metadata: {
                      fullEmailContent: `Subject: ${subject}\n\n${body}`,
                      emailSubject: subject,
                      emailFrom: from,
                      emailDate: headers.find(h => h.name === 'Date')?.value || '',
                      emailId: message.id,
                      isPriorityPerson: isPriorityPerson,
                      priorityReason: isPriorityPerson ? "Priority Contact" : "Normal Email",
                      fromEmail: fromEmail
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
              console.error(`[Gmail] Error during retry fetch after token refresh for user ${userId}:`, retryError);
              // If retry fetch fails, we might still need to handle token refresh failure below
            }

          } catch (refreshError) {
            // Failed to refresh token
            console.error(`[Gmail] Failed to refresh token for user ${userId}:`, refreshError);
            // Create a notification about the connection issue
            await storage.createNotification({
              userId,
              title: "Gmail Connection Lost",
              description: "Your Gmail connection has expired or become invalid. Please reconnect to continue receiving email notifications.",
              type: "important",
              sourceApp: "gmail",
              aiSummary: "Gmail OAuth token refresh failed",
              actionableInsights: ["Reconnect Gmail", "Check authentication"],
            });

            // Stop fetching for this user
            if (userGmailIntervals.has(userId)) {
              clearInterval(userGmailIntervals.get(userId));
              userGmailIntervals.delete(userId);
            }
            userGmailClients.delete(userId); // Remove the client so it's not used again until reconnected
          }
        }
      }
    };

    // Call fetchUnreadEmails immediately when starting
    console.log(`[Gmail] Starting immediate email fetch for user: ${userId}`);
    await fetchUnreadEmails();

    // Set up periodic fetching every 15 seconds for faster notifications
    const interval = setInterval(fetchUnreadEmails, 15000); // 15 seconds for faster processing
    userGmailIntervals.set(userId, interval);
  }

  // Recovery function to restore Gmail connections on server restart
  async function recoverGmailConnections() {
    try {
      console.log('[Gmail Recovery] Starting Gmail connection recovery...');
      
      // Get all users who have stored Gmail tokens
      const allUsers = await storage.getAllUsers();
      let recoveredConnections = 0;

      for (const user of allUsers) {
        try {
          // Check if user has stored Gmail tokens
          const hasTokens = await storage.hasGmailTokens(user.id);
          if (!hasTokens) {
            continue; // Skip users without Gmail tokens
          }

          console.log(`[Gmail Recovery] Recovering Gmail connection for user: ${user.id}`);

          // Retrieve stored encrypted tokens
          const tokenStorage = new SecureTokenStorage();
          const storedData = await tokenStorage.retrieveGmailTokens(user.id);
          
          if (!storedData) {
            console.log(`[Gmail Recovery] No valid tokens found for user: ${user.id}`);
            continue;
          }

          const { tokens, userEmail } = storedData;

          // Create a new OAuth2Client with stored credentials
          const recoveredOAuth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI
          );

          // Set the stored credentials
          recoveredOAuth2Client.setCredentials({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
            token_type: tokens.token_type || 'Bearer',
            scope: tokens.scope
          });

          // Store the OAuth client in the Map
          userGmailClients.set(user.id, recoveredOAuth2Client);

          // Store user email for reference
          userEmails.set(user.id, userEmail);

          // Set up calendar service for this user
          calendarService.setUserClient(user.id, recoveredOAuth2Client);

          // Start email fetching for this user
          console.log(`[Gmail Recovery] Starting email fetching for user: ${user.id}, email: ${userEmail}`);
          startRealGmailFetching(user.id, recoveredOAuth2Client, userEmail);

          recoveredConnections++;
          console.log(`[Gmail Recovery] Successfully recovered Gmail connection for user: ${user.id}`);

        } catch (userError) {
          console.error(`[Gmail Recovery] Failed to recover connection for user ${user.id}:`, userError);
          // Continue with other users even if one fails
        }
      }

      console.log(`[Gmail Recovery] Recovery complete. Recovered ${recoveredConnections} Gmail connections.`);
      
    } catch (error) {
      console.error('[Gmail Recovery] Gmail recovery failed:', error);
    }
  }

  // Call recovery function after a short delay to ensure database is ready
  setTimeout(async () => {
    await recoverGmailConnections();
  }, 3000); // 3 second delay

  const httpServer = createServer(app);
  return httpServer;
}
