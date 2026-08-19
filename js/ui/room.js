// UI da sala: listeners Firebase, sessão, chat, jogadores, multiplayer
import { S } from "../state.js";
import { setDoc, updateDoc, addDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, doc, collection, deleteField } from "../firebase.js";
import { escapeHtml, nowTimeFromDate, initials, showOslToast } from "../utils.js";
import { panelBootRoom, panelMarkSessionStart, panelMarkSessionEnd, PanelBridge, ensureHostToken, redeemPendingCoins, fetchRoomSessions, fetchRoomStats } from "../api.js";
import { startRitualDeck, resetRitualDeck, revealNextRitualCard, bindRitual, setRitualWaitingState, updateRitualButtons } from "../game/cards.js";
import { logEvent, joinSessionAsPlayer, setSessionId, setPlayerConnected, clearActiveSession, endGameSession } from "../game/session.js";
import { bindMyMission, checkMissionChatCompletion, evaluateChatResponse } from "../game/missions.js";
import { checkDailyReward, showSessionRecap, updateXpCard, showLevelPanel } from "../game/rewards.js";
import { OSL_ACHIEVEMENTS } from "../game/effects.js";
import { BACKEND_BASE_URL } from "../constants.js";

// ── Áudio ─────────────────────────────────────────────────────────────────────
function playIncomingMessageSound() {
  if (!S.audioReady || !S.audioCtx) return;
  try {
    const now = S.audioCtx.currentTime;
    const osc1 = S.audioCtx.createOscillator(), osc2 = S.audioCtx.createOscillator();
    const gain = S.audioCtx.createGain(), filter = S.audioCtx.createBiquadFilter();
    osc1.type = "triangle"; osc2.type = "sine";
    osc1.frequency.setValueAtTime(920, now); osc1.frequency.exponentialRampToValueAtTime(680, now + 0.08);
    osc2.frequency.setValueAtTime(1320, now); osc2.frequency.exponentialRampToValueAtTime(980, now + 0.08);
    filter.type = "lowpass"; filter.frequency.setValueAtTime(1800, now); filter.Q.setValueAtTime(0.8, now);
    gain.gain.setValueAtTime(0.00001, now); gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01); gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.14);
    osc1.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(S.audioCtx.destination);
    osc1.start(now); osc2.start(now); osc1.stop(now + 0.15); osc2.stop(now + 0.15);
  } catch (_) {}
}

// ── Sanitização de campos de avatar (defesa contra XSS via Firestore) ─────────
function safeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const t = url.trim();
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(t)) return t;
  if (!/^https:\/\//i.test(t)) return '';
  return t.replace(/['"()\\ ]/g, '');
}

function safeAvatarColor(color) {
  if (!color || typeof color !== 'string') return '#342718';
  const t = color.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(t) ? t : '#342718';
}

// ── Renderização de jogadores ─────────────────────────────────────────────────
export function renderPlayers(players) {
  const playerListEl = document.getElementById("playerList");
  const playerCountEl = document.getElementById("playerCount");
  const playersEmptyEl = document.getElementById("playersEmpty");
  if (!playerListEl) return;

  playerListEl.innerHTML = "";
  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "player";
    div.dataset.pid = player.id;
    const safePhoto = safeAvatarUrl(player.avatarPhotoUrl);
    const safeColor = safeAvatarColor(player.avatarColor);
    const safeEmoji = escapeHtml(player.avatarEmoji || '');
    const safeInits = escapeHtml(initials(player.name));
    const avatarContent = safePhoto ? "" : (safeEmoji || safeInits);
    const avatarStyle   = safePhoto
      ? `style="background-image:url('${safePhoto}');background-size:cover;background-position:center;font-size:0"`
      : (safeEmoji ? `style="font-size:1.3em;background:${safeColor}"` : (player.avatarColor ? `style="background:${safeColor}"` : ""));
    const photoAttr = safePhoto ? `data-photo-url="${safePhoto}"` : "";
    div.innerHTML = `
      <div class="playerLeft">
        <div class="avatar" ${avatarStyle} ${photoAttr}>${avatarContent}</div>
        <div class="playerMeta">
          <div class="playerName">${player.id === S.participantId ? "(Você)" : escapeHtml(player.name)}</div>
          <div class="playerRole">${player.isHost ? "Anfitrião" : "Participante"}</div>
        </div>
      </div>
      <div class="playerRight">
        <span class="playerStatus">Online</span>
      </div>`;
    div.addEventListener("click", () => document.dispatchEvent(new CustomEvent("osl:openProfile", { detail: player })));
    playerListEl.appendChild(div);
  });

  if (playerCountEl)  playerCountEl.textContent   = String(players.length);
  if (playersEmptyEl) playersEmptyEl.style.display = players.length === 0 ? "block" : "none";
  applyVideoTileAvatars();
}

export function applyVideoTileAvatars() {
  const grid = document.getElementById("videoGrid");
  if (!grid) return;
  S.currentPlayers.forEach(player => {
    if (player.id === S.participantId) return;
    const tile = grid.querySelector(`.videoTile[data-identity="${CSS.escape(player.id)}"]`);
    if (!tile) return;
    const cameraOff = tile.querySelector(".videoCameraOff");
    if (!cameraOff) return;
    cameraOff.classList.remove("videoCameraOff--photo", "videoCameraOff--emoji");
    if (player.avatarPhotoUrl) {
      cameraOff.classList.add("videoCameraOff--photo");
      let img = cameraOff.querySelector(".videoCameraOffBgPhoto");
      if (!img) { img = document.createElement("img"); img.className = "videoCameraOffBgPhoto"; cameraOff.insertBefore(img, cameraOff.firstChild); }
      img.src = player.avatarPhotoUrl;
    } else {
      cameraOff.classList.add("videoCameraOff--emoji");
      const icon = cameraOff.querySelector(".videoCameraOffIcon");
      if (icon) { icon.textContent = player.avatarEmoji || initials(player.name); if (player.avatarColor) icon.style.setProperty("--avatar-color", player.avatarColor); }
    }
  });
}

// Observer para aplicar avatares quando tiles de vídeo forem criados
(function() {
  const grid = document.getElementById("videoGrid");
  if (!grid) return;
  new MutationObserver(() => applyVideoTileAvatars()).observe(grid, { childList: true, subtree: true });
})();

// ── Renderização de mensagens ─────────────────────────────────────────────────
function _buildMessageEl(item) {
  const div = document.createElement("div");
  div.dataset.msgId = item.id;
  if (item.type === "system") {
    div.className = "message system"; div.textContent = item.text;
  } else {
    const own = item.authorId === S.participantId;
    div.className = "message " + (own ? "me" : "other");
    let timeLabel = "--:--";
    if (item.createdAt && typeof item.createdAt.toDate === "function") timeLabel = nowTimeFromDate(item.createdAt.toDate());
    div.innerHTML = own
      ? `<span class="msgTime">${timeLabel}</span>${escapeHtml(item.text)}`
      : `<span class="meta">${escapeHtml(item.authorName || "Jogador")}</span><span class="msgTime">${timeLabel}</span>${escapeHtml(item.text)}`;
  }
  return div;
}

function renderMessages(docs) {
  const messagesEl  = document.getElementById("messages");
  const chatEmptyEl = document.getElementById("chatEmpty");
  if (!messagesEl) return;

  if (!docs.length) {
    messagesEl.innerHTML = "";
    if (chatEmptyEl) { chatEmptyEl.style.display = "block"; chatEmptyEl.innerHTML = "A sala foi criada.<br>Quando houver mensagens ou eventos do sistema, eles aparecerão aqui."; }
    return;
  }
  if (chatEmptyEl) chatEmptyEl.style.display = "none";

  // Identifica IDs já renderizados no DOM
  const rendered = new Set();
  messagesEl.querySelectorAll("[data-msg-id]").forEach(el => rendered.add(el.dataset.msgId));

  // Se alguma mensagem desapareceu (clearRoomData), reconstrói do zero
  const docIds = new Set(docs.map(d => d.id));
  if (rendered.size > 0 && [...rendered].some(id => !docIds.has(id))) {
    messagesEl.innerHTML = "";
    rendered.clear();
  }

  // Só adiciona mensagens novas — nenhuma remoção/recriação de DOM existente
  let appended = false;
  docs.forEach((item) => {
    if (rendered.has(item.id)) return;
    messagesEl.appendChild(_buildMessageEl(item));
    appended = true;
  });

  if (appended || rendered.size === 0) messagesEl.scrollTop = messagesEl.scrollHeight;
}

const DOTS_HTML = `<span class="typingDots"><span></span><span></span><span></span></span>`;
function renderTyping(names) {
  const typingBarEl = document.getElementById("typingBar");
  const mobileBar   = document.getElementById("mobileTypingBar");
  const wasEmpty    = !(typingBarEl && typingBarEl.firstChild);
  if (!names.length) { if (typingBarEl) typingBarEl.innerHTML = ""; if (mobileBar) mobileBar.innerHTML = ""; return; }
  const _n = names.map(escapeHtml);
  let label;
  if (_n.length === 1)      label = `${_n[0]} está digitando`;
  else if (_n.length === 2) label = `${_n[0]} e ${_n[1]} estão digitando`;
  else if (_n.length === 3) label = `${_n[0]}, ${_n[1]} e ${_n[2]} estão digitando`;
  else                       label = `${_n[0]}, ${_n[1]}, ${_n[2]} e mais ${_n.length - 3} estão digitando`;
  const html = label + DOTS_HTML;
  if (typingBarEl) typingBarEl.innerHTML = html;
  if (mobileBar)   mobileBar.innerHTML   = html;
  if (wasEmpty) requestAnimationFrame(() => { const ms = document.getElementById("messages"); if (ms) ms.scrollTop = ms.scrollHeight; });
}

// ── Typing ────────────────────────────────────────────────────────────────────
export async function setTyping(isTyping) {
  try {
    if (isTyping) { await setDoc(S.typingRef, { name: S.playerName, isTyping: true, updatedAt: serverTimestamp() }, { merge: true }); }
    else          { await deleteDoc(S.typingRef); }
  } catch (_) {}
}

export function scheduleTypingStop() {
  clearTimeout(S.typingTimer);
  S.typingTimer = setTimeout(() => setTyping(false), 1000);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
export function startHeartbeat() {
  clearInterval(S.heartbeatTimer);
  S.heartbeatTimer = setInterval(async () => {
    try { await updateDoc(S.playerRef, { lastSeen: serverTimestamp() }); } catch (_) {}
    setPlayerConnected(true).catch(() => {});
    PanelBridge.roomHeartbeat(S.roomCode).catch(() => {});
    // Cacheia token para uso síncrono no sendLeaveBeacon (beforeunload não permite await)
    try { S._cachedIdToken = (await S.auth?.currentUser?.getIdToken()) || null; } catch (_) { S._cachedIdToken = null; }
  }, 15000);
}

// ── Inicializações Firestore ──────────────────────────────────────────────────
function isPlayerActive(player) {
  if (!player.lastSeen || typeof player.lastSeen.toMillis !== "function") return true;
  return (Date.now() - player.lastSeen.toMillis()) <= 40000;
}

export function bindUserDoc() {
  let _firstSnapshot = true;
  onSnapshot(S.userRef, (snap) => {
    if (!snap.exists()) return;
    const data    = snap.data();
    const pending = (data.incomingRequests || []).length;
    if (data.prestige === true && !S._isPrestige) { S._isPrestige = true; document.dispatchEvent(new CustomEvent("osl:applyPrestige")); }
    if (_firstSnapshot) {
      _firstSnapshot = false;
      const xp = data.xp || 0;
      S._xpPrevLevel = OSL_ACHIEVEMENTS.init ? 0 : 0;
      OSL_ACHIEVEMENTS.init(Object.keys(data.achievements || {}));
      S._xpPrevLevel = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
      // Resgata moedas pendentes de compras feitas antes do perfil existir
      redeemPendingCoins().then(r => {
        if ((r?.coinsAdded || 0) > 0) {
          window.showOslToast?.(`+${r.coinsAdded} moedas resgatadas!`);
        }
      }).catch(() => {});
    }
    const xp = data.xp || 0;
    const newLv = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
    updateXpCard(xp);
    if (newLv > S._xpPrevLevel && S._xpPrevLevel > 0) OSL_ACHIEVEMENTS.onLevelUp(newLv);
    const mb = document.getElementById("mobileProfileBadge");
    const db2 = document.getElementById("desktopProfileBadge");
    if (mb)  mb.classList.toggle("visible",  pending > 0);
    if (db2) db2.classList.toggle("visible", pending > 0);
  });
}

export function bindRoom() {
  let _roomFirstSnapshot = true;
  S.roomUnsub = onSnapshot(S.roomRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (_roomFirstSnapshot) {
      _roomFirstSnapshot = false;
      loadSessionHistory(); // carrega histórico uma vez ao entrar na sala
    }
    const roomNameEl   = document.getElementById("roomName");
    const roomStatusEl = document.getElementById("roomStatus");
    const sessionLabelEl = document.getElementById("sessionLabel");
    const footerStatusEl = document.getElementById("footerStatus");
    const startBtn       = document.getElementById("startBtn");
    if (roomNameEl) roomNameEl.textContent = data.name || S.roomName;
    const started = data.status === "started";
    if (roomStatusEl)    roomStatusEl.textContent    = started ? "Ritual em andamento" : "Aguardando jogadores";
    if (sessionLabelEl)  sessionLabelEl.textContent  = started ? "Sessão iniciada" : "Sessão não iniciada";
    if (footerStatusEl)  footerStatusEl.textContent  = started ? "Ritual iniciado" : "Aguardando início";
    S.isHost = data.hostId === S.participantId;
    if (startBtn) { startBtn.disabled = !S.isHost || S._isSpectator; startBtn.textContent = S.isHost ? (started ? "Ritual iniciado" : "Iniciar Ritual") : "Aguardando anfitrião"; }
    const _arenaActive = !!data.arenaActive;
    const _optedOut = sessionStorage.getItem("osl_arena_optout") === "1";
    const arenaBtn = document.getElementById("arenaBtn");
    if (arenaBtn) arenaBtn.hidden = !(S.isHost && (_arenaActive || _optedOut));
    const streamModeBtn = document.getElementById("streamModeBtn");
    if (streamModeBtn) streamModeBtn.hidden = !(S.isHost && _arenaActive && !_optedOut);
    const liveBtn = document.getElementById("liveBtn");
    if (liveBtn) liveBtn.hidden = !(S.isHost && _arenaActive && !_optedOut);
    if (data.arenaActive) {
      if (sessionStorage.getItem("osl_arena_optout") !== "1" && typeof window.activateArenaMode === "function") window.activateArenaMode();
    }
    else { if (typeof window.deactivateArenaMode === "function") window.deactivateArenaMode(); if (!started && !S.ritualStarted) setRitualWaitingState(); }
    await setDoc(S.playerRef, { isHost: S.isHost }, { merge: true });
    // Toast quando outro jogador reconecta (campo observável na sessão)
    const notif = data.reconnectNotification;
    if (notif?.participantId && notif.participantId !== S.participantId) {
      const notifKey = `${notif.participantId}_${notif.ts?.toMillis?.() || notif.ts || 0}`;
      if (S._lastReconnectNotifKey !== notifKey) {
        S._lastReconnectNotifKey = notifKey;
        window.showOslToast?.(`${notif.nickname} reconectou.`);
      }
    }
    // Non-host players join session when host publishes currentSessionId.
    // Guard newSessionId !== S.sessionId evita dupla chamada caso SYNC_FROM_FIRESTORE
    // chegue primeiro e já tenha feito setSessionId + joinSessionAsPlayer.
    const newSessionId = data.currentSessionId || null;
    if (newSessionId && newSessionId !== S.sessionId && !S.isHost) {
      setSessionId(newSessionId);
      const isReconnect = await joinSessionAsPlayer().catch(() => false);
      if (isReconnect) {
        window.dispatchEvent(new CustomEvent("osl:session-reconnected"));
      }
    }
  });
}

export function bindPlayers() {
  S.playersUnsub = onSnapshot(S.playersCollectionRef, (snapshot) => {
    const players = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return { id: docSnap.id, userId: data.userId || null, name: data.name || "Jogador", isHost: !!data.isHost, activeDeckId: data.activeDeckId || null, avatarEmoji: data.avatarEmoji || null, avatarPhotoUrl: data.avatarPhotoUrl || null, avatarColor: data.avatarColor || null, joinedAt: data.joinedAt || null, lastSeen: data.lastSeen || null };
    }).filter(isPlayerActive)
      .sort((a, b) => (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0));
    S.currentPlayers = players;
    renderPlayers(players);
    try { localStorage.setItem("osl_players_cache", JSON.stringify(players.map(p => ({ id:p.id, name:p.name, isHost:p.isHost, avatarEmoji:p.avatarEmoji, avatarPhotoUrl:p.avatarPhotoUrl, avatarColor:p.avatarColor })))); } catch (_) {}
  }, (err) => { console.error("bindPlayers onSnapshot error:", err); });
}

export function bindTyping() {
  const q = query(S.typingCollectionRef, orderBy("updatedAt", "asc"));
  S.typingUnsub = onSnapshot(q, (snapshot) => {
    const names = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })).filter(item => item.id !== S.participantId).map(item => item.name).filter(Boolean);
    renderTyping(names);
  });
}

export function bindMessages() {
  const q = query(S.messagesRef, orderBy("createdAt", "asc"));
  S.messagesUnsub = onSnapshot(q, (snapshot) => {
    const docs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    renderMessages(docs);
    const currentIds = new Set(docs.map(item => item.id));
    if (!S.initialMessagesLoaded) { S.knownMessageIds = currentIds; S.initialMessagesLoaded = true; return; }
    docs.forEach((item) => {
      if (S.knownMessageIds.has(item.id)) return;
      const isOwn       = item.authorId === S.participantId;
      const shouldPlay  = item.type === "system" || (item.type === "user" && !isOwn);
      if (shouldPlay) playIncomingMessageSound();
    });
    S.knownMessageIds = currentIds;
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export async function sendMessage(text) {
  if (!text) return;
  clearTimeout(S.typingTimer);
  await setTyping(false);
  await addDoc(S.messagesRef, { type:"user", authorId: S.participantId, authorName: S.playerName, text, createdAt: serverTimestamp() });
  evaluateChatResponse(text);
  checkMissionChatCompletion(text);
  await updateDoc(S.roomRef, { updatedAt: serverTimestamp() });
}

// ── Sessão ────────────────────────────────────────────────────────────────────
export async function startSession() {
  const startBtn = document.getElementById("startBtn");
  if (!S.isHost) {
    showOslToast("Apenas o anfitrião pode iniciar o ritual.", "warn");
    return { ok: false, code: "HOST_REQUIRED" };
  }
  if (startBtn?.dataset.busy === "1") return { ok: false, code: "ACTION_IN_PROGRESS" };
  if (startBtn) {
    startBtn.dataset.busy = "1";
    startBtn.disabled = true;
    startBtn.textContent = "Iniciando...";
  }
  const deckInfo = document.getElementById("deckInfo");
  try {
    const snap = await getDoc(S.roomRef);
    if (!snap.exists()) {
      showOslToast("A sala não foi encontrada. Recarregue a página e tente novamente.", "error");
      return { ok: false, code: "ROOM_NOT_FOUND" };
    }
    const data = snap.data();
    if (data.status === "started") {
      const ok = confirm("O ritual já está em andamento. Deseja reiniciá-lo com um novo deck embaralhado?");
      return ok ? resetRitualDeck() : { ok: false, code: "CANCELLED" };
    }
    if (deckInfo) deckInfo.textContent = "Iniciando o ritual...";

    // O backend valida host/token e cria a sessão primeiro. Só então publicamos
    // o estado visual da sala, evitando uma sala marcada como iniciada após erro.
    let result = await startRitualDeck();

    // TRANSICAO_INVALIDA ocorre quando o listener da sala (status→waiting) chegou
    // antes do listener de ritual/state (started→false) — corrida entre os dois.
    // Retry único após 700 ms para o engine sincronizar com o Firestore.
    if (!result?.ok && result?.code === "TRANSICAO_INVALIDA" && result?.phase === "RITUAL_ACTIVE") {
      await new Promise(r => setTimeout(r, 700));
      result = await startRitualDeck();
    }

    if (!result?.ok) {
      const errCode = result?.code
        || result?.error?.error
        || (typeof result?.error === 'string' ? result.error : null)
        || "?";
      console.error('[startSession] falhou:', errCode, result);
      showOslToast(`Não foi possível iniciar o ritual. [${errCode}]`, "error");
      return result || { ok: false };
    }

    await updateDoc(S.roomRef, { status:"started", startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    addDoc(S.messagesRef, { type:"system", text:"O anfitrião iniciou o ritual. A próxima etapa pode começar.", createdAt: serverTimestamp() }).catch(() => {});
    await panelMarkSessionStart();
    showOslToast("Ritual iniciado.", "success");
    return result;
  } catch (error) {
    console.error("Erro ao iniciar ritual:", error);
    showOslToast("Não foi possível iniciar o ritual. Verifique a conexão e tente novamente.", "error");
    return { ok: false, error: error?.message || String(error) };
  } finally {
    if (startBtn) {
      delete startBtn.dataset.busy;
      startBtn.disabled = !S.isHost || S.ritualStarted || S._isSpectator;
      startBtn.textContent = S.ritualStarted ? "Ritual iniciado" : "Iniciar Ritual";
    }
  }
}

export async function leaveRoom(redirect = true) {
  if (S.leaving) return;
  S.leaving = true;
  try {
    clearInterval(S.heartbeatTimer);
    clearTimeout(S.typingTimer);
    await setTyping(false);
    if (S.isHost && S.sessionId) {
      const ended = await endGameSession();
      if (!ended?.ok) console.warn("A sessão foi fechada sem confirmação do settlement:", ended?.error);
    }
    if (S.roomUnsub)          S.roomUnsub();
    if (S.playersUnsub)       S.playersUnsub();
    if (S.messagesUnsub)      S.messagesUnsub();
    if (S.typingUnsub)        S.typingUnsub();
    if (S.ritualUnsub)        S.ritualUnsub();
    if (S.ritualHistoryUnsub) S.ritualHistoryUnsub();
    logEvent("PLAYER_LEFT", { nickname: S.playerName, isHost: S.isHost }).catch(() => {});
    if (!S.isHost) {
      setPlayerConnected(false).catch(() => {});
      clearActiveSession().catch(() => {});
    }
    if (S.isHost) {
      await updateDoc(S.roomRef, {
        status: "closed",
        arenaActive: false,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    await panelMarkSessionEnd();
    await PanelBridge.playerLeave(S.roomCode, S.participantId);
    await deleteDoc(S.playerRef);
  } catch (_) {}
  if (redirect) window.location.href = "./entrada.html";
}

// ── Histórico de sessões ──────────────────────────────────────────────────────
function openSessionHistoryModal(sessions, stats) {
  document.querySelector(".sessionHistoryOverlay")?.remove();
  const fmt = (ms)  => ms  ? new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—";
  const dur = (sec) => !sec ? "—" : sec >= 60 ? `${Math.round(sec / 60)} min` : "< 1 min";

  const rows = sessions.map(s => {
    const date  = fmt(s.createdAt);
    const cards = s.summary?.cardsRevealed ?? "—";
    const time  = dur(s.summary?.durationSec);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:13px;">
      <span style="opacity:.5">${date}</span>
      <span>🃏 ${cards}</span>
      <span>⏱ ${time}</span>
    </div>`;
  }).join("");

  let statsBanner = "";
  if (stats) {
    const totalMin = stats.totalPlayTimeSec >= 60 ? `${Math.round(stats.totalPlayTimeSec / 60)} min` : "< 1 min";
    const avgMin   = stats.avgDurationSec   >= 60 ? `${Math.round(stats.avgDurationSec   / 60)} min` : "< 1 min";
    const emojiStr = stats.topEmoji ? ` • ${stats.topEmoji} favorito` : "";
    statsBanner = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:16px 0;text-align:center;">
      <div style="background:rgba(255,255,255,.06);border-radius:8px;padding:10px 4px;">
        <div style="font-size:20px;font-weight:700;">${stats.totalSessions}</div>
        <div style="font-size:10px;opacity:.5;text-transform:uppercase;letter-spacing:.05em;">sessões</div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:8px;padding:10px 4px;">
        <div style="font-size:20px;font-weight:700;">${stats.totalCardsRevealed}</div>
        <div style="font-size:10px;opacity:.5;text-transform:uppercase;letter-spacing:.05em;">cartas</div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:8px;padding:10px 4px;">
        <div style="font-size:20px;font-weight:700;">${totalMin}</div>
        <div style="font-size:10px;opacity:.5;text-transform:uppercase;letter-spacing:.05em;">jogados</div>
      </div>
    </div>
    <div style="font-size:11px;opacity:.4;text-align:center;margin-bottom:12px;">média ${avgMin}/sessão • ${stats.avgPlayers} jogadores${emojiStr}</div>`;
  }

  const overlay = document.createElement("div");
  overlay.className = "recapOverlay sessionHistoryOverlay";
  overlay.innerHTML = `
    <div class="recapCard" style="max-height:80vh;overflow-y:auto;">
      <div class="recapCard__eyebrow">Sala ${escapeHtml(S.roomCode || "")}</div>
      <div class="recapCard__title">Histórico</div>
      ${statsBanner}
      <div style="margin:4px 0;">${rows || '<p style="opacity:.4;text-align:center;padding:24px 0;">Nenhuma sessão encerrada ainda.</p>'}</div>
      <div class="recapCard__actions">
        <button class="recapCard__btn recapCard__btn--ghost" id="historyModalCloseBtn">FECHAR</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("historyModalCloseBtn").addEventListener("click", () => {
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 300);
  });
}

async function loadSessionHistory() {
  try {
    const [sessResult, statsResult] = await Promise.all([
      fetchRoomSessions(),
      fetchRoomStats(),
    ]);
    const sessions = sessResult?.sessions || [];
    if (!sessions.length) return;

    const stats = statsResult?.stats || null;

    if (document.getElementById("historyBtn")) return;
    const btn = document.createElement("button");
    btn.id        = "historyBtn";
    btn.className = "btn btn--ghost";
    btn.style.cssText = "margin-top:8px;width:100%;font-size:12px;opacity:.6;";
    btn.textContent = `📜 Histórico (${sessions.length} sessão${sessions.length !== 1 ? "ões" : ""})`;
    btn.addEventListener("click", () => openSessionHistoryModal(sessions, stats));

    const anchor = document.getElementById("startBtn") || document.getElementById("arenaBtn");
    anchor?.parentElement?.insertAdjacentElement("afterend", btn);
  } catch (_) {}
}

// ── Beacon de saída (pagehide / beforeunload) ─────────────────────────────────
export function sendLeaveBeacon() {
  try {
    const hostToken = S.isHost ? (sessionStorage.getItem("osl_host_token") || null) : null;
    navigator.sendBeacon?.(
      PanelBridge.baseUrl + "/game/player/leave",
      new Blob([JSON.stringify({
        roomId: S.roomCode,
        playerId: S.participantId,
        ...(hostToken ? { hostToken } : {}),
        ...(!hostToken && S._cachedIdToken ? { firebaseIdToken: S._cachedIdToken } : {}),
      })], { type:"application/json" })
    );
    // Marca jogador como desconectado na sessão (best-effort; usa token cacheado do heartbeat)
    if (S.sessionId && S._cachedIdToken) {
      navigator.sendBeacon?.(
        PanelBridge.baseUrl + "/game/session/player-heartbeat",
        new Blob([JSON.stringify({ roomId: S.roomCode, sessionId: S.sessionId, firebaseIdToken: S._cachedIdToken, connected: false })], { type:"application/json" })
      );
    }
  } catch (_) {}
}

// ── Inicialização da sala ─────────────────────────────────────────────────────
async function clearRoomData() {
  const [msgsSnap, playersSnap, typingSnap, histSnap] = await Promise.all([
    getDocs(S.messagesRef), getDocs(S.playersCollectionRef), getDocs(S.typingCollectionRef), getDocs(S.ritualHistoryRef)
  ]);
  await Promise.allSettled([
    ...msgsSnap.docs.map(d => deleteDoc(d.ref)),
    ...playersSnap.docs.map(d => deleteDoc(d.ref)),
    ...typingSnap.docs.map(d => deleteDoc(d.ref)),
    ...histSnap.docs.map(d => deleteDoc(d.ref)),
    deleteDoc(S.ritualRef)
  ]);
}

export async function ensureRoom() {
  const snap    = await getDoc(S.roomRef);
  const isClosed = snap.exists() && snap.data().status === "closed";
  if (!snap.exists() || isClosed) {
    S.isHost = true;
    if (isClosed) await clearRoomData();
    await setDoc(S.roomRef, { code: S.roomCode, name: S.roomName, status:"waiting", arenaActive: false, hostId: S.participantId, hostName: S.playerName, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await addDoc(S.messagesRef, { type:"system", text:"A sala foi criada. Aguardando jogadores.", createdAt: serverTimestamp() });
  } else {
    S.isHost = snap.data().hostId === S.participantId;
  }
  await panelBootRoom();
}

export async function ensureUserProfile() {
  let snap = await getDoc(S.userRef);
  if (!snap.exists()) {
    const oldUserId = localStorage.getItem("osl_user_id");
    if (oldUserId && oldUserId !== S.userId && /^u_[a-z0-9]{5,30}$/.test(oldUserId)) {
      try {
        const idToken = await S.auth?.currentUser?.getIdToken();
        if (idToken) {
          const res = await fetch(BACKEND_BASE_URL + "/game/migrar-perfil", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
            body: JSON.stringify({ oldUserId })
          });
          if (res.ok) snap = await getDoc(S.userRef);
        }
      } catch (_) {}
    }
  }
  if (!snap.exists()) {
    const usernameBase = (S.playerName || "jogador").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]/g,"").slice(0,20) || "jogador";
    await setDoc(S.userRef, {
      schemaVersion: 1,
      uid: S.userId,
      userId: S.userId,
      displayName: S.playerName,
      username: usernameBase,
      bio:"Novo participante do ritual.",
      avatarEmoji:"🔮",
      avatarColor:"#1f86d9",
      xp: 0,
      coins: 0,
      memberSince: new Date(),
      lastSeen: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      friends:[],
      incomingRequests:[],
      outgoingRequests:[],
      achievements:{},
      stats:{ gamesPlayed:0, wins:0 }
    });
    S.selectedAvatarEmoji = "🔮"; S.selectedAvatarColor = "#1f86d9";
    const fab = document.getElementById("mobileProfileBtn"); if (fab) fab.textContent = "🔮";
    const myBtn = document.getElementById("myProfileBtn"); if (myBtn) myBtn.textContent = "🔮 Perfil";
    localStorage.setItem("osl_cache_uid", S.userId);
    localStorage.setItem("osl_avatar", "🔮");
  } else {
    await updateDoc(S.userRef, { lastSeen: serverTimestamp(), lastSeenAt: serverTimestamp() });
    const data = snap.data();
    const canonicalName = String(data.displayName || data.username || S.playerName || "Jogador").trim().slice(0, 40);
    if (canonicalName) {
      S.playerName = canonicalName;
      localStorage.setItem("osl_nome", canonicalName);
    }
    localStorage.setItem("osl_cache_uid", S.userId);
    const avatar = data.avatar && typeof data.avatar === "object" ? data.avatar : {};
    const emoji = avatar.emoji || data.avatarEmoji;
    const color = avatar.color || data.avatarColor;
    const photoUrl = avatar.url || data.avatarPhotoUrl || data.photoURL || S.auth?.currentUser?.photoURL || null;
    S.selectedAvatarPhoto = photoUrl;
    if (photoUrl) { localStorage.setItem("osl_avatar_photo", photoUrl); localStorage.removeItem("osl_avatar"); }
    else { localStorage.removeItem("osl_avatar_photo"); if (emoji) { S.selectedAvatarEmoji = emoji; localStorage.setItem("osl_avatar", emoji); } }
    if (color) S.selectedAvatarColor = color;
    document.dispatchEvent(new CustomEvent("osl:profileLoaded", { detail: data }));
  }
}

export async function upsertSelf() {
  const playersSnap    = await getDocs(S.playersCollectionRef);
  const activePlayers  = playersSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(isPlayerActive);
  const selfAlreadyActive = activePlayers.some(p => p.id === S.participantId);
  if (!selfAlreadyActive && activePlayers.length >= 5) throw new Error("ROOM_FULL");
  const _photo = S.selectedAvatarPhoto || localStorage.getItem("osl_avatar_photo") || S.auth?.currentUser?.photoURL || null;
  await setDoc(S.playerRef, { id: S.participantId, userId: S.userId, name: S.playerName, isHost: S.isHost, avatarEmoji: _photo ? deleteField() : (S.selectedAvatarEmoji || "🔮"), avatarPhotoUrl: _photo || deleteField(), avatarColor: S.selectedAvatarColor || "#342718", joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }, { merge: true });
  await panelBootRoom();
}

// ── Partidas ao vivo (multiplayer) ────────────────────────────────────────────
const MULTI_SERVER = BACKEND_BASE_URL;

export async function fetchLiveRooms() {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(MULTI_SERVER + "/game/rooms", { signal: ctrl.signal });
    const d = await r.json();
    return Array.isArray(d.rooms) ? d.rooms : [];
  } catch (_) { return []; }
  finally { clearTimeout(tid); }
}

export function renderLiveRooms(rooms) {
  const body    = document.getElementById("multiBody");
  const countEl = document.getElementById("multiCount");
  if (!body) return;
  const others = rooms.filter(r => r.roomId !== S.roomCode);
  if (countEl) countEl.textContent = others.length;
  if (!others.length) { body.innerHTML = '<div class="multiEmpty">Nenhuma partida ativa no momento.</div>'; return; }
  body.innerHTML = others.map(r => {
    const full = r.playerCount >= 5, live = r.sessionActive;
    const badge = full ? '<span class="multiRoomBadge multiRoomBadge--full">LOTADA</span>' : live ? '<span class="multiRoomBadge multiRoomBadge--live">🔴 AO VIVO</span>' : '<span class="multiRoomBadge multiRoomBadge--open">ABERTA</span>';
    const cls   = full ? " multiRoom--full" : "";
    const safeName = escapeHtml(r.name || "Sala").replace(/"/g,"&quot;");
    return `<div class="multiRoom${cls}" data-code="${r.roomId}" data-name="${safeName}" data-host="${escapeHtml(r.host||"").replace(/"/g,"&quot;")}" data-count="${r.playerCount||0}" data-live="${live}">
      <div class="multiRoomInfo"><div class="multiRoomName">${escapeHtml(r.name || r.roomId)}</div><div class="multiRoomMeta">${r.playerCount||0}/5 jogadores · ${escapeHtml(r.host || "anfitrião")}</div></div>
      ${badge}<button class="multiSpectateBtn" title="Assistir em stand-by">👁</button></div>`;
  }).join("");

  body.querySelectorAll(".multiRoom:not(.multiRoom--full)").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.classList.contains("multiSpectateBtn")) return;
      openJoinModal({
        roomId: el.dataset.code,
        name: el.dataset.name,
        host: el.dataset.host,
        playerCount: Number(el.dataset.count || 0),
      });
    });
  });
}

export function showJoinLoadingOverlay(name) {
  const el = document.createElement("div");
  el.className = "joinLoadingOverlay";
  el.innerHTML = `<div class="joinLoadingSpinner"></div><div class="joinLoadingName">${escapeHtml(name || "Sala")}</div><div class="joinLoadingSub">Entrando na partida…</div>`;
  document.body.appendChild(el);
}

export function startMultiPoller() {
  const poll = async () => { const rooms = await fetchLiveRooms(); renderLiveRooms(rooms); };
  poll();
  S._multiPollTimer = setInterval(poll, 10000);
}

// ── Pedido de entrada (Join Modal) ────────────────────────────────────────────
export function openJoinModal(room) {
  S._joinTarget = room;
  const overlay    = document.getElementById("joinOverlay");
  const nameInput  = document.getElementById("joinNameInput");
  document.getElementById("joinRoomName").textContent = room.name;
  document.getElementById("joinRoomMeta").textContent = `${room.playerCount}/5 jogadores · anfitrião: ${room.host || "—"}`;
  document.getElementById("joinStatus").textContent = "";
  document.getElementById("joinStatus").className   = "joinPanel__status";
  document.getElementById("joinSendBtn").disabled   = false;
  document.getElementById("joinSendBtn").textContent = "Enviar pedido";
  nameInput.value = S.playerName;
  overlay.style.display = "flex";
}

export function closeJoinModal() {
  const overlay = document.getElementById("joinOverlay");
  clearInterval(S._joinPollTimer);
  overlay.classList.add("closing");
  setTimeout(() => { overlay.style.display = "none"; overlay.classList.remove("closing"); }, 230);
  S._joinTarget = null;
}

export async function sendJoinRequest() {
  if (!S._joinTarget) return;
  const name = document.getElementById("joinNameInput").value.trim() || S.playerName;
  const btn  = document.getElementById("joinSendBtn");
  btn.disabled = true; btn.textContent = "Enviando…";
  document.getElementById("joinStatus").textContent = "";
  try {
    const firebaseIdToken = await S.auth?.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(MULTI_SERVER + "/game/room/request-join", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        roomId: S._joinTarget.roomId,
        roomName: S._joinTarget.name,
        playerId: S.participantId,
        playerName: name,
        ...(firebaseIdToken ? { firebaseIdToken } : {}),
      })
    });
    const d   = await res.json();
    if (!d.ok) {
      const msgs = { SALA_CHEIA:"Sala lotada.", NOME_JA_EM_USO:`Nome em uso. Tente: ${d.suggestion||"outro nome"}`, SALA_NAO_ENCONTRADA:"Sala não encontrada." };
      document.getElementById("joinStatus").textContent = msgs[d.code] || "Erro ao enviar pedido.";
      btn.disabled = false; btn.textContent = "Enviar pedido"; return;
    }
    document.getElementById("joinStatus").textContent = d.hostOnline ? "Aguardando aprovação do anfitrião…" : "Pedido enviado. Aguardando anfitrião…";
    btn.textContent = "Aguardando…";
    pollJoinApproval(S._joinTarget.roomId, S._joinTarget.name, name);
  } catch (_) { document.getElementById("joinStatus").textContent = "Erro de conexão."; btn.disabled = false; btn.textContent = "Enviar pedido"; }
}

function pollJoinApproval(targetRoomId, targetRoomName, joinName) {
  let attempts = 0;
  clearInterval(S._joinPollTimer);
  S._joinPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > 20) { clearInterval(S._joinPollTimer); document.getElementById("joinStatus").textContent = "Tempo esgotado. Tente novamente."; document.getElementById("joinSendBtn").disabled = false; document.getElementById("joinSendBtn").textContent = "Reenviar"; return; }
    try {
      const result = await PanelBridge.joinStatus(targetRoomId, S.participantId);
      if (result?.status === "approved") {
        clearInterval(S._joinPollTimer);
        document.getElementById("joinStatus").textContent = "✅ Aprovado! Entrando na sala…";
        setTimeout(() => { closeJoinModal(); window.location.href = `sala.html?sala=${encodeURIComponent(targetRoomId)}&nome=${encodeURIComponent(joinName)}&nomeSala=${encodeURIComponent(targetRoomName)}`; }, 800);
      } else if (result?.status === "denied") {
        clearInterval(S._joinPollTimer);
        document.getElementById("joinStatus").textContent = "O anfitrião recusou o pedido.";
        document.getElementById("joinSendBtn").disabled = false;
        document.getElementById("joinSendBtn").textContent = "Enviar novamente";
      }
    } catch (_) {}
  }, 3000);
}

// ── Host SSE ──────────────────────────────────────────────────────────────────
export async function connectHostSse() {
  if (S._hostSseSource) return;
  const hostToken = await ensureHostToken(S.roomCode);
  if (!hostToken || !S.isHost || S._hostSseSource) return;
  const url = MULTI_SERVER + `/game/room/${encodeURIComponent(S.roomCode)}/host-sse?hostToken=${encodeURIComponent(hostToken)}`;
  S._hostSseSource = new EventSource(url);
  S._hostSseSource.addEventListener("join_request", e => {
    try { const d = JSON.parse(e.data); showHostJoinAlert(d.playerId, d.playerName); } catch (_) {}
  });
  S._hostSseSource.onerror = () => {
    S._hostSseSource?.close(); S._hostSseSource = null;
    setTimeout(() => { if (S.isHost) connectHostSse(); }, 10000);
  };
}

export function showHostJoinAlert(playerId, name) {
  S._pendingJoinId = playerId;
  const alertEl = document.getElementById("hostJoinAlert");
  const nameEl  = document.getElementById("hostAlertName");
  if (nameEl)  nameEl.textContent = name;
  if (alertEl) alertEl.style.display = "block";
}

export async function respondJoin(approved) {
  const alertEl = document.getElementById("hostJoinAlert");
  if (!S._pendingJoinId) return;
  try {
    const result = approved
      ? await PanelBridge.approveJoin(S.roomCode, S._pendingJoinId)
      : await PanelBridge.denyJoin(S.roomCode, S._pendingJoinId);
    if (!result?.ok) {
      showOslToast("Não foi possível responder ao pedido. Tente novamente.", "error");
      return;
    }
    if (alertEl) alertEl.style.display = "none";
    S._pendingJoinId = null;
    showOslToast(approved ? "Entrada aprovada." : "Pedido recusado.", approved ? "success" : "info");
  } catch (error) {
    console.error("Erro ao responder pedido de entrada:", error);
    showOslToast("Não foi possível responder ao pedido. Tente novamente.", "error");
  }
}

// ── Painel espectador ────────────────────────────────────────────────────────
let _specLkRoom = null;

export async function closeSpectatorRoom() {
  if (!_specLkRoom) return;
  try { await _specLkRoom.disconnect(); } catch (_) {}
  _specLkRoom = null;
}

export async function spectateRoom(roomId, name) {
  await closeSpectatorRoom();

  const specOverlay = document.getElementById("specOverlay");
  if (!specOverlay || !roomId) return;

  const titleEl   = document.getElementById("specTitle");
  const statusEl  = document.getElementById("specStatusText");
  const dotEl     = document.getElementById("specStatusDot");
  const playersEl = document.getElementById("specPlayers");
  const cardWrap  = document.getElementById("specCardWrap");
  const noticeEl  = document.getElementById("specObservingNotice");
  const liveBadge = document.getElementById("specLiveBadge");

  if (titleEl) titleEl.textContent = name || roomId;
  if (statusEl) statusEl.textContent = "Carregando...";
  if (dotEl) dotEl.className = "specStatusDot";
  if (liveBadge) liveBadge.style.display = "none";
  if (playersEl) playersEl.innerHTML = '<div class="specEmpty" style="padding:32px 0">⏳</div>';
  if (cardWrap) cardWrap.innerHTML = "";
  if (noticeEl) noticeEl.style.display = "flex";
  specOverlay.style.display = "flex";

  try {
    const [panelRes, playersSnap, ritualSnap] = await Promise.all([
      fetch(MULTI_SERVER + "/game/rooms")
        .then(r => r.json())
        .then(data => ({ room: Array.isArray(data.rooms) ? data.rooms.find(item => item.roomId === roomId) : null }))
        .catch(() => null),
      getDocs(collection(S.db, "salas", roomId, "players")).catch(() => null),
      getDoc(doc(S.db, "salas", roomId, "ritual", "state")).catch(() => null),
    ]);

    const room = panelRes?.room;
    const isLive = !!room?.sessionActive;
    const hasVideo = isLive && !!room?.videoActive;
    if (dotEl) dotEl.className = "specStatusDot" + (isLive ? " specStatusDot--live" : "");
    if (statusEl) statusEl.textContent = isLive ? "Ritual em andamento" : "Aguardando início";
    if (liveBadge) liveBadge.style.display = isLive ? "" : "none";

    let players = [];
    if (playersSnap && !playersSnap.empty) {
      playersSnap.forEach(d => {
        const player = d.data();
        if (player.name) players.push({ ...player, _fsId: d.id });
      });
      players.sort((a, b) => {
        if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
        return (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0);
      });
    } else if (room?.players?.length) {
      players = room.players.map(p => ({ name: p.playerName, isHost: p.playerName === room.host, _fsId: p.playerId || "" }));
    }

    if (playersEl) {
      playersEl.innerHTML = players.length ? players.map(player => {
        const isHost = !!player.isHost;
        const safeName = escapeHtml(player.name || "Jogador");
        const participantId = escapeHtml(player._fsId || player.id || "");
        const livePip = hasVideo
          ? '<div class="specPlayerTileLive">📹 AO VIVO</div>'
          : (isLive ? '<div class="specPlayerTileLive">AO VIVO</div>' : "");
        const avatar = player.avatarPhotoUrl
          ? `<img class="specPlayerTileAvatarImg" src="${escapeHtml(player.avatarPhotoUrl)}" alt="">`
          : (player.avatarEmoji
            ? `<span style="font-size:2.2em">${escapeHtml(player.avatarEmoji)}</span>`
            : `<span style="font-size:1.6em;font-weight:800">${escapeHtml((player.name || "?").charAt(0).toUpperCase())}</span>`);
        return `<div class="specPlayerTile${isHost ? " specPlayerTile--host" : ""}" data-participant-id="${participantId}">
          <div class="specPlayerTileAvatar">${avatar}</div>${livePip}
          <div class="${isHost ? "specPlayerTileName--host" : "specPlayerTileName"}">${isHost ? "👑 " : ""}${safeName}</div>
        </div>`;
      }).join("") : '<div class="specEmpty">Nenhum jogador ativo</div>';
    }

    const ritual = ritualSnap?.exists?.() ? ritualSnap.data() : null;
    const card = ritual?.currentCard;
    if (cardWrap) {
      cardWrap.innerHTML = card && ritual?.started
        ? `<div class="specCard"><div class="specCardType">${escapeHtml((card.type || "Ritual").toUpperCase())}</div><div class="specCardTitle">${escapeHtml(card.title || "")}</div><div class="specCardText">${escapeHtml(card.text || "").replace(/\n/g, "<br>")}</div></div>`
        : '<div class="specEmpty">Ritual ainda não iniciado</div>';
    }

    if (hasVideo) {
      try {
        const [tokenRes, livekit] = await Promise.all([
          fetch(`${MULTI_SERVER}/spectate-token?room=${encodeURIComponent(roomId)}&user=${encodeURIComponent(S.participantId)}`).then(r => r.json()),
          import("https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs"),
        ]);
        if (tokenRes?.ok && tokenRes?.token && specOverlay.style.display !== "none") {
          const lkRoom = new livekit.Room({ adaptiveStream: false, dynacast: false });
          _specLkRoom = lkRoom;
          lkRoom.on(livekit.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            if (track.kind !== "video") return;
            const avatarEl = playersEl?.querySelector(`[data-participant-id="${CSS.escape(participant.identity)}"] .specPlayerTileAvatar`);
            if (!avatarEl) return;
            const videoEl = track.attach();
            videoEl.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
            avatarEl.replaceChildren(videoEl);
          });
          lkRoom.on(livekit.RoomEvent.TrackUnsubscribed, track => track.detach());
          await lkRoom.connect(tokenRes.url || "wss://osextolugar-eqa7q1iz.livekit.cloud", tokenRes.token, { autoSubscribe: true });
        }
      } catch (_) { /* O painel continua útil sem vídeo ao vivo. */ }
    }
  } catch (error) {
    console.error("Erro ao abrir modo espectador:", error);
    if (statusEl) statusEl.textContent = "Erro ao carregar dados da sala";
  }
}

// ── Event listeners (inicializados por init.js) ───────────────────────────────
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand?.("copy");
  input.remove();
  if (!copied) throw new Error("CLIPBOARD_UNAVAILABLE");
}

async function runRitualButtonAction(button, action, fallbackMessage) {
  if (button?.dataset.busy === "1") return { ok: false, code: "ACTION_IN_PROGRESS" };
  if (button) { button.dataset.busy = "1"; button.disabled = true; }
  try {
    const result = await action();
    if (result?.ok === false && !["CANCELLED", "ACTION_IN_PROGRESS"].includes(result.code)) {
      const message = result.code === "EFFECT_PENDING"
        ? "Conclua o efeito atual antes de revelar outra carta."
        : fallbackMessage;
      showOslToast(message, result.code === "EFFECT_PENDING" ? "warn" : "error");
    }
    return result;
  } catch (error) {
    console.error(fallbackMessage, error);
    showOslToast(fallbackMessage, "error");
    return { ok: false, error: error?.message || String(error) };
  } finally {
    if (button) delete button.dataset.busy;
    document.dispatchEvent(new CustomEvent("osl:updateRitualButtons"));
  }
}

export function bindRoomEvents() {
  const copyCodeBtn  = document.getElementById("copyCodeBtn");
  const sendBtn      = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const startBtn     = document.getElementById("startBtn");
  const revealCardBtn = document.getElementById("revealCardBtn");
  const resetRitualBtn = document.getElementById("resetRitualBtn");
  const leaveBtn      = document.getElementById("leaveBtn");

  copyCodeBtn?.addEventListener("click", async () => {
    const originalText = copyCodeBtn.textContent;
    try {
      await copyText(S.roomCode);
      copyCodeBtn.textContent = "Código copiado!";
      showOslToast(`Código ${S.roomCode} copiado.`, "success");
      addDoc(S.messagesRef, { type:"system", text:"O código da sala foi copiado.", createdAt: serverTimestamp() }).catch(() => {});
    } catch (error) {
      console.error("Erro ao copiar código da sala:", error);
      showOslToast(`Código da sala: ${S.roomCode}`, "warn");
    } finally {
      setTimeout(() => { copyCodeBtn.textContent = originalText; }, 1800);
    }
  });

  const submitMessage = async () => {
    const text = messageInput?.value.trim();
    if (!text || sendBtn?.dataset.busy === "1") return;
    if (sendBtn) { sendBtn.dataset.busy = "1"; sendBtn.disabled = true; }
    try {
      await sendMessage(text);
      messageInput.value = "";
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      showOslToast("Não foi possível enviar a mensagem.", "error");
    } finally {
      if (sendBtn) { delete sendBtn.dataset.busy; sendBtn.disabled = false; }
    }
  };
  sendBtn?.addEventListener("click", submitMessage);
  messageInput?.addEventListener("input", () => {
    if (messageInput.value.trim()) { setTyping(true); scheduleTypingStop(); }
    else { clearTimeout(S.typingTimer); setTyping(false); }
  });
  messageInput?.addEventListener("blur", () => { clearTimeout(S.typingTimer); setTyping(false); });
  messageInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); submitMessage(); } });
  startBtn?.addEventListener("click", startSession);
  revealCardBtn?.addEventListener("click", () => runRitualButtonAction(revealCardBtn, revealNextRitualCard, "Não foi possível revelar a carta."));
  resetRitualBtn?.addEventListener("click", () => {
    const reset = () => runRitualButtonAction(resetRitualBtn, resetRitualDeck, "Não foi possível reiniciar o ritual.");
    if (S.ritualStarted) showSessionRecap(reset).catch(error => { console.error(error); showOslToast("Não foi possível abrir o resumo da sessão.", "error"); });
    else if (confirm("Deseja reiniciar o ritual e embaralhar o deck novamente?")) reset();
  });
  leaveBtn?.addEventListener("click", () => {
    const isArena = document.documentElement.classList.contains("arenaMode");
    if (S.ritualStarted && isArena) {
      // Sair da Arena sempre passa pelo controlador que separa a visualização
      // local do estado compartilhado. Chamar só deactivateArenaMode removia o
      // fullscreen, mas deixava carta/mesa ocupando o lugar do lobby.
      const exitArena = () => window._osl.deactivateArenaForAll?.();
      showSessionRecap(exitArena, "SAIR DA ARENA").catch(console.error);
    } else if (S.ritualStarted) {
      showSessionRecap(() => leaveRoom(true), "SAIR DA SALA").catch(console.error);
    } else if (confirm("Deseja sair da sala?")) {
      leaveRoom(true);
    }
  });
  document.getElementById("joinCancelBtn")?.addEventListener("click", closeJoinModal);
  document.getElementById("joinSendBtn")?.addEventListener("click", sendJoinRequest);
  document.getElementById("joinOverlay")?.addEventListener("click", e => { if (e.target === document.getElementById("joinOverlay")) closeJoinModal(); });
  document.getElementById("hostApproveBtn")?.addEventListener("click", () => respondJoin(true));
  document.getElementById("hostDenyBtn")?.addEventListener("click",    () => respondJoin(false));
  const xpCardLevel = document.getElementById("xpCardLevel");
  if (xpCardLevel) {
    xpCardLevel.setAttribute("role", "button");
    xpCardLevel.tabIndex = 0;
    xpCardLevel.addEventListener("click", () => showLevelPanel(S._currentXp));
    xpCardLevel.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showLevelPanel(S._currentXp); } });
  }
  document.getElementById("deckModalBtn")?.addEventListener("click", () => {
    import("../game/deckModal.js").then(module => module.showDeckModal()).catch(error => {
      console.error("Erro ao abrir deck:", error);
      showOslToast("Não foi possível abrir o deck.", "error");
    });
  });

  window.addEventListener("pagehide",     sendLeaveBeacon);
  window.addEventListener("beforeunload", sendLeaveBeacon);

  // Toast para o próprio jogador ao reconectar a uma sessão em andamento
  window.addEventListener("osl:session-reconnected", () => {
    window.showOslToast?.("🔄 Você está de volta!");
  });

  // Evento customizado de osl:openProfile (disparado por renderPlayers)
  document.addEventListener("osl:openProfile", e => document.dispatchEvent(new CustomEvent("osl:openProfileModal", { detail: e.detail })));
}
