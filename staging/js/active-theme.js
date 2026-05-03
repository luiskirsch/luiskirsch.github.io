// Reads `config/activeTheme` from Firestore in REAL-TIME via onSnapshot and
// pushes the resolved theme id to the theme-loader. Runs after theme-loader.js
// so the cached/default theme is already painted; subsequent updates from the
// admin propagate within <1s to every connected client.

import { db } from "./firebase-app.js";
import {
  doc,
  onSnapshot,
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

// Real-time listener. Cada save no admin propaga em <1s para todas as abas/
// dispositivos conectados — sem precisar recarregar.
console.info("[osl-active-theme] subscribing to config/activeTheme via onSnapshot");
let _lastBroadcast = null;
onSnapshot(
  doc(db, "config", "activeTheme"),
  (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const themeId = data ? resolveThemeId(data) : "default";
    console.info("[osl-active-theme] snapshot:", { exists: snap.exists(), data, resolved: themeId, _lastBroadcast });
    if (themeId === _lastBroadcast) return;
    _lastBroadcast = themeId;
    try { localStorage.setItem(CACHE_KEY, themeId); } catch (e) { /* ignore */ }
    broadcast(themeId);
  },
  (err) => {
    // Firestore unreachable, rules denied, etc. Fail silently — cached/default
    // is already on screen.
    console.warn("[osl-active-theme] error:", err.code || err.message, err);
    if (_lastBroadcast === null) broadcast("default", err);
  }
);
