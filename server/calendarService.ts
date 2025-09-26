import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { storage } from './storage';
import type { Task } from '../shared/schema';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders: {
    useDefault: boolean;
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
}

class CalendarService {
  private userCalendarClients = new Map<string, OAuth2Client>();

  setUserClient(userId: string, authClient: OAuth2Client) {
    this.userCalendarClients.set(userId, authClient);
  }

  removeUserClient(userId: string) {
    this.userCalendarClients.delete(userId);
  }

  hasUserClient(userId: string): boolean {
    return this.userCalendarClients.has(userId);
  }

  async createTaskEvent(task: Task): Promise<string | null> {
    try {
      if (!task.dueAt || task.status === 'completed') return null;

      const authClient = this.userCalendarClients.get(task.userId);
      if (!authClient) {
        console.log(`[Calendar] No auth client for user ${task.userId}`);
        return null;
      }

      // Create fresh OAuth2Client for calendar request
      const freshClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      const credentials = authClient.credentials;
      freshClient.setCredentials(credentials);

      const calendar = google.calendar({ version: 'v3', auth: freshClient });

      const dueDate = new Date(task.dueAt);
      const startTime = new Date(dueDate.getTime() - (task.estimatedMinutes || 30) * 60 * 1000);

      // Generate Google Calendar compatible event ID (lowercase letters, numbers, underscores only)
      const sanitizedTaskId = task.id.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const timestamp = Date.now().toString();
      const calendarEventId = `flowhub_${sanitizedTaskId}_${timestamp}`;

      const event: CalendarEvent = {
        id: calendarEventId, // Google Calendar compatible event ID
        summary: `📋 ${task.title}`,
        description: `FlowHub Task: ${task.description || ''}\n\nPriority: ${task.priority}\nEstimated time: ${task.estimatedMinutes || 30} minutes\n\nManage this task: https://flowhub.app/dashboard`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        end: {
          dateTime: dueDate.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },  // 1 hour
            { method: 'popup', minutes: 30 },  // 30 minutes
            { method: 'popup', minutes: 10 }   // 10 minutes
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event
      });

      console.log(`[Calendar] Created event for task: ${task.title}, event ID: ${response.data.id}`);
      return calendarEventId;

    } catch (error) {
      console.error(`[Calendar] Error creating event for task ${task.id}:`, error);
      return null;
    }
  }

  async updateTaskEvent(task: Task, calendarEventId: string): Promise<boolean> {
    try {
      if (!task.dueAt) return false;

      const authClient = this.userCalendarClients.get(task.userId);
      if (!authClient) return false;

      const freshClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      freshClient.setCredentials(authClient.credentials);
      const calendar = google.calendar({ version: 'v3', auth: freshClient });

      const dueDate = new Date(task.dueAt);
      const startTime = new Date(dueDate.getTime() - (task.estimatedMinutes || 30) * 60 * 1000);

      const updatedEvent = {
        summary: `📋 ${task.title}`,
        description: `FlowHub Task: ${task.description || ''}\n\nPriority: ${task.priority}\nEstimated time: ${task.estimatedMinutes || 30} minutes\n\nStatus: ${task.status}\n\nManage this task: https://flowhub.app/dashboard`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Kolkata'
        },
        end: {
          dateTime: dueDate.toISOString(),
          timeZone: 'Asia/Kolkata'
        }
      };

      await calendar.events.update({
        calendarId: 'primary',
        eventId: calendarEventId,
        requestBody: updatedEvent
      });

      console.log(`[Calendar] Updated event for task: ${task.title}`);
      return true;

    } catch (error) {
      console.error(`[Calendar] Error updating event for task ${task.id}:`, error);
      return false;
    }
  }

  async deleteTaskEvent(userId: string, calendarEventId: string): Promise<boolean> {
    try {
      const authClient = this.userCalendarClients.get(userId);
      if (!authClient) return false;

      const freshClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      freshClient.setCredentials(authClient.credentials);
      const calendar = google.calendar({ version: 'v3', auth: freshClient });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: calendarEventId
      });

      console.log(`[Calendar] Deleted calendar event: ${calendarEventId}`);
      return true;

    } catch (error) {
      console.error(`[Calendar] Error deleting event ${calendarEventId}:`, error);
      return false;
    }
  }

  async syncCalendarEvents(userId: string): Promise<void> {
    try {
      const authClient = this.userCalendarClients.get(userId);
      if (!authClient) return;

      const freshClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      freshClient.setCredentials(authClient.credentials);
      const calendar = google.calendar({ version: 'v3', auth: freshClient });

      // Get upcoming calendar events (next 7 days)
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50
      });

      const events = response.data.items || [];
      console.log(`[Calendar] Found ${events.length} upcoming calendar events for user ${userId}`);

      // Process events and create tasks for actionable items
      for (const event of events) {
        if (!event.summary || event.summary.startsWith('📋')) {
          // Skip FlowHub tasks and events without summary
          continue;
        }

        // Check if we already created a task for this event
        const existingTasks = await storage.getUserTasks(userId);
        const eventTaskExists = existingTasks.some(task => 
          task.metadata?.calendarEventId === event.id
        );

        if (eventTaskExists) continue;

        // Create task for calendar event if it contains actionable keywords
        const actionableKeywords = ['meeting', 'call', 'interview', 'deadline', 'presentation', 'review', 'demo', 'standup'];
        const hasActionableContent = actionableKeywords.some(keyword => 
          event.summary!.toLowerCase().includes(keyword)
        );

        if (hasActionableContent && event.start?.dateTime) {
          const eventStart = new Date(event.start.dateTime);
          const prepTime = new Date(eventStart.getTime() - 30 * 60 * 1000); // 30 min prep time

          await storage.createTask({
            userId,
            title: `Prepare: ${event.summary}`,
            description: `Prepare for calendar event: ${event.summary}\n\nEvent time: ${eventStart.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\nLocation: ${event.location || 'Not specified'}\n\nSynced from Google Calendar`,
            priority: 'important',
            status: 'pending',
            estimatedMinutes: 30,
            dueAt: prepTime,
            sourceApp: 'calendar',
            metadata: {
              calendarEventId: event.id,
              calendarSync: true,
              originalEventTitle: event.summary,
              eventStartTime: eventStart.toISOString(),
              eventLocation: event.location || null
            }
          });

          console.log(`[Calendar] Created prep task for calendar event: ${event.summary}`);
        }
      }

    } catch (error) {
      console.error(`[Calendar] Error syncing calendar events for user ${userId}:`, error);
    }
  }
}

export const calendarService = new CalendarService();
