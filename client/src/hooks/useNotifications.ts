import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

const MOCK_USER_ID = "demo-user";

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ["/api/notifications", { userId: MOCK_USER_ID }],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/notifications?userId=${MOCK_USER_ID}`);
        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }
        return response.json();
      } catch (error) {
        // Return sample data if API fails
        return [
          {
            id: "1",
            title: "Meeting with Product Team",
            description: "Quarterly planning meeting scheduled for 3 PM",
            type: "important",
            sourceApp: "calendar",
            isRead: false,
            isDismissed: false,
            createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
            aiSummary: "Important quarterly planning meeting with the product team"
          },
          {
            id: "2",
            title: "New email from client",
            description: "Project update and feedback request",
            type: "urgent",
            sourceApp: "gmail",
            isRead: false,
            isDismissed: false,
            createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
            aiSummary: "Client has provided feedback on the latest project deliverables"
          },
          {
            id: "3",
            title: "Slack message from team",
            description: "New discussion in #development channel",
            type: "informational",
            sourceApp: "slack",
            isRead: false,
            isDismissed: false,
            createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
            aiSummary: "Team discussion about upcoming sprint planning"
          }
        ].map(notification => ({ 
          ...notification, 
          userId: MOCK_USER_ID, 
          metadata: {}, 
          actionableInsights: [] as string[],
          createdAt: new Date(notification.createdAt),
          type: notification.type as "urgent" | "important" | "informational",
          sourceApp: notification.sourceApp as "gmail" | "slack" | "calendar" | "notion" | "trello" | "zoom" | "manual"
        })) as Notification[];
      }
    },
    refetchInterval: 5000, // Poll every 5 seconds for new notifications
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
      return await apiRequest("POST", "/api/notifications/analyze", {
        title,
        content,
        sourceApp,
        userId: MOCK_USER_ID,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}