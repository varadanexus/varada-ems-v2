(function () {
  "use strict";
  var form = document.getElementById("wpPlanEstimator");
  var output = document.getElementById("wpEstimatorResult");
  if (!form || !output) return;

  /* ------------------------------------------------------------------
   * EDITABLE RATE TABLE
   * Illustrative estimate only, modelled on published WhatsApp Business
   * Platform pricing (per-message categories) plus a per-message platform
   * fee (Twilio-style). Service / user-initiated messages are free.
   * Adjust these numbers to match your own contracted rates.
   * ------------------------------------------------------------------ */
  // Per-message rates the CUSTOMER pays Varada Nexus (inclusive of Meta charges).
  var RATES = {
    INR: { symbol: "₹", locale: "en-IN", decimals: 0, rateDecimals: 2,
      marketing: 0.99, utility: 0.20, authentication: 0.20, service: 0 },
    USD: { symbol: "$", locale: "en-US", decimals: 2, rateDecimals: 4,
      marketing: 0.0120, utility: 0.0024, authentication: 0.0024, service: 0 }
  };
  // Monthly platform subscription per plan (your recurring SaaS fee).
  var PLANS = {
    Launch: { INR: 999, USD: 12 },
    Growth: { INR: 2999, USD: 36 },
    Enterprise: { INR: 9999, USD: 120 }
  };
  var CATS = [
    { key: "marketing", label: "Marketing" },
    { key: "utility", label: "Utility" },
    { key: "authentication", label: "Authentication" },
    { key: "service", label: "Service (user-initiated)" }
  ];

  var currency = "INR";

  function num(name) {
    var el = form.elements[name];
    var v = el ? parseFloat(el.value) : 0;
    if (!isFinite(v) || v < 0) v = 0;
    return Math.floor(v);
  }
  function money(value, r, dec) {
    if (dec == null) dec = r.decimals;
    var s = new Intl.NumberFormat(r.locale, {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    }).format(value);
    return r.symbol + s;
  }
  function rate(value, r) { return money(value, r, r.rateDecimals); }
  function count(n, r) { return new Intl.NumberFormat(r.locale).format(n); }

  function suggestPlan(totalMessages, users, numbers) {
    var score = 0;
    score += users >= 40 ? 3 : users >= 15 ? 2 : users >= 5 ? 1 : 0;
    score += numbers >= 5 ? 2 : numbers >= 2 ? 1 : 0;
    score += totalMessages >= 250000 ? 3 : totalMessages >= 50000 ? 2 : totalMessages >= 10000 ? 1 : 0;
    return score <= 2 ? "Launch" : score <= 5 ? "Growth" : "Enterprise";
  }

  function calculate() {
    var r = RATES[currency];
    var users = Number((form.elements.users || {}).value || 1);
    var numbers = Number((form.elements.numbers || {}).value || 1);

    var totalMessages = 0, metaCost = 0, lines = "";
    CATS.forEach(function (c) {
      var vol = num(c.key);
      totalMessages += vol;
      var unit = r[c.key];
      var sub = vol * unit;
      metaCost += sub;
      if (unit === 0) {
        lines += '<li class="free"><span>' + c.label + " · " + count(vol, r) +
          "</span><b>Free</b></li>";
      } else {
        lines += "<li><span>" + c.label + " · " + count(vol, r) + " × " +
          rate(unit, r) + "</span><b>" + money(sub, r) + "</b></li>";
      }
    });

    var plan = suggestPlan(totalMessages, users, numbers);
    var subscription = (PLANS[plan] || PLANS.Launch)[currency];
    lines += '<li class="sub"><span>Varada ' + plan + " plan · subscription</span><b>" +
      money(subscription, r) + "</b></li>";

    var total = metaCost + subscription;

    output.innerHTML =
      "<strong>Estimated monthly cost</strong>" +
      '<div class="wp-calc-total">' + money(total, r) + " <span>/ month</span></div>" +
      '<ul class="wp-calc-lines">' + lines + "</ul>" +
      '<div class="wp-calc-plan">Suggested plan: <b>' + plan + "</b> · " +
      count(totalMessages, r) + " messages / month</div>" +
      '<p class="wp-calc-fine">Per-message rates are what you pay Varada Nexus (inclusive of Meta&rsquo;s messaging charges); ' +
      "service and user-initiated messages are free. The plan line is a monthly subscription. " +
      "Illustrative estimate, not a commercial quote.</p>";
  }

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

  calculate();
})();
