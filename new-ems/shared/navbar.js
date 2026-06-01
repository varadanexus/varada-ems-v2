export function renderNavbar(email = "", role = "", options = {}) {
  const { sidebarless = false } = options;
  return `
    <header class="app-navbar">
      <div class="navbar-left">
        <button class="icon-btn ${sidebarless ? "hidden" : ""}" id="menuToggle" aria-label="Toggle menu">☰</button>
        <div class="navbar-title">EMS 2.0</div>
      </div>
      <div class="global-search">Search modules, users, settings...</div>
      <div class="navbar-actions">
        <button class="btn btn-ghost" id="adminMenuBtn">Admin</button>
        <button class="icon-btn" id="themeToggle" aria-label="Toggle theme">◐</button>
        <div class="user-chip">
          <span>${email || "User"}</span>
          <small>${role || "role"}</small>
        </div>
        <button class="btn btn-ghost" id="logoutBtn">Logout</button>
      </div>
    </header>
  `;
}
