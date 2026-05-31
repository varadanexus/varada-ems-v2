export function renderNavbar(email = "", role = "") {
  return `
    <header class="app-navbar">
      <button class="icon-btn" id="menuToggle" aria-label="Toggle menu">☰</button>
      <div class="navbar-title">Control Center</div>
      <div class="navbar-actions">
        <button class="btn btn-ghost" id="themeToggle">Theme</button>
        <div class="user-chip">
          <span>${email || "User"}</span>
          <small>${role || "role"}</small>
        </div>
        <button class="btn btn-danger" id="logoutBtn">Logout</button>
      </div>
    </header>
  `;
}
