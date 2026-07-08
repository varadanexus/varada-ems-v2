
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // preloader
  window.addEventListener("load", function () {
    setTimeout(function () { document.getElementById("loader").classList.add("done"); }, reduced ? 0 : 550);
  });

  // nav state
  var nav = document.getElementById("nav");
  addEventListener("scroll", function () {
    nav.classList.toggle("scrolled", scrollY > 24);
  }, { passive: true });

  // duplicate marquee content for a seamless loop
  var mq = document.getElementById("marquee");
  if (mq) mq.innerHTML += mq.innerHTML;

  // scroll reveals
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".rv").forEach(function (el) { io.observe(el); });

  // animated counters
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      cio.unobserve(e.target);
      var el = e.target, target = parseInt(el.dataset.count, 10), suffix = el.dataset.suffix || "";
      if (reduced) { el.textContent = target + suffix; return; }
      var start = null;
      function tick(t) {
        if (!start) start = t;
        var p = Math.min((t - start) / 1600, 1);
        p = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * p) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach(function (el) { cio.observe(el); });

  // hero starfield with gentle parallax
  var canvas = document.getElementById("stars");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var stars = [], mx = 0, my = 0, W, H;
  function resize() {
    W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    stars = Array.from({ length: Math.min(160, (W * H) / 22000) }, function () {
      return {
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.6 + 0.3, z: Math.random() * 0.7 + 0.3,
        tw: Math.random() * Math.PI * 2
      };
    });
  }
  resize();
  addEventListener("resize", resize);
  addEventListener("mousemove", function (e) {
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  (function draw(t) {
    if (reduced) return;
    ctx.clearRect(0, 0, W, H);
    stars.forEach(function (s) {
      var a = 0.25 + 0.55 * Math.abs(Math.sin(t / 1400 + s.tw));
      ctx.beginPath();
      ctx.arc(s.x + mx * 18 * s.z * devicePixelRatio, s.y + my * 12 * s.z * devicePixelRatio, s.r * devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = s.z > 0.72 ? "rgba(212,178,106," + a * 0.9 + ")" : "rgba(174,193,220," + a * 0.5 + ")";
      ctx.fill();
    });
    requestAnimationFrame(draw);
  })(0);
})();
