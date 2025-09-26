
import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface WindowsNotificationManagerProps {
  userId: string;
}

export function WindowsNotificationManager({ userId }: WindowsNotificationManagerProps) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const processedNotifications = useRef(new Set<string>());
  const tabId = useRef(`tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Check for existing notification permission on desktop devices
  useEffect(() => {
    // Simplified mobile detection - only exclude actual mobile devices
    const isMobile = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad/i.test(navigator.userAgent);
    
    // Allow notifications on Windows/Mac desktop (including touch-enabled desktops)
    const isDesktop = !isMobile && !isTablet;
    
    if ('Notification' in window && isDesktop) {
      if (Notification.permission === 'granted') {
        setPermissionGranted(true);
      }
      // DO NOT automatically request permission - modern browsers block this
      // Permission will be requested only when user clicks the enable button
    }
  }, []);

  // Poll for Windows notifications
  const { data: notifications } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const response = await fetch(`/api/notifications?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      return response.json();
    },
    refetchInterval: 5000, // Poll every 5 seconds
    enabled: permissionGranted
  });

  useEffect(() => {
    if (!permissionGranted || !notifications || !('Notification' in window)) return;

    const processWindowsNotifications = async () => {
      // Filter for Windows notifications that haven't been processed
      const windowsNotifications = notifications.filter((notification: any) => 
        notification.type === 'browser_notification' && 
        notification.metadata?.browserNotification &&
        !processedNotifications.current.has(notification.id)
      );

      for (const notification of windowsNotifications) {
        // Cross-tab coordination using localStorage to prevent duplicates
        const lockKey = `notification-lock-${notification.id}`;
        const existingLock = localStorage.getItem(lockKey);

        // If another tab already claimed this notification, skip it
        if (existingLock && existingLock !== tabId.current) {
          processedNotifications.current.add(notification.id);
          continue;
        }

        // Claim the notification for this tab
        localStorage.setItem(lockKey, tabId.current);

        // Double-check that we won the race
        if (localStorage.getItem(lockKey) !== tabId.current) {
          processedNotifications.current.add(notification.id);
          continue;
        }

        // Mark as processed to avoid duplicate notifications
        processedNotifications.current.add(notification.id);

        try {
          // Show Windows notification directly
          const windowsNotification = new Notification(notification.title, {
            body: notification.description,
            icon: '/favicon.ico',
            tag: `task-reminder-${notification.metadata.taskId}`,
            requireInteraction: true,
            silent: false,
            renotify: true
          });

          // Handle notification click
          windowsNotification.onclick = () => {
            window.focus();
            windowsNotification.close();
          };

          // Auto-close after 10 seconds
          setTimeout(() => {
            windowsNotification.close();
          }, 10000);

          console.log(`[WindowsNotification] Windows notification shown for task: ${notification.metadata.taskId} from tab: ${tabId.current}`);

        } catch (error) {
          console.error('Windows notification failed:', error);
        }

        // Immediately mark this notification as dismissed so it doesn't show again
        try {
          const dismissResponse = await fetch(`/api/notifications/${notification.id}/dismiss`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
          });

          if (!dismissResponse.ok) {
            throw new Error(`HTTP ${dismissResponse.status}`);
          }

          console.log(`[WindowsNotification] Dismissed notification: ${notification.id}`);
        } catch (error) {
          console.error(`Failed to dismiss notification ${notification.id}:`, error);
          // Keep the lock longer if dismiss fails to prevent duplicates
          setTimeout(() => {
            localStorage.removeItem(lockKey);
          }, 15000);
          continue; // Skip the normal cleanup
        }

        // Clean up the lock after a delay
        setTimeout(() => {
          localStorage.removeItem(lockKey);
        }, 5000);
      }
    };

    processWindowsNotifications();
  }, [notifications, permissionGranted]);

  // Clean up old processed notifications to prevent memory leaks
  useEffect(() => {
    const cleanup = setInterval(() => {
      // Keep only the last 100 processed notification IDs
      if (processedNotifications.current.size > 100) {
        const processed = Array.from(processedNotifications.current);
        processedNotifications.current = new Set(processed.slice(-50));
      }
    }, 300000); // Every 5 minutes

    return () => clearInterval(cleanup);
  }, []);

  // Simplified mobile/desktop detection for UI display
  const isMobile = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTablet = /iPad/i.test(navigator.userAgent);
  const isDesktop = !isMobile && !isTablet;
  
  // Show permission request UI only on desktop devices
  if ('Notification' in window && Notification.permission !== 'granted' && isDesktop) {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
        <h4 className="font-semibold mb-2">Enable Windows Notifications</h4>
        <p className="text-sm mb-3">
          Get native Windows notifications for task deadlines that appear in your Windows notification center.
        </p>
        <div className="space-y-2">
          <button
            onClick={async () => {
              setPermissionRequested(true);
              const permission = await Notification.requestPermission();
              setPermissionGranted(permission === 'granted');

              // Test notification immediately if granted
              if (permission === 'granted') {
                new Notification('FlowHub Windows Notifications Enabled! 🎉', {
                  body: 'You will now receive Windows notifications for your task deadlines in the Windows notification center.',
                  icon: '/favicon.ico',
                  requireInteraction: true,
                  tag: 'flowhub-test'
                });
              }
            }}
            className="w-full bg-white text-blue-600 px-3 py-2 rounded text-sm font-medium hover:bg-gray-100"
          >
            Enable Windows Notifications
          </button>
          {Notification.permission === 'denied' && (
            <p className="text-xs text-blue-200">
              Notifications are blocked. Please enable them in your browser settings for Windows notifications to work.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Component doesn't render anything in normal operation
  return null;
}

// Export with the old name for compatibility
export { WindowsNotificationManager as BrowserNotificationManager };
