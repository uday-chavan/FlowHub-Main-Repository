// Service Worker removed - using direct Windows notifications instead
console.log('Service Worker: Removed for direct Windows notifications');

self.addEventListener('install', event => {
  console.log('Service Worker: Installing (minimal)');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating (minimal)');
  event.waitUntil(self.clients.claim());
});

// No longer handling notifications via service worker
// Using direct Notification API for Windows notifications