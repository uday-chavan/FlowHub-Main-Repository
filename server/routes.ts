import { createServer } from "http";
import type { Express } from "express";
import { db } from "./db";
import { getUserTokens, storeUserTokens, clearUserTokens } from "./tokenStorage";
import { google } from 'googleapis';
import { analyzeNotificationForTask } from "./openai";
import { storage } from "./storage";
import * as nodemailer from 'nodemailer';

// Placeholder for rate limiting function - replace with actual implementation
const rateLimitAuth = (limit: number, windowMs: number) => (req: any, res: any, next: any) => next();

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";

export function createHttpServer(app: Express, userId: string): import("http").Server {
  const userGmailIntervals = new Map<string, NodeJS.Timeout>();
  const userGmailClients = new Map<string, typeof google.auth>();
  const processedEmailIds = new Map<string, Set<string | undefined>>(); // To store processed email IDs per user

  // Gmail fetch logic for a specific user
  async function fetchUnreadEmailsForUser(userId: string) {
    console.log(`[Gmail] Fetching emails for user: ${userId}`);
    const userTokens = await getUserTokens(userId);

    if (!userTokens || !userTokens.refresh_token) {
      console.log(`[Gmail] No refresh token found for user ${userId}. Skipping email fetch.`);
      // Optionally, create a notification that Gmail is not connected
      await storage.createNotification({
        userId,
        title: "Gmail Not Connected",
        description: "Please connect your Gmail account to receive email notifications.",
        type: "informational",
        sourceApp: "gmail",
        aiSummary: "Gmail connection required",
        actionableInsights: ["Connect Gmail"],
      });
      return;
    }

    try {
      let oauth2Client = userGmailClients.get(userId);

      // If client doesn't exist or needs refresh
      if (!oauth2Client || userTokens.expiry_date && Date.now() >= userTokens.expiry_date) {
        console.log(`[Gmail] Refreshing token for user: ${userId}`);
        const retryClient = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          GOOGLE_REDIRECT_URI
        );
        retryClient.setCredentials(userTokens);

        const tokens = await new Promise((resolve, reject) => {
          retryClient.refreshAccessToken((err, tokens) => {
            if (err) reject(err);
            else resolve(tokens);
          });
        });

        // Update stored tokens with new expiry and access token
        const newTokens = {
          ...userTokens,
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
        };
        await storeUserTokens(userId, newTokens);
        oauth2Client = retryClient;
        oauth2Client.setCredentials(newTokens); // Set credentials on the client
        userGmailClients.set(userId, oauth2Client);
        console.log(`[Gmail] Token refreshed and stored for user: ${userId}`);
      }

      // Use the existing or newly created client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Get last check time for this user, default to a time in the past if not found
      const lastCheck = await storage.getUserLastGmailCheckTime(userId);
      let lastCheckTime = lastCheck ? new Date(lastCheck) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to 24 hours ago if no record

      const query = `is:unread category:primary after:${Math.floor(lastCheckTime.getTime() / 1000)}`;
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 20 // Fetch more emails to be safe
      });

      const messages = response.data.messages || [];
      const userProcessedIds = processedEmailIds.get(userId) || new Set<string | undefined>();

      // Process only new messages
      const newMessages = messages.filter(msg => msg.id && !userProcessedIds.has(msg.id));

      if (newMessages.length > 0) {
        console.log(`[Gmail] Found ${newMessages.length} new unread emails for user ${userId}`);
        for (const message of newMessages) {
          if (!message.id) continue;

          try {
            // Check if notification already exists for this email ID
            const existingNotifications = await storage.getUserNotifications(userId, 100);
            const emailAlreadyExists = existingNotifications.some(notification =>
              notification.metadata?.emailId === message.id
            );

            if (emailAlreadyExists) {
              console.log(`[Gmail] Email notification already exists in database: ${message.id}`);
              userProcessedIds.add(message.id); // Mark as processed even if already in DB
              continue;
            }

            const messageData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            const msg = messageData.data;
            const headers = msg.payload?.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
            const date = headers.find(h => h.name === 'Date')?.value || '';

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
            } else {
              try {
                const taskAnalysis = await analyzeNotificationForTask({
                  title: `New email from ${from}`,
                  description: `${subject}: ${body}`,
                  sourceApp: "gmail"
                });
                priority = taskAnalysis.priority as "urgent" | "important" | "informational";
              } catch (error) {
                console.log(`[Gmail] AI analysis failed for email from ${fromEmail}, using fallback logic`);
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
              }
            }

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
                emailDate: date,
                emailId: message.id,
                isPriorityPerson: isPriorityPerson,
                priorityReason: isPriorityPerson ? "Priority Contact" : "Normal Email",
                fromEmail: fromEmail
              },
              actionableInsights: ["Reply to email", "Mark as read", "Archive email"],
            });

            // Add to processed set
            userProcessedIds.add(message.id);
            processedEmailIds.set(userId, userProcessedIds);
            console.log(`[Gmail] Notification created for ${fromEmail}`);

          } catch (msgError) {
            console.error(`[Gmail] Error processing message ${message.id}:`, msgError);
          }
        }

        // Update last check time if new messages were processed
        await storage.setUserLastGmailCheckTime(userId, new Date());
        console.log(`[Gmail] Updated last check time for user ${userId}`);
      } else {
        console.log(`[Gmail] No new unread emails found for user ${userId}`);
      }
    } catch (error) {
      console.error(`[Gmail] Error fetching emails for user ${userId}:`, error);

      // Handle token refresh errors specifically
      if (error.code === 401 || error.message.includes('invalid_grant') || error.message.includes('Token has been expired or revoked')) {
        await storage.createNotification({
          userId,
          title: "Gmail Connection Lost",
          description: "Your Gmail connection has expired or been revoked. Please reconnect to continue receiving email notifications.",
          type: "important",
          sourceApp: "gmail",
          aiSummary: "Gmail OAuth token expired or revoked",
          actionableInsights: ["Reconnect Gmail", "Check authentication"],
        });

        // Stop fetching for this user
        if (userGmailIntervals.has(userId)) {
          clearInterval(userGmailIntervals.get(userId));
          userGmailIntervals.delete(userId);
        }
        userGmailClients.delete(userId);
        await clearUserTokens(userId); // Clear the invalid tokens
        console.log(`[Gmail] Cleared tokens and stopped fetching for user ${userId} due to expired/revoked token.`);
      } else {
        // For other errors, maybe just log and continue or notify user of a temporary issue
        console.error(`[Gmail] Non-authentication error fetching emails for ${userId}:`, error);
      }
    }
  }


  // Feedback route - no authentication required for demo
  app.post("/api/feedback/submit", rateLimitAuth(3, 15 * 60 * 1000), async (req, res) => {
    try {
      const { userId, feedback, timestamp } = req.body;

      if (!feedback || feedback.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: "Feedback must be at least 10 characters long"
        });
      }

      // Create email transporter
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'chavanuday407@gmail.com',
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });

      // Email content
      const mailOptions = {
        from: 'chavanuday407@gmail.com',
        to: 'chavanuday407@gmail.com',
        subject: 'FlowHub Feedback Submission',
        html: `
          <h2>New Feedback from FlowHub</h2>
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Timestamp:</strong> ${timestamp}</p>
          <p><strong>Feedback:</strong></p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0;">
            ${feedback.replace(/\n/g, '<br>')}
          </div>
        `
      };

      // Send email
      await transporter.sendMail(mailOptions);

      res.json({
        success: true,
        message: "Feedback sent successfully"
      });

    } catch (error) {
      console.error('[Feedback] Error sending email:', error);
      res.status(500).json({
        success: false,
        message: "Failed to send feedback"
      });
    }
  });


  // This section seems to be outside the scope of the original code provided for modification
  // and might be related to setting up the server. I'm including it as is to maintain completeness.
  // If this part is also meant to be modified or is causing issues, please provide specific instructions.

  const httpServer = createServer(app);
  return httpServer;
}
