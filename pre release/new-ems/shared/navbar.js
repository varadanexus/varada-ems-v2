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
      <div class="global-search" id="globalSearch">
        <span class="global-search-icon" aria-hidden="true">⌕</span>
        <input type="text" id="globalSearchInput" placeholder="Search modules, users, settings..." autocomplete="off" spellcheck="false" aria-label="Search" />
        <div class="global-search-results hidden" id="globalSearchResults" role="listbox"></div>
      </div>
      <style>
        .app-navbar{position:relative;z-index:1000;}
        .global-search{position:relative;display:flex;align-items:center;gap:.45rem;}
        .global-search-icon{opacity:.55;font-size:1rem;flex:0 0 auto;}
        #globalSearchInput{flex:1;min-width:0;background:transparent;border:none;outline:none;color:#e8eef7;font:inherit;}
        #globalSearchInput::placeholder{color:#7f93b0;}
        .global-search-results{position:absolute;top:calc(100% + 8px);left:0;right:0;background:#0b1324;border:1px solid rgba(148,163,184,.25);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.45);max-height:360px;overflow:auto;z-index:1200;padding:.3rem;}
        .global-search-results.hidden{display:none;}
        .gsr-item{display:flex;flex-direction:column;gap:.08rem;padding:.5rem .6rem;border-radius:8px;cursor:pointer;text-decoration:none;color:#e5edf8;}
        .gsr-item:hover,.gsr-item.gsr-active{background:rgba(148,163,184,.16);}
        .gsr-item strong{font-size:.86rem;font-weight:600;}
        .gsr-item small{font-size:.72rem;color:#8aa0bf;}
        .gsr-empty{padding:.7rem;color:#8aa0bf;font-size:.82rem;}
      </style>
      <div class="navbar-actions">
        <button class="btn btn-ghost" id="adminMenuBtn">Admin</button>
        <button class="icon-btn notification-trigger" id="notificationBellBtn" aria-label="Open notifications">
          <span aria-hidden="true">🔔</span>
          <span class="notification-badge hidden" id="notificationUnreadBadge">0</span>
        </button>
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
