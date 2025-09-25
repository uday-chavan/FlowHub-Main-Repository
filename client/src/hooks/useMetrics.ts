import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UserMetrics, InsertUserMetrics, UserAppLink } from "@shared/schema";
import { useCurrentUser } from "./useAuth";

export function useMetrics() {
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useQuery<UserMetrics>({
    queryKey: ["/api/metrics", userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const response = await fetch(`/api/metrics?userId=${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }
      return response.json();
    },
    enabled: !!userId && !!user,
  });
}

export function useWellnessInsights() {
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      return await apiRequest("POST", "/api/wellness/insights", {
        userId: userId,
      });
    },
  });
}

export function useConnectedApps() {
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useQuery({
    queryKey: ["/api/connected-apps", userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const response = await fetch(`/api/connected-apps?userId=${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch connected apps');
      }
      return response.json();
    },
    enabled: !!userId && !!user,
  });
}

export function useAIInsights() {
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useQuery({
    queryKey: ["/api/ai-insights", userId],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const response = await fetch(`/api/ai-insights?userId=${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch AI insights');
      }
      return response.json();
    },
    enabled: !!userId && !!user,
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
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useQuery<UserAppLink[]>({
    queryKey: ["/api/user-app-links"],
    queryFn: async () => {
      if (!userId) throw new Error('User not authenticated');
      const response = await fetch(`/api/user-app-links?userId=${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user app links');
      }
      return response.json();
    },
    enabled: !!userId && !!user,
    refetchInterval: 2000, // Poll every 2 seconds for real-time updates
    refetchIntervalInBackground: true,
  });
}

export function useCreateUserAppLink() {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id;

  return useMutation({
    mutationFn: async (linkData: { name: string; url: string; logo?: string }) => {
      if (!userId) throw new Error('User not authenticated');
      return await apiRequest("POST", "/api/user-app-links", {
        userId: userId,
        ...linkData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-app-links", userId] });
      queryClient.refetchQueries({ queryKey: ["/api/user-app-links", userId] });
    },
  });
}
