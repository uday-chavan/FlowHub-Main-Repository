
import { storage } from "./storage";
import type { Task } from "../shared/schema";

interface TaskReminder {
  taskId: string;
  reminderTime: Date;
  reminderType: string;
  sent: boolean;
}

class TaskNotificationScheduler {
  private reminders: Map<string, TaskReminder[]> = new Map();
  private interval: NodeJS.Timeout | null = null;


  start() {
    // Check for reminders every minute
    this.interval = setInterval(() => {
      this.checkAndSendReminders();
    }, 60000);
    
    // Backfill reminders for existing tasks on startup with error handling
    this.backfillExistingTaskReminders().catch(error => {
      console.error('Error backfilling task reminders:', error);
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async scheduleTaskReminders(task: Task) {
    if (!task.dueAt || task.status === 'completed') return;

    const dueDate = new Date(task.dueAt);
    const now = new Date();
    const reminders: TaskReminder[] = [];

    // Schedule reminders: 1 hour, 30 min, 15 min, 10 min, 5 min before due
    const reminderTimes = [
      { minutes: 60, label: "1 hour" },
      { minutes: 30, label: "30 minutes" },
      { minutes: 15, label: "15 minutes" },
      { minutes: 10, label: "10 minutes" },
      { minutes: 5, label: "5 minutes" }
    ];

    for (const reminder of reminderTimes) {
      const reminderTime = new Date(dueDate.getTime() - reminder.minutes * 60 * 1000);
      
      // Only schedule if reminder time is in the future
      if (reminderTime > now) {
        reminders.push({
          taskId: task.id,
          reminderTime,
          reminderType: reminder.label,
          sent: false
        });
      }
    }

    if (reminders.length > 0) {
      this.reminders.set(task.id, reminders);
    }
  }

  private async checkAndSendReminders() {
    const now = new Date();

    // Check for priority promotions (Important -> Urgent when < 2 hours)
    await this.checkTaskPriorityPromotions();

    for (const [taskId, taskReminders] of this.reminders.entries()) {
      for (const reminder of taskReminders) {
        if (!reminder.sent && reminder.reminderTime <= now) {
          await this.sendTaskReminder(taskId, reminder.reminderType);
          reminder.sent = true;
        }
      }

      // Clean up sent reminders
      const activeReminders = taskReminders.filter(r => !r.sent);
      if (activeReminders.length === 0) {
        this.reminders.delete(taskId);
      } else {
        this.reminders.set(taskId, activeReminders);
      }
    }
  }

  private async checkTaskPriorityPromotions() {
    try {
      console.log('[TaskScheduler] Checking for priority promotions...');
      
      // Get all important tasks across all users that are not completed
      const importantTasks = await storage.getTasksByPriority("important");
      console.log(`[TaskScheduler] Found ${importantTasks.length} important tasks`);
      
      const activeTasks = importantTasks.filter(task => 
        task.status !== "completed" && 
        task.dueAt
      );
      console.log(`[TaskScheduler] Found ${activeTasks.length} active tasks with due dates`);

      const now = new Date();
      for (const task of activeTasks) {
        const dueDate = new Date(task.dueAt!);
        const timeRemaining = dueDate.getTime() - now.getTime();
        const hoursRemaining = timeRemaining / (1000 * 60 * 60);

        // Promote to urgent if less than 2 hours remaining
        if (hoursRemaining < 2 && hoursRemaining > 0) {
          await storage.updateTask(task.id, { priority: "urgent" });
          console.log(`[TaskScheduler] Promoted task "${task.title}" from Important to Urgent (${Math.round(hoursRemaining * 60)} minutes remaining)`);
        }
      }
    } catch (error) {
      console.error("Error checking task priority promotions:", error);
    }
  }

  private async sendTaskReminder(taskId: string, reminderType: string) {
    try {
      const task = await storage.getTaskById(taskId);
      if (!task || task.status === 'completed') return;

      let sourceType = "Manual";
      if (task.metadata?.aiGenerated) {
        sourceType = "AI Converted";
      } else if (task.sourceApp === "gmail") {
        sourceType = "Mail Converted";
      }

      // Store notification data for browser notification API with proper type
      await storage.createNotification({
        userId: task.userId,
        title: `⏰ Task Due in ${reminderType}`,
        description: `${sourceType} task "${task.title}" is due in ${reminderType}. ${task.description || 'Click to view task details.'}`,
        type: "browser_notification",
        sourceApp: "system",
        aiSummary: `Reminder for ${sourceType.toLowerCase()} task due in ${reminderType}`,
        actionableInsights: ["Complete task", "Reschedule task", "Mark as done"],
        metadata: {
          taskId: task.id,
          reminderType,
          sourceType,
          browserNotification: true,
          taskTitle: task.title,
          taskPriority: task.priority,
          dueAt: task.dueAt?.toISOString(),
          reminderTimestamp: new Date().toISOString()
        }
      });

      console.log(`[TaskScheduler] Created browser notification for task "${task.title}" due in ${reminderType}`);

    } catch (error) {
      console.error(`Failed to send reminder for task ${taskId}:`, error);
    }
  }

  removeTaskReminders(taskId: string) {
    this.reminders.delete(taskId);
  }

  private async backfillExistingTaskReminders() {
    try {
      console.log('[TaskScheduler] Backfilling reminders for existing tasks...');
      
      // Get all users and their tasks
      const allUsers = await storage.getAllUsers();
      let totalTasksWithReminders = 0;
      
      for (const user of allUsers) {
        const userTasks = await storage.getUserTasks(user.id);
        const tasksWithDueDates = userTasks.filter(task => 
          task.dueAt && 
          task.status !== 'completed' && 
          new Date(task.dueAt) > new Date()
        );
        
        console.log(`[TaskScheduler] Found ${tasksWithDueDates.length} tasks with due dates for user ${user.id}`);
        
        for (const task of tasksWithDueDates) {
          await this.scheduleTaskReminders(task);
          totalTasksWithReminders++;
        }
      }
      
      console.log(`[TaskScheduler] Backfilled reminders for ${totalTasksWithReminders} tasks across all users`);
    } catch (error) {
      console.error('Error backfilling task reminders:', error);
    }
  }
}

export const taskNotificationScheduler = new TaskNotificationScheduler(); 
