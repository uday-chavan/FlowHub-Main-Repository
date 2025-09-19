import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Task, InsertTask } from "@shared/schema";

const MOCK_USER_ID = "demo-user";

export function useTasks() {
  return useQuery<Task[]>({
    queryKey: ["/api/tasks", { userId: MOCK_USER_ID }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?userId=${MOCK_USER_ID}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds to catch priority changes
    refetchIntervalInBackground: true,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: InsertTask) => {
      return await apiRequest("POST", "/api/tasks", task);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useCreateTaskFromText() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, naturalLanguageInput }: { userId: string; naturalLanguageInput: string }) => {
      const response = await fetch("/api/tasks/create-from-text", {
        method: "POST",
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useStartTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/start`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useStopTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Task> }) => {
      return await apiRequest("PATCH", `/api/tasks/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useOptimizeWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/workflow/optimize", {
        userId: MOCK_USER_ID,
      });
    },
    onSuccess: () => {
      // Invalidate tasks to refresh with new priorities
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}

export function useAutoReschedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/workflow/auto-reschedule", {
        userId: MOCK_USER_ID,
      });
    },
    onSuccess: () => {
      // Invalidate tasks to refresh with new rescheduled times
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { userId: MOCK_USER_ID }] });
    },
  });
}
