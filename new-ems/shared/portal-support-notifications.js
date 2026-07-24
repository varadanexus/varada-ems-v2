import "./portal-support.js";
import { getSupabaseClient } from "../config/supabase.js";
import { supportPortalTokens } from "./support-notification-delivery.js";

const DEVICE_KEY = "ems_native_push_device_id";
let nativeReady = false;

function deviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) { value = crypto.randomUUID?.() || `ems-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(DEVICE_KEY, value); }
  return value;
}
function nativePlugin() { return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.PushNotifications : null; }
async function saveNative(token) {
  const { error } = await getSupabaseClient().rpc("portal_upsert_native_push_token", {
    p_token: token, p_platform: window.Capacitor?.getPlatform?.() === "ios" ? "ios" : "android",
    p_device_id: deviceId(), p_user_agent: navigator.userAgent, ...supportPortalTokens()
  });
  if (error) throw error;
}
async function registerNative() {
  const plugin = nativePlugin(); if (!plugin) return false;
  if (!nativeReady) {
    await plugin.addListener("registration", ({ value }) => saveNative(value).catch(() => {}));
    await plugin.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const target = notification?.data?.url; if (target) location.assign(target);
    });
    await plugin.createChannel?.({ id:"ems_operational_alerts", name:"EMS operational alerts", importance:4, visibility:1, vibration:true, sound:"default" });
    nativeReady = true;
  }
  let status = await plugin.checkPermissions();
  if (status?.receive === "prompt" || status?.receive === "prompt-with-rationale") status = await plugin.requestPermissions();
  if (status?.receive !== "granted") return false;
  await plugin.register(); return true;
}
function bytes(value) {
  const padding="=".repeat((4-value.length%4)%4); const raw=atob((value+padding).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(raw,(c)=>c.charCodeAt(0));
}
async function registerWeb() {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent); const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  if (ios&&!standalone) return false;
  if (Notification.permission === "default") return false;
  if (Notification.permission !== "granted") return false;
  await navigator.serviceWorker.register("/sw.js",{scope:"/"}); const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription(); const vapid=(window.EMS_RUNTIME_CONFIG||{}).vapidPublicKey;
  if (!sub&&vapid) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(vapid)});
  if (!sub) return false; const json=sub.toJSON();
  const { error }=await getSupabaseClient().rpc("portal_upsert_push_subscription",{
    p_endpoint:sub.endpoint,p_p256dh_key:json.keys?.p256dh||"",p_auth_key:json.keys?.auth||"",p_user_agent:navigator.userAgent,...supportPortalTokens()
  }); if(error) throw error; return true;
}
async function enableAlerts() {
  if (nativePlugin()) return registerNative();
  if (!("Notification" in window)) return false;
  if (Notification.permission === "default") await Notification.requestPermission();
  return registerWeb();
}
function prompt() {
  if (document.querySelector("#portalPushPrompt")) return;
  const button=document.createElement("button"); button.id="portalPushPrompt"; button.type="button"; button.className="portal-support-push-prompt";
  button.textContent="Enable ticket alerts"; button.addEventListener("click",async()=>{button.disabled=true; const ok=await enableAlerts().catch(()=>false); button.textContent=ok?"Ticket alerts enabled":"Allow notifications in device settings"; if(ok)setTimeout(()=>button.remove(),1800);else button.disabled=false;});
  document.body.appendChild(button);
}
async function refreshNotifications(showLatest=false) {
  const { data, error }=await getSupabaseClient().rpc("portal_list_support_notifications",{...supportPortalTokens(),p_limit:30}); if(error)return;
  const rows=Array.isArray(data)?data:[]; const unread=rows.filter((row)=>!row.is_read); const launcher=document.querySelector("#portalSupportLauncher");
  if(launcher){launcher.dataset.unread=String(unread.length);launcher.classList.toggle("has-unread",unread.length>0);}
  if(showLatest&&unread[0]&&!document.querySelector("#portalSupportAlert")){
    const alert=document.createElement("button");alert.id="portalSupportAlert";alert.type="button";alert.className="portal-support-alert";
    const title=document.createElement("strong"); title.textContent=String(unread[0].title||"Support update"); const message=document.createElement("span"); message.textContent=String(unread[0].message||""); alert.append(title,message);
    alert.addEventListener("click",async()=>{await getSupabaseClient().rpc("portal_mark_support_notification_read",{p_recipient_id:unread[0].recipient_id,...supportPortalTokens()});alert.remove();launcher?.click();refreshNotifications(false);});
    document.body.appendChild(alert);setTimeout(()=>alert.remove(),12000);
  }
}
async function init() {
  await new Promise((resolve)=>setTimeout(resolve,500));
  const enabled=nativePlugin()?await registerNative().catch(()=>false):await registerWeb().catch(()=>false); if(!enabled)prompt();
  await refreshNotifications(true);setInterval(()=>refreshNotifications(true),60000);
  if(new URLSearchParams(location.search).has("support_ticket")) document.querySelector("#portalSupportLauncher")?.click();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
