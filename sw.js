self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* ★ এই fetch handler ছাড়া Chrome অ্যাপ ইনস্টল করতে দেয় না ★ */
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
