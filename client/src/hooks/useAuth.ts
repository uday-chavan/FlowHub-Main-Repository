import { useQuery } from "@tanstack/react-query";

interface User {
  id: string;
  name: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  profileImageUrl?: string;
}

interface AuthResponse {
  user?: User;
}

export function useAuth() {
  return useQuery<AuthResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (!response.ok) {
          // Clear any stale auth state on failed requests
          localStorage.removeItem('user_auth');
          localStorage.removeItem('gmailConnected');
          localStorage.removeItem('userEmail');
          localStorage.removeItem('currentUserId');
          localStorage.removeItem('currentUserEmail');
          return { user: undefined };
        }

        const data = await response.json();

        // Handle user data with proper isolation
        if (data.user) {
          const previousUserId = localStorage.getItem('currentUserId');
          const currentUserId = data.user.id;
          
          // If user changed, clear everything first
          if (previousUserId && previousUserId !== currentUserId) {
            console.log(`Auth hook detected user change: ${previousUserId} -> ${currentUserId}`);
            localStorage.clear();
            sessionStorage.clear();
          }
          
          // Store fresh user data
          localStorage.setItem('user_auth', JSON.stringify(data.user));
          localStorage.setItem('currentUserId', data.user.id);
          localStorage.setItem('currentUserEmail', data.user.email);
        } else {
          // Clear all auth-related data on logout
          localStorage.removeItem('user_auth');
          localStorage.removeItem('currentUserId');
          localStorage.removeItem('currentUserEmail');
          localStorage.removeItem('gmailConnected');
          localStorage.removeItem('userEmail');
        }

        return data;
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('user_auth');
        return { user: undefined };
      }
    },
    retry: false,
    staleTime: 0, // No cache - always fetch fresh data
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 5, // Check auth every 5 seconds for immediate updates
    gcTime: 0, // Don't cache in garbage collection
    refetchOnMount: true, // Always refetch on component mount
  });
}

export function useCurrentUser() {
  const { data, isLoading, error } = useAuth();

  return {
    user: data?.user,
    isLoading,
    isAuthenticated: !!data?.user,
    error
  };
}
