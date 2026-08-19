// Modo Transmissão — esconde código/nome da sala, email, licença e UID,
// limpa a URL e oferece atalhos de teclado para o host streamar com segurança.
import { S } from "../state.js";

const STORAGE_KEY = "osl_stream_mode";
const CLEAN_URL   = "sala.html";

export function isStreamMode() {
  return document.documentElement.classList.contains("streaming-mode");
}

export function enterStreamMode() {
  document.documentElement.classList.add("streaming-mode");
  localStorage.setItem(STORAGE_KEY, "1");
  try { history.replaceState({}, "", CLEAN_URL); } catch (_) {}
  syncToggleBtn(true);
}

export function exitStreamMode() {
  document.documentElement.classList.remove("streaming-mode");
  localStorage.removeItem(STORAGE_KEY);
  syncToggleBtn(false);
}

export function toggleStreamMode() {
  if (!S.isHost) return;
  if (isStreamMode()) exitStreamMode();
  else enterStreamMode();
}

function syncToggleBtn(active) {
  const btn = document.getElementById("streamModeBtn");
  if (!btn) return;
  btn.classList.toggle("streamModeBtn--active", active);
  btn.textContent = active ? "🔴 Privado" : "📡 Transmissão";
  btn.title = active
    ? "Modo Transmissão ativo (Shift+S para sair)"
    : "Ativar Modo Transmissão (Shift+S)";
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function updateStreamBtnVisibility() {
  const btn = document.getElementById("streamModeBtn");
  if (!btn) return;
  const inArena = document.documentElement.classList.contains("arenaMode");
  const optedOut = sessionStorage.getItem("osl_arena_optout") === "1";
  btn.hidden = !(S.isHost && inArena && !optedOut);
}

export function initStreamMode() {
  // Boot inline já adicionou a classe se osl_stream_mode === "1".
  // Reaplicamos replaceState aqui (boot inline pode rodar antes do replaceState ter efeito visual completo)
  // e sincronizamos UI do botão.
  if (isStreamMode()) {
    try { history.replaceState({}, "", CLEAN_URL); } catch (_) {}
    syncToggleBtn(true);
  } else {
    syncToggleBtn(false);
  }

  document.getElementById("streamModeBtn")?.addEventListener("click", toggleStreamMode);

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const isTyping = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (isTyping) return;

    if (e.shiftKey && (e.key === "S" || e.key === "s")) {
      if (!S.isHost) return;
      e.preventDefault();
      toggleStreamMode();
      return;
    }
    if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}
