import {
  users,
  tasks,
  notifications,
  connectedApps,
  userMetrics,
  aiInsights,
  userAppLinks,
  credentials,
  plans,
  payments,
  subscriptions,
  userUsage,
  encryptedGmailTokens,
  priorityEmails,
  type User,
  type InsertUser,
  type Task,
  type InsertTask,
  type Notification,
  type InsertNotification,
  type ConnectedApp,
  type InsertConnectedApp,
  type UserMetrics,
  type InsertUserMetrics,
  type AiInsight,
  type InsertAiInsight,
  type UserAppLink,
  type InsertUserAppLink,
  type Credential,
  type InsertCredential,
  type Plan,
  type InsertPlan,
  type Payment,
  type InsertPayment,
  type Subscription,
  type InsertSubscription,
  type UserUsage,
  type InsertUserUsage,
  type EncryptedGmailToken,
  type InsertEncryptedGmailToken,
  type PriorityEmail,
  type InsertPriorityEmail,
} from "../shared/schema";
import { getDb } from "./db";
import { eq, desc, and, gte, lte, or, isNull, exists, asc, inArray, sql } from "drizzle-orm";

// Helper function to get database instance
function requireDb() {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  return db;
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Task operations
  getUserTasks(userId: string): Promise<Task[]>;
  getTaskById(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  getTasksByStatus(userId: string, status: string): Promise<Task[]>;
  getTasksByPriority(priority: string, status?: string): Promise<Task[]>;

  // Notification operations
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getNotificationById(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  dismissNotification(id: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Connected Apps operations
  getUserConnectedApps(userId: string): Promise<ConnectedApp[]>;
  createConnectedApp(app: InsertConnectedApp): Promise<ConnectedApp>;
  updateConnectedApp(id: string, updates: Partial<ConnectedApp>): Promise<ConnectedApp>;

  // User Metrics operations
  getUserMetrics(userId: string, date?: Date): Promise<UserMetrics | undefined>;
  createUserMetrics(metrics: InsertUserMetrics): Promise<UserMetrics>;
  updateUserMetrics(id: string, updates: Partial<UserMetrics>): Promise<UserMetrics>;

  // AI Insights operations
  getUserAiInsights(userId: string, limit?: number): Promise<AiInsight[]>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  dismissAiInsight(id: string): Promise<void>;
  applyAiInsight(id: string): Promise<void>;

  // User App Links operations
  getUserAppLinks(userId: string): Promise<UserAppLink[]>;
  createUserAppLink(link: InsertUserAppLink): Promise<UserAppLink>;
  deleteUserAppLink(id: string): Promise<void>;

  // User Usage operations for plan limits
  getUserUsage(userId: string, month: string): Promise<UserUsage | undefined>;
  createUserUsage(usage: InsertUserUsage): Promise<UserUsage>;
  updateUserUsage(id: string, updates: Partial<UserUsage>): Promise<UserUsage>;
  incrementAiTaskUsage(userId: string): Promise<UserUsage | null>;
  checkAiTaskLimit(userId: string): Promise<{ withinLimit: boolean; currentCount: number; limit: number; planType: string }>;
  createAiTaskWithLimit(task: InsertTask): Promise<Task | null>;

  // Gmail Token operations
  createEncryptedGmailToken(data: InsertEncryptedGmailToken): Promise<EncryptedGmailToken>;
  getEncryptedGmailToken(userId: string): Promise<EncryptedGmailToken | undefined>;
  updateEncryptedGmailToken(userId: string, data: Partial<InsertEncryptedGmailToken>): Promise<EncryptedGmailToken>;
  deleteEncryptedGmailToken(userId: string): Promise<void>;

  // Priority Email operations
  createPriorityEmail(data: InsertPriorityEmail): Promise<PriorityEmail>;
  getUserPriorityEmails(userId: string): Promise<PriorityEmail[]>;
  deletePriorityEmail(id: string): Promise<void>;
  isPriorityEmail(userId: string, email: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await requireDb().select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await requireDb().select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await requireDb().insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await requireDb()
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Task operations
  async getUserTasks(userId: string): Promise<Task[]> {
    return await requireDb()
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt));
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    const [task] = await requireDb().select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await requireDb().insert(tasks).values(insertTask).returning();
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const [task] = await requireDb()
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await requireDb().delete(tasks).where(eq(tasks.id, id));
  }

  async getTasksByStatus(userId: string, status: string): Promise<Task[]> {
    return await requireDb()
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, status as any)))
      .orderBy(desc(tasks.createdAt));
  }

  async getTasksByPriority(priority: string, status?: string): Promise<Task[]> {
    const conditions = [eq(tasks.priority, priority as any)];
    if (status) {
      conditions.push(eq(tasks.status, status as any));
    }
    return await requireDb()
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt));
  }

  // Notification operations
  async getUserNotifications(userId: string, limit = 50): Promise<Notification[]> {
    return await requireDb()
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isDismissed, false)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    const [notification] = await requireDb()
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));
    return notification;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await requireDb()
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationRead(id: string): Promise<void> {
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

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await requireDb()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          eq(notifications.isDismissed, false)
        )
      );
    return result.length;
  }

  // Connected Apps operations
  async getUserConnectedApps(userId: string): Promise<ConnectedApp[]> {
    return await requireDb()
      .select()
      .from(connectedApps)
      .where(eq(connectedApps.userId, userId))
      .orderBy(connectedApps.appName);
  }

  async createConnectedApp(insertApp: InsertConnectedApp): Promise<ConnectedApp> {
    const [app] = await requireDb().insert(connectedApps).values(insertApp).returning();
    return app;
  }

  async updateConnectedApp(id: string, updates: Partial<ConnectedApp>): Promise<ConnectedApp> {
    const [app] = await requireDb()
      .update(connectedApps)
      .set(updates)
      .where(eq(connectedApps.id, id))
      .returning();
    return app;
  }

  // User Metrics operations
  async getUserMetrics(userId: string, date?: Date): Promise<UserMetrics | undefined> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [metrics] = await requireDb()
      .select()
      .from(userMetrics)
      .where(
        and(
          eq(userMetrics.userId, userId),
          gte(userMetrics.date, startOfDay),
          lte(userMetrics.date, endOfDay)
        )
      )
      .orderBy(desc(userMetrics.createdAt));

    return metrics;
  }

  async createUserMetrics(insertMetrics: InsertUserMetrics): Promise<UserMetrics> {
    const [metrics] = await requireDb()
      .insert(userMetrics)
      .values(insertMetrics)
      .returning();
    return metrics;
  }

  async updateUserMetrics(id: string, updates: Partial<UserMetrics>): Promise<UserMetrics> {
    const [metrics] = await requireDb()
      .update(userMetrics)
      .set(updates)
      .where(eq(userMetrics.id, id))
      .returning();
    return metrics;
  }

  // AI Insights operations
  async getUserAiInsights(userId: string, limit = 10): Promise<AiInsight[]> {
    return await requireDb()
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.userId, userId),
          eq(aiInsights.isDismissed, false)
        )
      )
      .orderBy(desc(aiInsights.createdAt))
      .limit(limit);
  }

  async createAiInsight(insertInsight: InsertAiInsight): Promise<AiInsight> {
    const [insight] = await requireDb().insert(aiInsights).values(insertInsight).returning();
    return insight;
  }

  async dismissAiInsight(id: string): Promise<void> {
    await requireDb()
      .update(aiInsights)
      .set({ isDismissed: true })
      .where(eq(aiInsights.id, id));
  }

  async applyAiInsight(id: string): Promise<void> {
    await requireDb()
      .update(aiInsights)
      .set({ isApplied: true })
      .where(eq(aiInsights.id, id));
  }

  // User App Links operations
  async getUserAppLinks(userId: string): Promise<UserAppLink[]> {
    return await requireDb()
      .select()
      .from(userAppLinks)
      .where(eq(userAppLinks.userId, userId))
      .orderBy(desc(userAppLinks.createdAt));
  }

  async createUserAppLink(insertLink: InsertUserAppLink): Promise<UserAppLink> {
    const [link] = await requireDb().insert(userAppLinks).values(insertLink).returning();
    return link;
  }

  async deleteUserAppLink(id: string): Promise<void> {
    await requireDb().delete(userAppLinks).where(eq(userAppLinks.id, id));
  }

  // User Usage operations for plan limits
  async getUserUsage(userId: string, month: string): Promise<UserUsage | undefined> {
    const [usage] = await requireDb()
      .select()
      .from(userUsage)
      .where(and(eq(userUsage.userId, userId), eq(userUsage.month, month)));
    return usage;
  }

  async createUserUsage(insertUsage: InsertUserUsage): Promise<UserUsage> {
    const [usage] = await requireDb().insert(userUsage).values(insertUsage).returning();
    return usage;
  }

  async updateUserUsage(id: string, updates: Partial<UserUsage>): Promise<UserUsage> {
    const [usage] = await requireDb()
      .update(userUsage)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userUsage.id, id))
      .returning();
    return usage;
  }

  async incrementAiTaskUsage(userId: string): Promise<UserUsage | null> {
    const currentMonth = new Date().toISOString().slice(0, 7); // "2025-01" format
    const limit = 50; // Free plan limit

    try {
      // Atomic increment with limit check - only increment if under limit
      const [updatedUsage] = await requireDb()
        .update(userUsage)
        .set({ 
          aiTasksCreated: sql`${userUsage.aiTasksCreated} + 1`,
          aiInteractionsCount: sql`${userUsage.aiInteractionsCount} + 1`,
          updatedAt: new Date()
        })
        .where(and(
          eq(userUsage.userId, userId), 
          eq(userUsage.month, currentMonth),
          sql`${userUsage.aiTasksCreated} < ${limit}` // Only update if under limit
        ))
        .returning();

      if (updatedUsage) {
        return updatedUsage; // Successfully incremented
      }

      // If no rows updated, either no record exists or limit reached
      // Try to create new record if it doesn't exist
      try {
        const [newUsage] = await requireDb()
          .insert(userUsage)
          .values({
            userId,
            month: currentMonth,
            aiTasksCreated: 1,
            aiInteractionsCount: 1,
            planType: "free"
          })
          .returning();
        return newUsage;
      } catch (insertError: any) {
        // Handle race condition where another request created the record
        if (insertError.code === '23505') { // Unique constraint violation
          // Record exists, retry atomic update with limit check
          const [retryUsage] = await requireDb()
            .update(userUsage)
            .set({ 
              aiTasksCreated: sql`${userUsage.aiTasksCreated} + 1`,
              aiInteractionsCount: sql`${userUsage.aiInteractionsCount} + 1`,
              updatedAt: new Date()
            })
            .where(and(
              eq(userUsage.userId, userId), 
              eq(userUsage.month, currentMonth),
              sql`${userUsage.aiTasksCreated} < ${limit}` // Only update if under limit
            ))
            .returning();
          return retryUsage || null; // null if limit exceeded
        }
        throw insertError;
      }
    } catch (error) {
      console.error("Error incrementing AI task usage:", error);
      return null;
    }
  }

  async createAiTaskWithLimit(taskData: InsertTask): Promise<Task | null> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const limit = 50; // Free plan limit

    try {
      // Perform atomic reservation and task creation in a single transaction
      const result = await requireDb().transaction(async (tx) => {
        // First, try to reserve capacity atomically using the transaction
        const [reservedUsage] = await tx
          .update(userUsage)
          .set({ 
            aiTasksCreated: sql`${userUsage.aiTasksCreated} + 1`,
            aiInteractionsCount: sql`${userUsage.aiInteractionsCount} + 1`,
            updatedAt: new Date()
          })
          .where(and(
            eq(userUsage.userId, taskData.userId),
            eq(userUsage.month, currentMonth),
            sql`${userUsage.aiTasksCreated} < ${limit}` // Only update if under limit
          ))
          .returning();

        if (!reservedUsage) {
          // Either no record exists or limit reached - try to create new record within transaction
          try {
            const [newUsage] = await tx
              .insert(userUsage)
              .values({
                userId: taskData.userId,
                month: currentMonth,
                aiTasksCreated: 1,
                aiInteractionsCount: 1,
                planType: "free"
              })
              .returning();

            if (!newUsage) {
              throw new Error("Failed to create usage record");
            }
          } catch (insertError: any) {
            if (insertError.code === '23505') {
              // Record exists, try the conditional update one more time within transaction
              const [retryUsage] = await tx
                .update(userUsage)
                .set({ 
                  aiTasksCreated: sql`${userUsage.aiTasksCreated} + 1`,
                  aiInteractionsCount: sql`${userUsage.aiInteractionsCount} + 1`,
                  updatedAt: new Date()
                })
                .where(and(
                  eq(userUsage.userId, taskData.userId),
                  eq(userUsage.month, currentMonth),
                  sql`${userUsage.aiTasksCreated} < ${limit}` // Only update if under limit
                ))
                .returning();

              if (!retryUsage) {
                throw new Error("AI task limit exceeded");
              }
            } else {
              throw insertError;
            }
          }
        }

        // If we reach here, capacity is reserved within the transaction - now create the task
        const [task] = await tx
          .insert(tasks)
          .values(taskData)
          .returning();

        if (!task) {
          throw new Error("Failed to create task");
        }

        return task;
      });

      return result;
    } catch (error: any) {
      if (error.message === "AI task limit exceeded") {
        console.log(`AI task limit exceeded for user ${taskData.userId}`);
        return null;
      }
      console.error("Error creating AI task with limit check:", error);
      throw error;
    }
  }

  async checkAiTaskLimit(userId: string): Promise<{ withinLimit: boolean; currentCount: number; limit: number; planType: string }> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usage = await this.getUserUsage(userId, currentMonth);

    const currentCount = usage?.aiTasksCreated || 0;
    const planType = usage?.planType || "free";

    // Define limits based on plan
    const limits = {
      free: 50,
      basic: 100,
      premium: 500,
      enterprise: 1000
    };

    const limit = limits[planType as keyof typeof limits] || 50;
    const withinLimit = currentCount < limit;

    return { withinLimit, currentCount, limit, planType };
  }

  // Create encrypted Gmail token
  async createEncryptedGmailToken(data: InsertEncryptedGmailToken): Promise<EncryptedGmailToken> {
    const [token] = await requireDb().insert(encryptedGmailTokens).values(data).returning();
    return token;
  }

  // Get encrypted Gmail token by user ID
  async getEncryptedGmailToken(userId: string): Promise<EncryptedGmailToken | undefined> {
    const [token] = await requireDb().select().from(encryptedGmailTokens).where(eq(encryptedGmailTokens.userId, userId));
    return token;
  }

  // Update encrypted Gmail token
  async updateEncryptedGmailToken(userId: string, data: Partial<InsertEncryptedGmailToken>): Promise<EncryptedGmailToken> {
    const [token] = await requireDb()
      .update(encryptedGmailTokens)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(encryptedGmailTokens.userId, userId))
      .returning();
    return token;
  }

  // Delete encrypted Gmail token
  async deleteEncryptedGmailToken(userId: string): Promise<void> {
    await requireDb().delete(encryptedGmailTokens).where(eq(encryptedGmailTokens.userId, userId));
  }

  // Priority Emails methods
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
    const [result] = await requireDb().select({ count: sql<number>`count(*)` })
      .from(priorityEmails)
      .where(and(
        eq(priorityEmails.userId, userId),
        eq(priorityEmails.email, email.toLowerCase())
      ));
    return result.count > 0;
  }
}

// Use in-memory storage for demo/development
export class MemoryStorage implements IStorage {
  private users = new Map<string, User>();
  private tasks = new Map<string, Task>();
  private notifications = new Map<string, Notification>();
  private connectedApps = new Map<string, ConnectedApp>();
  private userMetrics = new Map<string, UserMetrics>();
  private aiInsights = new Map<string, AiInsight>();
  private userAppLinks = new Map<string, UserAppLink>();
  private userUsageMap = new Map<string, UserUsage>();
  private encryptedGmailTokens = new Map<string, EncryptedGmailToken>();
  private priorityEmailsMap = new Map<string, PriorityEmail>();


  constructor() {
    // Initialize with demo user
    const demoUser: User = {
      id: "demo-user",
      name: "Demo User",
      email: "demo@flowhub.com",
      password: null,
      role: "Executive",
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set("demo-user", demoUser);

    // Initialize demo metrics
    const demoMetrics: UserMetrics = {
      id: "demo-metrics",
      userId: "demo-user",
      focusScore: 85,
      workloadCapacity: 75,
      stressLevel: "low",
      tasksCompleted: 12,
      activeHours: 6,
      todayProgress: 68,
      nextBreakIn: 25,
      date: new Date(),
      createdAt: new Date(),
    };
    this.userMetrics.set("demo-user", demoMetrics);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    for (const user of Array.from(this.users.values())) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    // Generate a proper unique ID for the user
    const userId = userData.id || `user-${Math.random().toString(36).substr(2, 9)}`;
    
    // Using memory storage instead of db
    const user: User = {
      ...userData,
      id: userId,
      password: userData.password || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: userData.role || null,
      profileImageUrl: userData.profileImageUrl || null
    };
    this.users.set(user.id, user);

    // Create default app links for new users
    const defaultAppLinks = [
      { userId: user.id, name: 'GitHub', url: 'https://github.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/github.svg' },
      { userId: user.id, name: 'Zoom', url: 'https://zoom.us', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/zoom.svg' },
      { userId: user.id, name: 'Google', url: 'https://google.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/google.svg' },
      { userId: user.id, name: 'Slack', url: 'https://slack.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/slack.svg' },
      { userId: user.id, name: 'Jira', url: 'https://atlassian.com/software/jira', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/jira.svg' },
      { userId: user.id, name: 'Trello', url: 'https://trello.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/trello.svg' },
      { userId: user.id, name: 'LinkedIn', url: 'https://linkedin.com', logo: 'https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg' },
    ];

    // Add default app links using memory storage
    defaultAppLinks.forEach(link => {
      const appLink: UserAppLink = {
        ...link,
        id: Math.random().toString(36).substr(2, 9),
        createdAt: new Date(),
        logo: link.logo || null
      };
      this.userAppLinks.set(appLink.id, appLink);
    });

    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");

    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getUserTasks(userId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.userId === userId)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(task: InsertTask): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substr(2, 9),
      status: task.status || "pending", // Ensure status defaults to "pending"
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: task.metadata || {},
      description: task.description || null,
      priority: task.priority || null,
      sourceApp: task.sourceApp || null,
      dueAt: task.dueAt || null,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      estimatedMinutes: task.estimatedMinutes || null,
      actualMinutes: task.actualMinutes || null
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

  async getTasksByStatus(userId: string, status: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.userId === userId && task.status === status);
  }

  async getTasksByPriority(priority: string, status?: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter(task => task.priority === priority && (!status || task.status === status));
  }

  async getUserNotifications(userId: string, limit?: number): Promise<Notification[]> {
    const userNotifications = Array.from(this.notifications.values())
      .filter(notification => notification.userId === userId && !notification.isDismissed)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return limit ? userNotifications.slice(0, limit) : userNotifications;
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    return this.notifications.get(id);
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
      metadata: notification.metadata || {}
    };
    this.notifications.set(newNotification.id, newNotification);
    return newNotification;
  }

  async markNotificationRead(id: string): Promise<void> {
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

  async getUnreadNotificationCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values())
      .filter(n => n.userId === userId && !n.isRead && !n.isDismissed).length;
  }

  async getUserConnectedApps(userId: string): Promise<ConnectedApp[]> {
    return Array.from(this.connectedApps.values())
      .filter(app => app.userId === userId);
  }

  async createConnectedApp(app: InsertConnectedApp): Promise<ConnectedApp> {
    const newApp: ConnectedApp = {
      ...app,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      isConnected: app.isConnected || null,
      hasNotifications: app.hasNotifications || null,
      lastSyncAt: app.lastSyncAt || null
    };
    this.connectedApps.set(newApp.id, newApp);
    return newApp;
  }

  async updateConnectedApp(id: string, updates: Partial<ConnectedApp>): Promise<ConnectedApp> {
    const app = this.connectedApps.get(id);
    if (!app) throw new Error("Connected app not found");

    const updatedApp = { ...app, ...updates };
    this.connectedApps.set(id, updatedApp);
    return updatedApp;
  }

  async getUserMetrics(userId: string, date?: Date): Promise<UserMetrics | undefined> {
    return this.userMetrics.get(userId);
  }

  async createUserMetrics(metrics: InsertUserMetrics): Promise<UserMetrics> {
    const newMetrics: UserMetrics = {
      ...metrics,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      date: metrics.date || null,
      focusScore: metrics.focusScore || null,
      workloadCapacity: metrics.workloadCapacity || null,
      stressLevel: metrics.stressLevel || null,
      tasksCompleted: metrics.tasksCompleted || null,
      activeHours: metrics.activeHours || null,
      todayProgress: metrics.todayProgress || null,
      nextBreakIn: metrics.nextBreakIn || null
    };
    this.userMetrics.set(metrics.userId, newMetrics);
    return newMetrics;
  }

  async updateUserMetrics(id: string, updates: Partial<UserMetrics>): Promise<UserMetrics> {
    const metrics = Array.from(this.userMetrics.values()).find(m => m.id === id);
    if (!metrics) throw new Error("User metrics not found");

    const updatedMetrics = { ...metrics, ...updates };
    this.userMetrics.set(metrics.userId, updatedMetrics);
    return updatedMetrics;
  }

  async getUserAiInsights(userId: string, limit?: number): Promise<AiInsight[]> {
    const userInsights = Array.from(this.aiInsights.values())
      .filter(insight => insight.userId === userId && !insight.isDismissed)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());

    return limit ? userInsights.slice(0, limit) : userInsights;
  }

  async createAiInsight(insight: InsertAiInsight): Promise<AiInsight> {
    const newInsight: AiInsight = {
      ...insight,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      metadata: insight.metadata || {},
      isDismissed: insight.isDismissed || null,
      priority: insight.priority || null,
      actionable: insight.actionable || null,
      isApplied: insight.isApplied || null
    };
    this.aiInsights.set(newInsight.id, newInsight);
    return newInsight;
  }

  async dismissAiInsight(id: string): Promise<void> {
    const insight = this.aiInsights.get(id);
    if (insight) {
      insight.isDismissed = true;
      this.aiInsights.set(id, insight);
    }
  }

  async applyAiInsight(id: string): Promise<void> {
    const insight = this.aiInsights.get(id);
    if (insight) {
      insight.isApplied = true;
      this.aiInsights.set(id, insight);
    }
  }

  async getUserAppLinks(userId: string): Promise<UserAppLink[]> {
    return Array.from(this.userAppLinks.values())
      .filter(link => link.userId === userId)
      .sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());
  }

  async createUserAppLink(link: InsertUserAppLink): Promise<UserAppLink> {
    const newLink: UserAppLink = {
      ...link,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      logo: link.logo || null
    };
    this.userAppLinks.set(newLink.id, newLink);
    return newLink;
  }

  async deleteUserAppLink(id: string): Promise<void> {
    this.userAppLinks.delete(id);
  }

  // User Usage operations for plan limits
  async getUserUsage(userId: string, month: string): Promise<UserUsage | undefined> {
    const key = `${userId}-${month}`;
    return this.userUsageMap.get(key);
  }

  async createUserUsage(insertUsage: InsertUserUsage): Promise<UserUsage> {
    const newUsage: UserUsage = {
      ...insertUsage,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
      aiTasksCreated: insertUsage.aiTasksCreated || 0,
      aiInteractionsCount: insertUsage.aiInteractionsCount || 0,
      planType: insertUsage.planType || "free"
    };
    const key = `${newUsage.userId}-${newUsage.month}`;
    this.userUsageMap.set(key, newUsage);
    return newUsage;
  }

  async updateUserUsage(id: string, updates: Partial<UserUsage>): Promise<UserUsage> {
    const usage = Array.from(this.userUsageMap.values()).find(u => u.id === id);
    if (!usage) throw new Error("User usage not found");

    const updatedUsage = { ...usage, ...updates, updatedAt: new Date() };
    const key = `${updatedUsage.userId}-${updatedUsage.month}`;
    this.userUsageMap.set(key, updatedUsage);
    return updatedUsage;
  }

  async incrementAiTaskUsage(userId: string): Promise<UserUsage | null> {
    const currentMonth = new Date().toISOString().slice(0, 7); // "2025-01" format

    // First check current limits to prevent increment if already at limit
    const limitCheck = await this.checkAiTaskLimit(userId);
    if (!limitCheck.withinLimit) {
      return null; // Return null if limit would be exceeded
    }

    // Get or create usage record for current month
    let usage = await this.getUserUsage(userId, currentMonth);

    if (!usage) {
      // Create new usage record for this month
      usage = await this.createUserUsage({
        userId,
        month: currentMonth,
        aiTasksCreated: 1,
        aiInteractionsCount: 1,
        planType: "free"
      });
    } else {
      // Increment existing usage
      usage = await this.updateUserUsage(usage.id, {
        aiTasksCreated: (usage.aiTasksCreated || 0) + 1,
        aiInteractionsCount: (usage.aiInteractionsCount || 0) + 1
      });
    }

    return usage;
  }

  async createAiTaskWithLimit(taskData: InsertTask): Promise<Task | null> {
    // Check AI task limits before proceeding
    const limitCheck = await this.checkAiTaskLimit(taskData.userId);
    if (!limitCheck.withinLimit) {
      return null; // Return null if limit exceeded
    }

    // Increment usage counter
    const usage = await this.incrementAiTaskUsage(taskData.userId);
    if (!usage) {
      return null; // Return null if increment failed (shouldn't happen in memory storage)
    }

    // Create the task
    const task = await this.createTask(taskData);
    return task;
  }

  async checkAiTaskLimit(userId: string): Promise<{ withinLimit: boolean; currentCount: number; limit: number; planType: string }> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usage = await this.getUserUsage(userId, currentMonth);

    const currentCount = usage?.aiTasksCreated || 0;
    const planType = usage?.planType || "free";

    // Define limits based on plan
    const limits = {
      free: 50,
      basic: 100,
      premium: 500,
      enterprise: 1000
    };

    const limit = limits[planType as keyof typeof limits] || 50;
    const withinLimit = currentCount < limit;

    return { withinLimit, currentCount, limit, planType };
  }

  // Gmail Token operations
  async createEncryptedGmailToken(data: InsertEncryptedGmailToken): Promise<EncryptedGmailToken> {
    const newEncryptedGmailToken: EncryptedGmailToken = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
      token: data.token,
      userId: data.userId,
    };
    this.encryptedGmailTokens.set(newEncryptedGmailToken.id, newEncryptedGmailToken);
    return newEncryptedGmailToken;
  }

  async getEncryptedGmailToken(userId: string): Promise<EncryptedGmailToken | undefined> {
    for (const token of Array.from(this.encryptedGmailTokens.values())) {
      if (token.userId === userId) {
        return token;
      }
    }
    return undefined;
  }

  async updateEncryptedGmailToken(userId: string, data: Partial<InsertEncryptedGmailToken>): Promise<EncryptedGmailToken> {
    const token = Array.from(this.encryptedGmailTokens.values()).find(t => t.userId === userId);
    if (!token) throw new Error("Encrypted Gmail token not found");

    const updatedToken = { ...token, ...data, updatedAt: new Date() };
    this.encryptedGmailTokens.set(token.id, updatedToken);
    return updatedToken;
  }

  async deleteEncryptedGmailToken(userId: string): Promise<void> {
    const token = Array.from(this.encryptedGmailTokens.values()).find(t => t.userId === userId);
    if (token) {
      this.encryptedGmailTokens.delete(token.id);
    }
  }

  // Priority Emails methods
  async createPriorityEmail(data: InsertPriorityEmail): Promise<PriorityEmail> {
    const newPriorityEmail: PriorityEmail = {
      ...data,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      email: data.email.toLowerCase(),
      userId: data.userId,
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
      .some(priorityEmail => priorityEmail.userId === userId && priorityEmail.email === email.toLowerCase());
  }
}

// Use MemoryStorage for stable demo while database connection issues are resolved
export const storage = new MemoryStorage();
