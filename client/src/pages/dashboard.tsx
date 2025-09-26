import { Header } from "@/components/dashboard/Header";

import { WorkflowRiver } from "@/components/dashboard/WorkflowRiver";
import { NotificationFeed } from "@/components/dashboard/NotificationFeed";

import { GmailConnect } from "@/components/dashboard/GmailConnect";
import { WindowsNotificationManager } from "@/components/WindowsNotificationManager";
import { CalendarSync } from "@/components/CalendarSync"; // Import CalendarSync component

// Assuming RealTimeMetrics, WellnessPanel, AIInsights, UserProfile, and useNotifications are imported elsewhere
// and are available in this scope. For the purpose of this edit, we'll assume their existence.
// import { RealTimeMetrics } from "@/components/dashboard/RealTimeMetrics";
// import { WellnessPanel } from "@/components/dashboard/WellnessPanel";
// import { AIInsights } from "@/components/dashboard/AIInsights";
// import { UserProfile } from "@/components/dashboard/UserProfile";
// import { useNotifications } from "@/hooks/useNotifications";

// TaskList functionality is handled by WorkflowRiver component
import { useMetrics } from "@/hooks/useMetrics"; // Added useMetrics import
import { useIsMobile } from "@/hooks/use-mobile"; // Added useIsMobile hook
import { useAuth } from "@/hooks/useAuth"; // Added useAuth import
import { useState } from "react"; // Import useState for isGmailConnected

export default function Dashboard() {
  const { data: metrics } = useMetrics();
  const isMobile = useIsMobile();
  const { user } = useAuth(); // Get actual authenticated user
  const [isGmailConnected, setIsGmailConnected] = useState(false); // State to track Gmail connection
  // const { data: notifications } = useNotifications();
  // const activeNotifications = notifications?.filter(n => !n.isRead) || [];

  return (
    <div className="min-h-screen bg-background text-foreground dashboard-container flex flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-none mx-0 px-4 pt-4 pb-8 h-full">
        {isMobile ? (
          /* Mobile Layout */
          <div className="flex flex-col gap-6 h-full overflow-y-auto">
            {/* Mobile Notifications */}
            <NotificationFeed />

            {/* Main Content - Tasks */}
            <WorkflowRiver />

            {/* Secondary Content - No Windows notification manager needed in mobile */}

          </div>
        ) : (
          /* Desktop Layout */
          <div className="flex gap-6 h-[calc(100vh-120px)]">
            {/* Left Column - Notifications with Fixed Width */}
            <div className="w-80 flex-shrink-0 px-2 h-full">
              <NotificationFeed />
            </div>

            {/* Main Column - Tasks with Extended Width */}
            <div className="flex-[3] px-2 h-full">
              {/* Placeholder for potential future dashboard widgets */}
              <div className="space-y-4">
                <GmailConnect onConnectionChange={setIsGmailConnected} />
                <CalendarSync isGmailConnected={isGmailConnected} />
                <UserProfile />
              </div>
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
