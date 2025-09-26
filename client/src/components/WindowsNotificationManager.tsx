
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

  // Request Windows notification permission and create login notification - only on desktop devices
  useEffect(() => {
    // Simplified mobile detection - only exclude actual mobile devices
    const isMobile = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /iPad/i.test(navigator.userAgent);
    
    // Allow notifications on Windows/Mac desktop (including touch-enabled desktops)
    const isDesktop = !isMobile && !isTablet;
    
    if ('Notification' in window && isDesktop) {
      console.log('[WindowsNotificationManager] Current permission status:', Notification.permission);
      
      if (Notification.permission === 'granted') {
        setPermissionGranted(true);
        console.log('[WindowsNotificationManager] Notifications already granted');
        
        // Create instant login notification that appears in Windows notification center
        setTimeout(() => {
          console.log('[WindowsNotificationManager] Creating login notification');
          const loginNotification = new Notification('🔔 Welcome back to FlowHub!', {
            body: 'You are now logged in. Windows notifications are active and will appear in your notification center.',
            icon: '/favicon.ico',
            tag: 'flowhub-login',
            requireInteraction: true, // Keep visible longer
            silent: false
          });

          loginNotification.onclick = () => {
            console.log('[WindowsNotificationManager] Login notification clicked');
            window.focus();
            loginNotification.close();
          };

          loginNotification.onshow = () => {
            console.log('[WindowsNotificationManager] Login notification shown in Windows notification center');
          };

          loginNotification.onerror = (error) => {
            console.error('[WindowsNotificationManager] Login notification error:', error);
          };

          // Auto-close after 10 seconds
          setTimeout(() => {
            loginNotification.close();
          }, 10000);
        }, 2000); // Wait 2 seconds after page load to show login notification
        
      } else if (Notification.permission === 'denied') {
        console.log('[WindowsNotificationManager] Notifications denied by user');
      } else {
        console.log('[WindowsNotificationManager] Notifications in default state - requesting permission');
        // Request permission if in default state
        Notification.requestPermission().then((permission) => {
          console.log('[WindowsNotificationManager] Permission request result:', permission);
          if (permission === 'granted') {
            setPermissionGranted(true);
            console.log('[WindowsNotificationManager] Permission granted - notifications enabled');
            
            // Create instant login notification
            setTimeout(() => {
              console.log('[WindowsNotificationManager] Creating login notification after permission granted');
              const loginNotification = new Notification('🔔 Welcome to FlowHub!', {
                body: 'You are now logged in. Windows notifications are active and will appear in your notification center.',
                icon: '/favicon.ico',
                tag: 'flowhub-login',
                requireInteraction: true,
                silent: false
              });

              loginNotification.onclick = () => {
                console.log('[WindowsNotificationManager] Login notification clicked');
                window.focus();
                loginNotification.close();
              };

              loginNotification.onshow = () => {
                console.log('[WindowsNotificationManager] Login notification shown in Windows notification center');
              };

              loginNotification.onerror = (error) => {
                console.error('[WindowsNotificationManager] Login notification error:', error);
              };

              setTimeout(() => loginNotification.close(), 10000);
            }, 1000);
          } else {
            console.log('[WindowsNotificationManager] Permission denied or dismissed');
          }
        }).catch((error) => {
          console.error('[WindowsNotificationManager] Error requesting permission:', error);
        });
      }
    } else {
      console.log('[WindowsNotificationManager] Not a desktop device or Notification API not supported');
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
    enabled: 'Notification' in window // Enable polling regardless of permission to detect notifications
  });

  useEffect(() => {
    if (!permissionGranted || !notifications || !('Notification' in window)) return;

    console.log('[WindowsNotificationManager] Processing notifications:', notifications.length);

    // Filter for Windows notifications that haven't been processed
    const windowsNotifications = notifications.filter((notification: any) => {
      const isWindowsNotification = notification.metadata?.browserNotification === true;
      const notProcessed = !processedNotifications.current.has(notification.id);
      
      if (isWindowsNotification && notProcessed) {
        console.log(`[WindowsNotificationManager] Found unprocessed notification: ${notification.title}`);
      }
      
      return isWindowsNotification && notProcessed;
    });

    console.log('[WindowsNotificationManager] Found', windowsNotifications.length, 'unprocessed Windows notifications');

    for (const notification of windowsNotifications) {
      // Mark as processed immediately to prevent duplicates
      processedNotifications.current.add(notification.id);

      try {
        console.log(`[WindowsNotificationManager] Creating Windows notification: ${notification.title}`);
        
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
              console.log('[WindowsNotificationManager] Enable button clicked');
              console.log('[WindowsNotificationManager] Notification API support:', 'Notification' in window);
              console.log('[WindowsNotificationManager] Current permission:', Notification.permission);
              
              if (!('Notification' in window)) {
                alert('This browser does not support notifications');
                return;
              }
              
              try {
                // Directly request permission - this will show the browser's native popup immediately
                const permission = await Notification.requestPermission();
                console.log('[WindowsNotificationManager] Permission result:', permission);
                
                if (permission === 'granted') {
                  setPermissionGranted(true);
                  console.log('[WindowsNotificationManager] Permission granted, creating test notification');
                  
                  // Create immediate test notification that will appear in Windows notification center
                  const testNotification = new Notification('✅ FlowHub Notifications Enabled!', {
                    body: 'You will now receive Windows notifications for task deadlines. This notification should appear in your Windows notification center.',
                    icon: '/favicon.ico',
                    tag: 'flowhub-enabled',
                    requireInteraction: true, // Keep it visible longer
                    silent: false
                  });

                  testNotification.onclick = () => {
                    console.log('[WindowsNotificationManager] Test notification clicked');
                    window.focus();
                    testNotification.close();
                  };

                  testNotification.onshow = () => {
                    console.log('[WindowsNotificationManager] Test notification shown in Windows notification center');
                  };

                  testNotification.onerror = (error) => {
                    console.error('[WindowsNotificationManager] Test notification error:', error);
                  };

                  // Auto-close after 8 seconds
                  setTimeout(() => {
                    testNotification.close();
                  }, 8000);
                  
                } else if (permission === 'denied') {
                  console.log('[WindowsNotificationManager] Permission denied');
                  alert('Notifications blocked. Please click the lock icon in your browser address bar to enable notifications.');
                } else {
                  console.log('[WindowsNotificationManager] Permission dismissed');
                }
              } catch (error) {
                console.error('[WindowsNotificationManager] Permission request error:', error);
                alert('Error requesting notification permission. Please try again.');
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
