import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UserMetrics, InsertUserMetrics, UserAppLink } from "@shared/schema";

const MOCK_USER_ID = "demo-user";

export function useMetrics() {
  return useQuery<UserMetrics>({
    queryKey: ["/api/metrics", { userId: MOCK_USER_ID }],
  });
}

export function useWellnessInsights() {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/wellness/insights", {
        userId: MOCK_USER_ID,
      });
    },
  });
}

export function useConnectedApps() {
  return useQuery({
    queryKey: ["/api/connected-apps", { userId: MOCK_USER_ID }],
  });
}

export function useAIInsights() {
  return useQuery({
    queryKey: ["/api/ai-insights", { userId: MOCK_USER_ID }],
  });
}

export function useApplyAIInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      return await apiRequest("POST", `/api/ai-insights/${insightId}/apply`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-insights"] });
    },
  });
}

export function useDismissAIInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      return await apiRequest("POST", `/api/ai-insights/${insightId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-insights"] });
    },
  });
}

export function useUserAppLinks() {
  return useQuery<UserAppLink[]>({
    queryKey: ["/api/user-app-links", "demo-user"],
    queryFn: async () => {
      const response = await fetch(`/api/user-app-links?userId=demo-user`);
      if (!response.ok) {
        throw new Error('Failed to fetch user app links');
      }
      return response.json();
    },
  });
}

export function useCreateUserAppLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkData: { name: string; url: string; logo?: string }) => {
      return await apiRequest("POST", "/api/user-app-links", {
        userId: "demo-user",
        ...linkData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-app-links", "demo-user"] });
      queryClient.refetchQueries({ queryKey: ["/api/user-app-links", "demo-user"] });
    },
  });
}