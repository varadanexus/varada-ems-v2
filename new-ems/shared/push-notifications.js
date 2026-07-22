import { getSupabaseAccessToken, getSupabaseClient } from "../config/supabase.js";

function runtime() {
  return window.EMS_RUNTIME_CONFIG || {};
}

function nativeDevicePlugin() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  return window.Capacitor?.Plugins?.NativeDevice || null;
}

function base64UrlToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function pushSupport() {
  if (nativeDevicePlugin()) return { supported: true, reason: "" };
  if (!window.isSecureContext) return { supported: false, reason: "A secure HTTPS connection is required." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "Push notifications are not supported by this browser." };
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (ios && !standalone) return { supported: false, reason: "On iPhone or iPad, install EMS first and open it from the Home Screen." };
  if (!runtime().vapidPublicKey) return { supported: false, reason: "Push notifications are not configured yet." };
  return { supported: true, reason: "" };
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function saveSubscription(subscription) {
  const json = subscription.toJSON();
  const { error } = await getSupabaseClient().rpc("upsert_my_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh_key: json.keys?.p256dh || "",
    p_auth_key: json.keys?.auth || "",
    p_user_agent: navigator.userAgent
  });
  if (error) throw error;
}

export async function getPushNotificationStatus() {
  const nativeDevice = nativeDevicePlugin();
  if (nativeDevice) {
    const status = await nativeDevice.notificationStatus();
    return {
      supported: true,
      enabled: Boolean(status?.granted),
      permission: status?.granted ? "granted" : "prompt",
      deviceCount: status?.granted ? 1 : 0,
      reason: status?.granted ? "" : "Notification permission is required on this device."
    };
  }
  const support = pushSupport();
  if (!support.supported) return { ...support, enabled: false, permission: "Notification" in window ? Notification.permission : "unsupported", deviceCount: 0 };
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  const permissionGranted = Notification.permission === "granted";
  if (subscription && permissionGranted) await saveSubscription(subscription).catch(() => {});
  const { data, error } = await getSupabaseClient().rpc("get_my_push_subscription_status", {
    p_endpoint: subscription?.endpoint || null
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ...support,
    enabled: Boolean(permissionGranted && subscription && row?.enabled),
    permission: Notification.permission,
    deviceCount: Number(row?.device_count || 0),
    reason: permissionGranted
      ? ""
      : Notification.permission === "denied"
        ? "Notifications are blocked. Allow them in this device's app or browser settings, then return to EMS."
        : "Notification permission is required on this device."
  };
}

export async function enablePushNotifications() {
  const nativeDevice = nativeDevicePlugin();
  if (nativeDevice) {
    const status = await nativeDevice.requestNotifications();
    if (!status?.granted) throw new Error("Notification permission was not granted. Enable it in Android app settings.");
    return getPushNotificationStatus();
  }
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted. Enable it in this device's browser settings.");
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(runtime().vapidPublicKey)
    });
  }
  await saveSubscription(subscription);
  return getPushNotificationStatus();
}

export async function disablePushNotifications() {
  const nativeDevice = nativeDevicePlugin();
  if (nativeDevice) return getPushNotificationStatus();
  const support = pushSupport();
  if (!support.supported) return { ...support, enabled: false, deviceCount: 0 };
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    const { error } = await getSupabaseClient().rpc("remove_my_push_subscription", { p_endpoint: subscription.endpoint });
    if (error) throw error;
    await subscription.unsubscribe();
  }
  return getPushNotificationStatus();
}

export async function deliverPushNotification(notificationId) {
  if (!notificationId) return null;
  const token = await getSupabaseAccessToken();
  if (!token) return null;
  const config = runtime();
  const response = await fetch(`${config.supabaseUrl}/functions/v1/push-notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseAnonKey || "",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ notification_id: notificationId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "Push delivery failed");
  return payload;
}
