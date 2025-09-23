import express, { Express, Request, Response } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { storage } from './storage';
import { authenticateToken, generateTokens, hashPassword, verifyPassword, setAuthCookies, clearAuthCookies, rateLimitAuth, trackFailedAuth, type AuthenticatedRequest } from './auth';
import { analyzeNotificationForTask, generateIntelligentSummary } from './openai';
import { smartScheduler } from './scheduler';
import { encryptGmailToken, decryptGmailToken } from './tokenStorage';
import { emailService } from './emailService';

dotenv.config();

const app: Express = express();
app.use(express.json());
app.use(cors());

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

// Keep track of Gmail API clients and intervals per user
const userGmailClients: Map<string, any> = new Map(); // userId -> OAuth2Client
const userGmailIntervals: Map<string, NodeJS.Timeout> = new Map(); // userId -> intervalId
const processedEmailIds: Map<string, Set<string>> = new Map(); // userId -> Set<emailId>

// --- Google OAuth & Gmail API ---

// Function to handle Google OAuth callback
app.get('/auth/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const userId = req.query.state?.split(':')[0]; // Extract userId from state

  if (!code || !userId) {
    return res.status(400).send('Authorization code or user ID missing.');
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    if (!accessToken || !refreshToken) {
      return res.status(500).send('Failed to obtain access and refresh tokens.');
    }

    // Encrypt and store tokens
    const encryptedAccessToken = encryptGmailToken(accessToken);
    const encryptedRefreshToken = encryptGmailToken(refreshToken);

    // Update user in the database with encrypted tokens
    await storage.updateUserGmailTokens(userId, encryptedAccessToken, encryptedRefreshToken);

    // Set the OAuth2 client for this user
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    });
    userGmailClients.set(userId, oauth2Client);

    // Redirect to a success page or dashboard
    res.redirect('/auth/google/success'); // You'll need to create this route/page

  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).send('Error during Google authentication.');
  }
});

// Route to initiate Google OAuth flow
app.get('/auth/google/url', async (req: Request, res: Response) => {
  const userId = req.query.userId as string; // Expecting userId as a query param

  if (!userId) {
    return res.status(400).send('User ID is required for Google OAuth.');
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    // Define the scopes
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      // Add other scopes if needed in the future
    ];

    // Generate the authorization URL, including the userId in the state parameter
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request offline access to get a refresh token
      scope: scopes,
      state: `${userId}:arbitrary_string_to_prevent_csrf` // Include userId for callback
    });

    res.json({ url: authUrl });
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error);
    res.status(500).json({ message: 'Failed to generate Google OAuth URL' });
  }
});


// Middleware to check if Gmail is connected for a user
const ensureGmailConnected = async (req: AuthenticatedRequest, res: Response, next: any) => {
  const userId = req.user!.id;
  let client = userGmailClients.get(userId);

  if (!client) {
    // If client not in memory, try to load from storage
    try {
      const user = await storage.getUserById(userId);
      if (user?.encryptedGmailAccessToken && user.encryptedGmailRefreshToken) {
        const accessToken = decryptGmailToken(user.encryptedGmailAccessToken);
        const refreshToken = decryptGmailToken(user.encryptedGmailRefreshToken);

        if (accessToken && refreshToken) {
          client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI
          );
          client.setCredentials({ access_token: accessToken, refresh_token: refreshToken, scope: 'https://www.googleapis.com/auth/gmail.readonly' });
          userGmailClients.set(userId, client); // Cache the client
        }
      }
    } catch (error) {
      console.error(`Error loading Gmail client for user ${userId}:`, error);
      // Proceed without Gmail if loading fails
    }
  }

  // If still no client, notify the user
  if (!client) {
    return res.status(403).json({ message: 'Gmail not connected or authentication failed. Please connect your Gmail account.' });
  }

  // Refresh token if expired
  try {
    const currentTime = Date.now();
    const tokenInfo = await client.getTokenInfo(client.credentials.access_token);
    
    // If access token is expired or about to expire (e.g., within 5 minutes)
    if (tokenInfo.expiry_date && tokenInfo.expiry_date < currentTime + 5 * 60 * 1000) {
      console.log(`[Gmail] Access token expired for user ${userId}, refreshing...`);
      const newTokens = await client.refreshAccessToken();
      
      const encryptedAccessToken = encryptGmailToken(newTokens.credentials.access_token);
      const encryptedRefreshToken = newTokens.credentials.refresh_token || client.credentials.refresh_token; // Keep old refresh token if new one isn't provided

      await storage.updateUserGmailTokens(userId, encryptedAccessToken, encryptedRefreshToken);
      client.setCredentials({ ...client.credentials, access_token: newTokens.credentials.access_token });
      userGmailClients.set(userId, client); // Update cache
      console.log(`[Gmail] Token refreshed successfully for user ${userId}`);
    }
  } catch (error) {
    console.error(`[Gmail] Error refreshing token for user ${userId}:`, error);
    // Handle token refresh failure, potentially by notifying the user to reconnect
    // For now, we'll just log and continue, hoping the old token might still work for a bit
  }

  next();
};

// Function to fetch unread emails for a user
const fetchUnreadEmails = async (userId: string) => {
  let lastCheckTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours

  // Attempt to retrieve last check time from storage for this user
  const lastCheckData = await storage.getUserLastGmailCheck(userId);
  if (lastCheckData && lastCheckData.lastCheckTime) {
    lastCheckTime = new Date(lastCheckData.lastCheckTime);
  }

  const client = userGmailClients.get(userId);
  if (!client) {
    console.warn(`[Gmail] No Gmail client found for user ${userId}. Skipping fetch.`);
    return;
  }

  const gmail = google.gmail({ version: 'v1', auth: client });

  try {
    const query = `is:unread category:primary after:${Math.floor(lastCheckTime.getTime() / 1000)}`;
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20 // Fetch up to 20 unread messages
    });

    const messages = response.data.messages || [];

    if (messages.length === 0) {
      console.log(`[Gmail] No new unread emails found for user ${userId} after ${lastCheckTime.toISOString()}`);
      return; // No new messages
    }

    console.log(`[Gmail] Found ${messages.length} unread emails for user ${userId}`);

    // Ensure the processed set is initialized for the user
    if (!processedEmailIds.has(userId)) {
      processedEmailIds.set(userId, new Set());
    }
    const userProcessedIds = processedEmailIds.get(userId)!;

    for (const message of messages) {
      // Deduplicate based on message ID within this fetch cycle
      if (userProcessedIds.has(message.id)) {
        console.log(`[Gmail] Skipping already processed email in current fetch cycle: ${message.id}`);
        continue;
      }

      // Add to processed set immediately to prevent race conditions if the same email is fetched again
      userProcessedIds.add(message.id!);

      try {
        const messageData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full' // Get full email content
        });

        const msg = messageData.data;
        const headers = msg.payload?.headers || [];

        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';

        let body = '';
        if (msg.payload?.body?.data) {
          body = Buffer.from(msg.payload.body.data, 'base64').toString();
        } else if (msg.payload?.parts) {
          // Find the text/plain part of the email
          const textPart = msg.payload.parts.find(part => part.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString();
          }
        }

        const truncatedBody = body.length > 200 ? body.substring(0, 200) + '...' : body;

        // Extract email address for priority checking
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

        const isPriorityContact = await storage.isPriorityEmail(userId, fromEmail);
        let priority: "urgent" | "important" | "informational" = "informational";
        let isPriorityPerson = false;

        if (isPriorityContact) {
          priority = "urgent";
          isPriorityPerson = true;
          console.log(`[Gmail] Priority person detected: ${fromEmail} - setting priority to urgent`);
        } else {
          // Analyze with AI if not a priority contact
          try {
            const taskAnalysis = await analyzeNotificationForTask({
              title: `New email from ${from}`,
              description: `${subject}: ${body}`,
              sourceApp: "gmail"
            });
            priority = taskAnalysis.priority as "urgent" | "important" | "informational";
          } catch (aiError) {
            console.log(`[Gmail] AI analysis failed for email from ${fromEmail}, using fallback logic`);
            // Fallback logic if AI fails
            const casualKeywords = ['hi', 'hello', 'hey', 'wassup', 'what\'s up', 'how are you', 'how r u', 'good morning', 'good afternoon', 'good evening', 'hangout', 'chat', 'let\'s play', 'game'];
            const urgentKeywords = ['urgent', 'asap', 'emergency', 'critical', 'immediately', 'in 5 min', 'in 10 min', 'in 30 min'];
            const importantKeywords = ['important', 'meeting', 'deadline', 'review', 'approval', 'join', 'schedule', 'conference', 'call', 'in 1 hour', 'in 2 hours', 'in 3 hours', 'today', 'tomorrow'];

            const fullText = (subject + ' ' + body).toLowerCase();
            if (casualKeywords.some(keyword => fullText.includes(keyword))) {
              priority = "informational";
            } else if (urgentKeywords.some(keyword => fullText.includes(keyword))) {
              priority = "urgent";
            } else if(importantKeywords.some(keyword => fullText.includes(keyword))) {
              priority = "important";
            }
            console.log(`[Gmail] Fallback analysis result: ${priority} for email from ${fromEmail}`);
          }
        }

        // Check if this email ID has already been processed and stored in DB
        const existingNotifications = await storage.getUserNotifications(userId, 100);
        const emailAlreadyExists = existingNotifications.some(notification =>
          notification.metadata?.emailId === message.id
        );

        if (emailAlreadyExists) {
          console.log(`[Gmail] Email notification already exists in database: ${message.id}`);
          continue; // Skip if already processed
        }

        console.log(`[Gmail] Creating notification for email: ${subject} from ${from} (Priority: ${priority}, isPriorityPerson: ${isPriorityPerson})`);

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
            emailDate: headers.find(h => h.name === 'Date')?.value || '',
            emailId: message.id, // Store email ID for deduplication
            isPriorityPerson: isPriorityPerson,
            priorityReason: isPriorityPerson ? "Priority Contact" : "Normal Email",
            fromEmail: fromEmail
          },
          actionableInsights: ["Reply to email", "Mark as read", "Archive email"],
        });

        console.log(`[Gmail] Notification created successfully for ${fromEmail}`);

      } catch (msgError) {
        console.error(`[Gmail] Error processing message ${message.id}:`, msgError);
      }
    }

    // Update last check time only if emails were successfully processed
    if (messages.length > 0) {
      await storage.updateUserLastGmailCheck(userId, new Date().toISOString());
    }

  } catch (error) {
    console.error(`[Gmail] Error fetching emails for user ${userId}:`, error);

    // Handle potential token expiry or API errors
    // If it's a token issue, we might want to notify the user or disable fetching
    // For now, just log and let the retry mechanism handle it.
    // If the error indicates an invalid token, we might need to clear cached credentials.
    if (error.message.includes('invalid_grant') || error.message.includes('unauthorized')) {
      console.error(`[Gmail] Token invalid for user ${userId}. Removing client and interval.`);
      if (userGmailIntervals.has(userId)) {
        clearInterval(userGmailIntervals.get(userId));
        userGmailIntervals.delete(userId);
      }
      userGmailClients.delete(userId);
      await storage.clearUserGmailTokens(userId); // Clear tokens from DB
      // Optionally create a notification for the user to re-authenticate
      await storage.createNotification({
        userId,
        title: "Gmail Authentication Expired",
        description: "Your Gmail connection has expired. Please reconnect your account to continue receiving email notifications.",
        type: "important",
        sourceApp: "gmail",
        aiSummary: "Gmail OAuth token expired",
        actionableInsights: ["Reconnect Gmail"],
      });
    }
  }
};

// Endpoint to initialize Gmail fetching for a user
app.post('/api/gmail/init', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  // Prevent re-initializing if already running
  if (userGmailIntervals.has(userId)) {
    return res.status(409).json({ message: 'Gmail fetching is already initialized.' });
  }

  try {
    // Fetch user's stored tokens
    const user = await storage.getUserById(userId);
    if (!user || !user.encryptedGmailAccessToken || !user.encryptedGmailRefreshToken) {
      return res.status(403).json({ message: 'Gmail not configured. Please connect your Gmail account first.' });
    }

    const accessToken = decryptGmailToken(user.encryptedGmailAccessToken);
    const refreshToken = decryptGmailToken(user.encryptedGmailRefreshToken);

    if (!accessToken || !refreshToken) {
      // Tokens might be corrupted or expired and not refreshable
      return res.status(401).json({ message: 'Invalid or expired Gmail tokens. Please reconnect your account.' });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    });

    userGmailClients.set(userId, oauth2Client);

    // Initial fetch immediately
    fetchUnreadEmails(userId).catch(error => {
      console.error(`[Gmail Init] Error during initial fetch for user ${userId}:`, error);
    });

    // Set up periodic fetching
    const interval = setInterval(() => fetchUnreadEmails(userId), 10000); // Fetch every 10 seconds
    userGmailIntervals.set(userId, interval);

    res.status(200).json({ message: 'Gmail fetching initialized successfully.' });

  } catch (error) {
    console.error(`Error initializing Gmail for user ${userId}:`, error);
    res.status(500).json({ message: 'Failed to initialize Gmail fetching.' });
  }
});

// Endpoint to stop Gmail fetching for a user
app.post('/api/gmail/stop', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  if (userGmailIntervals.has(userId)) {
    clearInterval(userGmailIntervals.get(userId));
    userGmailIntervals.delete(userId);
    userGmailClients.delete(userId); // Remove from memory cache
    console.log(`[Gmail] Stopped fetching for user ${userId}`);
    res.status(200).json({ message: 'Gmail fetching stopped.' });
  } else {
    res.status(404).json({ message: 'Gmail fetching not currently active for this user.' });
  }
});

// Endpoint to check Gmail connection status
app.get('/api/gmail/status', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  let status = 'disconnected';
  let canFetch = false;

  try {
    const user = await storage.getUserById(userId);
    if (user?.encryptedGmailAccessToken && user.encryptedGmailRefreshToken) {
      const accessToken = decryptGmailToken(user.encryptedGmailAccessToken);
      const refreshToken = decryptGmailToken(user.encryptedGmailRefreshToken);

      if (accessToken && refreshToken) {
        status = 'connected';
        // Check if fetching is actively running
        if (userGmailIntervals.has(userId)) {
          canFetch = true;
        }
      } else {
        status = 'invalid_tokens'; // Tokens exist but are not decryptable/valid
      }
    }
  } catch (error) {
    console.error(`Error checking Gmail status for user ${userId}:`, error);
    status = 'error';
  }

  res.json({ status, isFetching: canFetch });
});

// --- API Endpoints ---

// User registration
app.post("/api/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required." });
    }

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists." });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = await storage.createUser({ username, email, password: hashedPassword });

    // Generate tokens and set cookies upon registration
    const { accessToken, refreshToken } = generateTokens(newUser.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({ message: "User registered successfully", userId: newUser.id });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: "Failed to register user." });
  }
});

// User login
app.post("/api/login", rateLimitAuth, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await storage.getUserByEmail(email);
    if (!user) {
      trackFailedAuth(req, email);
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      trackFailedAuth(req, email);
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Generate tokens and set cookies
    const { accessToken, refreshToken } = generateTokens(user.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({ message: "Login successful", userId: user.id });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: "Failed to login." });
  }
});

// User logout
app.post('/api/logout', (req: Request, res: Response) => {
  clearAuthCookies(res);
  res.status(200).json({ message: 'Logout successful' });
});

// Get current user (requires authentication)
app.get('/api/user', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUserById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return user info, excluding sensitive data like password
    const { password, encryptedGmailAccessToken, encryptedGmailRefreshToken, ...userInfo } = user;
    res.json(userInfo);

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to fetch user data' });
  }
});

// Update user profile
app.put('/api/user/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { username, email, timezone, gmailIntegrationEnabled, priorityContacts } = req.body;

  try {
    // Validate input data
    if (!username || !email || !timezone) {
      return res.status(400).json({ message: 'Username, email, and timezone are required.' });
    }

    // Update user details in the database
    await storage.updateUserProfile(userId, { username, email, timezone });

    // Handle Gmail integration toggle
    if (typeof gmailIntegrationEnabled === 'boolean') {
      if (gmailIntegrationEnabled) {
        // If enabling, ensure the user initiates the OAuth flow
        // We don't enable it directly here, but prompt the user to connect
        await storage.setGmailIntegrationStatus(userId, true);
        // Respond with instructions to connect Gmail
        return res.status(200).json({ 
          message: 'Gmail integration enabled. Please connect your Gmail account via the dashboard to start syncing.',
          gmailConnectUrl: `/auth/google/url?userId=${userId}` // Provide URL to initiate OAuth
        });
      } else {
        // If disabling, clear tokens and related data
        await storage.clearUserGmailData(userId); // Clears tokens and disables integration
        if (userGmailIntervals.has(userId)) {
          clearInterval(userGmailIntervals.get(userId));
          userGmailIntervals.delete(userId);
        }
        userGmailClients.delete(userId);
        await storage.setGmailIntegrationStatus(userId, false);
        return res.status(200).json({ message: 'Gmail integration disabled. All synced data has been cleared.' });
      }
    }

    // Update priority contacts if provided
    if (Array.isArray(priorityContacts)) {
      await storage.updatePriorityContacts(userId, priorityContacts.map(c => c.toLowerCase().trim()));
    }

    res.status(200).json({ message: 'Profile updated successfully.' });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// Waitlist endpoint
  app.post("/api/waitlist/join", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ message: "Valid email is required" });
      }

      // Store in database
      const waitlistEntry = await storage.createWaitlistEntry({
        email: email.toLowerCase().trim(),
        metadata: {
          userAgent: req.headers['user-agent'] || '',
          ip: req.ip || '',
          timestamp: new Date().toISOString()
        }
      });

      // Send notification email (non-blocking)
      emailService.sendWaitlistEmail(email).catch(error => {
        console.error('Waitlist email sending failed (non-critical):', error);
      });

      res.status(200).json({ 
        success: true, 
        message: "Successfully joined the waitlist!" 
      });

    } catch (error) {
      console.error('Waitlist signup error:', error);
      res.status(500).json({ message: "Failed to join waitlist" });
    }
  });

// Feedback endpoint
  app.post("/api/feedback", async (req, res) => {
    try {
      const { name, email, message } = req.body;

      if (!name || !email || !message) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Store feedback in database
      const feedback = await storage.createFeedback({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        message: message.trim(),
        metadata: {
          userAgent: req.headers['user-agent'] || '',
          ip: req.ip || '',
          timestamp: new Date().toISOString()
        }
      });

      // Send notification email (non-blocking)
      emailService.sendFeedbackEmail(name, email, message).catch(error => {
        console.error('Feedback email sending failed (non-critical):', error);
      });

      res.status(200).json({ 
        success: true, 
        message: "Feedback submitted successfully!" 
      });

    } catch (error) {
      console.error('Feedback submission error:', error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

// Get all notifications for the current user
app.get('/api/notifications', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string, 10) || 100; // Default to 100
    const notifications = await storage.getUserNotifications(userId, limit);
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Mark a notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;
    await storage.markNotificationAsRead(userId, notificationId);
    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Delete a notification
app.delete('/api/notifications/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;
    await storage.deleteNotification(userId, notificationId);
    res.status(200).json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// Add task to user
app.post('/api/tasks', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { title, description, dueDate, priority, category, aiGenerated } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Task title is required' });
    }

    const newTask = await storage.createTask({
      userId,
      title,
      description: description || '',
      dueDate: dueDate || null,
      priority: priority || 'normal',
      category: category || 'general',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiGenerated: aiGenerated || false,
      metadata: {
        source: aiGenerated ? "AI Assistant" : "User Input",
      }
    });

    // If task is AI generated, potentially trigger smart scheduler
    if (aiGenerated && newTask.id) {
      await smartScheduler.addTaskToSchedule(userId, newTask.id);
    }

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// Get tasks for the current user
app.get('/api/tasks', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, category, priority, sort } = req.query;

    const tasks = await storage.getUserTasks(userId);

    // Filtering tasks
    let filteredTasks = tasks;
    if (status) filteredTasks = filteredTasks.filter(t => t.status === status);
    if (category) filteredTasks = filteredTasks.filter(t => t.category === category);
    if (priority) filteredTasks = filteredTasks.filter(t => t.priority === priority);

    // Sorting tasks
    if (sort === 'dueDate') {
      filteredTasks.sort((a, b) => {
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (a.dueDate) return -1; // Tasks with due dates come first
        if (b.dueDate) return 1;
        return 0;
      });
    } else if (sort === 'priority') {
      const priorityOrder = { urgent: 0, important: 1, normal: 2, low: 3 };
      filteredTasks.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));
    } else if (sort === 'createdAt') {
      filteredTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    res.json(filteredTasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
});

// Get a single task by ID
app.get('/api/tasks/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const taskId = req.params.id;
    const task = await storage.getTaskById(userId, taskId);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Get task by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch task' });
  }
});

// Update a task
app.put('/api/tasks/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const taskId = req.params.id;
    const { title, description, dueDate, priority, category, status, startedAt, completedAt } = req.body;

    const updatedTask = await storage.updateTask(userId, taskId, {
      title,
      description,
      dueDate,
      priority,
      category,
      status,
      startedAt,
      completedAt,
      updatedAt: new Date().toISOString(),
    });

    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // If task status changed to 'completed', update smart scheduler
    if (status === 'completed' && updatedTask.id) {
      await smartScheduler.removeTaskFromSchedule(userId, updatedTask.id);
    }
     // If task status changed from pending/in-progress to started, update startedAt
    if (status === 'in_progress' && !startedAt && updatedTask.startedAt) {
       await storage.updateTask(userId, taskId, { startedAt: updatedTask.startedAt });
    }
    // If task status changed to completed, set completedAt and update schedule
    if (status === 'completed' && !completedAt && updatedTask.completedAt) {
      await storage.updateTask(userId, taskId, { completedAt: updatedTask.completedAt });
      await smartScheduler.removeTaskFromSchedule(userId, updatedTask.id);
    }

    res.json(updatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// Delete a task
app.delete('/api/tasks/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const taskId = req.params.id;
    await storage.deleteTask(userId, taskId);
    // Also remove from smart scheduler if it exists there
    await smartScheduler.removeTaskFromSchedule(userId, taskId);
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

// Add priority contact
app.post('/api/priority-contacts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    await storage.addPriorityContact(userId, email.toLowerCase().trim());
    res.status(201).json({ message: 'Priority contact added successfully' });
  } catch (error) {
    console.error('Add priority contact error:', error);
    res.status(500).json({ message: 'Failed to add priority contact' });
  }
});

// Get priority contacts
app.get('/api/priority-contacts', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const contacts = await storage.getPriorityContacts(userId);
    res.json(contacts);
  } catch (error) {
    console.error('Get priority contacts error:', error);
    res.status(500).json({ message: 'Failed to fetch priority contacts' });
  }
});

// Delete priority contact
app.delete('/api/priority-contacts/:email', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const emailToDelete = req.params.email.toLowerCase().trim();
    await storage.removePriorityContact(userId, emailToDelete);
    res.status(200).json({ message: 'Priority contact deleted successfully' });
  } catch (error) {
    console.error('Delete priority contact error:', error);
    res.status(500).json({ message: 'Failed to delete priority contact' });
  }
});


// Analytics endpoint
  app.get("/api/analytics", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;

      const tasks = await storage.getUserTasks(userId);
      const notifications = await storage.getUserNotifications(userId, 100);

      // Calculate completion rate
      const completedTasks = tasks.filter(t => t.status === 'completed');
      const completionRate = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

      // Calculate average task completion time
      const completedTasksWithTime = completedTasks.filter(t => t.startedAt && t.completedAt);
      const avgCompletionTime = completedTasksWithTime.length > 0 
        ? completedTasksWithTime.reduce((sum, task) => {
            const startTime = new Date(task.startedAt!).getTime();
            const endTime = new Date(task.completedAt!).getTime();
            return sum + (endTime - startTime);
          }, 0) / completedTasksWithTime.length / (1000 * 60) // Convert to minutes
        : 0;

      // Productivity insights
      const today = new Date();
      const thisWeekStart = new Date(today.setDate(today.getDate() - today.getDay()));
      const thisWeekTasks = tasks.filter(t => 
        t.createdAt && new Date(t.createdAt) >= thisWeekStart
      );

      res.json({
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        completionRate: Math.round(completionRate),
        avgCompletionTime: Math.round(avgCompletionTime),
        totalNotifications: notifications.length,
        thisWeekTasks: thisWeekTasks.length,
        productivityScore: Math.min(100, Math.round(completionRate + (thisWeekTasks.length * 5)))
      });
    } catch (error) {
      console.error('Analytics fetch error:', error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Email test endpoint (development only)
  if (process.env.NODE_ENV === 'development') {
    app.post("/api/test-email", async (req, res) => {
      try {
        const isConnected = await emailService.testConnection();

        if (isConnected) {
          const testResult = await emailService.sendEmail({
            to: process.env.SMTP_USER || 'test@example.com',
            subject: 'FlowHub Email Test',
            text: 'This is a test email from FlowHub to verify SMTP configuration.',
            html: '<p>This is a test email from FlowHub to verify SMTP configuration.</p>'
          });

          res.json({ 
            success: testResult,
            message: testResult ? 'Test email sent successfully' : 'Test email failed to send',
            smtpConfigured: true
          });
        } else {
          res.json({ 
            success: false,
            message: 'SMTP connection test failed',
            smtpConfigured: false
          });
        }
      } catch (error) {
        console.error('Email test error:', error);
        res.status(500).json({ 
          success: false,
          message: 'Email test failed: ' + (error as Error).message,
          smtpConfigured: false
        });
      }
    });
  }


// --- Catch-all for undefined routes ---
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Endpoint not found" });
});

// --- Start Server ---
const PORT = process.env.PORT || 5001;
const httpServer = createServer(app);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app; // Export app for potential testing
