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

export function getParticipantId() {
  // Prefer Firebase UID — set by login.html/cadastro.html before sala.html loads.
  // Firebase UIDs are server-verified; a client can't forge another user's UID without
  // their credentials. Also written to sessionStorage so video.js picks the same identity.
  const authUid = localStorage.getItem("osl_auth_uid");
  if (authUid) {
    sessionStorage.setItem("osl_participant_id", authUid);
    sessionStorage.setItem("osl_player_id", authUid);
    localStorage.setItem("osl_player_id", authUid);
    return authUid;
  }
  // Anonymous fallback (free play without a Firebase account)
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

let _toastTimer = null;
export function showOslToast(msg, type = "info") {
  let el = document.getElementById("oslGlobalToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "oslGlobalToast";
    el.style.cssText = [
      "position:fixed","bottom:80px","left:50%","transform:translateX(-50%)",
      "z-index:99000","background:rgba(20,15,5,.96)","color:#f8f5ef",
      "border:1px solid rgba(215,176,107,.4)","border-radius:10px",
      "padding:10px 18px","font-size:13px","font-weight:600","letter-spacing:.02em",
      "pointer-events:none","opacity:0","transition:opacity .2s ease",
      "white-space:nowrap","max-width:88vw","text-align:center"
    ].join(";");
    document.body.appendChild(el);
  }
  if (type === "warn") el.style.borderColor = "rgba(255,180,50,.5)";
  else el.style.borderColor = "rgba(215,176,107,.4)";
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2800);
}
