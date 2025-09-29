import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { TextLoop } from "@/components/TextLoop";
import { ArrowRight, InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from '@/components/ui/alert';

export function Landing() {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);

  const benefits = [
    "Turn emails into next steps",
    "Auto-prioritize your day", 
    "Schedule itself, not you",
    "Exec-ready status in seconds",
    "Deadlines handled, not chased",
    "Focus on what moves the needle"
  ];

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Check for update notification flag on mount
  useEffect(() => {
    const shouldShowNotification = localStorage.getItem('showUpdateNotification');
    if (shouldShowNotification === 'true') {
      setShowUpdateNotification(true);
      // Remove the flag immediately to prevent showing it again
      localStorage.removeItem('showUpdateNotification');
      
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowUpdateNotification(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSignInWithGoogle = async () => {
    try {
      // Trigger Google OAuth flow
      const response = await fetch('/api/gmail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'demo-user' })
      });

      const data = await response.json();

      if (data.authUrl) {
        // Open OAuth popup
        const popup = window.open(data.authUrl, 'google-auth', 
          'width=500,height=600,scrollbars=yes,resizable=yes');

        // Listen for auth completion
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
          }
        }, 1000);

        // Listen for OAuth callback message
        window.addEventListener('message', (event) => {
          if (event.origin !== window.location.origin) return;

          if (event.data.success) {
            const newUserEmail = event.data.email;
            const newUserId = event.data.userId;
            const previousUserEmail = localStorage.getItem('currentUserEmail');
            
            // Always clear everything for clean slate
            localStorage.clear();
            sessionStorage.clear();

            // Set new user state if provided
            if (newUserEmail && newUserId) {
              localStorage.setItem('currentUserEmail', newUserEmail);
              localStorage.setItem('currentUserId', newUserId);
              localStorage.setItem('gmailConnected', 'true');
              localStorage.setItem('userEmail', newUserEmail);
            }

            popup?.close();

            // Force complete page refresh to ensure clean state
            setTimeout(() => {
              window.location.href = '/dashboard';
            }, 100);
          }
        }, { once: true });
      }
    } catch (error) {
      // Authentication error
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-hidden">
      {/* Update notification popup */}
      {showUpdateNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 animate-in slide-in-from-top-2 duration-300" data-testid="update-notification">
            <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              The app was updated, please log in again
            </AlertDescription>
          </Alert>
        </div>
      )}
      
      {/* Subtle Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Soft gradient orbs */}
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-gradient-to-br from-blue-500/8 to-cyan-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '2s' }} />

        {/* Premium noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }} />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center max-w-4xl mx-auto">
        <div className={`transition-all duration-1000 transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
        }`}>

          {/* Optional subtle wordmark */}
          <div className="mb-4">
            <h1 className="text-2xl font-light text-white/60 tracking-[0.2em] uppercase mb-2">
              FlowHub
            </h1>
            <div className="w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mx-auto" />
          </div>

          {/* Hero Animated Benefits */}
          <div className="mb-8">
            <TextLoop 
              messages={benefits}
              duration={2800}
              className="text-5xl md:text-6xl lg:text-7xl font-extralight text-white leading-tight tracking-tight flex items-center justify-center"
            />
          </div>



          {/* Primary CTA */}
          <button
            onClick={handleSignInWithGoogle}
            className="bg-white/95 hover:bg-white text-slate-900 hover:text-slate-950 px-10 py-4 text-lg font-medium rounded-full transition-all duration-500 group hover:scale-105 hover:shadow-2xl hover:shadow-white/20 border-0 backdrop-blur-sm flex items-center justify-center gap-3 mx-auto"
            data-testid="button-sign-in-google"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="relative z-10">Sign in with Google</span>
            <ArrowRight className="ml-3 w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>

          {/* Glass reflection effect */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-96 bg-gradient-to-b from-white/[0.02] to-transparent rounded-full blur-3xl pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
