/* Varada Nexus — public site interactions */
(function () {
  "use strict";

  /* nav scroll state */
  var nav = document.querySelector(".site-nav");

  /* The primary access action is Login. Meeting access remains available
     from the login screen, so do not repeat it in the global navigation. */
  document.querySelectorAll(".nav-links").forEach(function (links) {
    var cta = links.querySelector(".nav-cta");
    if (!cta) return;
    var standardLogin = Array.prototype.find.call(links.querySelectorAll("a"), function (link) {
      return link !== cta && link.textContent.trim().toLowerCase() === "login";
    });
    if (standardLogin) standardLogin.remove();
    cta.href = "/login.html";
    cta.textContent = "Login";
    cta.setAttribute("aria-label", "Login");
    if (location.pathname === "/login.html") cta.classList.add("active");
  });
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

  /* Keep the service menu aligned with the expanded nine-service catalogue. */
  document.querySelectorAll(".nav-drop").forEach(function (drop) {
    drop.innerHTML =
      '<a href="/hospital.html">Hospital Construction</a>' +
      '<a href="/consultancy.html">Hospital Consultancy</a>' +
      '<a href="/hr.html">HR</a>' +
      '<a href="/pr.html">PR</a>' +
      '<a href="/import-export.html">Import &amp; Export</a>' +
      '<a href="/mining.html">Mining</a>' +
      '<a href="/logistics.html">Logistics</a>' +
      '<a href="/ecommerce.html">E-Commerce</a>' +
      '<a href="/arbitrage.html">Strategic Arbitrage</a>' +
      '<a href="/services.html" class="nav-drop-all">All Services &rarr;</a>';
  });

  /* inject Professional Tools nav link on pages that don't already have it */
  (function () {
    var links = document.querySelector(".nav-links");
    if (!links || links.querySelector('a[href="/professional-tools/"]')) return;
    var tools = document.createElement("a");
    tools.href = "/professional-tools/";
    tools.textContent = "Professional Tools";
    /* active state when browsing the tools platform */
    if (location.pathname.indexOf("/professional-tools") === 0) tools.className = "active";
    var blog = links.querySelector('a[href="/blog/"]');
    var contact = links.querySelector('a[href="/contact.html"]');
    if (blog && blog.parentNode === links) links.insertBefore(tools, blog.nextSibling);
    else if (contact) links.insertBefore(tools, contact);
    else links.appendChild(tools);
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

  /* resilient scroll reveal: above-fold items are visible on the first frame */
  var revealed = document.querySelectorAll(".reveal, [data-rv]");
  function revealNow(el) { el.classList.add("in"); }
  if ("IntersectionObserver" in window && revealed.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        revealNow(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    revealed.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) revealNow(el);
      else io.observe(el);
    });
    /* Safety fallback only reveals elements that are actually near the viewport.
       Off-screen sections retain their entrance motion until the user reaches them. */
    function revealVisible() {
      revealed.forEach(function (el) {
        if (el.classList.contains("in")) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.06 && r.bottom > -window.innerHeight * 0.06) revealNow(el);
      });
    }
    window.addEventListener("scroll", revealVisible, { passive: true });
    window.addEventListener("resize", revealVisible, { passive: true });
    window.addEventListener("load", revealVisible);
  } else {
    revealed.forEach(revealNow);
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

  /* Obsidian Aurum page enhancement layer — content and links remain untouched */
  var isHome = /(?:^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
  if (isHome) document.body.classList.add("home");
  var isFounder = /(?:^|\/)founder\.html$/.test(location.pathname);
  if (isFounder) {
    document.body.classList.add("founder-page");

    var founderPortrait = document.querySelector(".founder-hero .founder-portrait");
    if (founderPortrait) {
      var repeatedCaption = founderPortrait.querySelector(".founder-portrait-caption");
      if (repeatedCaption) repeatedCaption.remove();
      founderPortrait.setAttribute("data-plx", "-0.13");
    }

    var founderHero = document.querySelector(".founder-hero");
    if (founderHero) {
      founderHero.querySelectorAll(".founder-orbit").forEach(function (orbit) { orbit.remove(); });
      if (!founderHero.querySelector(".founder-bg")) {
        var founderBg = document.createElement("div");
        founderBg.className = "founder-bg";
        founderBg.setAttribute("aria-hidden", "true");
        founderBg.innerHTML = '<img src="/images/founder-boardroom.png" alt="">';
        founderHero.insertBefore(founderBg, founderHero.firstChild);
      }
      var founderDepths = [
        [".eyebrow", "0.06"],
        [".display", "0.10"],
        [".sub", "0.14"],
        [".hero-actions", "0.18"]
      ];
      founderDepths.forEach(function (item) {
        var target = founderHero.querySelector(item[0]);
        if (target) target.setAttribute("data-plx", item[1]);
      });
    }

    var founderMessage = document.getElementById("message");
    if (founderMessage) {
      founderMessage.classList.add("founder-message");
      var messageWrap = founderMessage.querySelector(".wrap-narrow");
      if (messageWrap && !messageWrap.querySelector(".founder-message-heading")) {
        var messageHeading = document.createElement("div");
        messageHeading.className = "founder-message-heading";
        var messageCopy = document.createElement("div");
        messageCopy.className = "founder-message-copy";
        var messageEyebrow = messageWrap.querySelector(":scope > .eyebrow");
        var messageTitle = messageWrap.querySelector(":scope > .headline");
        if (messageEyebrow) messageHeading.appendChild(messageEyebrow);
        if (messageTitle) messageHeading.appendChild(messageTitle);
        Array.prototype.slice.call(messageWrap.querySelectorAll(":scope > .lede")).forEach(function (p) { messageCopy.appendChild(p); });
        messageWrap.insertBefore(messageHeading, messageWrap.firstChild);
        messageWrap.insertBefore(messageCopy, messageHeading.nextSibling);
      }
    }

    document.querySelectorAll("main > .section").forEach(function (section) {
      var label = section.querySelector(".eyebrow");
      var textLabel = label ? label.textContent.trim() : "";
      if (textLabel === "Execution Philosophy") section.classList.add("founder-pillars");
      if (textLabel === "Operational Scale") section.classList.add("founder-scale");
      if (textLabel === "Growth Journey") {
        section.classList.add("founder-journey");
        var journeyList = section.querySelector(".checklist");
        if (journeyList) journeyList.classList.add("founder-timeline");
      }
      if (textLabel === "Vision") section.classList.add("founder-vision");
    });

    /* Founder narrative motion: each content group enters independently. */
    var founderMotion = document.querySelectorAll(
      ".founder-message-heading, .founder-message-copy, .founder-message .quote, " +
      ".founder-pillars .panel, .founder-scale .section-head, .founder-scale .card, " +
      ".founder-journey .eyebrow, .founder-journey .headline, .founder-timeline li, " +
      ".founder-vision .panel, .founder-page .cta-band > *"
    );
    founderMotion.forEach(function (el, index) {
      el.classList.add("founder-motion");
      el.classList.remove("in");
      el.style.setProperty("--founder-delay", (index % 4) * 90 + "ms");
    });
    function revealFounderVisible() {
      founderMotion.forEach(function (el) {
        if (el.classList.contains("founder-motion-in")) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.94 && r.bottom > 0) el.classList.add("founder-motion-in", "in");
      });
    }
    if (!reduceMotion && "IntersectionObserver" in window) {
      var founderIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("founder-motion-in", "in");
          founderIo.unobserve(entry.target);
        });
      }, { threshold: 0.13, rootMargin: "0px 0px -7% 0px" });
      founderMotion.forEach(function (el) { founderIo.observe(el); });
      window.addEventListener("scroll", revealFounderVisible, { passive: true });
      window.addEventListener("resize", revealFounderVisible, { passive: true });
      requestAnimationFrame(revealFounderVisible);
    } else {
      founderMotion.forEach(function (el) { el.classList.add("founder-motion-in", "in"); });
    }
  }

  /* Services: visual service catalogue with layered motion */
  var isServices = /(?:^|\/)services\.html$/.test(location.pathname);
  if (isServices) {
    document.body.classList.add("services-page");
    var servicesHero = document.querySelector(".page-hero");
    if (servicesHero && !servicesHero.querySelector(".services-hero-bg")) {
      var servicesBg = document.createElement("div");
      servicesBg.className = "services-hero-bg";
      servicesBg.setAttribute("aria-hidden", "true");
      servicesBg.innerHTML = '<img src="/images/services-city.png" alt="">';
      servicesHero.insertBefore(servicesBg, servicesHero.firstChild);
      if (!servicesHero.querySelector(".services-hero-copy")) {
        var servicesCopy = document.createElement("div");
        servicesCopy.className = "services-hero-copy";
        [".eyebrow", ".display", ".sub"].forEach(function (selector) {
          var copyItem = servicesHero.querySelector(selector);
          if (copyItem) servicesCopy.appendChild(copyItem);
        });
        servicesHero.appendChild(servicesCopy);
      }
      [".eyebrow", ".display", ".sub"].forEach(function (selector, i) {
        var item = servicesHero.querySelector(selector);
        if (item) item.setAttribute("data-plx", ["0.06", "0.11", "0.15"][i]);
      });
    }
    var serviceImages = {
      "/hospital.html":"/images/service-hospital.png",
      "/consultancy.html":"/images/service-consultancy.png",
      "/hr.html":"/images/service-hr.png",
      "/pr.html":"/images/service-pr.png",
      "/import-export.html":"/images/service-trade.png",
      "/mining.html":"/images/service-mining.png",
      "/logistics.html":"/images/service-logistics.png",
      "/ecommerce.html":"/images/service-ecommerce.png",
      "/arbitrage.html":"/images/service-arbitrage.png"
    };
    document.querySelectorAll(".services-page .card[href]").forEach(function (card, index) {
      card.classList.add("service-catalogue-card");
      card.style.setProperty("--service-delay", (index % 3) * 110 + "ms");
      if (!card.querySelector(".service-card-media")) {
        var media = document.createElement("span");
        media.className = "service-card-media";
        media.setAttribute("aria-hidden", "true");
        media.innerHTML = '<img src="' + (serviceImages[card.getAttribute("href")] || "/images/services-city.png") + '" alt="">';
        card.insertBefore(media, card.firstChild);
      }
    });
    var servicesHeroMedia = document.querySelector(".services-page .hero-media .frame img");
    if (servicesHeroMedia) { servicesHeroMedia.src = "/images/services-city.png"; servicesHeroMedia.alt = "Connected business districts at night"; }
  }

  /* Detail service pages: image-led cinematic hero with shared parallax language. */
  var serviceDetailImages = {
    "/hospital.html":"/images/service-hospital.png",
    "/consultancy.html":"/images/service-consultancy.png",
    "/hr.html":"/images/service-hr.png",
    "/pr.html":"/images/service-pr.png",
    "/import-export.html":"/images/service-trade.png",
    "/mining.html":"/images/service-mining.png",
    "/logistics.html":"/images/service-logistics.png",
    "/ecommerce.html":"/images/service-ecommerce.png",
    "/arbitrage.html":"/images/service-arbitrage.png"
  };
  var detailImage = serviceDetailImages[location.pathname];
  if (detailImage) {
    document.body.classList.add("service-detail-page");
    var detailHero = document.querySelector(".page-hero");
    if (detailHero && !detailHero.querySelector(".detail-hero-bg")) {
      var detailBg = document.createElement("div");
      detailBg.className = "detail-hero-bg";
      detailBg.setAttribute("aria-hidden", "true");
      detailBg.innerHTML = '<img src="' + detailImage + '" alt="">';
      detailHero.insertBefore(detailBg, detailHero.firstChild);
      [".eyebrow", ".display", ".sub", ".hero-actions", ".chip"].forEach(function (selector, index) {
        var detailItem = detailHero.querySelector(selector);
        if (detailItem) detailItem.setAttribute("data-plx", ["0.05", "0.10", "0.14", "0.18", "0.08"][index]);
      });
      var inlineHero = detailHero.nextElementSibling;
      if (inlineHero && inlineHero.classList.contains("hero-media")) inlineHero.classList.add("detail-hero-media");
    }
  }

  /* Team page editorial cleanup. */
  var isTeam = /(?:^|\/)team\.html$/.test(location.pathname);
  if (isTeam) {
    document.body.classList.add("team-page");
    var org = document.querySelector(".org");
    if (org) {
      var teamIntro = org.parentElement.querySelector(".section-head");
      if (teamIntro) teamIntro.classList.add("team-org-intro-hidden");
      org.querySelectorAll(".card").forEach(function (card, i) {
        card.removeAttribute("data-index");
        card.setAttribute("data-plx", i % 2 ? "0.05" : "-0.04");
      });
    }
  }

  var isProfessionalTools = location.pathname.indexOf("/professional-tools/") === 0;
  document.querySelectorAll(".card").forEach(function (card, index) {
    if (isProfessionalTools) {
      card.removeAttribute("data-index");
      card.setAttribute("data-rv", "");
      return;
    }
    var group = card.parentElement;
    var peers = group ? Array.prototype.filter.call(group.children, function (child) {
      return child.classList && child.classList.contains("card");
    }) : [];
    var localIndex = Math.max(0, peers.indexOf(card)) + 1;
    card.setAttribute("data-index", (localIndex < 10 ? "0" : "") + localIndex);
    card.setAttribute("data-rv", "");
    if (!card.classList.contains("reveal")) card.classList.add("in");
  });

  /* Professional Tools: fast client-side lookup against the published tools index. */
  var toolSearch = document.getElementById("tool-search");
  if (toolSearch) {
    var toolSearchInput = toolSearch.querySelector("input");
    var toolSearchResults = toolSearch.querySelector(".vt-tool-search-results");
    var toolIndex = [];
    fetch("/professional-tools/tools-index.json").then(function (res) { return res.ok ? res.json() : []; }).then(function (items) {
      toolIndex = Array.isArray(items) ? items : [];
    }).catch(function () { toolIndex = []; });
    function clearToolResults() { toolSearchResults.innerHTML = ""; toolSearchResults.hidden = true; }
    function showToolResults(term) {
      var query = term.trim().toLowerCase();
      if (!query || !toolIndex.length) { clearToolResults(); return []; }
      var matches = toolIndex.filter(function (tool) {
        return (tool.name + " " + tool.kw + " " + tool.cat).toLowerCase().indexOf(query) > -1;
      }).slice(0, 6);
      toolSearchResults.innerHTML = "";
      matches.forEach(function (tool) {
        var link = document.createElement("a");
        link.href = tool.url; link.textContent = tool.name;
        toolSearchResults.appendChild(link);
      });
      toolSearchResults.hidden = !matches.length;
      return matches;
    }
    toolSearchInput.addEventListener("input", function () { showToolResults(toolSearchInput.value); });
    toolSearch.addEventListener("submit", function (event) {
      event.preventDefault();
      var matches = showToolResults(toolSearchInput.value);
      if (matches.length) location.href = matches[0].url;
    });
    toolSearchInput.addEventListener("keydown", function (event) { if (event.key === "Escape") clearToolResults(); });
  }

  /* Full-viewport home image, decorative ring, and scroll cue */
  var homeHero = isHome && document.querySelector(".hero");
  var homeMediaImage = document.querySelector(".hero-media img");
  if (homeHero && homeMediaImage) {
    var bg = document.createElement("div");
    bg.className = "hero-bg";
    var bgImage = homeMediaImage.cloneNode(true);
    bgImage.alt = "";
    bgImage.removeAttribute("loading");
    bg.appendChild(bgImage);
    homeHero.insertBefore(bg, homeHero.firstChild);

    var ring = document.createElement("span");
    ring.className = "hero-ornament";
    ring.setAttribute("aria-hidden", "true");
    ring.setAttribute("data-plx", "-0.12");
    homeHero.appendChild(ring);

    var hint = document.createElement("span");
    hint.className = "scroll-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "Scroll to discover";
    homeHero.appendChild(hint);
  }

  /* Sticky value-chain narrative */
  document.querySelectorAll(".section").forEach(function (section) {
    var eyebrow = section.querySelector(".section-head .eyebrow");
    if (eyebrow && /End-to-End Value Chain/i.test(eyebrow.textContent)) section.classList.add("story-section");
  });

  /* Masked image reveals */
  var imageMasks = document.querySelectorAll(".frame, .founder-portrait, .team-photo, .service-image");
  imageMasks.forEach(function (el, index) {
    el.classList.add("image-reveal");
    el.style.transitionDelay = Math.min(index % 4, 3) * 110 + "ms";
  });
  if (!reduceMotion && "IntersectionObserver" in window) {
    var imageIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        imageIo.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    imageMasks.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add("in");
      else imageIo.observe(el);
    });
    function revealVisibleImages() {
      imageMasks.forEach(function (el) {
        if (el.classList.contains("in")) return;
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight * 1.06 && r.bottom > -innerHeight * 0.06) el.classList.add("in");
      });
    }
    window.addEventListener("scroll", revealVisibleImages, { passive: true });
    window.addEventListener("resize", revealVisibleImages, { passive: true });
    window.addEventListener("load", revealVisibleImages);
  } else {
    imageMasks.forEach(function (el) { el.classList.add("in"); });
  }

  /* Layered rAF parallax */
  var plxTargets = [];
  if (!reduceMotion) {
    var depthMap = ["0.06", "0.10", "0.14", "0.18"];
    document.querySelectorAll(".hero > .eyebrow, .hero > .display, .hero > .sub, .hero > .hero-actions, .founder-portrait").forEach(function (el, i) {
      if (!el.hasAttribute("data-plx")) el.setAttribute("data-plx", depthMap[i % depthMap.length]);
    });
    plxTargets = Array.prototype.slice.call(document.querySelectorAll("[data-plx]"));
    var plxTicking = false;
    function paintParallax() {
      var vh = Math.max(document.documentElement.clientHeight, 1);
      plxTargets.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var centered = ((r.top + r.height / 2) - vh / 2) / vh;
        var y = centered * parseFloat(el.getAttribute("data-plx") || 0) * 160;
        el.style.setProperty("--plx-y", y.toFixed(2) + "px");
      });
      plxTicking = false;
    }
    function queueParallax() {
      if (plxTicking) return;
      plxTicking = true;
      requestAnimationFrame(paintParallax);
    }
    window.addEventListener("scroll", queueParallax, { passive: true });
    window.addEventListener("resize", queueParallax, { passive: true });
    queueParallax();
  }

  /* restrained 3D card tilt */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".card, .step, .stat").forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        var r = card.getBoundingClientRect();
        var x = (event.clientX - r.left) / r.width - 0.5;
        var y = (event.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(900px) rotateX(" + (-y * 10).toFixed(2) + "deg) rotateY(" + (x * 10).toFixed(2) + "deg) translateY(-4px)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transition = "transform .65s cubic-bezier(.22,.61,.14,1), border-color .4s, box-shadow .4s";
        card.style.transform = "";
        window.setTimeout(function () { card.style.transition = ""; }, 680);
      });
    });
  }

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
      /* Authentication actions must stay stationary while their label changes
         (for example, "Signing in…"). A magnetic offset can otherwise remain
         visible after the click and make the submit control look misaligned. */
      if (b.closest(".auth-card")) return;
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
