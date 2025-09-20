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
          return { user: undefined };
        }
        
        const data = await response.json();
        
        // Always store fresh user data in localStorage
        if (data.user) {
          localStorage.setItem('user_auth', JSON.stringify(data.user));
        } else {
          localStorage.removeItem('user_auth');
        }
        
        return data;
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('user_auth');
        return { user: undefined };
      }
    },
    retry: false,
    staleTime: 1000 * 10, // Very short cache for immediate updates
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 30, // Check auth every 30 seconds for better reactivity
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
