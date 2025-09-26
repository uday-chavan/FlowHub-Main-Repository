
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

  // Request Windows notification permission - only on desktop devices
  useEffect(() => {
    // Simplified mobile detection - only exclude actual mobile devices
    const isMobile = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad/i.test(navigator.userAgent);
    
    // Allow notifications on Windows/Mac desktop (including touch-enabled desktops)
    const isDesktop = !isMobile && !isTablet;
    
    if ('Notification' in window && isDesktop) {
      console.log('[NotificationManager] Current permission status:', Notification.permission);
      
      if (Notification.permission === 'granted') {
        setPermissionGranted(true);
        console.log('[NotificationManager] Notifications already granted');
      } else if (Notification.permission === 'denied') {
        console.log('[NotificationManager] Notifications denied by user');
      } else {
        console.log('[NotificationManager] Notifications in default state');
      }
    } else {
      console.log('[NotificationManager] Not a desktop device or Notification API not supported');
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
    refetchInterval: 2000, // Poll every 2 seconds for faster notification detection
    enabled: permissionGranted && 'Notification' in window
  });

  useEffect(() => {
    if (!permissionGranted || !notifications || !('Notification' in window)) return;

    console.log('[WindowsNotification] Processing notifications:', notifications.length);

    // Filter for Windows notifications that haven't been processed
    const windowsNotifications = notifications.filter((notification: any) => {
      const isBrowserNotification = notification.type === 'browser_notification' && 
                                   notification.metadata?.browserNotification;
      const notProcessed = !processedNotifications.current.has(notification.id);
      
      if (isBrowserNotification && notProcessed) {
        console.log(`[WindowsNotification] Found unprocessed notification: ${notification.title}`);
      }
      
      return isBrowserNotification && notProcessed;
    });

    console.log('[WindowsNotification] Found', windowsNotifications.length, 'unprocessed browser notifications');

    for (const notification of windowsNotifications) {
      // Mark as processed immediately to prevent duplicates
      processedNotifications.current.add(notification.id);

      try {
        console.log(`[WindowsNotification] Creating Windows notification: ${notification.title}`);
        
        // Create Windows notification with simplified options
        const windowsNotification = new Notification(notification.title, {
          body: notification.description || 'Task reminder',
          icon: '/favicon.ico',
          tag: `task-${notification.metadata?.taskId || notification.id}`,
          requireInteraction: false,
          silent: false
        });

        // Handle notification events
        windowsNotification.onshow = () => {
          console.log(`[WindowsNotification] Notification shown: ${notification.title}`);
        };

        windowsNotification.onclick = () => {
          console.log(`[WindowsNotification] Notification clicked: ${notification.title}`);
          window.focus();
          windowsNotification.close();
        };

        windowsNotification.onerror = (error) => {
          console.error(`[WindowsNotification] Notification error:`, error);
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
            console.log(`[WindowsNotification] Dismissed notification: ${notification.id}`);
          } catch (error) {
            console.error(`Failed to dismiss notification ${notification.id}:`, error);
          }
        }, 1000);

      } catch (error) {
        console.error(`[WindowsNotification] Failed to create notification:`, error);
      }
    }
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
              console.log('[NotificationManager] Enable button clicked');
              console.log('[NotificationManager] Notification API support:', 'Notification' in window);
              console.log('[NotificationManager] Current permission:', Notification.permission);
              
              if (!('Notification' in window)) {
                alert('This browser does not support notifications');
                return;
              }
              
              setPermissionRequested(true);
              
              try {
                // Request permission using the browser's native popup
                const permission = await Notification.requestPermission();
                console.log('[NotificationManager] Permission result:', permission);
                
                if (permission === 'granted') {
                  setPermissionGranted(true);
                  console.log('[NotificationManager] Permission granted, creating test notification');
                  
                  // Create immediate test notification
                  const testNotification = new Notification('✅ FlowHub Notifications Enabled!', {
                    body: 'You will now receive Windows notifications for task deadlines.',
                    icon: '/favicon.ico',
                    tag: 'flowhub-test',
                    requireInteraction: false
                  });

                  testNotification.onclick = () => {
                    window.focus();
                    testNotification.close();
                  };

                  // Auto-close after 5 seconds
                  setTimeout(() => testNotification.close(), 5000);
                  
                } else if (permission === 'denied') {
                  console.log('[NotificationManager] Permission denied');
                  alert('Notifications blocked. Please enable them in browser settings.');
                } else {
                  console.log('[NotificationManager] Permission dismissed');
                }
              } catch (error) {
                console.error('[NotificationManager] Permission error:', error);
                alert('Error requesting notification permission');
              }
            }}
            className="w-full bg-white text-blue-600 px-3 py-2 rounded text-sm font-medium hover:bg-gray-100"
          >
            Enable Windows Notifications
          </button>
          {Notification.permission === 'denied' && (
            <div className="text-xs text-blue-200 bg-blue-700/20 p-2 rounded">
              <strong>Notifications Blocked:</strong> Please click the lock icon (🔒) in your browser's address bar and allow notifications, then refresh the page.
            </div>
          )}
          {permissionRequested && Notification.permission === 'default' && (
            <div className="text-xs text-blue-200 bg-blue-700/20 p-2 rounded">
              Permission request was dismissed. Click "Enable Windows Notifications" again to try.
            </div>
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
