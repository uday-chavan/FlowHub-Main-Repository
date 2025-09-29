import { Zap, Clock, Play, Square, Info, Trash2, RotateCcw, Plus, Pencil, Sparkles, Calendar, CheckSquare } from "lucide-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useTasks, useStartTask, useStopTask, useOptimizeWorkflow, useUpdateTask, useDeleteTask, useAutoReschedule, useCreateTaskFromText, useCreateTask } from "@/hooks/useTasks";
import { useCurrentUser } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";


const priorityConfig = {
  urgent: {
    color: "border-red-500",
    bgColor: "bg-red-50/20",
    textColor: "text-red-600",
    dotColor: "bg-red-500",
    label: "URGENT",
    sectionBg: "bg-red-500/10",
  },
  important: {
    color: "border-orange-500",
    bgColor: "bg-orange-50/20",
    textColor: "text-orange-600",
    dotColor: "bg-orange-500",
    label: "IMP",
    sectionBg: "bg-orange-500/10",
  },
  normal: {
    color: "border-blue-500", // Changed from green-500 to blue-500
    bgColor: "bg-blue-50/20",  // Changed from green-50/20 to blue-50/20
    textColor: "text-blue-600", // Changed from green-600 to blue-600
    dotColor: "bg-blue-500",   // Changed from green-500 to blue-500
    label: "NORMAL",
    sectionBg: "bg-blue-500/10",
  },
};

const priorityOrder = ["urgent", "important", "normal"] as const;

// Smart Countdown Component Router
function CountdownTimer({ task, onEditClick }: { task: any; onEditClick?: () => void }) {
  // Route to appropriate countdown component based on task source
  if (task.metadata?.aiGenerated) {
    return <AiTaskCountdown task={task} onEditClick={onEditClick} />;
  } else {
    return <ManualTaskCountdown task={task} onEditClick={onEditClick} />;
  }
}

// Manual Task Countdown Component
function ManualTaskCountdown({ task, onEditClick }: { task: any; onEditClick?: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isUrgent, setIsUrgent] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimeRef = useRef<Date | null>(null);
  const lastTaskStatusRef = useRef<string>(task.status);

  // Initialize target time using global store to prevent recalculation
  useEffect(() => {
    const taskKey = task.id;

    // Check if we already have this task's time in global store
    if (globalParsedTimes.has(taskKey)) {
      targetTimeRef.current = globalParsedTimes.get(taskKey);
      return;
    }

    // Initialize target time for manual tasks
    if (task.dueAt) {
      const dueDate = new Date(task.dueAt);
      targetTimeRef.current = dueDate;
      globalParsedTimes.set(taskKey, dueDate);
    } else {
      targetTimeRef.current = null;
      globalParsedTimes.set(taskKey, null);
    }
  }, [task.id, task.dueAt]); // Only depend on task.id and task.dueAt

  useEffect(() => {
    const updateCountdown = () => {
      // If task is completed, show completed status
      if (task.status === 'completed') {
        setTimeLeft('Completed');
        setIsUrgent(false);
        return true; // Stop interval for completed tasks
      }

      // If no target time, show no deadline set
      if (!targetTimeRef.current) {
        setTimeLeft('No deadline set');
        setIsUrgent(false);
        return true; // Stop interval if no target time
      }

      const now = Date.now();
      const target = targetTimeRef.current.getTime();
      const difference = target - now;

      // Mark as urgent if less than 3 hours remaining
      setIsUrgent(difference < 3 * 60 * 60 * 1000);

      if (difference > 0) {
        // Calculate time components
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        // Format countdown string based on time remaining
        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h ${minutes}m`);
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        } else if (minutes > 0) {
          setTimeLeft(`${minutes}m ${seconds}s`);
        } else {
          setTimeLeft(`${seconds}s`);
        }
        return false;
      } else {
        // Time has passed - show overdue
        const absTimePassed = Math.abs(difference);
        const daysOverdue = Math.floor(absTimePassed / (1000 * 60 * 60 * 24));
        const hoursOverdue = Math.floor((absTimePassed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutesOverdue = Math.floor((absTimePassed % (1000 * 60 * 60)) / (1000 * 60));

        if (daysOverdue > 0) {
          setTimeLeft(`${daysOverdue}d ${hoursOverdue}h overdue`);
        } else if (hoursOverdue > 0) {
          setTimeLeft(`${hoursOverdue}h ${minutesOverdue}m overdue`);
        } else {
          setTimeLeft(`${minutesOverdue}m overdue`);
        }
        setIsUrgent(true);
        return false; // Keep running for overdue tasks
      }
    };

    // Only restart interval if task status changed or interval doesn't exist
    const statusChanged = lastTaskStatusRef.current !== task.status;
    lastTaskStatusRef.current = task.status;

    if (statusChanged || !intervalRef.current) {
      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Update immediately
      const shouldStop = updateCountdown();
      if (shouldStop) return;

      // Set up interval to update every second only if not stopped
      intervalRef.current = setInterval(() => {
        const stop = updateCountdown();
        if (stop && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [task.status]); // Only depend on task.status

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium animate-in slide-in-from-right-2 duration-500 delay-1000 ${
        task.status === 'completed'
          ? 'bg-green-100 text-green-800'
          : isUrgent
          ? 'bg-red-100 text-red-800 animate-pulse'
          : (task.priority || 'normal') === 'urgent'
          ? 'bg-red-100 text-red-800'
          : (task.priority || 'normal') === 'important'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-gray-100 text-gray-600'
      } ${task.status !== 'completed' && onEditClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={task.status !== 'completed' && onEditClick ? onEditClick : undefined}
      title={task.status !== 'completed' ? 'Click to edit due date' : ''}
    >
      {timeLeft}
    </span>
  );
}

// Global store for parsed times to prevent recalculation across renders
const globalParsedTimes = new Map<string, Date | null>();

// Error boundary for countdown components
const CountdownErrorBoundary = ({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) => {
  try {
    return <>{children}</>;
  } catch (error) {
    console.error('Countdown component error:', error);
    return <>{fallback}</>;
  }
};

// AI Task Countdown Component
function AiTaskCountdown({ task, onEditClick }: { task: any; onEditClick?: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isUrgent, setIsUrgent] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimeRef = useRef<Date | null>(null);
  const lastTaskStatusRef = useRef<string>(task.status);

  // Initialize target time only once using global store
  useEffect(() => {
    const taskKey = task.id;

    // Check if we already have this task's parsed time in global store
    if (globalParsedTimes.has(taskKey)) {
      targetTimeRef.current = globalParsedTimes.get(taskKey);
      return;
    }

    // Initialize target time
    if (task.dueAt) {
      const dueDate = new Date(task.dueAt);
      targetTimeRef.current = dueDate;
      globalParsedTimes.set(taskKey, dueDate);
    } else {
      // Check localStorage for stored parsed time
      const storedTimeKey = `task_parsed_time_${task.id}`;
      const storedTime = localStorage.getItem(storedTimeKey);

      if (storedTime && storedTime !== 'null' && storedTime !== 'undefined') {
        try {
          const parsedDate = new Date(storedTime);
          if (!isNaN(parsedDate.getTime())) {
            targetTimeRef.current = parsedDate;
            globalParsedTimes.set(taskKey, parsedDate);
            return;
          }
        } catch (e) {
          localStorage.removeItem(storedTimeKey);
        }
      }

      // Parse time once and store it
      const baseTime = task.createdAt ? new Date(task.createdAt) : new Date();
      const parsedTime = parseRelativeTime(task.title + ' ' + (task.description || ''), baseTime);

      if (parsedTime && !isNaN(parsedTime.getTime())) {
        localStorage.setItem(storedTimeKey, parsedTime.toISOString());
        targetTimeRef.current = parsedTime;
        globalParsedTimes.set(taskKey, parsedTime);
      } else {
        targetTimeRef.current = null;
        globalParsedTimes.set(taskKey, null);
      }
    }
  }, [task.id]); // Only depend on task.id

  useEffect(() => {
    const updateCountdown = () => {
      // If task is completed, show completed status
      if (task.status === 'completed') {
        setTimeLeft('Completed');
        setIsUrgent(false);
        return true; // Stop interval for completed tasks
      }

      // If no target time, show no deadline set
      if (!targetTimeRef.current) {
        setTimeLeft('No deadline set');
        setIsUrgent(false);
        return true; // Stop interval if no target time
      }

      const now = Date.now();
      const target = targetTimeRef.current.getTime();
      const difference = target - now;

      // Mark as urgent if less than 3 hours remaining
      setIsUrgent(difference < 3 * 60 * 60 * 1000);

      if (difference > 0) {
        // Calculate time components
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        // Format countdown string based on time remaining
        if (days > 0) {
          setTimeLeft(`${days}d ${hours}h ${minutes}m`);
        } else if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        } else if (minutes > 0) {
          setTimeLeft(`${minutes}m ${seconds}s`);
        } else {
          setTimeLeft(`${seconds}s`);
        }
        return false;
      } else {
        // Time has passed - show overdue
        const absTimePassed = Math.abs(difference);
        const daysOverdue = Math.floor(absTimePassed / (1000 * 60 * 60 * 24));
        const hoursOverdue = Math.floor((absTimePassed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutesOverdue = Math.floor((absTimePassed % (1000 * 60 * 60)) / (1000 * 60));

        if (daysOverdue > 0) {
          setTimeLeft(`${daysOverdue}d ${hoursOverdue}h overdue`);
        } else if (hoursOverdue > 0) {
          setTimeLeft(`${hoursOverdue}h ${minutesOverdue}m overdue`);
        } else {
          setTimeLeft(`${minutesOverdue}m overdue`);
        }
        setIsUrgent(true);
        return false; // Keep running for overdue tasks
      }
    };

    // Only restart interval if task status changed or interval doesn't exist
    const statusChanged = lastTaskStatusRef.current !== task.status;
    lastTaskStatusRef.current = task.status;

    if (statusChanged || !intervalRef.current) {
      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Update immediately
      const shouldStop = updateCountdown();
      if (shouldStop) return;

      // Set up interval to update every second only if not stopped
      intervalRef.current = setInterval(() => {
        const stop = updateCountdown();
        if (stop && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [task.status]); // Only depend on task.status, not targetTime

  return (
    <span
      className={`text-xs px-2 py-1 rounded-full font-medium animate-in slide-in-from-right-2 duration-500 delay-1000 ${
        task.status === 'completed'
          ? 'bg-green-100 text-green-800'
          : isUrgent
          ? 'bg-red-100 text-red-800 animate-pulse'
          : (task.priority || 'normal') === 'urgent'
          ? 'bg-red-100 text-red-800'
          : (task.priority || 'normal') === 'important'
          ? 'bg-orange-100 text-orange-800'
          : 'bg-gray-100 text-gray-600'
      } ${task.status !== 'completed' && onEditClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      onClick={task.status !== 'completed' && onEditClick ? onEditClick : undefined}
      title={task.status !== 'completed' ? 'Click to edit due date' : ''}
    >
      {timeLeft}
    </span>
  );
}

// Enhanced helper function to parse relative time strings including day names and "tomorrow"
const parseRelativeTime = (text: string, baseTime?: Date): Date | null => {
  if (!text) return null;

  const base = baseTime || new Date();
  const lowerText = text.toLowerCase().trim();

  // Look for "in X min/mins/minutes/m" patterns
  const minuteMatch = lowerText.match(/in\s+(\d+)\s*(?:m|min|mins|minutes?)\b/i);
  if (minuteMatch) {
    const minutes = parseInt(minuteMatch[1]);
    return new Date(base.getTime() + minutes * 60 * 1000);
  }

  // Look for "in X hour/hours/hr/hrs/h" patterns
  const hourMatch = lowerText.match(/in\s+(\d+)\s*(?:h|hr|hrs|hour|hours?)\b/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1]);
    return new Date(base.getTime() + hours * 60 * 60 * 1000);
  }

  // Look for "in X days" patterns
  const dayMatch = lowerText.match(/in\s+(\d+)\s*(?:day|days?)/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1]);
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // Handle "tomorrow" or "tommorow" (common typo)
  if (lowerText.includes('tomorrow') || lowerText.includes('tommorow')) {
    const tomorrow = new Date(base);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Set to 9 AM tomorrow by default
    return tomorrow;
  }

  // Handle "today" using browser's local timezone (no manual IST offset)
  if (lowerText.includes('today')) {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());

    // Look for specific time mentions like "9 pm today"
    const timeToday = lowerText.match(/(\d{1,2}):?(\d{2})?\s*(pm|p\.m\.|am|a\.m\.)\s*today|today\s*(?:at\s*)?(\d{1,2}):?(\d{2})?\s*(pm|p\.m\.|am|a\.m\.)|(\d{1,2}):?(\d{2})?\s*(pm|p\.m\.|am|a\.m\.)/i);

    if (timeToday) {
      let hour = parseInt(timeToday[1] || timeToday[4] || timeToday[7] || '17');
      const minute = parseInt(timeToday[2] || timeToday[5] || timeToday[8] || '0');
      const period = (timeToday[3] || timeToday[6] || timeToday[9] || '').toLowerCase();

      if (period.includes('pm') || period.includes('p.m.')) {
        if (hour !== 12) hour += 12;
      } else if (period.includes('am') || period.includes('a.m.')) {
        if (hour === 12) hour = 0;
      }

      date.setHours(hour, minute, 0, 0);
      return date;
    } else {
      date.setHours(17, 0, 0, 0); // Default to 5 PM local time
      return date;
    }
  }

  // Handle specific day names (for this week)
  const dayNames = {
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6,
    'sunday': 0, 'sun': 0
  };

  for (const [dayName, dayNumber] of Object.entries(dayNames)) {
    if (lowerText.includes(dayName)) {
      const targetDate = new Date(base);
      const currentDay = base.getDay();
      const daysUntilTarget = (dayNumber - currentDay + 7) % 7;

      // If it's the same day, assume next week unless it's still early
      if (daysUntilTarget === 0 && base.getHours() >= 12) {
        targetDate.setDate(targetDate.getDate() + 7);
      } else if (daysUntilTarget === 0) {
        // Same day, set to later today
        targetDate.setHours(17, 0, 0, 0);
        return targetDate;
      } else {
        targetDate.setDate(targetDate.getDate() + daysUntilTarget);
      }

      targetDate.setHours(9, 0, 0, 0); // Set to 9 AM on target day
      return targetDate;
    }
  }

  // Handle "next week"
  if (lowerText.includes('next week')) {
    const nextWeek = new Date(base);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);
    return nextWeek;
  }

  // Handle "this week" (Friday)
  if (lowerText.includes('this week')) {
    const friday = new Date(base);
    const daysUntilFriday = (5 - base.getDay() + 7) % 7;
    if (daysUntilFriday === 0 && base.getHours() >= 17) {
      friday.setDate(friday.getDate() + 7); // Next Friday if it's late Friday
    } else {
      friday.setDate(friday.getDate() + daysUntilFriday);
    }
    friday.setHours(17, 0, 0, 0);
    return friday;
  }

  // Look for immediate urgency keywords
  if (lowerText.includes('asap') || lowerText.includes('urgent') || lowerText.includes('right now') || lowerText.includes('immediately')) {
    return new Date(base.getTime() + 5 * 60 * 1000); // 5 minutes from now
  }

  return null;
};


export function WorkflowRiver() {
  const { user } = useCurrentUser();
  const { data: tasks, isLoading } = useTasks();
  const startTaskMutation = useStartTask();
  const stopTaskMutation = useStopTask();
  const optimizeWorkflowMutation = useOptimizeWorkflow();
  const autoRescheduleMutation = useAutoReschedule();
  const deleteTaskMutation = useDeleteTask(); // Added for deleting tasks
  const createTaskFromTextMutation = useCreateTaskFromText();
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false); // Renamed from isAITaskModalOpen
  const [newTaskInput, setNewTaskInput] = useState("");
  const [isManualTaskDialogOpen, setIsManualTaskDialogOpen] = useState(false); // Renamed from isManualTaskModalOpen
  const [manualTaskName, setManualTaskName] = useState("");
  const [manualTaskTime, setManualTaskTime] = useState("");
  const [manualTaskDateTime, setManualTaskDateTime] = useState<Date | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingTimeTaskId, setEditingTimeTaskId] = useState<string | null>(null);
  const [editingDueDate, setEditingDueDate] = useState<Date | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  // State for handling potential Windows notifications (placeholder)
  const [showWindowsNotificationPrompt, setShowWindowsNotificationPrompt] = useState(false);

  // Effect to check for desktop environment and potentially show notification prompt
  useEffect(() => {
    // Detect if the user agent indicates a mobile device
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    // If it's not mobile, it's likely a desktop or tablet, and we can consider showing the prompt.
    // For a more robust check, you might also consider checking for specific desktop OS patterns
    // or using a library that provides better device detection.
    if (!isMobile) {
      setShowWindowsNotificationPrompt(true);
    }
  }, []);

  // Animation state for staggered section and task appearance
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [visibleTasks, setVisibleTasks] = useState<Set<string>>(new Set());
  const [animationInProgress, setAnimationInProgress] = useState(false);

  // Staggered animation effect for sections and tasks
  useEffect(() => {
    if (!tasks || tasks.length === 0) {
      setVisibleSections(new Set());
      setVisibleTasks(new Set());
      setAnimationInProgress(false);
      return;
    }

    setAnimationInProgress(true);
    const sectionsWithTasks = priorityOrder.filter(priority => 
      (tasksByPriority[priority] || []).length > 0
    );

    let sectionDelay = 0;
    let taskDelay = 300; // Start task animations after initial section delay

    const newVisibleSections = new Set<string>();
    const newVisibleTasks = new Set<string>();
    const timeouts: NodeJS.Timeout[] = [];

    // Animate sections first
    sectionsWithTasks.forEach((priority, sectionIndex) => {
      const sectionTimeout = setTimeout(() => {
        newVisibleSections.add(priority);
        setVisibleSections(new Set(newVisibleSections));
      }, sectionDelay);
      timeouts.push(sectionTimeout);

      sectionDelay += 150; // 150ms between each section header

      // Then animate tasks within each section
      const sectionTasks = tasksByPriority[priority] || [];
      sectionTasks.forEach((task, taskIndex) => {
        const taskTimeout = setTimeout(() => {
          newVisibleTasks.add(task.id);
          setVisibleTasks(new Set(newVisibleTasks));
        }, taskDelay);
        timeouts.push(taskTimeout);

        taskDelay += 100; // 100ms between each task
      });

      // Add extra spacing between sections
      taskDelay += 100;
    });

    // Mark animation as complete
    const completeTimeout = setTimeout(() => {
      setAnimationInProgress(false);
    }, taskDelay + 200);
    timeouts.push(completeTimeout);

    // Cleanup function to clear all timeouts
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    };

  }, [tasks?.map(t => t.id).join(',')]); // Use stable task ID signature


  const activeTasks = Array.isArray(tasks) ? tasks.filter(task => task && task.status && (task.status === "pending" || task.status === "in_progress" || task.status === "completed")) : [];

  // Group tasks by priority and sort by completion status and time urgency
  const tasksByPriority = priorityOrder.reduce((acc, priority) => {
    // Filter tasks by priority, with fallback to 'normal' if priority is undefined
    const priorityTasks = activeTasks.filter(task => {
      const taskPriority = task.priority || 'normal';
      return taskPriority === priority;
    });

    // Sort tasks within each priority - completed tasks go to bottom
    priorityTasks.sort((a, b) => {
      // Completed tasks go to the bottom
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;

      // For non-completed tasks, sort by time urgency
      if (a.status !== 'completed' && b.status !== 'completed') {
        if (a.dueAt && b.dueAt) {
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        }
        // Tasks with due dates come first
        if (a.dueAt && !b.dueAt) return -1;
        if (!a.dueAt && b.dueAt) return 1;
      }

      // If both completed or neither has dueAt, maintain original order
      return 0;
    });

    acc[priority] = priorityTasks;
    return acc;
  }, {} as Record<string, typeof activeTasks>);


  const handleCompleteTask = async (taskId: string) => {
    setCompletingTaskId(taskId);
    try {
      // Optimistic update - immediately update UI before API call
      const currentTasks = queryClient.getQueryData<Task[]>(["/api/tasks", user?.id]);
      if (currentTasks) {
        const optimisticTasks = currentTasks.map(task => 
          task.id === taskId 
            ? { ...task, status: "completed" as const, completedAt: new Date() }
            : task
        );
        queryClient.setQueryData(["/api/tasks", user?.id], optimisticTasks);
      }

      // Immediately clear completing state for instant UI feedback
      setCompletingTaskId(null);

      // API call in background (don't await for instant response)
      stopTaskMutation.mutateAsync(taskId).catch(error => {
        console.error("Failed to complete task:", error);
        // Revert optimistic update on error
        if (currentTasks) {
          queryClient.setQueryData(["/api/tasks", user?.id], currentTasks);
        }
      });
    } catch (error) {
      console.error("Failed to complete task:", error);
      setCompletingTaskId(null);
    }
  };

  const handleOptimizeWorkflow = () => {
    optimizeWorkflowMutation.mutate();
  };

  const handleClearAllTasks = () => {
    activeTasks.forEach(task => {
      // Clean up stored parsed time when clearing task
      localStorage.removeItem(`task_parsed_time_${task.id}`);
      // Clean up global store
      globalParsedTimes.delete(task.id);
      deleteTaskMutation.mutate(task.id);
    });
  };

  const handleDeleteTask = (taskId: string) => {
    // Clean up stored parsed time when deleting task
    localStorage.removeItem(`task_parsed_time_${taskId}`);
    // Clean up global store
    globalParsedTimes.delete(taskId);
    deleteTaskMutation.mutate(taskId);
  };

  // Placeholder for handling the "404 Page Not Found" error on scroll.
  // This is an unusual error to associate directly with scrolling.
  // Common causes might include:
  // - Infinite scroll implementation issues: If new content fails to load and triggers a 404, it might be reported during scroll.
  // - Routing errors: If scrolling triggers a navigation event that leads to a 404.
  // - Dynamic component loading failures.
  // Without more context, specific code changes are difficult. If this occurs, investigate network requests during scrolling or any routing logic tied to scroll events.

  const handleCreateAITask = async () => {
    if (!newTaskInput.trim()) return;

    try {
      const result = await createTaskFromTextMutation.mutateAsync({
        naturalLanguageInput: newTaskInput,
      });

      setNewTaskInput("");
      setIsAddTaskDialogOpen(false);

      if (result.loading) {
        toast({
          title: "Processing Task with AI... 🤖",
          description: "Your task is being analyzed and will appear shortly.",
          duration: 5000,
        });
      } else if (result.task) {
        toast({
          title: "Task Created! 🎉",
          description: `"${result.task.title}" has been added to your tasks.`,
          duration: 3000,
        });
      }
      // Dispatch custom event to update AI limit bar
      window.dispatchEvent(new CustomEvent('ai-task-created'));
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to create task. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateManualTask = async () => {
    if (!manualTaskName.trim() || createTaskMutation.isPending) return;

    try {
      // Use the selected date/time from the picker
      let dueAt = manualTaskDateTime;
      let priority = "normal";

      // Determine priority based on selected time
      if (dueAt) {
        const now = new Date();
        const diffMs = dueAt.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 3) {
          priority = "urgent";
        } else if (diffHours <= 24) {
          priority = "important";
        } else {
          priority = "normal";
        }
      }

      // Use the proper createTask mutation hook
      await createTaskMutation.mutateAsync({
        title: manualTaskName,
        description: dueAt ? `Due: ${dueAt.toLocaleDateString()} at ${dueAt.toLocaleTimeString()}` : "No specific time mentioned",
        priority: priority,
        status: "pending",
        estimatedMinutes: 60,
        dueAt: dueAt?.toISOString(),
        sourceApp: "manual",
        metadata: {
          manuallyCreated: true,
          noAI: true,
          selectedDateTime: dueAt?.toISOString() || null
        }
      });

      setManualTaskName("");
      setManualTaskTime("");
      setManualTaskDateTime(null);
      setIsManualTaskDialogOpen(false);

      toast({
        title: "Manual Task Created! ✅",
        description: `"${manualTaskName}" has been added to your tasks.`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Manual task creation error:', error);
      toast({
        title: "Error",
        description: "Failed to create manual task. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleViewDescription = (task: any) => {
    setSelectedTask(task);
    setIsDescriptionDialogOpen(true);
  };

  const handleStartEditTitle = (task: any) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const handleCancelEditTitle = () => {
    setEditingTaskId(null);
    setEditingTitle("");
  };

  const handleSaveEditTitle = async (taskId: string) => {
    if (!editingTitle.trim() || updateTaskMutation.isPending) return;

    try {
      await updateTaskMutation.mutateAsync({
        id: taskId,
        updates: { title: editingTitle.trim() }
      });

      setEditingTaskId(null);
      setEditingTitle("");

      toast({
        title: "Task Updated! ✏️",
        description: "Task title has been updated successfully.",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task title. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleStartEditTime = (task: any) => {
    setEditingTimeTaskId(task.id);
    setEditingDueDate(task.dueAt ? new Date(task.dueAt) : new Date());
  };

  const handleCancelEditTime = () => {
    setEditingTimeTaskId(null);
    setEditingDueDate(null);
  };

  const handleSaveEditTime = async (taskId: string) => {
    if (!editingDueDate || updateTaskMutation.isPending) return;

    try {
      await updateTaskMutation.mutateAsync({
        id: taskId,
        updates: { dueAt: editingDueDate.toISOString() }
      });

      setEditingTimeTaskId(null);
      setEditingDueDate(null);

      toast({
        title: "Task Time Updated! ⏰",
        description: "Task due date has been updated successfully.",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update task due date. Please try again.",
        variant: "destructive",
      });
    }
  };

  const truncateDescription = (description: string, task: any, maxLength: number = 50) => {
    if (!description) return "No description";

    // For email-converted tasks, show more content or full content if it's AI-generated
    if (task?.metadata?.aiGenerated || task?.sourceNotificationId) {
      // Show more content for AI-generated tasks (up to 150 chars)
      const expandedLength = 150;
      if (description.length <= expandedLength) return description;
      return description.substring(0, expandedLength) + "...";
    }

    // Regular truncation for other tasks
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength) + "...";
  };


  if (isLoading || !tasks) {
    return (
      <div className="glass-card rounded-lg p-6 mb-6" data-testid="card-workflow-river">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted/30 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted/20 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-lg p-6 h-full animate-in slide-in-from-bottom-5 duration-700 flex flex-col" data-testid="card-workflow-river">
      {/* Fixed Header Section */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-semibold flex items-center font-display animate-in fade-in-50 duration-500 delay-200" data-testid="text-workflow-title">
            <CheckSquare className="w-5 h-5 mr-2 text-primary animate-bounce" />
            Tasks
          </h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                    onClick={handleClearAllTasks}
                    disabled={deleteTaskMutation.isPending || activeTasks.length === 0}
                    className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-all duration-150 hover:scale-105 hover:shadow-md active:scale-95"
                    data-testid="button-clear-all-tasks"
                  >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear all tasks</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {/* Updated button group for responsiveness */}
        <div className="flex flex-wrap items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                    onClick={() => setIsAddTaskDialogOpen(true)} // Using the renamed state variable
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-105 hover:shadow-lg animate-in slide-in-from-right-3 duration-500 delay-300"
                    data-testid="button-add-ai-task"
                  >
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                  <span className="hidden sm:inline">AI (Natural Language to Task)</span>
                  <span className="sm:hidden">AI</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create task using AI from natural language</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                    onClick={() => setIsManualTaskDialogOpen(true)} // Using the renamed state variable
                    className="bg-green-500 hover:bg-green-600 text-white px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 hover:scale-105 hover:shadow-lg"
                    data-testid="button-add-manual-task-plus"
                  >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline ml-1">Manual Tasks</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Add Task Manually (No AI)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

        </div>
      </div>

      {/* Three Column Layout - Side by Side */}
      <div className="flex-1 overflow-hidden min-h-0 max-h-[calc(100vh-200px)]">
        {activeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground" data-testid="text-no-tasks">
            <CheckSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No pending tasks in your pipeline.</p>
            <p className="text-sm mt-2">Your task pipeline is clear and ready for action!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6 h-full min-h-[400px]">
            {priorityOrder.map((priority) => {
              const priorityTasks = tasksByPriority[priority];
              const config = priorityConfig[priority];

              if (!priorityTasks || priorityTasks.length === 0) {
                return null;
              }

              return (
                <div key={priority} className={`flex flex-col h-full max-h-full rounded-lg ${config.sectionBg} p-4`}>
                  {/* Fixed Header */}
                  <div className={`flex items-center space-x-2 mb-3 pb-2 border-b border-muted/20 flex-shrink-0 transition-all duration-500 ${
                    visibleSections.has(priority) 
                      ? 'animate-in slide-in-from-left-4 opacity-100' 
                      : 'opacity-0'
                  }`}>
                    <div className={`w-3 h-3 ${priorityConfig[priority].dotColor} rounded-full`} />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {priorityConfig[priority].label} ({priorityTasks.length})
                    </h3>
                  </div>

                  {/* Scrollable Task Content */}
                  <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-2" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                  {priorityTasks.map((task) => {
                    // Ensure task has a valid priority, default to 'normal' if not set
                    const taskPriority = task.priority || 'normal';
                    const taskConfig = priorityConfig[taskPriority] || priorityConfig['normal'];

                    // Determine source type for badge
                    let sourceType = "Manual";
                    if (task.sourceApp === 'gmail') {
                      sourceType = "Email";
                    } else if (task.metadata?.aiGenerated) {
                      sourceType = "AI";
                    }

                    return (
                      <div
                        key={task.id}
                        className={`workflow-river rounded-lg p-2 border ${taskConfig.color} relative ${
                          task.status !== 'completed' ? taskConfig.class : ''
                        } ${
                          task.status === 'completed' ? 'opacity-80 bg-green-50/50 border-green-300 border-dashed' : taskConfig.bgColor
                        } overflow-hidden max-w-full min-w-0 transition-all duration-200 hover:shadow-lg hover:border-opacity-80 ${
                          visibleTasks.has(task.id) 
                            ? 'animate-in slide-in-from-bottom-4 opacity-100 duration-500' 
                            : 'opacity-0 translate-y-4'
                        }`}
                        data-testid={`task-item-${task.id}`}
                        style={{
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          width: '100%',
                          maxWidth: '100%'
                        }}
                      >
                        {/* Main task content */}
                        <div className="flex flex-col space-y-2">
                          {/* Task header with title and status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start space-x-2 flex-1 min-w-0">
                              <div className={`w-3 h-3 ${taskConfig.dotColor} rounded-full ${task.priority === 'urgent' ? 'animate-pulse' : ''} flex-shrink-0 mt-1`} />
                              <div className="flex-1 min-w-0 overflow-hidden">
                                {editingTaskId === task.id ? (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={editingTitle}
                                      onChange={(e) => setEditingTitle(e.target.value)}
                                      className="text-sm font-medium flex-1"
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveEditTitle(task.id);
                                        } else if (e.key === 'Escape') {
                                          handleCancelEditTitle();
                                        }
                                      }}
                                      autoFocus
                                    />
                                    <Button
                                      onClick={() => handleSaveEditTitle(task.id)}
                                      disabled={updateTaskMutation.isPending}
                                      className="bg-green-500 hover:bg-green-600 text-white p-1 h-6 w-6"
                                    >
                                      ✓
                                    </Button>
                                    <Button
                                      onClick={handleCancelEditTitle}
                                      className="bg-gray-500 hover:bg-gray-600 text-white p-1 h-6 w-6"
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <h3 className={`font-medium break-words text-sm leading-tight truncate flex-1 ${
                                      visibleTasks.has(task.id) 
                                        ? 'animate-in slide-in-from-left-2 duration-500' 
                                        : 'opacity-0'
                                    }`} data-testid={`task-title-${task.id}`}>
                                      {task.status === 'completed' ? '✅ ' : ''}{task.title}
                                    </h3>
                                    {/* Pencil edit button for AI-generated tasks */}
                                    {(task.metadata?.aiGenerated === true || task.metadata?.sourceNotificationId) && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              onClick={() => handleStartEditTitle(task)}
                                              className="bg-gray-50 hover:bg-gray-100 text-gray-600 p-1 h-5 w-5 opacity-60 hover:opacity-100 transition-opacity"
                                              data-testid={`button-edit-title-${task.id}`}
                                            >
                                              <Pencil className="w-3 h-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Change the title</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                )}
                                {/* Hide "Show description" when editing time */}
                                {editingTimeTaskId !== task.id && (
                                  <div
                                    className="text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors flex items-center gap-1 mt-1"
                                    data-testid={`task-description-${task.id}`}
                                    onClick={() => handleViewDescription(task)}
                                  >
                                    <span className="underline">Show description</span>
                                    <Info className="w-3 h-3 opacity-60" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Countdown timer - hide for completed tasks */}
                            {task.status !== 'completed' && (((task.priority || 'normal') === 'urgent' || (task.priority || 'normal') === 'important') || task.dueAt) && (
                              <div className="flex-shrink-0">
                                {editingTimeTaskId === task.id ? (
                                  <div className="relative flex items-center gap-2">
                                    <div className="relative z-[9999]">
                                      <DatePicker
                                        selected={editingDueDate}
                                        onChange={(date) => setEditingDueDate(date)}
                                        showTimeSelect
                                        timeFormat="HH:mm"
                                        timeIntervals={15}
                                        dateFormat="MMM d, yyyy h:mm aa"
                                        className="text-xs p-2 rounded border text-center w-44 relative z-[9999] text-black bg-white"
                                        placeholderText="Select date & time"
                                        popperClassName="!z-[99999]"
                                        popperPlacement="bottom-end"
                                        popperModifiers={[
                                          {
                                            name: "preventOverflow",
                                            options: {
                                              rootBoundary: "viewport",
                                              tether: false,
                                              altAxis: true,
                                              padding: 8
                                            }
                                          },
                                          {
                                            name: "flip",
                                            options: {
                                              fallbackPlacements: ["top-end", "bottom-start", "top-start"]
                                            }
                                          }
                                        ]}
                                        portalId="date-picker-portal"
                                      />
                                    </div>
                                    <Button
                                      onClick={() => handleSaveEditTime(task.id)}
                                      disabled={updateTaskMutation.isPending}
                                      className="bg-green-500 hover:bg-green-600 text-white p-1 h-6 w-6"
                                    >
                                      ✓
                                    </Button>
                                    <Button
                                      onClick={handleCancelEditTime}
                                      className="bg-gray-500 hover:bg-gray-600 text-white p-1 h-6 w-6"
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                ) : (
                                  <CountdownErrorBoundary fallback={<span className="text-xs text-gray-500">No time set</span>}>
                                    <CountdownTimer task={task} onEditClick={() => handleStartEditTime(task)} />
                                  </CountdownErrorBoundary>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action buttons row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="task-badge-container flex items-center space-x-2">
                              {/* Only show badges for non-completed tasks */}
                              {task.status !== 'completed' && (
                                <>
                                  {/* Show Priority badge for priority person emails */}
                                  {task.metadata?.isPriorityPerson ? (
                                    <Badge className="priority-person-badge text-xs bg-red-500 text-white border-red-500 hover:bg-red-600">
                                      Priority
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant={task.priority === "important" ? "default" : task.priority === "urgent" ? "destructive" : "secondary"}
                                      className={`text-xs ${task.priority === 'urgent' ? 'bg-red-100 text-red-800' : task.priority === 'important' ? 'bg-orange-100 text-orange-800' : ''}`}
                                    >
                                      {priorityConfig[task.priority || 'normal']?.label || task.priority}
                                    </Badge>
                                  )}

                                  {/* Show clickable reply button for all email-based tasks */}
                                  {task.sourceApp === 'gmail' && task.metadata?.emailFrom ? (
                                    <Badge 
                                      variant="outline" 
                                      className="email-reply-badge text-xs cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                                      onClick={() => {
                                        const emailFrom = task.metadata?.emailFrom || '';
                                        const emailSubject = task.metadata?.emailSubject || '';
                                        const replySubject = emailSubject.startsWith('Re:') ? emailSubject : `Re: ${emailSubject}`;
                                        window.open(`https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(emailFrom)}&su=${encodeURIComponent(replySubject)}`, '_blank');
                                      }}
                                      title={`Click to reply to ${task.metadata.emailFrom}`}
                                    >
                                      reply
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      {sourceType}
                                    </Badge>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="task-action-buttons flex items-center gap-1 flex-shrink-0">
                              {task.status !== 'completed' && (
                                <Button
                                  onClick={() => handleCompleteTask(task.id)}
                                  disabled={completingTaskId === task.id}
                                  className="bg-green-600 hover:bg-green-700 px-2 py-1 rounded text-xs font-medium transition-colors hover:shadow-md text-white h-6"
                                  size="sm"
                                  data-testid={`button-complete-task-${task.id}`}
                                >
                                  {completingTaskId === task.id ? "Completing..." : "✓ Done"}
                                </Button>
                              )}
                              {task.status === 'completed' && (
                                <div className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200 pointer-events-none h-6 flex items-center">
                                  ✓ Completed
                                </div>
                              )}



                              {/* Clear task button */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      onClick={() => handleDeleteTask(task.id)}
                                      disabled={deleteTaskMutation.isPending}
                                      className="bg-red-50 hover:bg-red-100 text-red-600 px-1.5 py-1 rounded text-xs transition-colors h-6"
                                      size="sm"
                                      data-testid={`button-clear-task-${task.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Remove this task</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add AI Task Dialog */}
      <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2 text-purple-500" />
              AI (Natural Language to Task)
            </DialogTitle>
            <DialogDescription>
              Describe your task in natural language and AI will create it for you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Task Description</label>
              <Input
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="e.g., Review project proposal by 3pm today"
                className="w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateManualTask();
                  }
                }}
                data-testid="input-manual-task"
              />
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddTaskDialogOpen(false);
                  setNewTaskInput("");
                }}
                className="flex-1"
                data-testid="button-cancel-task"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateAITask}
                disabled={!newTaskInput.trim() || createTaskFromTextMutation.isPending}
                className="flex-1 bg-green-500 hover:bg-green-600"
                data-testid="button-create-task"
              >
                {createTaskFromTextMutation.isPending ? "🤖 AI Creating Task..." : "Create Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Completely Manual Task Dialog */}
      <Dialog open={isManualTaskDialogOpen} onOpenChange={setIsManualTaskDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Plus className="w-5 h-5 mr-2 text-green-500" />
              Add Manual Task
            </DialogTitle>
            <DialogDescription>
              Create a task without AI assistance. Enter the task name and time separately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Task Name</label>
              <Input
                value={manualTaskName}
                onChange={(e) => setManualTaskName(e.target.value)}
                placeholder="e.g., Review project proposal"
                className="w-full"
                data-testid="input-manual-task-name"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Due Date & Time (Optional)</label>
              <div className="border border-gray-300 rounded-md p-2">
                <DatePicker
                  selected={manualTaskDateTime}
                  onChange={(date: Date | null) => setManualTaskDateTime(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMM d, yyyy h:mm aa"
                  placeholderText="Select date and time"
                  className="w-full bg-transparent outline-none text-sm"
                  minDate={new Date()}
                  isClearable
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Select a specific date and time, or leave empty for no deadline
              </p>
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsManualTaskDialogOpen(false);
                  setManualTaskName("");
                  setManualTaskTime("");
                  setManualTaskDateTime(null);
                }}
                className="flex-1"
                data-testid="button-cancel-manual-task"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateManualTask}
                disabled={!manualTaskName.trim() || createTaskMutation.isPending}
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                data-testid="button-create-manual-task"
              >
                {createTaskMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Description Dialog */}
      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <CheckSquare className="w-5 h-5 mr-2 text-primary" />
              Task Description
            </DialogTitle>
            <DialogDescription>
              {selectedTask && `Task: ${selectedTask.title} • Status: ${selectedTask.status}`}
            </DialogDescription>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-2">Title:</h4>
                <p className="text-sm text-muted-foreground">{selectedTask.title}</p>
              </div>

              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-2">Description:</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedTask.description || 'No description provided'}
                </p>
              </div>

              {selectedTask.priority && (
                <div className="border rounded-lg p-4 bg-muted/20">
                  <h4 className="font-medium mb-2">Priority:</h4>
                  <span className={`text-sm px-2 py-1 rounded-full ${
                    selectedTask.priority === 'urgent' ? 'bg-red-500 text-white' : // Red for urgent
                    selectedTask.priority === 'important' ? 'bg-orange-500 text-white' : // Orange for important
                    selectedTask.priority === 'normal' ? 'bg-blue-500 text-white' : // Blue for normal
                    'bg-gray-200 text-gray-800' // Default
                  }`}>
                    {selectedTask.priority.charAt(0).toUpperCase() + selectedTask.priority.slice(1)}
                  </span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
