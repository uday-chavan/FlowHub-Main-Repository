import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Task, InsertTask } from "@shared/schema";
import { useCurrentUser } from "./useAuth";

// Removed MOCK_USER_ID as it's no longer used
// const MOCK_USER_ID = "demo-user";

export function useTasks() {
  const { user } = useCurrentUser();
  const userId = user?.id;
  return useQuery<Task[]>({
    queryKey: [`/api/tasks`, userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const response = await fetch(`/api/tasks?userId=${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Authentication/authorization failed - clear local state
          localStorage.clear();
          sessionStorage.clear();
          window.location.reload();
        }
        throw new Error('Failed to fetch tasks');
      }
      return response.json();
    },
    enabled: !!userId && !!user,
    refetchInterval: 5000, // Reduced frequency to 5 seconds to prevent aggressive polling during operations
    refetchIntervalInBackground: true,
    staleTime: 2000, // Consider data stale after 2 seconds
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async (task: InsertTask) => {
      // Process the task to ensure proper date handling
      const processedTask = { ...task, userId };
      if (processedTask.dueAt) {
        if (processedTask.dueAt instanceof Date) {
          processedTask.dueAt = processedTask.dueAt.toISOString();
        } else if (typeof processedTask.dueAt === 'string') {
          // If it's already a valid ISO string, keep it as is
          const date = new Date(processedTask.dueAt);
          if (!isNaN(date.getTime())) {
            // Only convert if it's not already an ISO string
            if (!processedTask.dueAt.includes('T')) {
              processedTask.dueAt = date.toISOString();
            }
          } else {
            processedTask.dueAt = null;
          }
        }
      }
      
      return await apiRequest("POST", "/api/tasks", processedTask);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.refetchQueries({ queryKey: ["/api/tasks"] });
    },
  });
}

export function useCreateTaskFromText() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async ({ naturalLanguageInput }: { naturalLanguageInput: string }) => {
      if (!userId) throw new Error('User not authenticated');
      const response = await fetch("/api/tasks/create-from-text", {
        method: "POST",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          naturalLanguageInput,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create task from natural language");
      }

      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.refetchQueries({ queryKey: ["/api/tasks"] });
    },
  });
}

export function useStartTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async (taskId: string) => {
      // Assuming apiRequest handles user context or the endpoint infers it
      return await apiRequest("POST", `/api/tasks/${taskId}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
    },
  });
}

export function useStopTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/stop`);
    },
    onSuccess: (data, taskId) => {
      // Invalidate and refetch tasks to get updated data from server
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
      
      // Also invalidate time saved stats to reflect the new completion
      queryClient.invalidateQueries({ queryKey: ['timeSavedStats', userId] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      // Ensure dueAt is properly converted to ISO string if it's a Date object
      const processedUpdates = { ...updates, userId };
      if (processedUpdates.dueAt !== undefined) {
        if (processedUpdates.dueAt === null) {
          // Keep null values as null
          processedUpdates.dueAt = null;
        } else {
          // Always ensure we have a valid Date object first
          let dateObj: Date | null = null;
          
          if (processedUpdates.dueAt instanceof Date) {
            dateObj = processedUpdates.dueAt;
          } else if (typeof processedUpdates.dueAt === 'string') {
            dateObj = new Date(processedUpdates.dueAt);
          }
          
          // Validate the date and convert to ISO string
          if (dateObj && !isNaN(dateObj.getTime())) {
            processedUpdates.dueAt = dateObj.toISOString();
          } else {
            console.warn('Invalid date provided for task update:', processedUpdates.dueAt);
            processedUpdates.dueAt = null;
          }
        }
      }
      
      return await apiRequest("PATCH", `/api/tasks/${id}`, processedUpdates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
    },
  });
}

export function useOptimizeWorkflow() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      return await apiRequest("POST", "/api/workflow/optimize", {
        userId,
      });
    },
    onSuccess: () => {
      // Invalidate tasks to refresh with new priorities
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      // Use a more controlled invalidation to prevent immediate refetch
      queryClient.invalidateQueries({ 
        queryKey: ["/api/tasks", userId],
        refetchType: 'none' // Prevent automatic refetch that causes flickering
      });
      
      // Manually set stale after a brief delay to allow for controlled refetch later
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/tasks", userId],
          refetchType: 'active'
        });
      }, 1000);
    },
  });
}

export function useAutoReschedule() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      return await apiRequest("POST", "/api/workflow/auto-reschedule", {
        userId,
      });
    },
    onSuccess: () => {
      // Invalidate tasks to refresh with new rescheduled times
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
    },
  });
}
