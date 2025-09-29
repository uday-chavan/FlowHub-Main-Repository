import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

import { useCurrentUser } from "./useAuth";

export function useNotifications(limit?: number, type?: string) {
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useQuery<Notification[]>({
    queryKey: ["/api/notifications", userId, limit, type],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');

      const params = new URLSearchParams();
      params.append('userId', userId);
      if (limit) params.append('limit', limit.toString());
      if (type) params.append('type', type);

      const response = await fetch(`/api/notifications?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // Authentication/authorization failed - redirect to login
          window.location.href = '/';
          throw new Error('Authentication failed');
        }
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    enabled: !!userId && !!user,
    refetchInterval: 15000, // Poll every 15 seconds for reasonable updates
    refetchIntervalInBackground: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      return await apiRequest("PATCH", `/api/notifications/${notificationId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}

export function useAnalyzeNotification() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async ({
      title,
      content,
      sourceApp,
    }: {
      title: string;
      content: string;
      sourceApp: string;
    }) => {
      const userId = user?.id;
      if (!userId) throw new Error('User not authenticated');

      return await apiRequest("POST", "/api/notifications/analyze", {
        title,
        content,
        sourceApp,
        userId: userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}
