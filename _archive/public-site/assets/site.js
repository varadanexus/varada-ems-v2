document.addEventListener("DOMContentLoaded", () => {
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const target = link.getAttribute("href")?.replace(/\/+$/, "") || "/";
    if (target === currentPath) link.classList.add("is-active");
  });
});
