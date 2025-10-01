import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { TextLoop } from "@/components/TextLoop";
import { ArrowRight, InfoIcon, Mail, CheckCircle2, Calendar, Bell, Sparkles, ShieldCheck, Clock, Zap, ChevronRight, ChevronDown } from "lucide-react";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { motion, useInView } from "framer-motion";

export function Landing() {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const workflowRef = useRef(null);
  const finalMessageRef = useRef(null);
  const encryptionRef = useRef(null);
  const isWorkflowInView = useInView(workflowRef, { once: true, threshold: 0.1 });
  const isFinalMessageInView = useInView(finalMessageRef, { once: true, threshold: 0.3 });
  const isEncryptionInView = useInView(encryptionRef, { once: true, threshold: 0.3 });

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-y-auto">
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

      {/* Hero Section - Full Screen */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center pt-16">
        <div className={`transition-all duration-1000 transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
        }`}>

          {/* Optional subtle wordmark */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-3xl font-light text-white/60 tracking-[0.3em] uppercase mb-4">
              FlowHub
            </h1>
            <div className="w-20 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mx-auto" />
          </div>

          {/* Hero Animated Benefits */}
          <div className="mb-20">
            <TextLoop
              messages={benefits}
              duration={2800}
              className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extralight text-white leading-tight tracking-tight flex items-center justify-center"
            />
          </div>

          {/* Primary CTA */}
          <button
            onClick={handleSignInWithGoogle}
            className="bg-white/95 hover:bg-white text-slate-900 hover:text-slate-950 px-10 py-5 text-lg font-medium rounded-full transition-all duration-500 group hover:scale-105 hover:shadow-2xl hover:shadow-white/20 border-0 backdrop-blur-sm flex items-center justify-center gap-3 mx-auto mb-24"
            data-testid="button-sign-in-google"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="relative z-10">Sign in with Google</span>
            <ArrowRight className="ml-1 w-6 h-6 transition-transform group-hover:translate-x-1" />
          </button>

          {/* How It Works Title */}
          <h2 className="text-2xl md:text-3xl font-light text-white/90 tracking-wide mb-8" data-testid="text-workflow-title">
            How It Works?
          </h2>

          {/* Down Arrow */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
            className="flex justify-center"
          >
            <ChevronDown className="w-8 h-8 text-white/60" />
          </motion.div>
        </div>
      </div>

      {/* Problem Statement Section */}
      <div className="relative z-10 py-8 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-2xl md:text-3xl font-light text-white/90 tracking-wide mb-4">
            Drowning in Emails & Tasks?
          </h3>
          <p className="text-lg md:text-xl text-white/70 font-light tracking-wide">
            Feeling overwhelmed by your inbox and growing task list?
          </p>
        </div>
      </div>

      {/* Workflow Cards Section - Closer to hero */}
      <div className="relative z-10 py-6 px-6">
        <div
          ref={workflowRef}
          className="max-w-7xl mx-auto px-8 md:px-12 pt-2 md:pt-4 pb-8"
          data-testid="workflow-section"
        >
          {/* Horizontal Cards with Arrows */}
          <div className="w-full overflow-x-auto px-4">
            <div className="flex items-center justify-start gap-3 pb-6 min-w-max">
              {/* Step 1 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isWorkflowInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.1, duration: 0.6 }}
                className="flex-shrink-0 w-36 h-40 bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
                data-testid="workflow-step-1"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-xs font-medium text-white mb-1">Sign Up & Connect</h3>
                <p className="text-[10px] text-white/60 leading-tight">Quick signup with Gmail and Google Calendar access — all permissions in one click.</p>
              </motion.div>

              {/* Arrow 1 */}
              <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />

              {/* Step 2 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isWorkflowInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="flex-shrink-0 w-36 h-40 bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
                data-testid="workflow-step-2"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-2">
                  <Mail className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-xs font-medium text-white mb-1">Instant Email Sync</h3>
                <p className="text-[10px] text-white/60 leading-tight">Live Gmail fetching starts immediately — watch your inbox sync in real-time.</p>
              </motion.div>

              {/* Arrow 2 */}
              <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />

              {/* Step 3 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isWorkflowInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="flex-shrink-0 w-36 h-40 bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
                data-testid="workflow-step-3"
              >
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <Sparkles className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="text-xs font-medium text-white mb-1">AI-Powered Emails to tasks Conversion</h3>
                <p className="text-[10px] text-white/60 leading-tight">Convert emails into prioritized tasks with one click — AI analyzes and categorizes with a live countdown.</p>
              </motion.div>

              {/* Arrow 3 */}
              <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />

              {/* Step 4 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isWorkflowInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="flex-shrink-0 w-36 h-40 bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
                data-testid="workflow-step-4"
              >
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center mb-2">
                  <Clock className="w-5 h-5 text-yellow-400" />
                </div>
                <h3 className="text-xs font-medium text-white mb-1">Smart Auto-Rescheduling</h3>
                <p className="text-[10px] text-white/60 leading-tight">Tasks automatically reschedule when you add or complete work — always optimized for your deadlines.</p>
              </motion.div>

              {/* Arrow 4 */}
              <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />

              {/* Step 5 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isWorkflowInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="flex-shrink-0 w-36 h-40 bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
                data-testid="workflow-step-5"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-2">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="text-xs font-medium text-white mb-1">Calendar Integration</h3>
                <p className="text-[10px] text-white/60 leading-tight">Deadline tasks automatically added to Google Calendar — seamless sync across devices.</p>
              </motion.div>

              {/* Arrow 5 */}
              <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />

              {/* Step 6 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isWorkflowInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="flex-shrink-0 w-36 h-40 bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-300 flex flex-col items-center justify-center text-center"
                data-testid="workflow-step-6"
              >
                <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center mb-2">
                  <Bell className="w-5 h-5 text-pink-400" />
                </div>
                <h3 className="text-xs font-medium text-white mb-1">Never Miss a Deadline</h3>
                <p className="text-[10px] text-white/60 leading-tight">Get timely alerts on your phone before deadlines — stay ahead, never behind.</p>
              </motion.div>
            </div>
          </div>

          {/* Final Message */}
          <motion.div
            ref={finalMessageRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isFinalMessageInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.6 }}
            className="text-center mt-6 p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-400/20 max-w-xl mx-auto"
            data-testid="workflow-final-message"
          >
            <h3 className="text-xl font-semibold text-white mb-3">You'll Never Drown in Deadlines Again!</h3>
            <p className="text-white/70 text-base">Stay organized, focused, and in complete control.</p>
          </motion.div>

          {/* Encryption Badge */}
          <motion.div
            ref={encryptionRef}
            initial={{ opacity: 0, y: 20 }}
            animate={isEncryptionInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="mt-8 flex items-center justify-center gap-3 text-white/80"
            data-testid="encryption-badge"
          >
            <ShieldCheck className="w-5 h-5 text-green-400" />
            <span className="text-lg font-medium tracking-wide">Your Data is End-to-End Encrypted</span>
          </motion.div>
        </div>
      </div>

      {/* Footer with Policy Links */}
      <footer className="relative z-10 py-8 px-6 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-white/60 text-sm">
            <span>© 2025 FlowHub. All rights reserved.</span>
            <div className="flex items-center gap-6">
              <a 
                href="/privacy-policy.html" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Privacy Policy
              </a>
              <a 
                href="/terms-of-service.html" 
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
