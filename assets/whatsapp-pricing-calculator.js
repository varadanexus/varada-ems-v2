(function () {
  "use strict";
  var form = document.getElementById("wpPlanEstimator");
  var output = document.getElementById("wpEstimatorResult");
  if (!form || !output) return;

  var cfg = window.WHATSAPP_PLATFORM_CONFIG || {};

  // Currency presentation. Rate numbers are loaded from the database (admin-managed)
  // and fall back to these defaults if the catalog cannot be fetched.
  var RATES = {
    INR: { symbol: "₹", locale: "en-IN", decimals: 0, rateDecimals: 2,
      marketing: 0.99, utility: 0.20, authentication: 0.20, service: 0 },
    USD: { symbol: "$", locale: "en-US", decimals: 2, rateDecimals: 4,
      marketing: 0.0120, utility: 0.0024, authentication: 0.0024, service: 0 }
  };
  // Plan tiers (label + monthly subscription) used for the calculator's plan line.
  var PLAN_TIERS = [
    { label: "Launch", INR: 999, USD: 12 },
    { label: "Growth", INR: 2999, USD: 36 },
    { label: "Enterprise", INR: 9999, USD: 120 }
  ];
  var CATS = [
    { key: "marketing", label: "Marketing" },
    { key: "utility", label: "Utility" },
    { key: "authentication", label: "Authentication" },
    { key: "service", label: "Service (user-initiated)" }
  ];
  var currency = "INR";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(name) {
    var el = form.elements[name];
    var v = el ? parseFloat(el.value) : 0;
    if (!isFinite(v) || v < 0) v = 0;
    return Math.floor(v);
  }
  function money(value, r, dec) {
    if (dec == null) dec = r.decimals;
    return r.symbol + new Intl.NumberFormat(r.locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(value);
  }
  function rate(value, r) { return money(value, r, r.rateDecimals); }
  function count(n, r) { return new Intl.NumberFormat(r.locale).format(n); }

  function planIndex(totalMessages, users, numbers) {
    var score = 0;
    score += users >= 40 ? 3 : users >= 15 ? 2 : users >= 5 ? 1 : 0;
    score += numbers >= 5 ? 2 : numbers >= 2 ? 1 : 0;
    score += totalMessages >= 250000 ? 3 : totalMessages >= 50000 ? 2 : totalMessages >= 10000 ? 1 : 0;
    var idx = score <= 2 ? 0 : score <= 5 ? 1 : 2;
    return Math.min(idx, PLAN_TIERS.length - 1);
  }

  function calculate() {
    var r = RATES[currency];
    var users = Number((form.elements.users || {}).value || 1);
    var numbers = Number((form.elements.numbers || {}).value || 1);

    var totalMessages = 0, metaCost = 0, lines = "";
    CATS.forEach(function (c) {
      var vol = num(c.key);
      totalMessages += vol;
      var unit = r[c.key] || 0;
      var sub = vol * unit;
      metaCost += sub;
      if (unit === 0) {
        lines += '<li class="free"><span>' + c.label + " · " + count(vol, r) + "</span><b>Free</b></li>";
      } else {
        lines += "<li><span>" + c.label + " · " + count(vol, r) + " × " + rate(unit, r) + "</span><b>" + money(sub, r) + "</b></li>";
      }
    });

    var tier = PLAN_TIERS[planIndex(totalMessages, users, numbers)] || PLAN_TIERS[0] || { label: "—", INR: 0, USD: 0 };
    var subscription = Number(tier[currency] || 0);
    lines += '<li class="sub"><span>Varada ' + esc(tier.label) + " plan · subscription</span><b>" + money(subscription, r) + "</b></li>";

    var total = metaCost + subscription;
    output.innerHTML =
      "<strong>Estimated monthly cost</strong>" +
      '<div class="wp-calc-total">' + money(total, r) + " <span>/ month</span></div>" +
      '<ul class="wp-calc-lines">' + lines + "</ul>" +
      '<div class="wp-calc-plan">Suggested plan: <b>' + esc(tier.label) + "</b> · " + count(totalMessages, r) + " messages / month</div>" +
      '<p class="wp-calc-fine">Per-message rates are what you pay Varada Nexus (inclusive of Meta&rsquo;s messaging charges); ' +
      "service and user-initiated messages are free. The plan line is a monthly subscription. Illustrative estimate, not a commercial quote.</p>";
  }

  function renderPlans(plans) {
    var grid = document.getElementById("wpPlanGrid");
    if (!grid || !plans || !plans.length) return;
    grid.innerHTML = plans.map(function (p) {
      var amount = new Intl.NumberFormat("en-IN").format(Number(p.priceMonthly || 0));
      var features = Array.isArray(p.features) ? p.features : [];
      return '<article class="wp-plan' + (p.isFeatured ? " featured" : "") + '">' +
        (p.badge ? '<span class="wp-popular">' + esc(p.badge) + "</span>" : "") +
        '<span class="wp-plan-label">' + esc(p.label) + "</span>" +
        "<h3>" + esc(p.name) + "</h3>" +
        '<div class="wp-price">' + esc(p.pricePrefix || "") + "₹" + amount + ' <small>' + esc(p.priceSuffix || "/mo") + "</small></div>" +
        (p.annualNote ? '<p class="wp-plan-annual">' + esc(p.annualNote) + "</p>" : "") +
        "<p>" + esc(p.tagline) + "</p>" +
        "<ul>" + features.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
        '<a href="' + esc(p.ctaHref || "#") + '">' + esc(p.ctaLabel || "Get started") + "</a>" +
        "</article>";
    }).join("");
  }

  function renderAddons(addons) {
    var grid = document.getElementById("wpAddonGrid");
    if (!grid || !addons || !addons.length) return;
    grid.innerHTML = addons.map(function (a) {
      return '<article class="wp-addon"><div><div class="wp-addon-head"><h3>' + esc(a.name) + "</h3>" +
        '<span class="wp-info" tabindex="0" role="note" aria-label="More about ' + esc(a.name) + '"><span class="wp-tip">' + esc(a.tooltip) + "</span></span></div>" +
        "<p>" + esc(a.description) + "</p></div>" +
        '<span class="wp-addon-price">' + esc(a.priceDisplay) + "<small>" + esc(a.priceUnit) + "</small></span></article>";
    }).join("");
  }

  function applyCatalog(catalog) {
    if (!catalog) return;
    if (catalog.rates && catalog.rates.INR) {
      RATES.INR = Object.assign({ symbol: "₹", locale: "en-IN", decimals: 0, rateDecimals: 2, service: 0 }, catalog.rates.INR);
    }
    if (catalog.rates && catalog.rates.USD) {
      RATES.USD = Object.assign({ symbol: "$", locale: "en-US", decimals: 2, rateDecimals: 4, service: 0 }, catalog.rates.USD);
    }
    if (Array.isArray(catalog.plans) && catalog.plans.length) {
      PLAN_TIERS = catalog.plans.map(function (p) {
        return { label: p.label, INR: Number(p.priceMonthly || 0), USD: Number(p.priceMonthlyUsd || 0) };
      });
      renderPlans(catalog.plans);
    }
    if (Array.isArray(catalog.addons) && catalog.addons.length) renderAddons(catalog.addons);
  }

  function fetchCatalog() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return Promise.resolve(null);
    return fetch(cfg.supabaseUrl + "/rest/v1/rpc/whatsapp_platform_public_catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey, Authorization: "Bearer " + cfg.supabaseAnonKey },
      body: "{}", cache: "no-store", referrerPolicy: "no-referrer"
    }).then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; });
  }

  // currency toggle + form events
  form.querySelectorAll(".wp-calc-currency button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      currency = btn.getAttribute("data-cur");
      form.querySelectorAll(".wp-calc-currency button").forEach(function (b) {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      calculate();
    });
  });
  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  form.addEventListener("submit", function (e) { e.preventDefault(); calculate(); });
  form.addEventListener("reset", function () {
    window.setTimeout(function () {
      currency = "INR";
      form.querySelectorAll(".wp-calc-currency button").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-cur") === "INR");
      });
      calculate();
    }, 0);
  });

  // Load DB catalog, then render + calculate (falls back to defaults on failure).
  fetchCatalog().then(function (catalog) { applyCatalog(catalog); calculate(); });
  calculate();
})();
