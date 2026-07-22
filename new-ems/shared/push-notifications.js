import { getSupabaseAccessToken, getSupabaseClient } from "../config/supabase.js";

function runtime() {
  return window.EMS_RUNTIME_CONFIG || {};
}

function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function nativePushPlugin() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  return window.Capacitor?.Plugins?.PushNotifications || null;
}

const NATIVE_DEVICE_ID_KEY = "ems_native_push_device_id";
let nativeListenersReady = false;
let nativeRegistrationWaiters = [];

function nativeDeviceId() {
  try {
    let value = localStorage.getItem(NATIVE_DEVICE_ID_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `ems-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(NATIVE_DEVICE_ID_KEY, value);
    }
    return value;
  } catch {
    return `ems-${navigator.userAgent.length}-${screen.width}x${screen.height}`;
  }
}

async function saveNativeToken(value) {
  const token = String(value || "").trim();
  if (!token) throw new Error("Firebase did not return a device token.");
  const platform = String(window.Capacitor?.getPlatform?.() || "android").toLowerCase();
  const { error } = await getSupabaseClient().rpc("upsert_my_native_push_token", {
    p_token: token,
    p_platform: platform === "ios" ? "ios" : "android",
    p_device_id: nativeDeviceId(),
    p_user_agent: navigator.userAgent
  });
  if (error) throw error;
  return token;
}

function settleNativeRegistration(error, token = "") {
  const waiters = nativeRegistrationWaiters;
  nativeRegistrationWaiters = [];
  waiters.forEach(({ resolve, reject, timer }) => {
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(token);
  });
}

function openNativeNotificationTarget(notification) {
  const target = String(notification?.data?.url || notification?.data?.action_url || "").trim();
  if (!target) return;
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) return;
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

async function prepareNativePush() {
  const plugin = nativePushPlugin();
  if (!plugin) throw new Error("Native push support is not installed in this app build. Update the Android app.");
  if (nativeListenersReady) return plugin;

  await plugin.addListener("registration", async ({ value }) => {
    try {
      const token = await saveNativeToken(value);
      settleNativeRegistration(null, token);
    } catch (error) {
      settleNativeRegistration(error);
    }
  });
  await plugin.addListener("registrationError", ({ error }) => {
    settleNativeRegistration(new Error(error || "Firebase registration failed."));
  });
  await plugin.addListener("pushNotificationActionPerformed", ({ notification }) => {
    openNativeNotificationTarget(notification);
  });
  await plugin.createChannel?.({
    id: "ems_operational_alerts",
    name: "EMS operational alerts",
    description: "Operational, security and workflow alerts from Varada Nexus EMS.",
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: "#D4B26AFF"
  });
  nativeListenersReady = true;
  return plugin;
}

async function registerNativePush() {
  const plugin = await prepareNativePush();
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      nativeRegistrationWaiters = nativeRegistrationWaiters.filter((entry) => entry.resolve !== resolve);
      reject(new Error("Firebase registration timed out. Confirm google-services.json is included in the Android app."));
    }, 15000);
    nativeRegistrationWaiters.push({ resolve, reject, timer });
  });
  await plugin.register();
  return result;
}

function base64UrlToBytes(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function pushSupport() {
  if (isNativeApp()) {
    return nativePushPlugin()
      ? { supported: true, reason: "" }
      : { supported: false, reason: "Update the Android app to enable native background notifications." };
  }
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
  const nativePush = nativePushPlugin();
  if (isNativeApp()) {
    if (!nativePush) return { supported: false, enabled: false, permission: "unsupported", deviceCount: 0, reason: "Update the Android app to enable native background notifications." };
    const status = await nativePush.checkPermissions();
    const granted = status?.receive === "granted";
    if (granted) await registerNativePush();
    const { data, error } = await getSupabaseClient().rpc("get_my_native_push_token_status", {
      p_device_id: nativeDeviceId()
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      supported: true,
      enabled: Boolean(granted && row?.enabled),
      permission: status?.receive || "prompt",
      deviceCount: Number(row?.device_count || 0),
      reason: granted ? "" : "Notification permission is required on this device."
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
  const nativePush = nativePushPlugin();
  if (isNativeApp()) {
    if (!nativePush) throw new Error("Update the Android app to enable native background notifications.");
    let status = await nativePush.checkPermissions();
    if (status?.receive === "prompt" || status?.receive === "prompt-with-rationale") {
      status = await nativePush.requestPermissions();
    }
    if (status?.receive !== "granted") throw new Error("Notification permission was not granted. Enable it in Android app settings.");
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
  const nativePush = nativePushPlugin();
  if (isNativeApp()) {
    if (!nativePush) return { supported: false, enabled: false, deviceCount: 0 };
    const { error } = await getSupabaseClient().rpc("remove_my_native_push_token", { p_device_id: nativeDeviceId() });
    if (error) throw error;
    await nativePush.unregister();
    return { supported: true, enabled: false, permission: "granted", deviceCount: 0, reason: "" };
  }
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
