// Entry point principal — inicializa o jogo conectando todos os módulos
import { S } from "./state.js";
import { db, auth, initFirebaseRefs, onSnapshot, query, orderBy } from "./firebase.js";
import { getParticipantId, getUserId, showOslToast } from "./utils.js";
import { applyBgTheme, applyCardStyle, applyVisualEffect, syncAccountPurchases, bindProfileEvents, openProfile, updateDesktopProfileBtn, applyAvatarDisplay } from "./ui/profile.js";
import { bindUserDoc, bindRoom, bindPlayers, bindTyping, bindMessages, bindRoomEvents, ensureRoom, ensureUserProfile, upsertSelf, startHeartbeat, startMultiPoller, connectHostSse } from "./ui/room.js";
import { bindMyMission } from "./game/missions.js";
import { bindRitual } from "./game/cards.js";
import { checkDailyReward, updateXpCard } from "./game/rewards.js";
import { sendReaction, castEffectVote, confirmAIDetection, dismissAIDetection } from "./game/effects.js";
import { startSession, leaveRoom, sendLeaveBeacon } from "./ui/room.js";
import { revealNextRitualCard, resetRitualDeck } from "./game/cards.js";

// ── Identidade ────────────────────────────────────────────────────────────────
S.participantId = getParticipantId();
S.userId        = getUserId();

// Persiste nome/sala no localStorage (exceto modo espectador)
if (!S._isSpectator) {
  localStorage.setItem("osl_nome",      S.playerName);
  localStorage.setItem("osl_sala",      S.roomCode);
  localStorage.setItem("osl_nome_sala", S.roomName);
}

// ── Firebase refs ─────────────────────────────────────────────────────────────
initFirebaseRefs();

// ── Áudio ─────────────────────────────────────────────────────────────────────
function enableAudio() {
  if (S.audioReady) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    S.audioCtx = new AudioContextClass();
    if (S.audioCtx.state === "suspended") S.audioCtx.resume().catch(() => {});
    S.audioReady = true;
  } catch (_) {}
}
window.addEventListener("pointerdown", enableAudio, { once: true });
window.addEventListener("touchstart",  enableAudio, { once: true });
window.addEventListener("keydown",     enableAudio, { once: true });

// ── Aplica customizações salvas antes do primeiro render ──────────────────────
(function applyInitialCustomizations() {
  applyBgTheme(S.selectedBgTheme);
  applyCardStyle(S.selectedCardStyle);
  applyVisualEffect(S.selectedFx);

  // Aplica avatar do cache local imediatamente, sem esperar o Firestore
  const savedPhoto  = localStorage.getItem("osl_avatar_photo") || "";
  const savedEmoji  = localStorage.getItem("osl_avatar") || "🔮";
  const mobileBtn   = document.getElementById("mobileProfileBtn");
  const desktopBtn  = document.getElementById("myProfileBtn");

  // Re-aplica botão usando i18n atual; chamado no cache pre-Firestore (fallback PT)
  // e novamente em osl:i18n-ready (EN garantido).
  function applyDesktopProfileBtn() {
    if (!desktopBtn) return;
    const profileLabel = oslTr("sala:topbar.actions.profile", "👤 Perfil").replace(/^[^\s]+\s*/, "");
    const photo = localStorage.getItem("osl_avatar_photo") || "";
    const emoji = localStorage.getItem("osl_avatar") || "🔮";
    if (photo) {
      const badge = desktopBtn.querySelector(".badge"); desktopBtn.innerHTML = "";
      const img = document.createElement("img"); img.src = photo; img.style.cssText = "width:28px;height:28px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0";
      desktopBtn.appendChild(img); desktopBtn.appendChild(document.createTextNode(profileLabel));
      if (badge) desktopBtn.appendChild(badge);
    } else {
      desktopBtn.textContent = emoji + " " + profileLabel;
    }
  }

  if (savedPhoto && mobileBtn) applyAvatarDisplay(mobileBtn, savedPhoto, null, null);
  else if (savedEmoji && mobileBtn) mobileBtn.textContent = savedEmoji;
  applyDesktopProfileBtn();
  document.addEventListener("osl:i18n-ready", applyDesktopProfileBtn);
})();

// ── Expõe funções para código não-módulo (mobile script) ─────────────────────
window._osl = window._osl || {};
window._osl.startGame   = () => startSession().catch(console.error);
window._osl.revealCard  = () => revealNextRitualCard().catch(console.error);
window._osl.resetDeck   = () => resetRitualDeck().catch(console.error);
window._osl.getIsHost        = () => S.isHost;
window._osl.isStarted        = () => S.ritualStarted;
window._osl.getParticipantId = () => S.participantId;
window._osl.getRoomCode      = () => S.roomCode;
window._osl.setTyping          = (v) => import("./ui/room.js").then(m => m.setTyping(v));
window._osl.scheduleTypingStop = () => import("./ui/room.js").then(m => m.scheduleTypingStop());
window._osl.openSelfProfile  = () => openProfile({ userId: S.userId, name: S.playerName, isHost: S.isHost }).catch(console.error);
window.oslOpenProfile        = window._osl.openSelfProfile; // atalho para scripts não-módulo
document.addEventListener("osl:openSelfProfile", () => window._osl.openSelfProfile());

window._osl.toggleArena = async () => {
  if (!S.isHost) return;
  const { getDoc, updateDoc } = await import("./firebase.js");
  const snap = await getDoc(S.roomRef); if (!snap.exists()) return;
  const currentlyActive = snap.data().arenaActive;
  if (!currentlyActive && !S.ritualStarted) {
    showOslToast(oslTr("sala:topbar.actions.arenaRequiresStarted", "⚔️ Inicie o ritual primeiro para ativar o Modo Arena."), "warn");
    return;
  }
  await updateDoc(S.roomRef, { arenaActive: !currentlyActive });
};

window._osl.deactivateArenaForAll = async () => {
  if (!S.isHost) return;
  const { updateDoc } = await import("./firebase.js");
  await updateDoc(S.roomRef, { arenaActive: false });
};

// Beacon de saída — dispara quando a aba é fechada, navegada ou colocada em background
// sendBeacon garante entrega mesmo durante o unload (fetch seria cancelado)
window.addEventListener("pagehide", sendLeaveBeacon);

// Expõe para uso inline no HTML (onclick="sendReaction(...)", etc.)
window.showOslToast       = showOslToast;
window.sendReaction       = sendReaction;
window.castEffectVote     = castEffectVote;
window.confirmAIDetection = confirmAIDetection;
window.dismissAIDetection = dismissAIDetection;

// ── Inicialização principal ───────────────────────────────────────────────────
(async function init() {
  // Aguarda i18n carregar antes do primeiro render — evita flash de texto PT em modo EN.
  // Fallback 2.5s caso i18n falhe; nesse caso renderiza com fallbacks PT.
  if (!window.OSL_I18N) {
    await new Promise((resolve) => {
      const done = () => { document.removeEventListener("osl:i18n-ready", done); resolve(); };
      document.addEventListener("osl:i18n-ready", done, { once: true });
      setTimeout(resolve, 2500);
    });
  }

  // Registra event listeners de sala e perfil
  bindRoomEvents();
  bindProfileEvents();

  // Renderiza do cache local antes de qualquer round-trip Firestore
  const _cachedXp = parseInt(localStorage.getItem("osl_xp_cache") || "0", 10);
  if (_cachedXp > 0) updateXpCard(_cachedXp);
  try {
    const _cachedPlayers = JSON.parse(localStorage.getItem("osl_players_cache") || "[]");
    const { renderPlayers } = await import("./ui/room.js");
    if (_cachedPlayers.length) renderPlayers(_cachedPlayers);
  } catch (_) {}

  // Modo espectador
  if (S._isSpectator) {
    const badge = document.getElementById("spectatorBadge");
    if (badge) badge.style.display = "block";
    ["startBtn","revealCardBtn","resetRitualBtn","sendBtn","messageInput"].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.disabled = true; el.title = oslTr("sala:spec.observerMode", "Modo observador"); }
    });
  }

  // Registra listeners realtime imediatamente (Firestore usa IndexedDB cache)
  bindRoom();
  bindPlayers();
  bindUserDoc();
  bindMessages();
  bindTyping();
  bindRitual(onSnapshot, orderBy, query);
  bindMyMission(onSnapshot);

  // Operações paralelas de inicialização
  try {
    await Promise.all([ensureUserProfile(), ensureRoom()]);
    if (!S._isSpectator) await upsertSelf();
    if (!S._isSpectator) startHeartbeat();

    checkDailyReward();
    startMultiPoller();
    syncAccountPurchases();

    if (S.isHost) connectHostSse();

    document.getElementById("xpCardLevel")?.addEventListener("click", () => {
      import("./game/rewards.js").then(({ showLevelPanel }) => showLevelPanel(S._currentXp));
    });
  } catch (error) {
    console.error(error);
    const footerStatusEl = document.getElementById("footerStatus");
    const roomStatusEl   = document.getElementById("roomStatus");
    const chatEmptyEl    = document.getElementById("chatEmpty");
    if (error?.message === "ROOM_FULL") {
      if (chatEmptyEl) { chatEmptyEl.style.display = "block"; chatEmptyEl.innerHTML = oslTr("sala:initErrors.roomFullChat", "A sala atingiu o limite de 5 jogadores.<br>Entre em outra sala ou aguarde alguém sair."); }
      if (roomStatusEl) roomStatusEl.textContent = oslTr("sala:footer.roomFull", "Sala lotada");
      if (footerStatusEl) footerStatusEl.textContent = oslTr("sala:footer.limitReached", "Limite atingido");
      return;
    }
    const isPermission = error?.code === "permission-denied" || String(error).includes("Missing or insufficient permissions");
    if (isPermission) {
      if (chatEmptyEl) { chatEmptyEl.style.display = "block"; chatEmptyEl.innerHTML = oslTr("sala:initErrors.permissionDeniedChat", "Permissão negada pelo Firestore.<br>As regras de segurança precisam ser atualizadas no Firebase Console."); }
      if (roomStatusEl) roomStatusEl.textContent = oslTr("sala:footer.permissionDenied", "Permissão negada");
      if (footerStatusEl) footerStatusEl.textContent = oslTr("sala:footer.noAccess", "Sem acesso");
    } else {
      if (chatEmptyEl) { chatEmptyEl.style.display = "block"; chatEmptyEl.innerHTML = oslTr("sala:initErrors.connectionFailedChat", "Não foi possível conectar à sala.<br>Verifique a configuração do Firebase."); }
      if (roomStatusEl) roomStatusEl.textContent = oslTr("sala:footer.errorConnection", "Erro de conexão");
      if (footerStatusEl) footerStatusEl.textContent = oslTr("sala:footer.errorShort", "Erro");
    }
  }
})();
