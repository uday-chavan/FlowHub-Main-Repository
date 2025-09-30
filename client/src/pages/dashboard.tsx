import { Header } from "@/components/dashboard/Header";
import { WorkflowRiver } from "@/components/dashboard/WorkflowRiver";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";
import { AppUpdateModal } from "@/components/AppUpdateModal";


import { useNotifications } from "@/hooks/useNotifications";

// TaskList functionality is handled by WorkflowRiver component

import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

function Dashboard() {

  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [showAppUpdateModal, setShowAppUpdateModal] = useState(false);
  const [, setLocation] = useLocation();
  // const { data: notifications } = useNotifications();
  // const activeNotifications = notifications?.filter(n => !n.isRead) || [];

  // Check for app update scenario
  useEffect(() => {
    const checkAppUpdate = () => {
      if (!user) return;

      // Use a static build timestamp to detect deployments
      const BUILD_TIMESTAMP = '1759099640'; // This will change with each deployment
      const storedBuildVersion = localStorage.getItem('buildVersion');

      // Check if this is a new deployment
      if (storedBuildVersion && storedBuildVersion !== BUILD_TIMESTAMP) {
        // App was updated/redeployed - show modal
        console.log('App update detected:', storedBuildVersion, '->', BUILD_TIMESTAMP);
        setShowAppUpdateModal(true);
        return;
      }

      // Store current build version
      localStorage.setItem('buildVersion', BUILD_TIMESTAMP);
    };

    checkAppUpdate();
  }, [user]);

  const handleSignInClick = () => {
    setShowAppUpdateModal(false);
    // Store current build version to prevent showing again
    const BUILD_TIMESTAMP = '1759099640';
    localStorage.setItem('buildVersion', BUILD_TIMESTAMP);
    // Clear user session and redirect to login
    localStorage.clear();
    sessionStorage.clear();
    // Re-set the build version after clearing
    localStorage.setItem('buildVersion', BUILD_TIMESTAMP);
    setLocation('/');
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
          <div className="flex flex-col gap-4 h-full overflow-y-auto px-2">
            {/* Mobile Notifications */}
            <div className="w-full">
              <NotificationFeed />
            </div>

            {/* Main Content - Tasks */}
            <div className="w-full">
              <WorkflowRiver />
            </div>
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
    </div>
  );
}

export default Dashboard;
