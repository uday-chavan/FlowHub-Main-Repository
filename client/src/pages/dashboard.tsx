import { Header } from "@/components/dashboard/Header";

import { WorkflowRiver } from "@/components/dashboard/WorkflowRiver";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";

import { GmailConnect } from "@/components/dashboard/GmailConnect";
import { WindowsNotificationManager } from "@/components/WindowsNotificationManager";
import { CalendarSync } from "@/components/dashboard/CalendarSync"; // Import CalendarSync component
import { AppUpdateModal } from "@/components/AppUpdateModal";


import { useNotifications } from "@/hooks/useNotifications";

// TaskList functionality is handled by WorkflowRiver component

import { useIsMobile } from "@/hooks/use-mobile"; // Added useIsMobile hook
import { useAuth } from "@/hooks/useAuth"; // Added useAuth import
import { useState, useEffect } from "react"; // Import useState for isGmailConnected
import { useLocation } from "wouter";

export default function Dashboard() {
  
  const isMobile = useIsMobile();
  const { user } = useAuth(); // Get actual authenticated user
  const [isGmailConnected, setIsGmailConnected] = useState(false); // State to track Gmail connection
  const [showAppUpdateModal, setShowAppUpdateModal] = useState(false);
  const [, setLocation] = useLocation();
  // const { data: notifications } = useNotifications();
  // const activeNotifications = notifications?.filter(n => !n.isRead) || [];

  // Check for app update scenario
  useEffect(() => {
    const checkAppUpdate = () => {
      if (!user) return;

      // Get stored app version/timestamp
      const storedAppVersion = localStorage.getItem('appVersion');
      const currentAppVersion = Date.now().toString();
      
      // Check if this is a returning user without stored version (indicates fresh deployment)
      const hasUserData = localStorage.getItem('currentUserId') || localStorage.getItem('user_auth');
      
      if (hasUserData && !storedAppVersion) {
        // This is likely after a deployment - show update modal
        setShowAppUpdateModal(true);
        return;
      }
      
      // Store current app version for future checks
      localStorage.setItem('appVersion', currentAppVersion);
    };

    checkAppUpdate();
  }, [user]);

  const handleSignInClick = () => {
    setShowAppUpdateModal(false);
    // Store current app version to prevent showing again
    localStorage.setItem('appVersion', Date.now().toString());
    // Keep user signed in, just refresh the page to clear any stale state
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background text-foreground dashboard-container flex flex-col">
      <Header />
      <AppUpdateModal 
        isOpen={showAppUpdateModal} 
        onSignInClick={handleSignInClick}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-none mx-0 px-4 pt-4 pb-8 h-full">
        {isMobile ? (
          /* Mobile Layout */
          <div className="flex flex-col gap-6 h-full overflow-y-auto">
            {/* Mobile Notifications */}
            <NotificationFeed />

            {/* Gmail and Calendar Integration */}
            <div className="space-y-4">
              <GmailConnect onConnectionChange={setIsGmailConnected} />
              <CalendarSync isGmailConnected={isGmailConnected} />
            </div>

            {/* Main Content - Tasks */}
            <WorkflowRiver />

            {/* Additional Mobile Content - Removed sidebar components */}
          </div>
        ) : (
          /* Desktop Layout */
          <div className="flex gap-6 h-[calc(100vh-120px)]">
            {/* Left Column - Notifications with Fixed Width */}
            <div className="w-80 flex-shrink-0 px-2 h-full">
              <NotificationFeed />
            </div>

            {/* Main Column - Tasks with Full Remaining Width */}
            <div className="flex-1 px-2 h-full">
              <WorkflowRiver />
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Windows Notification Manager */}
      {user && <WindowsNotificationManager userId={user.id} />}


    </div>
  );
}
