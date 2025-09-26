import { storage } from "./storage";
import { Task } from "../shared/schema";

export interface ReschedulingResult {
  rescheduledTasks: Array<{
    taskId: string;
    oldDueAt: Date | null;
    newDueAt: Date;
    reason: string;
    timeDifference: number; // minutes
  }>;
  insights: string[];
  totalTimeSaved: number;
}

export class SmartTaskScheduler {
  /**
   * Calculate the user's historical accuracy ratio for time estimation
   */
  private async getUserTimeAccuracyRatio(userId: string): Promise<number> {
    try {
      const completedTasks = await storage.getTasksByStatus(userId, "completed");
      
      if (completedTasks.length === 0) return 1.0; // Default to 1:1 ratio
      
      let totalEstimated = 0;
      let totalActual = 0;
      let taskCount = 0;
      
      for (const task of completedTasks) {
        if (task.estimatedMinutes && task.startedAt && task.completedAt) {
          const actualMinutes = Math.ceil(
            (new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / (1000 * 60)
          );
          
          totalEstimated += task.estimatedMinutes;
          totalActual += actualMinutes;
          taskCount++;
        }
      }
      
      if (taskCount === 0) return 1.0;
      
      // Return the ratio of actual time to estimated time
      // Values > 1 mean user takes longer than estimated
      // Values < 1 mean user finishes faster than estimated
      return totalActual / totalEstimated;
    } catch (error) {
      return 1.0;
    }
  }

  /**
   * Get the current system workload and suggest optimal scheduling gaps
   */
  private getOptimalSchedulingGaps(currentTime: Date, priority: string): number {
    const hour = currentTime.getHours();
    
    // Define buffer times based on priority and time of day
    const baseBuffers = {
      urgent: 5,     // 5 minute buffer for urgent tasks
      important: 15, // 15 minute buffer for important tasks  
      normal: 30     // 30 minute buffer for normal tasks
    };
    
    // Adjust based on time of day for optimal productivity
    let timeMultiplier = 1.0;
    
    if (hour >= 9 && hour <= 11) timeMultiplier = 0.8;  // Peak morning hours
    else if (hour >= 14 && hour <= 16) timeMultiplier = 0.9; // Good afternoon hours
    else if (hour >= 17 || hour <= 8) timeMultiplier = 1.3;  // Evening/early morning
    else timeMultiplier = 1.0; // Regular hours
    
    return Math.ceil((baseBuffers[priority as keyof typeof baseBuffers] || 15) * timeMultiplier);
  }

  /**
   * Smart rescheduling algorithm that considers task completion patterns
   */
  async rescheduleUserTasks(userId: string, completedTaskId?: string): Promise<ReschedulingResult> {
    try {
      const currentTime = new Date();
      const pendingTasks = await storage.getUserTasks(userId);
      const activePendingTasks = pendingTasks.filter(t => t.status === "pending");
      
      if (activePendingTasks.length === 0) {
        return {
          rescheduledTasks: [],
          insights: ["No pending tasks to reschedule"],
          totalTimeSaved: 0
        };
      }

      // Get user's historical time accuracy
      const timeAccuracyRatio = await this.getUserTimeAccuracyRatio(userId);
      
      let rescheduledTasks: ReschedulingResult['rescheduledTasks'] = [];
      let insights: string[] = [];
      let cumulativeScheduleTime = new Date(currentTime);
      
      // Add context about the recently completed task if provided
      if (completedTaskId) {
        const completedTask = await storage.getTaskById(completedTaskId);
        if (completedTask && completedTask.startedAt && completedTask.completedAt) {
          const actualTime = Math.ceil(
            (new Date(completedTask.completedAt).getTime() - new Date(completedTask.startedAt).getTime()) / (1000 * 60)
          );
          const estimatedTime = completedTask.estimatedMinutes || 30;
          
          if (actualTime > estimatedTime * 1.2) {
            insights.push(`Recent task took ${actualTime - estimatedTime} minutes longer than expected`);
          } else if (actualTime < estimatedTime * 0.8) {
            insights.push(`Recent task completed ${estimatedTime - actualTime} minutes faster than expected`);
          }
        }
      }
      
      // Sort tasks by priority and existing due dates
      const priorityOrder = { urgent: 0, important: 1, normal: 2 };
      activePendingTasks.sort((a, b) => {
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
        
        if (aPriority !== bPriority) return aPriority - bPriority;
        
        // Within same priority, sort by existing due date
        if (a.dueAt && b.dueAt) {
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        }
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        
        return 0;
      });

      // Process each task for rescheduling
      for (const task of activePendingTasks) {
        const oldDueAt = task.dueAt ? new Date(task.dueAt) : null;
        
        // Only skip tasks with due dates if they're very recent (less than 5 minutes old)
        // This allows reminder scheduling while preventing excessive rescheduling
        if (oldDueAt && oldDueAt > currentTime) {
          const timeSinceScheduled = currentTime.getTime() - (task.updatedAt ? new Date(task.updatedAt).getTime() : 0);
          const minutesSinceScheduled = timeSinceScheduled / (1000 * 60);
          
          // Skip only if scheduled very recently (within 2 minutes) to prevent churn
          if (minutesSinceScheduled < 2) {
            continue;
          }
        }
        
        // Calculate adjusted estimated time using historical accuracy
        const baseEstimate = task.estimatedMinutes || 30;
        const adjustedEstimate = Math.ceil(baseEstimate * timeAccuracyRatio);
        
        // Get optimal scheduling gap for this priority
        const schedulingGap = this.getOptimalSchedulingGaps(cumulativeScheduleTime, task.priority || 'normal');
        
        // Add the gap time first
        cumulativeScheduleTime = new Date(cumulativeScheduleTime.getTime() + schedulingGap * 60 * 1000);
        
        // Calculate new due time (schedule start + adjusted estimate)
        const newDueAt = new Date(cumulativeScheduleTime.getTime() + adjustedEstimate * 60 * 1000);
        
        // Update the cumulative time for next task
        cumulativeScheduleTime = new Date(newDueAt);
        
        // Determine if this is a meaningful reschedule
        let shouldReschedule = false;
        let reason = "";
        let timeDifference = 0;
        
        if (!oldDueAt) {
          shouldReschedule = true;
          reason = `Scheduled based on current workload and ${Math.round(timeAccuracyRatio * 100)}% historical accuracy`;
          timeDifference = Math.ceil((newDueAt.getTime() - currentTime.getTime()) / (1000 * 60));
        } else {
          timeDifference = Math.ceil((newDueAt.getTime() - oldDueAt.getTime()) / (1000 * 60));
          
          if (Math.abs(timeDifference) >= 10) { // Only reschedule if difference is 10+ minutes
            shouldReschedule = true;
            if (timeDifference > 0) {
              reason = `Delayed by ${timeDifference} minutes due to workload optimization`;
            } else {
              reason = `Moved earlier by ${Math.abs(timeDifference)} minutes based on faster completion patterns`;
            }
          }
        }
        
        if (shouldReschedule) {
          // Update the task in the database
          await storage.updateTask(task.id, {
            dueAt: newDueAt,
            estimatedMinutes: adjustedEstimate
          });
          
          rescheduledTasks.push({
            taskId: task.id,
            oldDueAt,
            newDueAt,
            reason,
            timeDifference
          });
        }
      }
      
      // Generate insights
      if (timeAccuracyRatio > 1.2) {
        insights.push(`You typically take ${Math.round((timeAccuracyRatio - 1) * 100)}% longer than estimated - schedules adjusted accordingly`);
      } else if (timeAccuracyRatio < 0.8) {
        insights.push(`You complete tasks ${Math.round((1 - timeAccuracyRatio) * 100)}% faster than estimated - creating tighter schedules`);
      }
      
      const totalTimeSaved = rescheduledTasks.reduce((sum, task) => {
        return sum + (task.timeDifference < 0 ? Math.abs(task.timeDifference) : 0);
      }, 0);
      
      if (rescheduledTasks.length > 0) {
        insights.push(`Smart rescheduling optimized ${rescheduledTasks.length} tasks based on your work patterns`);
      }
      
      return {
        rescheduledTasks,
        insights,
        totalTimeSaved
      };
      
    } catch (error) {
      throw new Error("Failed to reschedule tasks: " + (error as Error).message);
    }
  }

  /**
   * Calculate optimal break times based on task completion patterns
   */
  async suggestOptimalBreaks(userId: string): Promise<{
    nextBreakSuggestion: Date;
    reason: string;
    breakDuration: number;
  }> {
    try {
      const recentTasks = await storage.getUserTasks(userId);
      const activeTasks = recentTasks.filter(t => t.status === "in_progress" || t.status === "completed");
      
      // Simple break calculation - suggest break after 90 minutes of work or between task sessions
      const currentTime = new Date();
      const nextBreakTime = new Date(currentTime.getTime() + 90 * 60 * 1000); // 90 minutes
      
      return {
        nextBreakSuggestion: nextBreakTime,
        reason: "Optimal productivity break based on 90-minute work cycles",
        breakDuration: 15 // 15 minute break
      };
      
    } catch (error) {
      // Error suggesting breaks
      return {
        nextBreakSuggestion: new Date(Date.now() + 60 * 60 * 1000),
        reason: "Standard hourly break",
        breakDuration: 10
      };
    }
  }
}

// Export singleton instance
export const smartScheduler = new SmartTaskScheduler();
