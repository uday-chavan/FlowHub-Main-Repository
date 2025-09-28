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
  // Add redeployment detection state
  const [showRedeploymentPopup, setShowRedeploymentPopup] = useState(false);

  // Check for app redeployment on initial load
  useEffect(() => {
    const checkForRedeployment = () => {
      const appVersion = localStorage.getItem('appVersion');
      const currentVersion = Date.now().toString();
      
      // If user is authenticated but no app version is stored, 
      // or if we detect a potential redeployment scenario
      if (isAuthenticated && !appVersion) {
        // Show redeployment popup for authenticated users without version
        setShowRedeploymentPopup(true);
        return;
      }
      
      // Store current version if not present
      if (!appVersion) {
        localStorage.setItem('appVersion', currentVersion);
      }
    };

    if (authChecked) {
      checkForRedeployment();
    }
  }, [authChecked, isAuthenticated]);

  useEffect(() => {
    if (authChecked && initialAuthState !== null && user) {
      const previousUserId = localStorage.getItem('currentUserId');
      const previousUserEmail = localStorage.getItem('currentUserEmail');
      
      // Check for user change - be very strict about user isolation
      const userChanged = (previousUserId && previousUserId !== user.id) || 
                         (previousUserEmail && previousUserEmail !== user.email);
      
      if (userChanged) {
        // User changed - show redeployment popup instead of clearing immediately
        console.log(`User switching detected: ${previousUserEmail || 'unknown'} -> ${user.email}`);
        setShowRedeploymentPopup(true);
        return; // Exit early to prevent further processing
      }
      
      // Set initial user data if not present - preserve existing data
      if (!previousUserId || !previousUserEmail) {
        localStorage.setItem('currentUserId', user.id);
        localStorage.setItem('currentUserEmail', user.email);
        localStorage.setItem('user_auth', JSON.stringify(user));
        localStorage.setItem('appVersion', Date.now().toString());
      }
      
      // Handle auth state transitions - be more conservative about clearing
      if (initialAuthState && !isAuthenticated) {
        // User logged out - show popup instead of immediate clear
        setShowRedeploymentPopup(true);
      } else if (!initialAuthState && isAuthenticated) {
        // User just logged in - go to dashboard
        setLocation("/dashboard");
        setInitialAuthState(true);
      }
    } else if (authChecked && !isAuthenticated) {
      // Only check if there was a previous user, don't automatically clear
      const hadPreviousUser = localStorage.getItem('currentUserId');
      if (hadPreviousUser && !showRedeploymentPopup) {
        // Show redeployment popup instead of clearing
        setShowRedeploymentPopup(true);
      } else if (!hadPreviousUser) {
        setLocation("/");
      }
    }
  }, [authChecked, isAuthenticated, initialAuthState, setLocation, user, qc, showRedeploymentPopup]);

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
  // Handle redeployment popup actions
  const handleRedeploymentLogin = () => {
    // Clear data and redirect to login
    localStorage.clear();
    sessionStorage.clear();
    qc.clear();
    setShowRedeploymentPopup(false);
    setLocation("/");
    window.location.reload();
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen max-h-screen overflow-hidden">
        <Toaster />
        <AppRouter />
        
        {/* Redeployment Popup - Non-cancellable */}
        {showRedeploymentPopup && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              </div>
              
              <h2 className="text-xl font-semibold text-center mb-3 text-foreground">
                🔄 The app was updated
              </h2>
              
              <p className="text-center text-muted-foreground mb-6 leading-relaxed">
                For your security, please sign in again to continue using the latest version of the app.
              </p>
              
              <button 
                onClick={handleRedeploymentLogin}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                Sign In Again
              </button>
              
              <p className="text-xs text-center text-muted-foreground/70 mt-4">
                Your data is safe and will be restored after signing in
              </p>
            </div>
          </div>
        )}
      </div>
    </QueryClientProvider>
  );
}
