window.EMS_RUNTIME_CONFIG = window.EMS_RUNTIME_CONFIG || {
  supabaseUrl: "https://ftejxcycoiagbslnzaab.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0ZWp4Y3ljb2lhZ2JzbG56YWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzIzMjIsImV4cCI6MjA5NTgwODMyMn0.Fd9O069Gmoi5l-bcImmWUp5hWblQwJV0_s00UdFWscw",
  transportAgentPenaltiesReady: true
};

// PWA metadata and behaviour are loaded from this shared bootstrap so every
// EMS module participates without duplicating tags across more than 100 pages.
(function loadEmsPwa() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/new-ems/manifest.webmanifest";
    document.head.appendChild(manifest);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#07111f";
    document.head.appendChild(theme);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = "/new-ems/assets/icons/ems-180.png";
    document.head.appendChild(appleIcon);
  }
  [
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ["apple-mobile-web-app-title", "Varada EMS"]
  ].forEach(([name, content]) => {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  });
  if (!document.querySelector('script[data-ems-pwa]')) {
    const script = document.createElement("script");
    script.src = "/new-ems/shared/pwa.js";
    script.defer = true;
    script.dataset.emsPwa = "true";
    document.head.appendChild(script);
  }
})();
