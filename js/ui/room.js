// UI da sala: listeners Firebase, sessão, chat, jogadores, multiplayer
import { S } from "../state.js";
import { setDoc, updateDoc, addDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, doc, collection } from "../firebase.js";
import { escapeHtml, nowTimeFromDate, initials } from "../utils.js";
import { panelBootRoom, panelMarkSessionStart, panelMarkSessionEnd, PanelBridge } from "../api.js";
import { startRitualDeck, resetRitualDeck, revealNextRitualCard, bindRitual, setRitualWaitingState, updateRitualButtons } from "../game/cards.js";
import { bindMyMission, checkMissionChatCompletion, evaluateChatResponse } from "../game/missions.js";
import { checkDailyReward, showSessionRecap, updateXpCard, showLevelPanel } from "../game/rewards.js";
import { OSL_ACHIEVEMENTS } from "../game/effects.js";

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
    const avatarContent = player.avatarPhotoUrl ? "" : (player.avatarEmoji || initials(player.name));
    const avatarStyle   = player.avatarPhotoUrl
      ? `style="background-image:url('${player.avatarPhotoUrl}');background-size:cover;background-position:center;font-size:0"`
      : (player.avatarEmoji ? `style="font-size:1.3em;background:${player.avatarColor || "#342718"}"` : (player.avatarColor ? `style="background:${player.avatarColor}"` : ""));
    const photoAttr = player.avatarPhotoUrl ? `data-photo-url="${player.avatarPhotoUrl}"` : "";
    div.innerHTML = `
      <div class="playerLeft">
        <div class="avatar" ${avatarStyle} ${photoAttr}>${avatarContent}</div>
        <div class="playerMeta">
          <div class="playerName">${player.id === S.participantId ? oslTr("sala:players.you", "(Você)") : escapeHtml(player.name)}</div>
          <div class="playerRole">${player.isHost ? oslTr("sala:players.host", "Anfitrião") : oslTr("sala:players.participant", "Participante")}</div>
        </div>
      </div>
      <div class="playerRight">
        <span class="playerStatus">${oslTr("sala:players.online", "Online")}</span>
        ${player.isHost ? `<span class="playerHost">${oslTr("sala:players.hostBadge", "Host")}</span>` : ""}
      </div>`;
    div.addEventListener("click", () => document.dispatchEvent(new CustomEvent("osl:openProfile", { detail: player })));
    playerListEl.appendChild(div);
  });

  if (playerCountEl)  playerCountEl.textContent   = String(players.length);
  if (playersEmptyEl) playersEmptyEl.style.display = players.length > 1 ? "none" : "block";
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

// Mensagens system geradas em PT antes da i18n. Reescreve no render se bater.
const SYSTEM_MSG_PT_TO_KEY = {
  "A sala foi criada. Aguardando jogadores.": "sala:chat.systemRoomCreated",
  "O anfitrião iniciou o ritual. A próxima etapa pode começar.": "sala:ritual.systemHostStarted",
  "O código da sala foi copiado.": "sala:ritual.systemRoomCodeCopied",
  "O ritual foi iniciado.": "sala:table.ritualStarted",
  "O ritual foi reiniciado.": "sala:table.ritualReset"
};
function localizeSystemText(text) {
  if (!text) return text;
  const key = SYSTEM_MSG_PT_TO_KEY[text];
  if (!key) return text;
  return oslTr(key, text);
}

// ── Renderização de mensagens ─────────────────────────────────────────────────
function renderMessages(docs) {
  const messagesEl  = document.getElementById("messages");
  const chatEmptyEl = document.getElementById("chatEmpty");
  if (!messagesEl) return;
  messagesEl.innerHTML = "";
  if (!docs.length) {
    if (chatEmptyEl) { chatEmptyEl.style.display = "block"; chatEmptyEl.innerHTML = oslTr("sala:chat.emptyAfterCreate", "A sala foi criada.<br>Quando houver mensagens ou eventos do sistema, eles aparecerão aqui."); }
    return;
  }
  if (chatEmptyEl) chatEmptyEl.style.display = "none";
  docs.forEach((item) => {
    const div = document.createElement("div");
    if (item.type === "system") {
      div.className = "message system"; div.textContent = localizeSystemText(item.text);
    } else {
      const own = item.authorId === S.participantId;
      div.className = "message " + (own ? "me" : "other");
      let timeLabel = "--:--";
      if (item.createdAt && typeof item.createdAt.toDate === "function") timeLabel = nowTimeFromDate(item.createdAt.toDate());
      div.innerHTML = own
        ? `<span class="msgTime">${timeLabel}</span>${escapeHtml(item.text)}`
        : `<span class="meta">${escapeHtml(item.authorName || oslTr("sala:chat.fallbackAuthor", "Jogador"))}</span><span class="msgTime">${timeLabel}</span>${escapeHtml(item.text)}`;
    }
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

const DOTS_HTML = `<span class="typingDots"><span></span><span></span><span></span></span>`;
function renderTyping(names) {
  const typingBarEl = document.getElementById("typingBar");
  const mobileBar   = document.getElementById("mobileTypingBar");
  const wasEmpty    = !(typingBarEl && typingBarEl.firstChild);
  if (!names.length) { if (typingBarEl) typingBarEl.innerHTML = ""; if (mobileBar) mobileBar.innerHTML = ""; return; }
  let label;
  if (names.length === 1)      label = oslTr("sala:typing.one",   "{{name}} está digitando", { name: names[0] });
  else if (names.length === 2) label = oslTr("sala:typing.two",   "{{name1}} e {{name2}} estão digitando", { name1: names[0], name2: names[1] });
  else if (names.length === 3) label = oslTr("sala:typing.three", "{{name1}}, {{name2}} e {{name3}} estão digitando", { name1: names[0], name2: names[1], name3: names[2] });
  else                          label = oslTr("sala:typing.many", "{{name1}}, {{name2}}, {{name3}} e mais {{count}} estão digitando", { name1: names[0], name2: names[1], name3: names[2], count: names.length - 3 });
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
    PanelBridge.roomHeartbeat(S.roomCode).catch(() => {});
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
  S.roomUnsub = onSnapshot(S.roomRef, async (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const roomNameEl   = document.getElementById("roomName");
    const roomStatusEl = document.getElementById("roomStatus");
    const sessionLabelEl = document.getElementById("sessionLabel");
    const footerStatusEl = document.getElementById("footerStatus");
    const startBtn       = document.getElementById("startBtn");
    if (roomNameEl) roomNameEl.textContent = data.name || S.roomName;
    const started = data.status === "started";
    if (roomStatusEl)    roomStatusEl.textContent    = started ? oslTr("sala:footer.ritualActive", "Ritual em andamento") : oslTr("sala:footer.ritualWaiting", "Aguardando jogadores");
    if (sessionLabelEl)  sessionLabelEl.textContent  = started ? oslTr("sala:table.session.started", "Sessão iniciada") : oslTr("sala:table.session.notStarted", "Sessão não iniciada");
    if (footerStatusEl)  footerStatusEl.textContent  = started ? oslTr("sala:footer.ritualStarted", "Ritual iniciado") : oslTr("sala:footer.ritualWaitingStart", "Aguardando início");
    S.isHost = data.hostId === S.participantId;
    if (startBtn) {
      startBtn.disabled = !S.isHost || S._isSpectator;
      startBtn.textContent = S.isHost
        ? (started ? oslTr("sala:buttons.startRitualBtnStarted", "Ritual iniciado") : oslTr("sala:buttons.startRitualBtn", "Iniciar Ritual"))
        : oslTr("sala:buttons.startRitualBtnWaitHost", "Aguardando anfitrião");
    }
    const arenaBtn = document.getElementById("arenaBtn");
    if (arenaBtn) arenaBtn.hidden = !S.isHost;
    if (data.arenaActive) { if (typeof window.activateArenaMode === "function") window.activateArenaMode(); }
    else { if (typeof window.deactivateArenaMode === "function") window.deactivateArenaMode(); if (!started && !S.ritualStarted) setRitualWaitingState(); }
    await setDoc(S.playerRef, { isHost: S.isHost }, { merge: true });
  });
}

export function bindPlayers() {
  const q = query(S.playersCollectionRef, orderBy("joinedAt", "asc"));
  S.playersUnsub = onSnapshot(q, (snapshot) => {
    const players = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return { id: docSnap.id, userId: data.userId || null, name: data.name || oslTr("sala:players.fallbackName", "Jogador"), isHost: !!data.isHost, activeDeckId: data.activeDeckId || null, avatarEmoji: data.avatarEmoji || null, avatarPhotoUrl: data.avatarPhotoUrl || null, avatarColor: data.avatarColor || null, joinedAt: data.joinedAt || null, lastSeen: data.lastSeen || null };
    }).filter(isPlayerActive);
    S.currentPlayers = players;
    renderPlayers(players);
    setTimeout(() => applyVideoTileAvatars(), 800);
    try { localStorage.setItem("osl_players_cache", JSON.stringify(players.map(p => ({ id:p.id, name:p.name, isHost:p.isHost, avatarEmoji:p.avatarEmoji, avatarPhotoUrl:p.avatarPhotoUrl, avatarColor:p.avatarColor })))); } catch (_) {}
  });
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
  if (!S.isHost) return;
  const snap = await getDoc(S.roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.status === "started") {
    const ok = confirm(oslTr("sala:ritual.confirmRestart", "O ritual já está em andamento. Deseja reiniciá-lo com um novo deck embaralhado?"));
    if (ok) await resetRitualDeck();
    return;
  }
  const deckInfo = document.getElementById("deckInfo");
  if (deckInfo) deckInfo.textContent = oslTr("sala:ritual.starting", "Iniciando o ritual...");
  await updateDoc(S.roomRef, { status:"started", startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await addDoc(S.messagesRef, { type:"system", text: oslTr("sala:ritual.systemHostStarted", "O anfitrião iniciou o ritual. A próxima etapa pode começar."), createdAt: serverTimestamp() });
  await startRitualDeck();
  await panelMarkSessionStart();
}

export async function leaveRoom(redirect = true) {
  if (S.leaving) return;
  S.leaving = true;
  try {
    clearInterval(S.heartbeatTimer);
    clearTimeout(S.typingTimer);
    await setTyping(false);
    if (S.roomUnsub)          S.roomUnsub();
    if (S.playersUnsub)       S.playersUnsub();
    if (S.messagesUnsub)      S.messagesUnsub();
    if (S.typingUnsub)        S.typingUnsub();
    if (S.ritualUnsub)        S.ritualUnsub();
    if (S.ritualHistoryUnsub) S.ritualHistoryUnsub();
    await panelMarkSessionEnd();
    await PanelBridge.playerLeave(S.roomCode, S.participantId);
    await deleteDoc(S.playerRef);
  } catch (_) {}
  if (redirect) window.location.href = "./entrada.html";
}

// ── Beacon de saída (pagehide / beforeunload) ─────────────────────────────────
export function sendLeaveBeacon() {
  try {
    navigator.sendBeacon?.(
      PanelBridge.baseUrl + "/game/player/leave",
      new Blob([JSON.stringify({ roomId: S.roomCode, playerId: S.participantId, isHost: S.isHost })], { type:"application/json" })
    );
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
    await addDoc(S.messagesRef, { type:"system", text: oslTr("sala:chat.systemRoomCreated", "A sala foi criada. Aguardando jogadores."), createdAt: serverTimestamp() });
  } else {
    S.isHost = snap.data().hostId === S.participantId;
  }
  await panelBootRoom();
}

export async function ensureUserProfile() {
  const snap = await getDoc(S.userRef);
  if (!snap.exists()) {
    const usernameBase = (S.playerName || "jogador").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]/g,"").slice(0,20) || "jogador";
    await setDoc(S.userRef, { userId: S.userId, displayName: S.playerName, username: usernameBase, bio: oslTr("sala:newProfile.bio", "Novo participante do ritual."), avatarEmoji:"🔮", avatarColor:"#1f86d9", memberSince: serverTimestamp(), lastSeen: serverTimestamp(), friends:[], incomingRequests:[], outgoingRequests:[], stats:{ gamesPlayed:0, wins:0 } });
    S.selectedAvatarEmoji = "🔮"; S.selectedAvatarColor = "#1f86d9";
    const fab = document.getElementById("mobileProfileBtn"); if (fab) fab.textContent = "🔮";
    const myBtn = document.getElementById("myProfileBtn"); if (myBtn) myBtn.textContent = "🔮 Perfil";
    localStorage.setItem("osl_avatar", "🔮");
  } else {
    await updateDoc(S.userRef, { lastSeen: serverTimestamp() });
    const data = snap.data();
    const emoji = data.avatarEmoji, color = data.avatarColor, photoUrl = data.avatarPhotoUrl || null;
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
  await setDoc(S.playerRef, { id: S.participantId, userId: S.userId, name: S.playerName, isHost: S.isHost, avatarEmoji: S.selectedAvatarPhoto ? null : (S.selectedAvatarEmoji || "🔮"), avatarPhotoUrl: S.selectedAvatarPhoto || null, avatarColor: S.selectedAvatarColor || "#342718", joinedAt: serverTimestamp(), lastSeen: serverTimestamp() }, { merge: true });
  await panelBootRoom();
}

// ── Partidas ao vivo (multiplayer) ────────────────────────────────────────────
const MULTI_SERVER = window.PANEL_SERVER_BASE || "https://osl-video-server-production.up.railway.app";

export async function fetchLiveRooms() {
  try { const r = await fetch(MULTI_SERVER + "/game/rooms"); const d = await r.json(); return Array.isArray(d.rooms) ? d.rooms : []; }
  catch (_) { return []; }
}

export function renderLiveRooms(rooms) {
  const body    = document.getElementById("multiBody");
  const countEl = document.getElementById("multiCount");
  if (!body) return;
  const others = rooms.filter(r => r.roomId !== S.roomCode);
  if (countEl) countEl.textContent = others.length;
  if (!others.length) { body.innerHTML = `<div class="multiEmpty">${oslTr("sala:matches.empty", "Nenhuma partida ativa no momento.")}</div>`; return; }
  body.innerHTML = others.map(r => {
    const full = r.playerCount >= 5, live = r.sessionActive;
    const badge = full ? `<span class="multiRoomBadge multiRoomBadge--full">${oslTr("sala:matches.badge.full", "LOTADA")}</span>` : live ? `<span class="multiRoomBadge multiRoomBadge--live">${oslTr("sala:matches.badge.live", "🔴 AO VIVO")}</span>` : `<span class="multiRoomBadge multiRoomBadge--open">${oslTr("sala:matches.badge.open", "ABERTA")}</span>`;
    const cls   = full ? " multiRoom--full" : "";
    const safeName = (r.name || oslTr("sala:matches.fallbackName", "Sala")).replace(/"/g,"&quot;");
    return `<div class="multiRoom${cls}" data-code="${r.roomId}" data-name="${safeName}" data-host="${(r.host||"").replace(/"/g,"&quot;")}" data-count="${r.playerCount||0}" data-live="${live}">
      <div class="multiRoomInfo"><div class="multiRoomName">${r.name || r.roomId}</div><div class="multiRoomMeta">${r.playerCount||0}/5 ${oslTr("sala:matches.playersWord", "jogadores")} · ${r.host || oslTr("sala:matches.fallbackHost", "anfitrião")}</div></div>
      ${badge}<button class="multiSpectateBtn" title="${oslTr("sala:matches.spectateTitle", "Assistir em stand-by")}">👁</button></div>`;
  }).join("");

  body.querySelectorAll(".multiSpectateBtn").forEach(btn => {
    btn.addEventListener("click", e => { e.stopPropagation(); const row = btn.closest(".multiRoom"); document.dispatchEvent(new CustomEvent("osl:openSpectator", { detail:{ roomId: row.dataset.code, name: row.dataset.name, host: row.dataset.host } })); });
  });
  body.querySelectorAll(".multiRoom:not(.multiRoom--full)").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.classList.contains("multiSpectateBtn")) return;
      el.style.opacity = ".45"; el.style.pointerEvents = "none";
      showJoinLoadingOverlay(el.dataset.name);
      setTimeout(() => { window.location.href = `sala.html?sala=${encodeURIComponent(el.dataset.code)}&nome=${encodeURIComponent(S.playerName)}&nomeSala=${encodeURIComponent(el.dataset.name)}`; }, 600);
    });
  });
}

export function showJoinLoadingOverlay(name) {
  const el = document.createElement("div");
  el.className = "joinLoadingOverlay";
  el.innerHTML = `<div class="joinLoadingSpinner"></div><div class="joinLoadingName">${name || "Sala"}</div><div class="joinLoadingSub">Entrando na partida…</div>`;
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
  document.getElementById("joinRoomMeta").textContent = oslTr("sala:joinRoom.meta", "{{count}}/5 jogadores · anfitrião: {{host}}", { count: room.playerCount, host: room.host || "—" });
  document.getElementById("joinStatus").textContent = "";
  document.getElementById("joinStatus").className   = "joinPanel__status";
  document.getElementById("joinSendBtn").disabled   = false;
  document.getElementById("joinSendBtn").textContent = oslTr("sala:joinRoom.send", "Enviar pedido");
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
  btn.disabled = true; btn.textContent = oslTr("sala:joinRoom.sending", "Enviando…");
  document.getElementById("joinStatus").textContent = "";
  try {
    const res = await fetch(MULTI_SERVER + "/game/room/request-join", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ roomId: S._joinTarget.roomId, roomName: S._joinTarget.name, playerId: S.participantId, playerName: name }) });
    const d   = await res.json();
    if (!d.ok) {
      const suggestion = d.suggestion || oslTr("sala:joinRoom.fallbackSuggestion", "outro nome");
      const msgs = {
        SALA_CHEIA: oslTr("sala:joinRoom.errorRoomFull", "Sala lotada."),
        NOME_JA_EM_USO: oslTr("sala:joinRoom.errorNameUsed", "Nome em uso. Tente: {{suggestion}}", { suggestion }),
        SALA_NAO_ENCONTRADA: oslTr("sala:joinRoom.errorRoomNotFound", "Sala não encontrada.")
      };
      document.getElementById("joinStatus").textContent = msgs[d.code] || oslTr("sala:joinRoom.errorGeneric", "Erro ao enviar pedido.");
      btn.disabled = false; btn.textContent = oslTr("sala:joinRoom.send", "Enviar pedido"); return;
    }
    document.getElementById("joinStatus").textContent = d.hostOnline ? oslTr("sala:joinRoom.waitingApproval", "Aguardando aprovação do anfitrião…") : oslTr("sala:joinRoom.waitingHost", "Pedido enviado. Aguardando anfitrião…");
    btn.textContent = oslTr("sala:joinRoom.waiting", "Aguardando…");
    pollJoinApproval(S._joinTarget.roomId, S._joinTarget.name, name);
  } catch (_) { document.getElementById("joinStatus").textContent = oslTr("sala:joinRoom.errorConnection", "Erro de conexão."); btn.disabled = false; btn.textContent = oslTr("sala:joinRoom.send", "Enviar pedido"); }
}

function pollJoinApproval(targetRoomId, targetRoomName, joinName) {
  let attempts = 0;
  clearInterval(S._joinPollTimer);
  S._joinPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > 20) { clearInterval(S._joinPollTimer); document.getElementById("joinStatus").textContent = "Tempo esgotado. Tente novamente."; document.getElementById("joinSendBtn").disabled = false; document.getElementById("joinSendBtn").textContent = "Reenviar"; return; }
    try {
      const r = await fetch(MULTI_SERVER + `/game/room/${encodeURIComponent(targetRoomId)}`);
      const d = await r.json();
      if (!d.ok || !d.room) return;
      if ((d.room.players || []).some(p => p.playerId === S.participantId)) {
        clearInterval(S._joinPollTimer);
        document.getElementById("joinStatus").textContent = "✅ Aprovado! Entrando na sala…";
        setTimeout(() => { closeJoinModal(); window.location.href = `sala.html?sala=${encodeURIComponent(targetRoomId)}&nome=${encodeURIComponent(joinName)}&nomeSala=${encodeURIComponent(targetRoomName)}`; }, 800);
      }
    } catch (_) {}
  }, 3000);
}

// ── Host SSE ──────────────────────────────────────────────────────────────────
export function connectHostSse() {
  if (S._hostSseSource) return;
  S._hostSseSource = new EventSource(MULTI_SERVER + `/game/room/${encodeURIComponent(S.roomCode)}/host-sse`);
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
  if (alertEl) alertEl.style.display = "none";
  if (!S._pendingJoinId) return;
  const endpoint = approved ? "/game/room/approve-join" : "/game/room/deny-join";
  try {
    await fetch(MULTI_SERVER + endpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ roomId: S.roomCode, playerId: S._pendingJoinId }) });
  } catch (_) {}
  S._pendingJoinId = null;
}

// ── Event listeners (inicializados por init.js) ───────────────────────────────
export function bindRoomEvents() {
  const copyCodeBtn  = document.getElementById("copyCodeBtn");
  const sendBtn      = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const startBtn     = document.getElementById("startBtn");
  const revealCardBtn = document.getElementById("revealCardBtn");
  const resetRitualBtn = document.getElementById("resetRitualBtn");
  const leaveBtn      = document.getElementById("leaveBtn");

  copyCodeBtn?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(S.roomCode); await addDoc(S.messagesRef, { type:"system", text: oslTr("sala:ritual.systemRoomCodeCopied", "O código da sala foi copiado."), createdAt: serverTimestamp() }); } catch (_) {}
  });
  sendBtn?.addEventListener("click", () => {
    const text = messageInput?.value.trim();
    if (text) { messageInput.value = ""; sendMessage(text).catch(console.error); }
  });
  messageInput?.addEventListener("input", () => {
    if (messageInput.value.trim()) { setTyping(true); scheduleTypingStop(); }
    else { clearTimeout(S.typingTimer); setTyping(false); }
  });
  messageInput?.addEventListener("blur", () => { clearTimeout(S.typingTimer); setTyping(false); });
  messageInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const text = messageInput.value.trim(); if (text) { messageInput.value = ""; sendMessage(text).catch(console.error); } } });
  startBtn?.addEventListener("click", () => startSession().catch(console.error));
  revealCardBtn?.addEventListener("click", () => revealNextRitualCard().catch(console.error));
  resetRitualBtn?.addEventListener("click", () => {
    if (S.ritualStarted) showSessionRecap(() => resetRitualDeck().catch(console.error)).catch(console.error);
    else if (confirm("Deseja reiniciar o ritual e embaralhar o deck novamente?")) resetRitualDeck().catch(console.error);
  });
  leaveBtn?.addEventListener("click", () => {
    if (S.ritualStarted) showSessionRecap(() => leaveRoom(true), "SAIR DA SALA").catch(console.error);
    else if (confirm("Deseja sair da sala?")) leaveRoom(true);
  });
  document.getElementById("joinCancelBtn")?.addEventListener("click", closeJoinModal);
  document.getElementById("joinSendBtn")?.addEventListener("click", sendJoinRequest);
  document.getElementById("joinOverlay")?.addEventListener("click", e => { if (e.target === document.getElementById("joinOverlay")) closeJoinModal(); });
  document.getElementById("hostApproveBtn")?.addEventListener("click", () => respondJoin(true));
  document.getElementById("hostDenyBtn")?.addEventListener("click",    () => respondJoin(false));
  document.getElementById("xpCardLevel")?.addEventListener("click",    () => showLevelPanel(S._currentXp));

  window.addEventListener("pagehide",     sendLeaveBeacon);
  window.addEventListener("beforeunload", sendLeaveBeacon);

  // Evento customizado de osl:openProfile (disparado por renderPlayers)
  document.addEventListener("osl:openProfile", e => document.dispatchEvent(new CustomEvent("osl:openProfileModal", { detail: e.detail })));
}
