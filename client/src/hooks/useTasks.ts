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
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async (task: InsertTask) => {
      // Assuming apiRequest can handle user context or task should include userId
      return await apiRequest("POST", "/api/tasks", { ...task, userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
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
      // Assuming apiRequest handles user context or the endpoint infers it
      return await apiRequest("POST", `/api/tasks/${taskId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      // Assuming apiRequest handles user context or updates should include userId
      return await apiRequest("PATCH", `/api/tasks/${id}`, { ...updates, userId });
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
      // Assuming apiRequest handles user context or the endpoint infers it
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", userId] });
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
