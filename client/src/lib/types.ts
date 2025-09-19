export interface AppStatus {
  id: string;
  name: string;
  type: "gmail" | "slack" | "notion" | "trello" | "zoom" | "calendar";
  isConnected: boolean;
  hasNotifications: boolean;
  icon: string;
  color: string;
}

export interface TaskPriority {
  level: "urgent" | "important" | "normal";
  color: string;
  bgColor: string;
}

export interface WorkflowTask {
  id: string;
  title: string;
  description: string;
  priority: "urgent" | "important" | "normal";
  status: "pending" | "in_progress" | "completed" | "paused";
  estimatedMinutes: number;
  dueAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  type: "urgent" | "important" | "informational";
  sourceApp: string;
  isRead: boolean;
  createdAt: Date;
  aiSummary?: string;
}

export interface UserMetrics {
  focusScore: number;
  workloadCapacity: number;
  stressLevel: "low" | "medium" | "high";
  tasksCompleted: number;
  activeHours: number;
  todayProgress: number;
  nextBreakIn: number;
}

export interface AIInsight {
  id: string;
  type: "deadline_alert" | "workflow_optimization" | "wellness_suggestion";
  title: string;
  description: string;
  priority: "urgent" | "important" | "normal";
  actionable: boolean;
  isApplied: boolean;
  createdAt: Date;
}
