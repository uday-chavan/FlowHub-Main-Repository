import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface WindowsNotificationManagerProps {
  userId: string;
}

export function WindowsNotificationManager({ userId }: WindowsNotificationManagerProps) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const processedNotifications = useRef(new Set<string>());

  // Request Windows notification permission immediately
  useEffect(() => {
    const setupNotifications = async () => {
      if ('Notification' in window) {
        console.log('[WindowsNotificationManager] Setting up notifications...');
        console.log('[WindowsNotificationManager] Current permission:', Notification.permission);

        if (Notification.permission === 'granted') {
          setPermissionGranted(true);
          console.log('[WindowsNotificationManager] Permission already granted');

          // Show immediate login notification
          const loginNotification = new Notification('🔔 FlowHub Windows Notifications Ready!', {
            body: 'You will now receive Windows notifications for task deadlines. This notification appears in your Windows notification center.',
            icon: '/favicon.ico',
            tag: 'flowhub-ready',
            requireInteraction: true,
            silent: false
          });

          loginNotification.onclick = () => {
            console.log('[WindowsNotificationManager] Login notification clicked');
            window.focus();
            loginNotification.close();
          };

          // Auto-close after 10 seconds
          setTimeout(() => loginNotification.close(), 10000);

        } else if (Notification.permission === 'default') {
          // Automatically request permission
          try {
            const permission = await Notification.requestPermission();
            console.log('[WindowsNotificationManager] Permission result:', permission);

            if (permission === 'granted') {
              setPermissionGranted(true);

              // Show immediate test notification
              const testNotification = new Notification('✅ Windows Notifications Enabled!', {
                body: 'FlowHub notifications are now enabled! You will receive task deadline reminders in your Windows notification center.',
                icon: '/favicon.ico',
                tag: 'flowhub-enabled',
                requireInteraction: true,
                silent: false
              });

              testNotification.onclick = () => {
                console.log('[WindowsNotificationManager] Test notification clicked');
                window.focus();
                testNotification.close();
              };

              setTimeout(() => testNotification.close(), 10000);
            }
          } catch (error) {
            console.error('[WindowsNotificationManager] Permission request error:', error);
          }
        }
      }
    };

    setupNotifications();
  }, []);

  // Poll for notifications using the hardcoded user ID
  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'user-Y2hhdmFudWRheTU4'],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/notifications?userId=user-Y2hhdmFudWRheTU4`);
        if (!response.ok) {
          console.error('[WindowsNotificationManager] Failed to fetch notifications:', response.status);
          return [];
        }
        const data = await response.json();
        console.log('[WindowsNotificationManager] Fetched notifications:', data.length);
        return data;
      } catch (error) {
        console.error('[WindowsNotificationManager] Fetch error:', error);
        return [];
      }
    },
    refetchInterval: 1000, // Poll every 1 second
    enabled: permissionGranted && 'Notification' in window
  });

  // Process notifications
  useEffect(() => {
    if (!permissionGranted || !notifications || !('Notification' in window)) return;

    console.log('[WindowsNotificationManager] Processing notifications:', notifications.length);

    const windowsNotifications = notifications.filter((notification: any) => {
      const isWindowsNotification = notification.type === 'browser_notification' && 
                                   notification.metadata?.browserNotification;
      const notProcessed = !processedNotifications.current.has(notification.id);

      if (isWindowsNotification && notProcessed) {
        console.log(`[WindowsNotificationManager] Found unprocessed notification: ${notification.title}`);
      }

      return isWindowsNotification && notProcessed;
    });

    console.log('[WindowsNotificationManager] Found', windowsNotifications.length, 'unprocessed Windows notifications');

    for (const notification of windowsNotifications) {
      processedNotifications.current.add(notification.id);

      try {
        console.log(`[WindowsNotificationManager] Creating Windows notification: ${notification.title}`);

        const windowsNotification = new Notification(notification.title, {
          body: notification.description || 'Task reminder',
          icon: '/favicon.ico',
          tag: `task-${notification.metadata?.taskId || notification.id}`,
          requireInteraction: true,
          silent: false
        });

        windowsNotification.onshow = () => {
          console.log(`[WindowsNotificationManager] Windows notification shown: ${notification.title}`);
        };

        windowsNotification.onclick = () => {
          console.log(`[WindowsNotificationManager] Windows notification clicked: ${notification.title}`);
          window.focus();
          windowsNotification.close();
        };

        windowsNotification.onerror = (error) => {
          console.error(`[WindowsNotificationManager] Windows notification error:`, error);
        };

        setTimeout(() => windowsNotification.close(), 10000);

        // Dismiss the notification
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

  // Show permission request UI if needed
  if ('Notification' in window && Notification.permission === 'default') {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
        <h4 className="font-semibold mb-2">Enable Windows Notifications</h4>
        <p className="text-sm mb-3">
          Get native Windows notifications for task deadlines.
        </p>
        <button
          onClick={async () => {
            try {
              const permission = await Notification.requestPermission();
              if (permission === 'granted') {
                setPermissionGranted(true);

                const testNotification = new Notification('✅ Notifications Enabled!', {
                  body: 'Windows notifications are now active for FlowHub.',
                  icon: '/favicon.ico',
                  requireInteraction: true
                });

                setTimeout(() => testNotification.close(), 8000);
              }
            } catch (error) {
              console.error('Permission request error:', error);
            }
          }}
          className="w-full bg-white text-blue-600 px-3 py-2 rounded text-sm font-medium hover:bg-gray-100"
        >
          Enable Windows Notifications
        </button>
      </div>
    );
  }

  return null;
}
