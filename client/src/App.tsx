import { useEffect, useState } from "react";
import { Router, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Landing } from "@/pages/Landing";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import EmailsConverted from "@/pages/EmailsConverted";
import TimeSaved from "@/pages/TimeSaved";
import AppLinks from "@/pages/app-links";
import PriorityEmails from "@/pages/PriorityEmails";
import Feedback from "@/pages/Feedback";
import { useCurrentUser } from "@/hooks/useAuth";

// Create a single queryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AppRouter() {
  const { user, isLoading, isAuthenticated } = useCurrentUser();
  const qc = queryClient; // Use the queryClient for cache clearing
  const [location, setLocation] = useLocation();
  const [authChecked, setAuthChecked] = useState(false);
  const [initialAuthState, setInitialAuthState] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setAuthChecked(true);
      if (initialAuthState === null) {
        setInitialAuthState(isAuthenticated);
      }
    }
  }, [isLoading, isAuthenticated, initialAuthState]);

  // Handle authentication state changes and user switching
  useEffect(() => {
    if (authChecked && initialAuthState !== null && user) {
      const previousUserId = localStorage.getItem('currentUserId');
      const previousUserEmail = localStorage.getItem('currentUserEmail');
      
      // Check for user change - be very strict about user isolation
      const userChanged = (previousUserId && previousUserId !== user.id) || 
                         (previousUserEmail && previousUserEmail !== user.email);
      
      if (userChanged) {
        // User changed - force complete refresh to clear all state
        console.log(`User switching detected: ${previousUserEmail || 'unknown'} -> ${user.email}`);
        
        // Complete state reset to prevent data bleeding
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear React Query cache to prevent old data
        qc.clear();
        
        // Set new user state
        localStorage.setItem('currentUserId', user.id);
        localStorage.setItem('currentUserEmail', user.email);
        localStorage.setItem('user_auth', JSON.stringify(user));
        
        // Force complete page refresh to ensure clean state
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 100);
        
        return; // Exit early to prevent further processing
      }
      
      // Set initial user data if not present
      if (!previousUserId || !previousUserEmail) {
        localStorage.setItem('currentUserId', user.id);
        localStorage.setItem('currentUserEmail', user.email);
        localStorage.setItem('user_auth', JSON.stringify(user));
      }
      
      // Handle auth state transitions
      if (initialAuthState && !isAuthenticated) {
        // User logged out - clear everything and go to landing
        localStorage.clear();
        sessionStorage.clear();
        qc.clear();
        setLocation("/");
        setInitialAuthState(false);
      } else if (!initialAuthState && isAuthenticated) {
        // User just logged in - go to dashboard
        setLocation("/dashboard");
        setInitialAuthState(true);
      }
    } else if (authChecked && !isAuthenticated) {
      // No user authenticated - ensure clean state
      const hadPreviousUser = localStorage.getItem('currentUserId');
      if (hadPreviousUser) {
        localStorage.clear();
        sessionStorage.clear();
        qc.clear();
      }
      setLocation("/");
    }
  }, [authChecked, isAuthenticated, initialAuthState, setLocation, user, qc]);

  // Listen for storage changes (when user logs out in another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_auth' && e.newValue === null) {
        // User logged out in another tab
        window.location.reload();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Check for successful Gmail connection on mount
  useEffect(() => {
    const gmailConnected = localStorage.getItem('gmailConnected');
    const userEmail = localStorage.getItem('userEmail');

    if (gmailConnected === 'true' && userEmail && !user) {
      // Clear the flags
      localStorage.removeItem('gmailConnected');
      localStorage.removeItem('userEmail');
    }
  }, [user]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Router>
      <Route path="/">
        <Landing />
      </Route>
      <Route path="/dashboard">
        {isAuthenticated ? <Dashboard /> : <Landing />}
      </Route>
      <Route path="/emails-converted">
        {isAuthenticated ? <EmailsConverted /> : <Landing />}
      </Route>
      <Route path="/time-saved">
        {isAuthenticated ? <TimeSaved /> : <Landing />}
      </Route>
      <Route path="/app-links">
        {isAuthenticated ? <AppLinks /> : <Landing />}
      </Route>
      <Route path="/priority-emails">
        {isAuthenticated ? <PriorityEmails /> : <Landing />}
      </Route>
      <Route path="/feedback">
        {isAuthenticated ? <Feedback /> : <Landing />}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route path="/:rest*">
        {isAuthenticated ? <Dashboard /> : <Landing />}
      </Route>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen max-h-screen overflow-hidden">
        <Toaster />
        <AppRouter />
      </div>
    </QueryClientProvider>
  );
}
