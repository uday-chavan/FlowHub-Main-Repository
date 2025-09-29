import { Header } from "@/components/dashboard/Header";

import { WorkflowRiver } from "@/components/dashboard/WorkflowRiver";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";

import { GmailConnect } from "@/components/dashboard/GmailConnect";
import { WindowsNotificationManager } from "@/components/WindowsNotificationManager";
import { CalendarSync } from "@/components/dashboard/CalendarSync";
import { AppUpdateModal } from "@/components/AppUpdateModal";

import { Page, Section, ResponsiveGrid } from "@/components/layout";
import { useNotifications } from "@/hooks/useNotifications";

import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [showAppUpdateModal, setShowAppUpdateModal] = useState(false);
  const [, setLocation] = useLocation();

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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <AppUpdateModal 
        isOpen={showAppUpdateModal} 
        onSignInClick={handleSignInClick}
      />

      <main className="flex-1 overflow-y-auto">
        <Page className="py-4">
          <ResponsiveGrid 
            cols={{ base: 1, lg: 3 }}
            gap="lg"
            className="min-h-[calc(100vh-8rem)]"
          >
            {/* Notifications Column - Full width on mobile, 1/3 on desktop */}
            <div className="lg:col-span-1 order-1 lg:order-1">
              <div className="sticky top-4">
                <NotificationFeed />
              </div>
            </div>

            {/* Main Tasks Column - Full width on mobile, 2/3 on desktop */}
            <div className="lg:col-span-2 order-3 lg:order-2">
              <WorkflowRiver />
            </div>

            {/* Integration Tools - Desktop only */}
            <div className="hidden lg:block lg:col-span-3 order-2 lg:order-3 space-y-4">
              <ResponsiveGrid cols={{ base: 1, sm: 2 }} gap="md">
                <GmailConnect onConnectionChange={setIsGmailConnected} />
                <CalendarSync isGmailConnected={isGmailConnected} />
              </ResponsiveGrid>
            </div>
          </ResponsiveGrid>
        </Page>
      </main>

      {/* Windows Notification Manager */}
      {user && <WindowsNotificationManager userId={user.id} />}
    </div>
  );
}
