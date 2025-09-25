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
          
          // Only clear data if we're actually switching to a different user account
          // Don't clear if this is the same user after a deployment/refresh
          const isDifferentUser = previousUserId && previousUserEmail && 
                                 (previousUserId !== currentUserId || previousUserEmail !== currentUserEmail);
          
          if (isDifferentUser) {
            console.log(`Auth hook detected user change: ${previousUserEmail} -> ${currentUserEmail}`);
            // Only clear auth-related data, not all localStorage
            const authKeys = ['user_auth', 'gmailConnected', 'userEmail', 'currentUserId', 'currentUserEmail'];
            authKeys.forEach(key => localStorage.removeItem(key));
            sessionStorage.clear();
            
            // Set new user data
            localStorage.setItem('user_auth', JSON.stringify(data.user));
            localStorage.setItem('currentUserId', data.user.id);
            localStorage.setItem('currentUserEmail', data.user.email);
            // Force navigation to dashboard instead of reload
            window.location.href = '/dashboard';
            return { user: data.user };
          }
          
          // Store fresh user data for same user or first login
          localStorage.setItem('user_auth', JSON.stringify(data.user));
          localStorage.setItem('currentUserId', data.user.id);
          localStorage.setItem('currentUserEmail', data.user.email);
        } else {
          // Clear only auth-related data on logout, not everything
          const authKeys = ['user_auth', 'gmailConnected', 'userEmail', 'currentUserId', 'currentUserEmail'];
          authKeys.forEach(key => localStorage.removeItem(key));
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
