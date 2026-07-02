export function renderNavbar(email = "", role = "", options = {}) {
  const { sidebarless = false } = options;
  return `
    <header class="app-navbar">
      <div class="navbar-left">
        <button class="icon-btn ${sidebarless ? "hidden" : ""}" id="menuToggle" aria-label="Toggle menu">☰</button>
        <div class="navbar-title" style="display:flex;align-items:center;gap:.6rem;">
          <img src="/new-ems/assets/pdf/vn-logo.png" alt="Varada Nexus" style="width:30px;height:30px;object-fit:contain;" />
          <span style="line-height:1.15;display:inline-grid;">
            <span style="font-weight:700;letter-spacing:.02em;">Varada Nexus</span>
            <small style="font-size:.6rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d4b26a;">Private Limited</small>
          </span>
        </div>
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
