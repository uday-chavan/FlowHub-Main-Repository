import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

interface BrowserNotificationManagerProps {
  userId: string;
}

export function BrowserNotificationManager({ userId }: BrowserNotificationManagerProps) {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const processedNotifications = useRef(new Set<string>());

  // Check and request notification permission on component mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setPermissionGranted(true);
        console.log('[NotificationManager] Permission already granted');
      } else if (Notification.permission === 'default' && !permissionRequested) {
        setPermissionRequested(true);
        console.log('[NotificationManager] Requesting notification permission...');
        Notification.requestPermission().then((permission) => {
          const granted = permission === 'granted';
          setPermissionGranted(granted);
          console.log(`[NotificationManager] Permission ${granted ? 'granted' : 'denied'}`);

          // Show test notification immediately if granted
          if (granted) {
            new Notification('FlowHub Notifications Enabled! 🎉', {
              body: 'You will now receive Windows notifications for your tasks.',
              icon: '/favicon.ico',
              requireInteraction: false,
              tag: 'flowhub-enabled'
            });
          }
        });
      }
    } else {
      console.log('[NotificationManager] Notifications not supported in this browser');
    }
  }, [permissionRequested]);

  // Poll for browser notifications every 5 seconds
  const { data: notifications } = useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const response = await fetch(`/api/notifications?userId=${userId}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      return response.json();
    },
    refetchInterval: 5000,
    enabled: permissionGranted && !!userId
  });

  // Process and show Windows notifications
  useEffect(() => {
    if (!permissionGranted || !notifications || !('Notification' in window)) return;

    const browserNotifications = notifications.filter((notification: any) => 
      notification.type === 'browser_notification' && 
      notification.metadata?.browserNotification &&
      !processedNotifications.current.has(notification.id)
    );

    for (const notification of browserNotifications) {
      processedNotifications.current.add(notification.id);

      try {
        const windowsNotification = new Notification(notification.title, {
          body: notification.description,
          icon: '/favicon.ico',
          tag: `task-reminder-${notification.metadata.taskId}`,
          requireInteraction: true,
          silent: false
        });

        windowsNotification.onclick = () => {
          window.focus();
          windowsNotification.close();
        };

        setTimeout(() => {
          windowsNotification.close();
        }, 10000);

        console.log(`[NotificationManager] Windows notification shown: ${notification.title}`);

        // Mark notification as dismissed
        fetch(`/api/notifications/${notification.id}/dismiss`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' }
        }).catch(error => {
          console.error('Failed to dismiss notification:', error);
        });

      } catch (error) {
        console.error('Failed to show Windows notification:', error);
      }
    }
  }, [notifications, permissionGranted]);

  // Show permission request UI only if permission not granted
  if ('Notification' in window && Notification.permission !== 'granted') {
    return (
      <div className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-sm z-50">
        <h4 className="font-semibold mb-2">Enable Windows Notifications</h4>
        <p className="text-sm mb-3">
          Get Windows notifications for task deadlines.
        </p>
        <button
          onClick={async () => {
            setPermissionRequested(true);
            const permission = await Notification.requestPermission();
            const granted = permission === 'granted';
            setPermissionGranted(granted);

            if (granted) {
              new Notification('FlowHub Notifications Enabled! 🎉', {
                body: 'Windows notifications are now active.',
                icon: '/favicon.ico',
                requireInteraction: false,
                tag: 'flowhub-test'
              });
            }
          }}
          className="w-full bg-white text-blue-600 px-3 py-2 rounded text-sm font-medium hover:bg-gray-100"
        >
          Enable Notifications
        </button>
        {Notification.permission === 'denied' && (
          <p className="text-xs text-blue-200 mt-2">
            Notifications blocked. Enable them in browser settings.
          </p>
        )}
      </div>
    );
  }

  // Show status indicator when notifications are enabled
  if (permissionGranted) {
    return (
      <div className="fixed bottom-4 right-4 bg-green-600 text-white p-2 rounded-lg shadow-lg z-50 opacity-80">
        <p className="text-xs">🔔 Windows Notifications ON</p>
      </div>
    );
  }

  return null;
}

// Export with old name for compatibility
export { BrowserNotificationManager as WindowsNotificationManager };
