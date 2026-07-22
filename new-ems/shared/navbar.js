export function renderNavbar(email = "", role = "", options = {}) {
  const { sidebarless = false } = options;
  return `
    <header class="app-navbar">
      <div class="navbar-left">
        <button class="icon-btn ${sidebarless ? "hidden" : ""}" id="menuToggle" aria-label="Toggle menu">☰</button>
        <div class="navbar-title ems-nav-brand">
          <img class="ems-nav-logo" src="/images/logo.png" alt="Varada Nexus logo" />
          <span class="ems-nav-wordmark">
            <span class="ems-nav-name">Varada <span class="ems-nav-nexus">Nexus</span></span>
            <small class="ems-nav-sub">Private Limited</small>
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
        .ems-nav-brand{display:flex;align-items:center;gap:12px;min-width:0;}
        .ems-nav-logo{height:34px;width:auto;max-width:54px;border-radius:7px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(230,200,126,.14));}
        .ems-nav-wordmark{display:inline-grid;line-height:1.05;min-width:0;}
        .navbar-title.ems-nav-brand .ems-nav-name{font-family:"Manrope",sans-serif;color:#f7f4ec!important;font-size:13px;font-weight:700;letter-spacing:.34em!important;text-transform:uppercase;white-space:nowrap;}
        .navbar-title.ems-nav-brand .ems-nav-nexus{margin-left:2px;font-family:inherit;font-size:inherit;font-style:normal;font-weight:inherit;letter-spacing:inherit!important;text-transform:inherit;background:linear-gradient(120deg,#f7e7b0,#e0c274 45%,#c39a44);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#e6c87e!important;}
        .navbar-title.ems-nav-brand .ems-nav-sub{display:block;margin-top:1px;font-family:"Manrope",sans-serif;font-size:9.5px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:#8d8a7e!important;white-space:nowrap;}
        @media(max-width:768px){.navbar-title.ems-nav-brand .ems-nav-sub{display:block;margin-top:2px;font-size:7px;letter-spacing:.24em}.navbar-title.ems-nav-brand .ems-nav-name{font-size:11px;letter-spacing:.23em!important}.ems-nav-brand{gap:8px}.ems-nav-logo{height:30px;max-width:46px}}
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
        <div class="user-chip">
          <span>${email || "User"}</span>
          <small>${role || "role"}</small>
        </div>
        <button class="btn btn-ghost" id="logoutBtn">Logout</button>
      </div>
    </header>
  `;
}
