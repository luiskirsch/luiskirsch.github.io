// Reads `config/activeTheme` from Firestore and pushes the resolved theme id
// to the theme-loader. Runs after theme-loader.js so the cached/default theme
// is already painted; this only swaps in the *fresh* server-side decision.

import { db } from "./firebase-app.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const CACHE_KEY = "osl_active_theme_cached";
const ENV =
  window.location.pathname.indexOf("/staging/") === 0 ? "staging" : "production";

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function resolveThemeId(data) {
  if (!data) return "default";

  // Two supported shapes:
  //   1) Flat doc: { themeId, activeFrom, activeUntil, fallbackThemeId }
  //   2) Sub-doc per env: { staging: {...}, production: {...} }
  const cfg = data[ENV] && typeof data[ENV] === "object" ? data[ENV] : data;

  const themeId = cfg.themeId || "default";
  const fallback = cfg.fallbackThemeId || "default";
  const now = Date.now();

  const fromMs = toMillis(cfg.activeFrom);
  let untilMs = toMillis(cfg.activeUntil);
  // If activeUntil is a date-only string, include the entire day
  if (untilMs && typeof cfg.activeUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cfg.activeUntil)) {
    untilMs += 24 * 60 * 60 * 1000 - 1;
  }

  if (fromMs && now < fromMs) return fallback;
  if (untilMs && now > untilMs) return fallback;

  return themeId;
}

function broadcast(themeId, error) {
  window.OSL_ACTIVE_THEME = themeId;
  try {
    if (typeof window.OSL_applyActiveTheme === "function") {
      window.OSL_applyActiveTheme(themeId);
    }
  } catch (e) { /* swallow */ }
  try {
    window.dispatchEvent(
      new CustomEvent("osl-active-theme-resolved", { detail: { themeId, error } })
    );
  } catch (e) { /* swallow */ }
}

(async function () {
  try {
    const snap = await getDoc(doc(db, "config", "activeTheme"));
    if (!snap.exists()) {
      broadcast("default");
      return;
    }
    const themeId = resolveThemeId(snap.data());
    try { localStorage.setItem(CACHE_KEY, themeId); } catch (e) { /* ignore */ }
    broadcast(themeId);
  } catch (err) {
    // Firestore unreachable, rules denied, etc. Fail silently — cached/default
    // is already on screen.
    console.warn("[osl-active-theme]", err);
    broadcast("default", err);
  }
})();
