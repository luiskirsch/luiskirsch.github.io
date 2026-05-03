// Reads `config/activeTheme` from Firestore in REAL-TIME via onSnapshot and
// pushes the resolved theme id to the theme-loader. Standalone (não depende
// de outros módulos) — inicializa um Firebase app dedicado pra leitura do
// doc de tema no projeto sextolugar-staging (ondeo admin-theme.html grava).
//
// Por que sextolugar-staging em prod: o doc activeTheme é compartilhado
// entre staging e prod (mesma fonte de verdade). Admin grava lá, todos
// leem dali. Read-only via API key pública (regras Firestore permitem).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const themeFirebaseConfig = {
  apiKey: "AIzaSyAflOnCIpF6NYCxdd23XSZTLK2V54XLGFU",
  authDomain: "sextolugar-staging.firebaseapp.com",
  projectId: "sextolugar-staging",
  storageBucket: "sextolugar-staging.firebasestorage.app",
  messagingSenderId: "407627003441",
  appId: "1:407627003441:web:c501d2d46f04f40cd7c710"
};

// Inicializa app com nome dedicado para não conflitar com Firebase principal
// que pages como sala.html já usam (project diferente: osextolugar-game).
const THEME_APP_NAME = "osl-theme-reader";
const themeApp = getApps().some(a => a.name === THEME_APP_NAME)
  ? getApp(THEME_APP_NAME)
  : initializeApp(themeFirebaseConfig, THEME_APP_NAME);
const db = getFirestore(themeApp);

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

console.info("[osl-active-theme] subscribing to config/activeTheme via onSnapshot");
let _lastBroadcast = null;
onSnapshot(
  doc(db, "config", "activeTheme"),
  (snap) => {
    const data = snap.exists() ? snap.data() : null;
    const themeId = data ? resolveThemeId(data) : "default";
    console.info("[osl-active-theme] snapshot:", { exists: snap.exists(), resolved: themeId });
    if (themeId === _lastBroadcast) return;
    _lastBroadcast = themeId;
    try { localStorage.setItem(CACHE_KEY, themeId); } catch (e) { /* ignore */ }
    broadcast(themeId);
  },
  (err) => {
    console.warn("[osl-active-theme] error:", err.code || err.message, err);
    if (_lastBroadcast === null) broadcast("default", err);
  }
);
