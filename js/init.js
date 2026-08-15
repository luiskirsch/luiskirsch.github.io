// Entry point principal — inicializa o jogo conectando todos os módulos
import { S } from "./state.js";
import { db, auth, _authReady, initFirebaseRefs, onSnapshot, query, orderBy } from "./firebase.js";
import { getParticipantId, getUserId, showOslToast } from "./utils.js";
import { applyBgTheme, applyCardStyle, applyVisualEffect, syncAccountPurchases, bindProfileEvents, openProfile, updateDesktopProfileBtn, applyAvatarDisplay } from "./ui/profile.js";
import { bindUserDoc, bindRoom, bindPlayers, bindTyping, bindMessages, bindRoomEvents, ensureRoom, ensureUserProfile, upsertSelf, startHeartbeat, startMultiPoller, connectHostSse, fetchLiveRooms, renderLiveRooms, spectateRoom, closeSpectatorRoom } from "./ui/room.js";
import { bindMyMission } from "./game/missions.js";
import { bindRitual } from "./game/cards.js";
import { checkDailyReward, updateXpCard, syncCoinsFromFirestore } from "./game/rewards.js";
import { sendReaction, castEffectVote, confirmAIDetection, dismissAIDetection } from "./game/effects.js";
import { startSession, leaveRoom, sendLeaveBeacon } from "./ui/room.js";
import { revealNextRitualCard, resetRitualDeck } from "./game/cards.js";
import { dispatch } from "./game/engine.js";
import { CMD } from "./game/commands.js";
import { fetchHub, checkEncontroTicket } from "./api.js";
import { initStreamMode } from "./ui/stream-mode.js";
import { bootstrapAccount } from "./account-store.js";

function localAccountCacheMatchesAuthHint() {
  try {
    const authUid  = localStorage.getItem("osl_auth_uid") || "";
    const cacheUid = localStorage.getItem("osl_cache_uid") || "";
    return !!authUid && authUid === cacheUid;
  } catch (_) {
    return false;
  }
}

// ── Identidade ────────────────────────────────────────────────────────────────
S.participantId = getParticipantId();
S.userId        = getUserId();

// ── Detecção precoce de reconexão ─────────────────────────────────────────────
// Se o player clicou "Retomar" na entrada.html, aplica ritual-started imediatamente
// antes do bindRoom() para que o lobby nunca apareça durante a reconexão.
if (localStorage.getItem("osl_reconnect_flag")) {
  localStorage.removeItem("osl_reconnect_flag");
  S._isReconnecting = true;
  document.body.classList.add("ritual-started");
}

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
  const canUseAccountCache = localAccountCacheMatchesAuthHint();
  const savedPhoto  = canUseAccountCache ? (localStorage.getItem("osl_avatar_photo") || "") : "";
  const savedEmoji  = canUseAccountCache ? (localStorage.getItem("osl_avatar") || "🔮") : "🔮";
  const mobileBtn   = document.getElementById("mobileProfileBtn");
  const desktopBtn  = document.getElementById("myProfileBtn");

  // Re-aplica botão usando i18n atual; chamado no cache pre-Firestore (fallback PT)
  // e novamente em osl:i18n-ready (EN garantido).
  function applyDesktopProfileBtn() {
    if (!desktopBtn) return;
    const profileLabel = oslTr("sala:topbar.actions.profile", "👤 Perfil").replace(/^[^\s]+\s*/, "");
    const cacheMatches = localAccountCacheMatchesAuthHint();
    const photo = cacheMatches ? (localStorage.getItem("osl_avatar_photo") || "") : "";
    const emoji = cacheMatches ? (localStorage.getItem("osl_avatar") || "🔮") : "🔮";
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
async function runExposedAction(action, failureMessage) {
  try {
    const result = await action();
    if (result?.ok === false && !["CANCELLED", "ACTION_IN_PROGRESS"].includes(result.code)) {
      showOslToast(failureMessage, "error");
    }
    return result;
  } catch (error) {
    console.error(failureMessage, error);
    showOslToast(failureMessage, "error");
    return { ok: false, error: error?.message || String(error) };
  }
}

window._osl.startGame   = () => startSession();
window._osl.revealCard  = () => runExposedAction(revealNextRitualCard, "Não foi possível revelar a carta.");
window._osl.resetDeck   = () => runExposedAction(resetRitualDeck, "Não foi possível reiniciar o ritual.");
window._osl.getIsHost        = () => S.isHost;
window._osl.isStarted        = () => S.ritualStarted;
window._osl.getParticipantId = () => S.participantId;
window._osl.getRoomCode      = () => S.roomCode;
window._osl.setTyping          = (v) => import("./ui/room.js").then(m => m.setTyping(v));
window._osl.scheduleTypingStop = () => import("./ui/room.js").then(m => m.scheduleTypingStop());
window._osl.openSelfProfile  = () => openProfile({ userId: S.userId, name: S.playerName, isHost: S.isHost }).catch(console.error);
window._osl.fetchLiveRooms       = fetchLiveRooms;
window._osl.renderLiveRooms      = renderLiveRooms;
window._osl.spectateRoom         = spectateRoom;
window._osl.closeSpectatorRoom   = closeSpectatorRoom;
window._osl.getFirebaseIdToken   = async () => { try { await _authReady; return (await S.auth?.currentUser?.getIdToken()) || null; } catch(_) { return null; } };
window.oslOpenProfile        = window._osl.openSelfProfile; // atalho para scripts não-módulo
document.addEventListener("osl:openSelfProfile", () => window._osl.openSelfProfile());

window._osl.toggleArena = async () => {
  if (!S.isHost) {
    showOslToast("Apenas o anfitrião pode controlar a Arena.", "warn");
    return { ok: false, code: "HOST_REQUIRED" };
  }
  try {
    const { getDoc, updateDoc } = await import("./firebase.js");
    const snap = await getDoc(S.roomRef);
    if (!snap.exists()) throw new Error("ROOM_NOT_FOUND");
    const currentlyActive = snap.data().arenaActive;
    if (!currentlyActive && !S.ritualStarted) {
      showOslToast(oslTr("sala:topbar.actions.arenaRequiresStarted", "⚔️ Inicie o ritual primeiro para ativar o Modo Arena."), "warn");
      return { ok: false, code: "RITUAL_NOT_STARTED" };
    }
    await updateDoc(S.roomRef, { arenaActive: !currentlyActive });
    return { ok: true, active: !currentlyActive };
  } catch (error) {
    console.error("Erro ao alternar Arena:", error);
    showOslToast("Não foi possível alterar o Modo Arena.", "error");
    return { ok: false, error: error?.message || String(error) };
  }
};

window._osl.deactivateArenaForAll = async () => {
  if (!S.isHost) return;
  const { updateDoc } = await import("./firebase.js");
  await updateDoc(S.roomRef, { arenaActive: false });
};

// Expõe para uso inline no HTML (onclick="sendReaction(...)", etc.)
window.showOslToast       = showOslToast;
window.sendReaction       = sendReaction;
window.castEffectVote     = castEffectVote;
window.confirmAIDetection = confirmAIDetection;
window.dismissAIDetection = dismissAIDetection;

// ── Disconnect tracking via visibilitychange ──────────────────────────────────
// Marca connected:false após 60s de tab oculta; reconecta quando volta ao foco.
// Complementa o heartbeat (15s) para detectar saídas sem beforeunload.
(function bindVisibilityDisconnect() {
  let _hideTimer = null;
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") {
      _hideTimer = setTimeout(async () => {
        try { const { setPlayerConnected } = await import("./game/session.js"); await setPlayerConnected(false); } catch (_) {}
      }, 60000);
    } else {
      clearTimeout(_hideTimer);
      try { const { setPlayerConnected } = await import("./game/session.js"); setPlayerConnected(true).catch(() => {}); } catch (_) {}
    }
  });
})();

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
  initStreamMode();

  // Renderiza do cache local antes de qualquer round-trip Firestore
  const _cachedXp = localAccountCacheMatchesAuthHint()
    ? parseInt(localStorage.getItem("osl_xp_cache") || "0", 10)
    : 0;
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

  // salas/{id} tem allow read: if true — pode iniciar sem auth para warmup do cache IndexedDB
  bindRoom();

  // Aguarda Firebase SDK restaurar sessão. O callback já gravou osl_auth_uid se o user
  // é real; agora re-derivamos os IDs (no carregamento síncrono osl_auth_uid era null
  // e getUserId() retornava um u_xxxxx aleatório que nunca bate com request.auth.uid).
  await _authReady;
  const _freshParticipantId = getParticipantId();
  const _freshUserId        = getUserId();
  if (_freshParticipantId !== S.participantId || _freshUserId !== S.userId) {
    S.participantId = _freshParticipantId;
    S.userId        = _freshUserId;
    initFirebaseRefs();
  }
  window.dispatchEvent(new CustomEvent("osl:identity-ready", {
    detail: { participantId: S.participantId, userId: S.userId },
  }));

  // Engine: transiciona de IDLE → LOBBY. Players chegam via SET_PLAYERS depois.
  dispatch({ type: CMD.INIT, payload: { players: [] } }).catch(() => {});

  bindPlayers();
  bindUserDoc();
  bindMessages();
  bindTyping();
  bindRitual(onSnapshot, orderBy, query);
  bindMyMission(onSnapshot);

  // Inicialização autenticada e ordenada
  try {
    // Perfil primeiro: o nome/avatar canônicos precisam estar resolvidos antes
    // de criar a membership da sala. O bootstrap do backend consolida a mesma
    // conta usada pelo HUB e deixa o cache explicitamente vinculado ao UID.
    await ensureUserProfile();
    const account = await bootstrapAccount().catch(error => {
      console.warn("AccountSnapshot indisponível; usando listener Firestore:", error);
      return null;
    });
    if (account) {
      updateXpCard(account.progression?.xp || 0);
      updateDesktopProfileBtn(
        account.profile?.avatar?.url || null,
        account.profile?.avatar?.emoji || null,
      );
    }
    await ensureRoom();
    syncCoinsFromFirestore();
    if (!S._isSpectator) await upsertSelf();
    if (!S._isSpectator) startHeartbeat();

    checkDailyReward();
    startMultiPoller();
    syncAccountPurchases();

    // Hub Entre Sessões: fragmento + world state + daily + friends + last session + events + discoveries
    if (!S._isSpectator) {
      fetchHub().then(async hub => {
        if (!hub?.ok) return;
        _renderHub(hub);
        const ticket = await checkEncontroTicket().catch(() => null);
        if (ticket?.hasTicket) {
          const btn = document.getElementById("evTicketBtn");
          if (btn) btn.textContent = "VER DETALHES";
        }
      }).catch(() => {});
    }

    if (S.isHost) connectHostSse();
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

// ── Hub renderer ──────────────────────────────────────────────────────────────
// Popula todos os elementos do #hubPanel a partir da resposta do /hub.

function _el(id) { return document.getElementById(id); }

function _renderHub(hub) {
  const panel = _el("hubPanel");
  if (!panel) return;

  let hasAny = false;

  // ── Fragment ────────────────────────────────────────────────────────────────
  if (hub.fragment) {
    const banner = _el("fragmentBanner");
    const title  = _el("fragmentBannerTitle");
    if (banner) {
      if (title) title.textContent = hub.fragment.card?.title || "Fragmento";
      banner.hidden = false;
    }
  }

  // ── World State ─────────────────────────────────────────────────────────────
  const world = hub.world;
  if (world != null) {
    hasAny = true;
    const pct    = Math.round((world.communityProgress || 0) * 100);
    const fill   = _el("hubProgressFill");
    const pctEl  = _el("hubProgressPct");
    const missEl = _el("hubMission");
    if (fill)  fill.style.width = pct + "%";
    if (pctEl) pctEl.textContent = pct + "%";
    if (missEl && world.currentMission) missEl.textContent = world.currentMission;
  }

  // ── Season ──────────────────────────────────────────────────────────────────
  if (hub.season?.name) {
    hasAny = true;
    const lbl = _el("hubSeasonLabel");
    if (lbl) lbl.textContent = hub.season.name;
  }

  // ── Daily Ritual ────────────────────────────────────────────────────────────
  const daily    = hub.daily;
  const dailyCol = _el("hubDailyCol");
  if (daily && dailyCol) {
    hasAny = true;
    dailyCol.hidden = false;
    const titleEl = _el("hubDailyTitle");
    if (titleEl) titleEl.textContent = daily.title || daily.theme || "Ritual";
    const doneEl = _el("hubDailyDone");
    if (doneEl && daily.completedByUser) doneEl.hidden = false;
  }

  // ── Amigos online ───────────────────────────────────────────────────────────
  const online     = (hub.friends || []).filter(f => f.online).slice(0, 6);
  const friendsCol = _el("hubFriendsCol");
  if (online.length > 0 && friendsCol) {
    hasAny = true;
    friendsCol.hidden = false;
    const row = _el("hubFriendRow");
    if (row) {
      row.innerHTML = online.map(f => {
        const initial = (f.displayName || "?").charAt(0).toUpperCase();
        const name    = (f.displayName || "Amigo").replace(/"/g, "&quot;");
        return `<span class="hub-friend-chip" title="${name}">${initial}</span>`;
      }).join("");
    }
  }

  // ── Última sessão ───────────────────────────────────────────────────────────
  const last      = hub.lastSession;
  const resumeCol = _el("hubResumeCol");
  if (last?.roomId && resumeCol) {
    hasAny = true;
    resumeCol.hidden = false;
    const roomEl = _el("hubResumeRoom");
    const dnaEl  = _el("hubResumeDna");
    if (roomEl) roomEl.textContent = last.roomName || last.roomId;
    if (dnaEl && last.dna) {
      const d = last.dna;
      const parts = [];
      if (d.sessionCount) parts.push(`${d.sessionCount} sess.`);
      if (d.dominantType) parts.push(d.dominantType);
      dnaEl.textContent = parts.join(" · ");
    }
  }

  // ── Eventos ativos ──────────────────────────────────────────────────────────
  const events = (hub.events || []).slice(0, 3);
  const evRow  = _el("hubEventsRow");
  if (events.length > 0 && evRow) {
    hasAny = true;
    evRow.hidden = false;
    evRow.innerHTML = events.map(e => {
      const name = (e.name        || "Evento").replace(/</g, "&lt;");
      const desc = (e.description || "")      .replace(/</g, "&lt;");
      return `<div class="hub-event">
        <span class="hub-event__name">${name}</span>
        <span class="hub-event__desc">${desc}</span>
      </div>`;
    }).join("");
  }

  // ── Meus grupos com agenda recorrente ──────────────────────────────────────
  const myGroups  = (hub.myGroups || []).slice(0, 5);
  const groupsRow = _el("hubGroupsRow");
  if (myGroups.length > 0 && groupsRow) {
    hasAny = true;
    groupsRow.hidden = false;
    groupsRow.innerHTML = myGroups.map(g => {
      const sched  = (g.scheduleLabel || "").replace(/</g, "&lt;");
      const roomId = (g.roomId        || "").replace(/</g, "&lt;");
      return `<div class="hub-group" data-room="${roomId}">
        <span class="hub-group__icon">📅</span>
        <span class="hub-group__schedule">${sched}</span>
        <span class="hub-group__room">${roomId}</span>
        <span class="hub-group__join">Entrar →</span>
      </div>`;
    }).join("");
    groupsRow.querySelectorAll(".hub-group[data-room]").forEach(el => {
      el.addEventListener("click", () => {
        const rid  = el.dataset.room;
        const nome = localStorage.getItem("osl_nome") || "Jogador";
        if (rid) window.location.href = `sala.html?sala=${encodeURIComponent(rid)}&nome=${encodeURIComponent(nome)}&nomeSala=${encodeURIComponent(rid)}`;
      });
    });
  }

  // ── Discoveries / Rumores ───────────────────────────────────────────────────
  const available = (hub.discoveries?.available || []).slice(0, 2);
  const teasers   = (hub.discoveries?.teasers   || []).slice(0, Math.max(0, 2 - available.length));
  const allDisc   = [...available, ...teasers];
  const discRow   = _el("hubDiscoveriesRow");
  if (allDisc.length > 0 && discRow) {
    hasAny = true;
    discRow.hidden = false;
    discRow.innerHTML = allDisc.map(d => {
      const icon  = d.isTeaser ? "🌫️" : "🔮";
      const title = (d.title || d.hint || "Rumor").replace(/</g, "&lt;");
      const hint  = d.isTeaser
        ? "Desbloqueie jogando mais"
        : (d.description || "").replace(/</g, "&lt;");
      return `<div class="hub-discovery">
        <span class="hub-discovery__icon">${icon}</span>
        <div class="hub-discovery__body">
          <div class="hub-discovery__title">${title}</div>
          ${hint ? `<div class="hub-discovery__hint">${hint}</div>` : ""}
        </div>
      </div>`;
    }).join("");
  }

  if (hasAny) panel.hidden = false;
}
