import { STORAGE_KEYS } from "../config/constants.js";

export function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, safeTheme);
}

export function initTheme() {
  const stored = localStorage.getItem(STORAGE_KEYS.THEME) || "light";
  applyTheme(stored);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
}
