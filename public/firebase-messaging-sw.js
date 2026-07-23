// Firebase Cloud Messaging service worker (background handler).
// Config values are publishable Firebase identifiers, safe to inline.
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBpublic-placeholder",
  authDomain: "tma-fleet.firebaseapp.com",
  projectId: "tma-fleet",
  storageBucket: "tma-fleet.firebasestorage.app",
  messagingSenderId: "970002030337",
  appId: "1:970002030337:web:261fd2278d15a2b5630500",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "Fleet RTO";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "/dashboard";
  self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.navigate(url).then(() => c.focus());
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
