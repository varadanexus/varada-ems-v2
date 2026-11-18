const LAST_NATIVE_ROUTE_KEY = "ems_native_last_authorized_route";

function isNativeAndroid() {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() &&
    String(window.Capacitor?.getPlatform?.() || "").toLowerCase() === "android"
  );
}

function validatedModuleRoute(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (!url.pathname.startsWith("/new-ems/modules/")) return null;
    if (!url.pathname.endsWith("/index.html")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function rememberNativeAuthorizedRoute() {
  if (!isNativeAndroid()) return;
  const route = validatedModuleRoute(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  if (!route) return;
  try { localStorage.setItem(LAST_NATIVE_ROUTE_KEY, route); } catch {}
}

export function getNativeResumeRoute() {
  if (!isNativeAndroid()) return null;
  try { return validatedModuleRoute(localStorage.getItem(LAST_NATIVE_ROUTE_KEY)); }
  catch { return null; }
}

export function clearNativeResumeRoute() {
  try { localStorage.removeItem(LAST_NATIVE_ROUTE_KEY); } catch {}
}
