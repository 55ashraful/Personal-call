self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* Chrome অ্যাপ ইনস্টল করার জন্য এই fetch handler লাগবেই */
self.addEventListener('fetch', function () {});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
      for (var i = 0; i < l.length; i++) { if ('focus' in l[i]) return l[i].focus(); }
      return self.clients.openWindow('/');
    })
  );
});
