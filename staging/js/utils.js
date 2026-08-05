// Utilitários puros — sem dependências de estado ou Firebase

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function normalizeUsername(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

export function normalize(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function uniqueArray(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

export function nowTimeFromDate(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Lê um JSON serializado de localStorage com fallback em caso de corrupção.
// Loga warning (não silencioso) pra diagnóstico futuro.
export function safeParseJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); }
  catch (err) {
    console.warn(`safeParseJSON: localStorage["${key}"] corrompido —`, err.message);
    return fallback;
  }
}

export function getParticipantId() {
  const navType = performance.getEntriesByType("navigation")[0]?.type;
  const isReload = navType === "reload";
  let id = isReload ? sessionStorage.getItem("osl_participant_id") : null;
  if (!id) id = "p_" + Math.random().toString(36).slice(2, 11);
  sessionStorage.setItem("osl_participant_id", id);
  sessionStorage.setItem("osl_player_id", id);
  localStorage.setItem("osl_player_id", id);
  return id;
}

export function getUserId() {
  // Prefer Firebase UID (server-verified, not forgeable client-side)
  const authUid = localStorage.getItem("osl_auth_uid");
  if (authUid) return authUid;
  let id = localStorage.getItem("osl_user_id");
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("osl_user_id", id);
  }
  return id;
}
