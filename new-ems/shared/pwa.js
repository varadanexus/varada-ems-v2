(function initialiseVaradaPwa() {
  "use strict";

  const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());
  const isStandalone = () => isNative() || window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  let installPrompt = null;
  let installButton = null;

  if (isStandalone()) document.documentElement.classList.add("ems-standalone");
  if (isNative()) document.documentElement.classList.add("ems-native");

  function addStylesheet() {
    if (document.querySelector('link[data-ems-pwa-style]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/new-ems/assets/css/pwa.css";
    link.dataset.emsPwaStyle = "true";
    document.head.appendChild(link);
  }

  function removeInstallButton() {
    installButton?.remove();
    installButton = null;
  }

  function showMessage(title, message, action) {
    document.querySelector(".ems-pwa-notice")?.remove();
    const notice = document.createElement("section");
    notice.className = "ems-pwa-notice";
    notice.setAttribute("role", "status");
    notice.innerHTML = `<div><strong></strong><span></span></div><div class="ems-pwa-notice-actions"></div>`;
    notice.querySelector("strong").textContent = title;
    notice.querySelector("span").textContent = message;
    const actions = notice.querySelector(".ems-pwa-notice-actions");
    if (action) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.textContent = action.label;
      actionButton.addEventListener("click", action.run);
      actions.appendChild(actionButton);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "ems-pwa-notice-close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", () => notice.remove());
    actions.appendChild(close);
    document.body.appendChild(notice);
  }

  function renderInstallButton() {
    if (installButton || isStandalone() || (!installPrompt && !isIos)) return;
    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "ems-pwa-install";
    installButton.setAttribute("aria-label", "Install Varada Nexus on this device");
    installButton.innerHTML = '<span aria-hidden="true">↓</span> Install EMS';
    installButton.addEventListener("click", async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        removeInstallButton();
        return;
      }
      showMessage("Install Varada Nexus", "In Safari, tap Share and then Add to Home Screen.");
    });
    document.body.appendChild(installButton);
  }

  function offerUpdate(worker) {
    showMessage("EMS update ready", "Restart the app to use the latest version.", {
      label: "Restart",
      run: () => worker.postMessage({ type: "SKIP_WAITING" })
    });
  }

  async function registerServiceWorker() {
    if (isNative()) return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (error) {
      console.warn("Varada Nexus app installation is unavailable.", error);
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstallButton();
  });
  window.addEventListener("appinstalled", removeInstallButton);

  function boot() {
    addStylesheet();
    if (isNative()) {
      import("/new-ems/shared/native-app-update.js")
        .then(({ enforceNativeAppUpdate }) => enforceNativeAppUpdate())
        .catch((error) => console.warn("Native update protection could not start.", error));
    }
    if (isIos) renderInstallButton();
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
