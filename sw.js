var CACHE = 'pc-v2';
var SHELL = ['/', '/index.html', '/app.js', '/config.js', '/manifest.json', '/icon-512.png'];
var CDN_HOSTS = ['www.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
      for (var i = 0; i < l.length; i++) { if ('focus' in l[i]) return l[i].focus(); }
      return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  var isApp = url.origin === location.origin;
  var isCDN = CDN_HOSTS.indexOf(url.hostname) !== -1;
  /* Firebase API, ImgBB ইত্যাদি নিজের মতো চলবে — আমরা ধরব না */
  if (!isApp && !isCDN) return;

  if (isCDN) {
    /* CDN: ক্যাশ আগে, না থাকলে নেট */
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        return cached || fetch(e.request).then(function (resp) {
          try {
            var copy = resp.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          } catch (err) {}
          return resp;
        });
      })
    );
  } else {
    /* অ্যাপ ফাইল: নেট আগে (সবসময় নতুন কোড), নেট না থাকলে ক্যাশ */
    e.respondWith(
      fetch(e.request).then(function (resp) {
        try {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        } catch (err) {}
        return resp;
      }).catch(function () {
        return caches.match(e.request).then(function (cached) {
          return cached || caches.match('/index.html');
        });
      })
    );
  }
});
