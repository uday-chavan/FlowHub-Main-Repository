import {
  users,
  tasks,
  notifications,
  priorityEmails,
  convertedEmails,
  type User,
  type InsertUser,
  type Task,
  type InsertTask,
  type Notification,
  type InsertNotification,
  type PriorityEmail,
  type InsertPriorityEmail,
  type ConvertedEmail,
  type InsertConvertedEmail,
} from "../shared/schema";
import { getDb } from "./db";
import { eq, desc, and, gte, lte, or, isNull, exists, asc, inArray, sql } from "drizzle-orm";

// Helper function to get database instance
function requireDb() {
  const db = getDb();
  if (!db) {
    throw new Error("Database not initialized. Please check your DATABASE_URL.");
  }
  return db;
}

// Storage interface
export interface IStorage {
  // User operations
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Task operations
  getUserTasks(userId: string, limit?: number): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  getTasksByDate(userId: string, date: Date): Promise<Task[]>;
  getOverdueTasks(userId: string): Promise<Task[]>;
  getUpcomingTasks(userId: string, days?: number): Promise<Task[]>;
  updateTaskStatus(id: string, status: Task['status']): Promise<Task>;
  bulkDeleteTasks(taskIds: string[]): Promise<void>;

  // Notification operations
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;
  dismissNotification(id: string): Promise<void>;
  bulkMarkAsRead(ids: string[]): Promise<void>;
  bulkDismissNotifications(ids: string[]): Promise<void>;
  getUnreadNotificationsCount(userId: string): Promise<number>;

  // Priority Email operations
  createPriorityEmail(data: InsertPriorityEmail): Promise<PriorityEmail>;
  getUserPriorityEmails(userId: string): Promise<PriorityEmail[]>;
  deletePriorityEmail(id: string): Promise<void>;
  isPriorityEmail(userId: string, email: string): Promise<boolean>;

  // Converted Email operations
  createConvertedEmail(data: InsertConvertedEmail): Promise<ConvertedEmail>;
  getUserConvertedEmails(userId: string): Promise<ConvertedEmail[]>;
  getConvertedEmail(id: string): Promise<ConvertedEmail | undefined>;
  deleteConvertedEmail(id: string): Promise<void>;
  bulkDeleteConvertedEmails(ids: string[]): Promise<void>;
  retrieveConvertedEmails(ids: string[]): Promise<void>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await requireDb().select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await requireDb().insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [updatedUser] = await requireDb()
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async getUserTasks(userId: string, limit?: number): Promise<Task[]> {
    let query = requireDb().select().from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt));

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await requireDb().select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await requireDb().insert(tasks).values(task).returning();
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const [updatedTask] = await requireDb()
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    await requireDb().delete(tasks).where(eq(tasks.id, id));
  }

  async getTasksByDate(userId: string, date: Date): Promise<Task[]> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    return await requireDb().select().from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          and(
            gte(tasks.dueAt, startOfDay),
            lte(tasks.dueAt, endOfDay)
          )
        )
      )
      .orderBy(asc(tasks.dueAt));
  }

  async getOverdueTasks(userId: string): Promise<Task[]> {
    const now = new Date();
    return await requireDb().select().from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          and(
            eq(tasks.status, 'pending'),
            lte(tasks.dueAt, now)
          )
        )
      )
      .orderBy(asc(tasks.dueAt));
  }

  async getUpcomingTasks(userId: string, days: number = 7): Promise<Task[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

    return await requireDb().select().from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          and(
            eq(tasks.status, 'pending'),
            and(
              gte(tasks.dueAt, now),
              lte(tasks.dueAt, futureDate)
            )
          )
        )
      )
      .orderBy(asc(tasks.dueAt));
  }

  async updateTaskStatus(id: string, status: Task['status']): Promise<Task> {
    const updates: Partial<Task> = { status, updatedAt: new Date() };

    if (status === 'completed') {
      updates.completedAt = new Date();
    } else if (status === 'in_progress') {
      updates.startedAt = new Date();
    }

    const [updatedTask] = await requireDb()
      .update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async bulkDeleteTasks(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return;
    await requireDb().delete(tasks).where(inArray(tasks.id, taskIds));
  }

  async getUserNotifications(userId: string, limit?: number): Promise<Notification[]> {
    let query = requireDb().select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await requireDb().insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await requireDb()
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async dismissNotification(id: string): Promise<void> {
    await requireDb()
      .update(notifications)
      .set({ isDismissed: true })
      .where(eq(notifications.id, id));
  }

  async bulkMarkAsRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await requireDb()
      .update(notifications)
      .set({ isRead: true })
      .where(inArray(notifications.id, ids));
  }

  async bulkDismissNotifications(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await requireDb()
      .update(notifications)
      .set({ isDismissed: true })
      .where(inArray(notifications.id, ids));
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    const result = await requireDb()
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          eq(notifications.isDismissed, false)
        )
      );
    return result[0]?.count || 0;
  }

  async createPriorityEmail(data: InsertPriorityEmail): Promise<PriorityEmail> {
    const [priorityEmail] = await requireDb().insert(priorityEmails).values(data).returning();
    return priorityEmail;
  }

  async getUserPriorityEmails(userId: string): Promise<PriorityEmail[]> {
    return await requireDb().select().from(priorityEmails)
      .where(eq(priorityEmails.userId, userId))
      .orderBy(desc(priorityEmails.createdAt));
  }

  async deletePriorityEmail(id: string): Promise<void> {
    await requireDb().delete(priorityEmails).where(eq(priorityEmails.id, id));
  }

  async isPriorityEmail(userId: string, email: string): Promise<boolean> {
    const [result] = await requireDb().select().from(priorityEmails)
      .where(and(eq(priorityEmails.userId, userId), eq(priorityEmails.email, email)));
    return !!result;
  }

  async createConvertedEmail(data: InsertConvertedEmail): Promise<ConvertedEmail> {
    const [convertedEmail] = await requireDb().insert(convertedEmails).values(data).returning();
    return convertedEmail;
  }

  async getUserConvertedEmails(userId: string): Promise<ConvertedEmail[]> {
    return await requireDb().select().from(convertedEmails)
      .where(eq(convertedEmails.userId, userId))
      .orderBy(desc(convertedEmails.convertedAt));
  }

  async getConvertedEmail(id: string): Promise<ConvertedEmail | undefined> {
    const [convertedEmail] = await requireDb().select().from(convertedEmails)
      .where(eq(convertedEmails.id, id));
    return convertedEmail;
  }

  async deleteConvertedEmail(id: string): Promise<void> {
    await requireDb().delete(convertedEmails).where(eq(convertedEmails.id, id));
  }

  async bulkDeleteConvertedEmails(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await requireDb().delete(convertedEmails).where(inArray(convertedEmails.id, ids));
  }

  async retrieveConvertedEmails(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Get the converted emails to recreate as notifications
    const emailsToRetrieve = await requireDb().select().from(convertedEmails)
      .where(inArray(convertedEmails.id, ids));

    // Create notifications for each retrieved email
    for (const email of emailsToRetrieve) {
      await requireDb().insert(notifications).values({
        userId: email.userId,
        title: email.subject,
        description: email.rawSnippet || `From: ${email.sender}`,
        type: 'email_converted',
        sourceApp: 'gmail',
        metadata: {
          ...email.metadata,
          retrievedFromConverted: true,
          originalConvertedAt: email.convertedAt,
          gmailMessageId: email.gmailMessageId,
          senderEmail: email.senderEmail
        }
      });
    }

    // Delete the converted emails
    await requireDb().delete(convertedEmails).where(inArray(convertedEmails.id, ids));
  }
}

// Memory storage implementation for testing/development
export class MemoryStorage implements IStorage {
  private users = new Map<string, User>();
  private tasks = new Map<string, Task>();
  private notifications = new Map<string, Notification>();
  private priorityEmailsMap = new Map<string, PriorityEmail>();
  private convertedEmailsMap = new Map<string, ConvertedEmail>();

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      ...user,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
      role: user.role || null,
      profileImageUrl: user.profileImageUrl || null,
      password: user.password || null
    };
    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUserTasks(userId: string, limit?: number): Promise<Task[]> {
    const userTasks = Array.from(this.tasks.values())
      .filter(task => task.userId === userId)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return limit ? userTasks.slice(0, limit) : userTasks;
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(task: InsertTask): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
      description: task.description || null,
      priority: task.priority || null,
      status: task.status || null,
      estimatedMinutes: task.estimatedMinutes || null,
      actualMinutes: task.actualMinutes || null,
      dueAt: task.dueAt || null,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      sourceApp: task.sourceApp || null,
      metadata: task.metadata || null
    };
    this.tasks.set(newTask.id, newTask);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Task not found");

    const updatedTask = { ...task, ...updates, updatedAt: new Date() };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    this.tasks.delete(id);
  }

  async getTasksByDate(userId: string, date: Date): Promise<Task[]> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    return Array.from(this.tasks.values())
      .filter(task =>
        task.userId === userId &&
        task.dueAt &&
        task.dueAt >= startOfDay &&
        task.dueAt <= endOfDay
      )
      .sort((a, b) => (a.dueAt?.getTime() || 0) - (b.dueAt?.getTime() || 0));
  }

  async getOverdueTasks(userId: string): Promise<Task[]> {
    const now = new Date();
    return Array.from(this.tasks.values())
      .filter(task =>
        task.userId === userId &&
        task.status === 'pending' &&
        task.dueAt &&
        task.dueAt <= now
      )
      .sort((a, b) => (a.dueAt?.getTime() || 0) - (b.dueAt?.getTime() || 0));
  }

  async getUpcomingTasks(userId: string, days: number = 7): Promise<Task[]> {
    const now = new Date();
    const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));

    return Array.from(this.tasks.values())
      .filter(task =>
        task.userId === userId &&
        task.status === 'pending' &&
        task.dueAt &&
        task.dueAt >= now &&
        task.dueAt <= futureDate
      )
      .sort((a, b) => (a.dueAt?.getTime() || 0) - (b.dueAt?.getTime() || 0));
  }

  async updateTaskStatus(id: string, status: Task['status']): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Task not found");

    const updates: Partial<Task> = { status, updatedAt: new Date() };

    if (status === 'completed') {
      updates.completedAt = new Date();
    } else if (status === 'in_progress') {
      updates.startedAt = new Date();
    }

    const updatedTask = { ...task, ...updates };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async bulkDeleteTasks(taskIds: string[]): Promise<void> {
    taskIds.forEach(id => this.tasks.delete(id));
  }

  async getUserNotifications(userId: string, limit?: number): Promise<Notification[]> {
    const userNotifications = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return limit ? userNotifications.slice(0, limit) : userNotifications;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      description: notification.description || null,
      type: notification.type || null,
      sourceApp: notification.sourceApp || null,
      isRead: notification.isRead || null,
      isDismissed: notification.isDismissed || null,
      aiSummary: notification.aiSummary || null,
      actionableInsights: notification.actionableInsights || null,
      metadata: notification.metadata || null
    };
    this.notifications.set(newNotification.id, newNotification);
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.isRead = true;
      this.notifications.set(id, notification);
    }
  }

  async dismissNotification(id: string): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.isDismissed = true;
      this.notifications.set(id, notification);
    }
  }

  async bulkMarkAsRead(ids: string[]): Promise<void> {
    ids.forEach(id => {
      const notification = this.notifications.get(id);
      if (notification) {
        notification.isRead = true;
        this.notifications.set(id, notification);
      }
    });
  }

  async bulkDismissNotifications(ids: string[]): Promise<void> {
    ids.forEach(id => {
      const notification = this.notifications.get(id);
      if (notification) {
        notification.isDismissed = true;
        this.notifications.set(id, notification);
      }
    });
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values())
      .filter(notification =>
        notification.userId === userId &&
        !notification.isRead &&
        !notification.isDismissed
      ).length;
  }

  async createPriorityEmail(data: InsertPriorityEmail): Promise<PriorityEmail> {
    const newPriorityEmail: PriorityEmail = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date()
    };
    this.priorityEmailsMap.set(newPriorityEmail.id, newPriorityEmail);
    return newPriorityEmail;
  }

  async getUserPriorityEmails(userId: string): Promise<PriorityEmail[]> {
    return Array.from(this.priorityEmailsMap.values())
      .filter(email => email.userId === userId)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());
  }

  async deletePriorityEmail(id: string): Promise<void> {
    this.priorityEmailsMap.delete(id);
  }

  async isPriorityEmail(userId: string, email: string): Promise<boolean> {
    return Array.from(this.priorityEmailsMap.values())
      .some(pe => pe.userId === userId && pe.email === email);
  }

  async createConvertedEmail(data: InsertConvertedEmail): Promise<ConvertedEmail> {
    const newConvertedEmail: ConvertedEmail = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      convertedAt: new Date(),
      createdAt: new Date(),
      gmailThreadId: data.gmailThreadId || null,
      rawSnippet: data.rawSnippet || null,
      status: data.status || null,
      taskIds: data.taskIds || null,
      metadata: data.metadata || null
    };
    this.convertedEmailsMap.set(newConvertedEmail.id, newConvertedEmail);
    return newConvertedEmail;
  }

  async getUserConvertedEmails(userId: string): Promise<ConvertedEmail[]> {
    return Array.from(this.convertedEmailsMap.values())
      .filter(email => email.userId === userId)
      .sort((a, b) => new Date(b.convertedAt || new Date()).getTime() - new Date(a.convertedAt || new Date()).getTime());
  }

  async getConvertedEmail(id: string): Promise<ConvertedEmail | undefined> {
    return this.convertedEmailsMap.get(id);
  }

  async deleteConvertedEmail(id: string): Promise<void> {
    this.convertedEmailsMap.delete(id);
  }

  async bulkDeleteConvertedEmails(ids: string[]): Promise<void> {
    ids.forEach(id => this.convertedEmailsMap.delete(id));
  }

  async retrieveConvertedEmails(ids: string[]): Promise<void> {
    const emailsToRetrieve = ids.map(id => this.convertedEmailsMap.get(id)).filter(Boolean) as ConvertedEmail[];

    // Create notifications for each retrieved email
    for (const email of emailsToRetrieve) {
      const newNotification: Notification = {
        id: Math.random().toString(36).substr(2, 9),
        userId: email.userId,
        title: email.subject,
        description: email.rawSnippet || `From: ${email.sender}`,
        type: 'email_converted',
        sourceApp: 'gmail',
        isRead: false,
        isDismissed: false,
        aiSummary: null,
        actionableInsights: null,
        metadata: {
          ...email.metadata,
          retrievedFromConverted: true,
          originalConvertedAt: email.convertedAt,
          gmailMessageId: email.gmailMessageId,
          senderEmail: email.senderEmail
        },
        createdAt: new Date()
      };
      this.notifications.set(newNotification.id, newNotification);
    }

    // Delete the converted emails
    ids.forEach(id => this.convertedEmailsMap.delete(id));
  }
}

// Create storage instance
export function createStorage(): IStorage {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const hasDatabase = !!process.env.DATABASE_URL;

  if (hasDatabase) {
    return new DatabaseStorage();
  } else {
    console.warn("No DATABASE_URL found, using in-memory storage");
    return new MemoryStorage();
  }
}

// Export singleton instance
export const storage = createStorage();
