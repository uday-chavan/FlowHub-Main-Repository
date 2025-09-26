import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface WindowsNotificationManagerProps {
  userId: string;
}

export function WindowsNotificationManager({ userId }: WindowsNotificationManagerProps) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showPermissionUI, setShowPermissionUI] = useState(false);
  const processedNotifications = useRef(new Set<string>());

  // Check notification support and permission on mount
  useEffect(() => {
    if (!('Notification' in window)) {
      console.log('[WindowsNotificationManager] Notification API not supported');
      return;
    }

    const permission = Notification.permission;
    console.log('[WindowsNotificationManager] Current permission:', permission);

    if (permission === 'granted') {
      setPermissionGranted(true);
      setShowPermissionUI(false);

      // Create immediate test notification
      setTimeout(() => {
        console.log('[WindowsNotificationManager] Creating welcome notification');
        const welcomeNotification = new Notification('🔔 FlowHub Notifications Active!', {
          body: 'Windows notifications are working. You should see this in your notification center.',
          icon: '/favicon.ico',
          tag: 'flowhub-welcome',
          requireInteraction: true,
          silent: false
        });

        welcomeNotification.onclick = () => {
          console.log('[WindowsNotificationManager] Welcome notification clicked');
          window.focus();
          welcomeNotification.close();
        };

        setTimeout(() => welcomeNotification.close(), 8000);
      }, 1000);

    } else if (permission === 'denied') {
      setPermissionDenied(true);
      setShowPermissionUI(true);
    } else {
      // Default state - show permission request UI
      setShowPermissionUI(true);
    }
  }, []);

  // Poll for notifications with Windows notification flag
  const { data: notifications } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const response = await fetch(`/api/notifications?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      return response.json();
    },
    refetchInterval: 2000,
    enabled: true
  });

  // Process Windows notifications
  useEffect(() => {
    console.log('[WindowsNotificationManager] Processing effect triggered');
    console.log('[WindowsNotificationManager] permissionGranted:', permissionGranted);
    console.log('[WindowsNotificationManager] notifications:', notifications?.length || 0);
    console.log('[WindowsNotificationManager] Notification API available:', 'Notification' in window);
    
    if (!permissionGranted || !notifications || !('Notification' in window)) {
      console.log('[WindowsNotificationManager] Exiting early - missing requirements');
      return;
    }

    console.log('[WindowsNotificationManager] Processing notifications:', notifications.length);
    
    // Debug: Log all notifications
    notifications.forEach((notification: any, index: number) => {
      console.log(`[WindowsNotificationManager] Notification ${index}:`, {
        id: notification.id,
        title: notification.title,
        type: notification.type,
        metadata: notification.metadata,
        isDismissed: notification.isDismissed,
        browserNotification: notification.metadata?.browserNotification
      });
    });

    // Filter for Windows notifications that haven't been processed
    const windowsNotifications = notifications.filter((notification: any) => {
      const isWindowsNotification = notification.metadata?.browserNotification === true;
      const notProcessed = !processedNotifications.current.has(notification.id);
      const notDismissed = !notification.isDismissed;

      console.log(`[WindowsNotificationManager] Filtering notification ${notification.id}:`, {
        isWindowsNotification,
        notProcessed,
        notDismissed,
        willProcess: isWindowsNotification && notProcessed && notDismissed
      });

      return isWindowsNotification && notProcessed && notDismissed;
    });

    console.log('[WindowsNotificationManager] Found', windowsNotifications.length, 'unprocessed Windows notifications');

    for (const notification of windowsNotifications) {
      // Mark as processed immediately
      processedNotifications.current.add(notification.id);

      try {
        console.log(`[WindowsNotificationManager] Creating Windows notification: ${notification.title}`);

        // Create Windows notification
        const windowsNotification = new Notification(notification.title, {
          body: notification.description || notification.aiSummary || 'FlowHub notification',
          icon: '/favicon.ico',
          tag: `flowhub-${notification.id}`,
          requireInteraction: false,
          silent: false
        });

        // Handle notification events
        windowsNotification.onshow = () => {
          console.log(`[WindowsNotificationManager] Notification shown: ${notification.title}`);
        };

        windowsNotification.onclick = () => {
          console.log(`[WindowsNotificationManager] Notification clicked: ${notification.title}`);
          window.focus();
          windowsNotification.close();
        };

        windowsNotification.onerror = (error) => {
          console.error(`[WindowsNotificationManager] Notification error:`, error);
        };

        // Auto-close after 8 seconds
        setTimeout(() => {
          windowsNotification.close();
        }, 8000);

        // Dismiss the notification in the database after showing
        setTimeout(async () => {
          try {
            await fetch(`/api/notifications/${notification.id}/dismiss`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' }
            });
            console.log(`[WindowsNotificationManager] Dismissed notification: ${notification.id}`);
          } catch (error) {
            console.error(`Failed to dismiss notification ${notification.id}:`, error);
          }
        }, 1000);

      } catch (error) {
        console.error(`[WindowsNotificationManager] Failed to create notification:`, error);
      }
    }
  }, [notifications, permissionGranted]);

  // Clean up processed notifications periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      if (processedNotifications.current.size > 100) {
        const processed = Array.from(processedNotifications.current);
        processedNotifications.current = new Set(processed.slice(-50));
      }
    }, 300000);

    return () => clearInterval(cleanup);
  }, []);

  // Request permission handler
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    try {
      console.log('[WindowsNotificationManager] Requesting notification permission');
      const permission = await Notification.requestPermission();
      console.log('[WindowsNotificationManager] Permission result:', permission);

      if (permission === 'granted') {
        setPermissionGranted(true);
        setPermissionDenied(false);
        setShowPermissionUI(false);

        // Create immediate test notification
        setTimeout(() => {
          const testNotification = new Notification('✅ FlowHub Notifications Enabled!', {
            body: 'Perfect! You will now receive Windows notifications for task deadlines and important updates.',
            icon: '/favicon.ico',
            tag: 'flowhub-enabled',
            requireInteraction: true,
            silent: false
          });

          testNotification.onclick = () => {
            window.focus();
            testNotification.close();
          };

          setTimeout(() => testNotification.close(), 8000);
        }, 500);

      } else if (permission === 'denied') {
        setPermissionDenied(true);
        setPermissionGranted(false);
      }
    } catch (error) {
      console.error('[WindowsNotificationManager] Permission request error:', error);
      alert('Error requesting notification permission. Please try again.');
    }
  };

  // Show permission UI only if needed
  if (!('Notification' in window)) {
    return null; // Browser doesn't support notifications
  }

  if (!showPermissionUI) {
    return null; // Permission already granted or component not needed
  }

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
      <h4 className="font-semibold mb-2">Enable Windows Notifications</h4>
      <p className="text-sm mb-3">
        Get native Windows notifications for task deadlines and important updates.
      </p>
      <div className="space-y-2">
        <button
          onClick={requestPermission}
          className="w-full bg-white text-blue-600 px-3 py-2 rounded text-sm font-medium hover:bg-gray-100"
        >
          Enable Notifications
        </button>
        {permissionDenied && (
          <div className="text-xs text-blue-200 bg-blue-700/20 p-2 rounded">
            <strong>Notifications Blocked:</strong> Please click the lock icon (🔒) in your browser's address bar and allow notifications, then refresh the page.
          </div>
        )}
        <button
          onClick={() => setShowPermissionUI(false)}
          className="w-full text-blue-200 text-xs hover:text-white"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
