e.auth.OAuth2(
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
