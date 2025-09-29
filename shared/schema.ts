import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const taskPriorityEnum = pgEnum("task_priority", ["urgent", "important", "normal"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "urgent",
  "important", 
  "normal",
  "browser_notification",
  "email_converted"
]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "completed", "paused"]);
export const appTypeEnum = pgEnum("app_type", ["gmail", "slack", "notion", "trello", "zoom", "calendar", "manual", "system"]);
export const credentialTypeEnum = pgEnum("credential_type", ["oauth_token", "api_key", "password", "certificate"]);
export const planTypeEnum = pgEnum("plan_type", ["free", "basic", "premium", "enterprise"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"]);
export const paymentProviderEnum = pgEnum("payment_provider", ["razorpay", "cashfree", "phonepe", "paytm", "manual"]);
export const paymentMethodEnum = pgEnum("payment_method", ["upi", "card", "netbanking", "wallet"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "pending", "canceled", "paused"]);
export const convertedEmailStatusEnum = pgEnum("converted_email_status", ["new", "converted", "archived"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password"),
  role: text("role"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Connected Apps table
export const connectedApps = pgTable("connected_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  appType: appTypeEnum("app_type").notNull(),
  appName: text("app_name").notNull(),
  isConnected: boolean("is_connected").default(true),
  hasNotifications: boolean("has_notifications").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  priority: taskPriorityEnum("priority").default("normal"),
  status: taskStatusEnum("status").default("pending"),
  estimatedMinutes: integer("estimated_minutes"),
  actualMinutes: integer("actual_minutes"),
  dueAt: timestamp("due_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  sourceApp: appTypeEnum("source_app"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  type: notificationTypeEnum("type").default("informational"),
  sourceApp: appTypeEnum("source_app"),
  isRead: boolean("is_read").default(false),
  isDismissed: boolean("is_dismissed").default(false),
  aiSummary: text("ai_summary"),
  actionableInsights: jsonb("actionable_insights"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Metrics table
export const userMetrics = pgTable("user_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  focusScore: integer("focus_score").default(0),
  workloadCapacity: integer("workload_capacity").default(0),
  stressLevel: text("stress_level").default("low"),
  tasksCompleted: integer("tasks_completed").default(0),
  activeHours: integer("active_hours").default(0),
  todayProgress: integer("today_progress").default(0),
  nextBreakIn: integer("next_break_in").default(25),
  date: timestamp("date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// User App Links table
export const userAppLinks = pgTable("user_app_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  logo: text("logo"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Insights table
export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // "deadline_alert", "workflow_optimization", "wellness_suggestion"
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: taskPriorityEnum("priority").default("normal"),
  actionable: boolean("actionable").default(true),
  metadata: jsonb("metadata"),
  isApplied: boolean("is_applied").default(false),
  isDismissed: boolean("is_dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// User Usage table for tracking AI task creation limits
export const userUsage = pgTable("user_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // Format: "2025-01" for monthly tracking
  aiTasksCreated: integer("ai_tasks_created").default(0).notNull(),
  aiInteractionsCount: integer("ai_interactions_count").default(0).notNull(),
  planType: planTypeEnum("plan_type").default("free").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_usage_user_id_idx").on(table.userId),
  monthIdx: index("user_usage_month_idx").on(table.month),
  // Unique constraint to prevent duplicate records per user per month
  userMonthUnique: unique("user_usage_user_month_unique").on(table.userId, table.month),
}));

// Credentials table
export const credentials = pgTable("credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  serviceType: appTypeEnum("service_type").notNull(),
  credentialType: credentialTypeEnum("credential_type").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Plans table
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  planType: planTypeEnum("plan_type").notNull(),
  description: text("description"),
  price: integer("price").notNull(), // price in paise (smallest unit)
  currency: text("currency").default("inr"),
  billingInterval: text("billing_interval").notNull(), // "monthly", "yearly"
  features: jsonb("features"),
  isActive: boolean("is_active").default(true),
  provider: paymentProviderEnum("provider").default("razorpay"),
  providerProductId: text("provider_product_id"),
  providerPriceId: text("provider_price_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  planId: varchar("plan_id").references(() => plans.id),
  amount: integer("amount").notNull(), // amount in paise (smallest unit)
  currency: text("currency").default("inr"),
  status: paymentStatusEnum("status").default("pending"),
  provider: paymentProviderEnum("provider").default("razorpay"),
  paymentMethod: paymentMethodEnum("payment_method"),
  providerPaymentId: text("provider_payment_id"), // Razorpay payment ID
  providerOrderId: text("provider_order_id"), // Razorpay order ID
  signature: text("signature"), // Payment signature for verification
  webhookVerified: boolean("webhook_verified").default(false),
  upiTxnId: text("upi_txn_id"), // UPI transaction ID
  payerVpa: text("payer_vpa"), // UPI VPA (Virtual Payment Address)
  pspRefNo: text("psp_ref_no"), // Payment Service Provider reference number
  metadata: jsonb("metadata"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table for recurring payments/UPI AutoPay
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  planId: varchar("plan_id").notNull().references(() => plans.id),
  provider: paymentProviderEnum("provider").default("razorpay"),
  providerSubscriptionId: text("provider_subscription_id"), // Razorpay subscription ID
  upiMandateId: text("upi_mandate_id"), // UPI AutoPay mandate ID
  status: subscriptionStatusEnum("status").default("pending"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  canceledAt: timestamp("canceled_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Encrypted Gmail Tokens table
export const encryptedGmailTokens = pgTable("encrypted_gmail_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  encryptedTokenBlob: text("encrypted_token_blob").notNull(), // JSON string with encrypted data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Priority Emails table
export const priorityEmails = pgTable("priority_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userEmailUnique: unique("priority_emails_user_email_unique").on(table.userId, table.email),
}));

// Converted Emails table for proper tracking of email conversions
export const convertedEmails = pgTable("converted_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  gmailMessageId: text("gmail_message_id").notNull(),
  gmailThreadId: text("gmail_thread_id"),
  subject: text("subject").notNull(),
  sender: text("sender").notNull(),
  senderEmail: text("sender_email").notNull(),
  receivedAt: timestamp("received_at").notNull(),
  convertedAt: timestamp("converted_at").defaultNow(),
  rawSnippet: text("raw_snippet"),
  status: convertedEmailStatusEnum("status").default("new"),
  taskIds: jsonb("task_ids"), // Array of task IDs created from this email
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userGmailIdUnique: unique("converted_emails_user_gmail_id_unique").on(table.userId, table.gmailMessageId),
  userIdIdx: index("converted_emails_user_id_idx").on(table.userId),
  statusIdx: index("converted_emails_status_idx").on(table.status),
}));

// Accumulated Time Saved table - Persistent tracking that never resets
export const accumulatedTimeSaved = pgTable("accumulated_time_saved", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  totalMinutesSaved: integer("total_minutes_saved").default(0).notNull(),
  emailConversions: integer("email_conversions").default(0).notNull(),
  aiTasksCreated: integer("ai_tasks_created").default(0).notNull(),
  urgentTasksHandled: integer("urgent_tasks_handled").default(0).notNull(),
  tasksCompleted: integer("tasks_completed").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("accumulated_time_saved_user_id_idx").on(table.userId),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    dueAt: z.union([z.string(), z.date()]).optional().transform((val) => {
      if (typeof val === 'string') {
        return new Date(val);
      }
      return val;
    }),
  });

export const updateTaskSchema = createInsertSchema(tasks)
  .omit({
    id: true,
    userId: true, // Don't allow changing user ownership
    createdAt: true,
    updatedAt: true,
  })
  .partial() // Make all fields optional for updates
  .extend({
    dueAt: z.union([z.string(), z.date()]).optional().transform((val) => {
      if (typeof val === 'string') {
        return new Date(val);
      }
      return val;
    }),
    startedAt: z.union([z.string(), z.date()]).optional().transform((val) => {
      if (typeof val === 'string') {
        return new Date(val);
      }
      return val;
    }),
    completedAt: z.union([z.string(), z.date()]).optional().transform((val) => {
      if (typeof val === 'string') {
        return new Date(val);
      }
      return val;
    }),
  });

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertConnectedAppSchema = createInsertSchema(connectedApps).omit({
  id: true,
  createdAt: true,
});

export const insertUserMetricsSchema = createInsertSchema(userMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertUserAppLinkSchema = createInsertSchema(userAppLinks).omit({
  id: true,
  createdAt: true,
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
});

export const insertCredentialSchema = createInsertSchema(credentials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserUsageSchema = createInsertSchema(userUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEncryptedGmailTokensSchema = createInsertSchema(encryptedGmailTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPriorityEmailSchema = createInsertSchema(priorityEmails).omit({
  id: true,
  createdAt: true,
});

export const insertConvertedEmailSchema = createInsertSchema(convertedEmails).omit({
  id: true,
  createdAt: true,
  convertedAt: true,
});

export const insertAccumulatedTimeSavedSchema = createInsertSchema(accumulatedTimeSaved).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type ConnectedApp = typeof connectedApps.$inferSelect;
export type InsertConnectedApp = z.infer<typeof insertConnectedAppSchema>;

export type UserMetrics = typeof userMetrics.$inferSelect;
export type InsertUserMetrics = z.infer<typeof insertUserMetricsSchema>;

export type UserAppLink = typeof userAppLinks.$inferSelect;
export type InsertUserAppLink = z.infer<typeof insertUserAppLinkSchema>;

export type AiInsight = typeof aiInsights.$inferSelect;
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;

export type Credential = typeof credentials.$inferSelect;
export type InsertCredential = z.infer<typeof insertCredentialSchema>;

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type EncryptedGmailToken = typeof encryptedGmailTokens.$inferSelect;
export type InsertEncryptedGmailToken = z.infer<typeof insertEncryptedGmailTokensSchema>;

export type UserUsage = typeof userUsage.$inferSelect;
export type InsertUserUsage = z.infer<typeof insertUserUsageSchema>;

export type PriorityEmail = typeof priorityEmails.$inferSelect;
export type InsertPriorityEmail = z.infer<typeof insertPriorityEmailSchema>;

export type ConvertedEmail = typeof convertedEmails.$inferSelect;
export type InsertConvertedEmail = z.infer<typeof insertConvertedEmailSchema>;

export type AccumulatedTimeSaved = typeof accumulatedTimeSaved.$inferSelect;
export type InsertAccumulatedTimeSaved = z.infer<typeof insertAccumulatedTimeSavedSchema>;
