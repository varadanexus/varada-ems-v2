/* Varada Nexus — public site interactions */
(function () {
  "use strict";

  /* nav scroll state */
  var nav = document.querySelector(".site-nav");
  function onScroll() {
    if (!nav) return;
    if (window.scrollY > 12) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* inject Blog nav link on pages that don't already have it */
  (function () {
    var links = document.querySelector(".nav-links");
    if (!links || links.querySelector('a[href="/blog/"]')) return;
    var blog = document.createElement("a");
    blog.href = "/blog/";
    blog.textContent = "Blog";
    var team = links.querySelector('a[href="/team.html"]');
    var contact = links.querySelector('a[href="/contact.html"]');
    if (team && team.parentNode === links) links.insertBefore(blog, team.nextSibling);
    else if (contact) links.insertBefore(blog, contact);
    else links.appendChild(blog);
  })();

  /* mobile menu */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      document.body.classList.toggle("menu-open");
    });
    document.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        document.body.classList.remove("menu-open");
      });
    });
  }

  /* scroll reveal */
  var revealed = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealed.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add("in"); });
  }

  /* animated counters — <span class="num" data-count="55" data-suffix="+"> */
  var counters = document.querySelectorAll("[data-count]");
  if (counters.length && "IntersectionObserver" in window) {
    var cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          cio.unobserve(e.target);
          animateCount(e.target);
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (el) { cio.observe(el); });
  }
  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-count"), 10) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1600;
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* card pointer glow */
  document.querySelectorAll(".card, .step").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  });

  /* team modal */
  window.openModal = function (name, role, desc, img, initials) {
    var modal = document.getElementById("modal");
    if (!modal) return;
    document.getElementById("m-name").textContent = name || "";
    document.getElementById("m-role").textContent = role || "";
    document.getElementById("m-desc").textContent = desc || "";
    var avatar = document.getElementById("m-img");
    if (avatar) {
      if (img) {
        avatar.innerHTML =
          '<img src="' + img + '" alt="' + (name || "") + '" onerror="this.parentElement.innerHTML=\'' + (initials || "") + "'\">";
      } else {
        avatar.textContent = initials || "";
      }
    }
    modal.classList.add("open");
    document.body.classList.add("modal-open");
  };
  window.closeModal = function () {
    var modal = document.getElementById("modal");
    if (!modal) return;
    modal.classList.remove("open");
    document.body.classList.remove("modal-open");
  };
  var modal = document.getElementById("modal");
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) window.closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") window.closeModal();
    });
  }

  /* footer year */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* scroll-progress bar */
  var progress = document.createElement("div");
  progress.className = "scroll-progress";
  document.body.appendChild(progress);
  function onProgress() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    var pct = max > 0 ? (h.scrollTop || window.scrollY) / max : 0;
    progress.style.width = (pct * 100).toFixed(2) + "%";
  }
  window.addEventListener("scroll", onProgress, { passive: true });
  onProgress();

  if (finePointer && !reduceMotion) {
    /* hero cursor spotlight */
    var hero = document.querySelector(".hero");
    if (hero) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        hero.style.setProperty("--hx", ((e.clientX - r.left) / r.width) * 100 + "%");
        hero.style.setProperty("--hy", ((e.clientY - r.top) / r.height) * 100 + "%");
        hero.classList.add("spot");
      });
      hero.addEventListener("pointerleave", function () { hero.classList.remove("spot"); });
    }

    /* magnetic buttons */
    document.querySelectorAll(".btn-primary, .btn-accent").forEach(function (b) {
      b.classList.add("magnetic");
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        b.style.transform = "translate(" + mx * 0.22 + "px," + my * 0.3 + "px)";
      });
      b.addEventListener("pointerleave", function () { b.style.transform = ""; });
    });
  }

  /* custom themed chat launcher (Tawk.to) */
  function initChatLauncher() {
    if (document.querySelector(".vx-chat-wrap")) return;
    var found = !!document.querySelector('script[src*="tawk.to"]');
    if (!found) {
      var sc = document.getElementsByTagName("script");
      for (var i = 0; i < sc.length; i++) {
        if ((sc[i].textContent || "").indexOf("tawk.to") > -1) { found = true; break; }
      }
    }
    if (!found && !window.Tawk_API) return;
    window.Tawk_API = window.Tawk_API || {};

    var wrap = document.createElement("div");
    wrap.className = "vx-chat-wrap";

    var tip = document.createElement("span");
    tip.className = "vx-chat-tip";
    tip.textContent = "Chat with us";

    var btn = document.createElement("button");
    btn.className = "vx-chat";
    btn.type = "button";
    btn.setAttribute("aria-label", "Chat with Varada Nexus");
    btn.innerHTML =
      '<span class="vx-dot" aria-hidden="true"></span>' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 3C6.99 3 3 6.29 3 10.4c0 2.3 1.27 4.35 3.29 5.7-.11.85-.49 2-1.44 3.06-.22.24-.05.62.28.57 1.58-.23 3.16-.85 4.35-1.64.78.2 1.62.3 2.52.3 5.01 0 9-3.29 9-7.99S17.01 3 12 3z"/>' +
      '<circle cx="8.4" cy="10.4" r="1.15" fill="#f6e6ad"/>' +
      '<circle cx="12" cy="10.4" r="1.15" fill="#f6e6ad"/>' +
      '<circle cx="15.6" cy="10.4" r="1.15" fill="#f6e6ad"/></svg>';

    wrap.appendChild(tip);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);

    /* show our button immediately so the default Tawk icon never flashes */
    wrap.classList.add("ready");

    var pendingOpen = false;
    function hideDefault() { try { Tawk_API.hideWidget(); } catch (e) {} }
    function loaded() {
      hideDefault();
      if (pendingOpen) { try { Tawk_API.maximize(); } catch (e) {} pendingOpen = false; }
    }
    if (typeof Tawk_API.getStatus === "function") hideDefault();
    Tawk_API.onLoad = loaded;
    Tawk_API.onChatMaximized = function () {
      wrap.classList.add("hidden");
      document.body.classList.add("vx-chat-open");
    };
    Tawk_API.onChatMinimized = function () {
      wrap.classList.remove("hidden", "has-unread");
      btn.classList.remove("has-unread");
      document.body.classList.remove("vx-chat-open");
      hideDefault();
    };
    Tawk_API.onChatHidden = function () {
      wrap.classList.remove("hidden");
      document.body.classList.remove("vx-chat-open");
    };
    Tawk_API.onUnreadCountChanged = function (c) {
      btn.classList.toggle("has-unread", !!c && c > 0);
    };

    btn.addEventListener("click", function () {
      btn.classList.remove("has-unread");
      document.body.classList.add("vx-chat-open");
      if (typeof Tawk_API.maximize === "function") {
        try { Tawk_API.maximize(); } catch (e) {}
      } else {
        pendingOpen = true;
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChatLauncher);
  } else {
    initChatLauncher();
  }
  window.addEventListener("load", initChatLauncher);
})();
