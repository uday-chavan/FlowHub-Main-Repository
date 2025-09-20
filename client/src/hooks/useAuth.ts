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

        // Handle user data with proper isolation and strict user switching detection
        if (data.user) {
          const previousUserId = localStorage.getItem('currentUserId');
          const previousUserEmail = localStorage.getItem('currentUserEmail');
          const currentUserId = data.user.id;
          const currentUserEmail = data.user.email;
          
          // Strict user change detection - clear everything if user changed
          const userChanged = (previousUserId && previousUserId !== currentUserId) || 
                             (previousUserEmail && previousUserEmail !== currentUserEmail);
          
          if (userChanged) {
            console.log(`Auth hook detected user change: ${previousUserEmail || previousUserId} -> ${currentUserEmail}`);
            // Complete data isolation - clear everything
            localStorage.clear();
            sessionStorage.clear();
            // Force page reload to ensure clean state
            window.location.reload();
            return { user: undefined };
          }
          
          // Store fresh user data only after validation
          localStorage.setItem('user_auth', JSON.stringify(data.user));
          localStorage.setItem('currentUserId', data.user.id);
          localStorage.setItem('currentUserEmail', data.user.email);
        } else {
          // Clear all auth-related data on logout
          localStorage.clear();
          sessionStorage.clear();
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
