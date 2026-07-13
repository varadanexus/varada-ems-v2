import { TOAST_TYPES } from "../config/constants.js";

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function showToast(message, type = TOAST_TYPES.INFO) {
  const host = getToastHost();
  if (!host) return;

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  host.appendChild(item);

  window.setTimeout(() => {
    item.classList.add("toast-hide");
    window.setTimeout(() => item.remove(), 200);
  }, 2400);
}

function getToastHost() {
  let host = document.body?.querySelector?.('[data-global-toast-host="true"]');
  if (host) return host;
  if (!document.body) return null;
  host = document.createElement("div");
  host.className = "toast-host";
  host.setAttribute("data-global-toast-host", "true");
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

export function setLoadingState(container, isLoading) {
  if (!container) return;
  container.classList.toggle("is-loading", Boolean(isLoading));
}
