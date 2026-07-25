import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

// Firebase Web config values are publishable identifiers (safe in client code).
// Replace `apiKey` below with the value from Firebase Console → Project settings.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAIWikOhvovjxDQgf2Ap9i_8JNgtOk8pho",
  authDomain: "tma-fleet.firebaseapp.com",
  projectId: "tma-fleet",
  storageBucket: "tma-fleet.firebasestorage.app",
  messagingSenderId: "970002030337",
  appId: "1:970002030337:web:261fd2278d15a2b5630500",
};

const VAPID_KEY =
  "BJhLpTOE4-Tu0HRzXtVg3N45nrjB6izIBWLKk42QGzrazOWFp2kF_wR7eKlUHVL_aGirCgc_FUTi_4G7kDGZuzo";

export function getFirebaseApp() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

export async function enablePushNotifications(): Promise<
  { ok: true; token: string } | { ok: false; reason: string }
> {
  if (typeof window === "undefined") return { ok: false, reason: "SSR" };
  if (!(await isSupported())) return { ok: false, reason: "Push not supported on this browser" };
  if (!("Notification" in window)) return { ok: false, reason: "Notifications unavailable" };

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Permission denied" };

  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg,
  });
  if (!token) return { ok: false, reason: "No FCM token returned" };

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { ok: false, reason: "Not signed in" };

  await supabase
    .from("push_tokens")
    .upsert(
      { user_id: userId, token, user_agent: navigator.userAgent },
      { onConflict: "token" },
    );

  return { ok: true, token };
}

export function listenForegroundMessages(handler: (title: string, body: string) => void) {
  isSupported().then((ok) => {
    if (!ok) return;
    const messaging = getMessaging(getFirebaseApp());
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || "Fleet RTO";
      const body = payload.notification?.body || payload.data?.body || "";
      handler(title, body);
    });
  });
}
