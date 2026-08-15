import { S } from "./state.js";
import { BACKEND_BASE_URL } from "./constants.js";

const SERVER_BASE = BACKEND_BASE_URL;
const HOST_TOKEN_KEY      = "osl_host_token";
const HOST_TOKEN_ROOM_KEY = "osl_host_token_room";

function _normalizeRoomId(roomId) {
  return String(roomId || "").trim();
}

function _resultCode(result) {
  if (!result || typeof result !== "object") return null;
  if (typeof result.code === "string") return result.code;
  if (typeof result.error === "string") return result.error;
  if (result.error && typeof result.error === "object") {
    if (typeof result.error.code === "string") return result.error.code;
    if (typeof result.error.error === "string") return result.error.error;
  }
  return null;
}

function _readHostToken(roomId) {
  const normalizedRoomId = _normalizeRoomId(roomId);
  try {
    const token     = sessionStorage.getItem(HOST_TOKEN_KEY) || null;
    const tokenRoom = sessionStorage.getItem(HOST_TOKEN_ROOM_KEY) || "";
    if (!token) return null;
    if (tokenRoom && normalizedRoomId && tokenRoom !== normalizedRoomId) return null;
    return token;
  } catch (_) {
    return null;
  }
}

function _storeHostToken(roomId, token) {
  if (!token) return;
  try {
    sessionStorage.setItem(HOST_TOKEN_KEY, String(token));
    sessionStorage.setItem(HOST_TOKEN_ROOM_KEY, _normalizeRoomId(roomId));
  } catch (_) {}
}

function _clearHostToken(roomId) {
  try {
    const tokenRoom = sessionStorage.getItem(HOST_TOKEN_ROOM_KEY) || "";
    const normalizedRoomId = _normalizeRoomId(roomId);
    if (tokenRoom && normalizedRoomId && tokenRoom !== normalizedRoomId) return;
    sessionStorage.removeItem(HOST_TOKEN_KEY);
    sessionStorage.removeItem(HOST_TOKEN_ROOM_KEY);
  } catch (_) {}
}

async function _post(path, data = {}) {
  try {
    const res  = await fetch(SERVER_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) { console.error("PanelBridge erro:", path, json || res.status); return { ok: false, error: json || res.status }; }
    return json || { ok: true };
  } catch (error) {
    console.error("PanelBridge falha:", path, error);
    return { ok: false, error: error.message || String(error) };
  }
}

async function _get(path) {
  try {
    const res  = await fetch(SERVER_BASE + path, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("PanelBridge erro:", path, json || res.status);
      return { ok: false, error: json || res.status };
    }
    return json || { ok: true };
  } catch (error) {
    console.error("PanelBridge falha:", path, error);
    return { ok: false, error: error.message || String(error) };
  }
}

let _hostTokenRequest = null;

export async function ensureHostToken(roomId = S.roomCode, forceRefresh = false) {
  const normalizedRoomId = _normalizeRoomId(roomId || S.roomCode);
  if (!normalizedRoomId) return null;

  if (!forceRefresh) {
    const cached = _readHostToken(normalizedRoomId);
    if (cached) return cached;
  } else {
    _clearHostToken(normalizedRoomId);
  }

  if (_hostTokenRequest?.roomId === normalizedRoomId) {
    const pendingToken = await _hostTokenRequest.promise;
    if (pendingToken || !forceRefresh) return pendingToken;
  }

  const promise = (async () => {
    const firebaseIdToken = await _getFirebaseIdToken();
    if (!firebaseIdToken) return null;
    const result = await _post("/game/room/host-token", {
      roomId: normalizedRoomId,
      firebaseIdToken,
    });
    if (!result?.ok || !result.hostToken) return null;
    _storeHostToken(normalizedRoomId, result.hostToken);
    return result.hostToken;
  })();

  _hostTokenRequest = { roomId: normalizedRoomId, promise };
  try {
    return await promise;
  } finally {
    if (_hostTokenRequest?.promise === promise) _hostTokenRequest = null;
  }
}

function _isHostTokenError(result) {
  const code = _resultCode(result);
  return code === "HOST_TOKEN_INVALIDO" || code === "HOST_TOKEN_OBRIGATORIO";
}

async function _hostPost(path, data, { tokenOptional = false, suppliedToken = null } = {}) {
  const roomId = _normalizeRoomId(data?.roomId || S.roomCode);
  let hostToken = suppliedToken || _readHostToken(roomId);
  const shouldRecover = !tokenOptional || !!hostToken || (roomId === _normalizeRoomId(S.roomCode) && S.isHost);

  if (!hostToken && shouldRecover) hostToken = await ensureHostToken(roomId);

  const payload = { ...data, ...(hostToken ? { hostToken } : {}) };
  let result = await _post(path, payload);

  if (_isHostTokenError(result) && shouldRecover) {
    const refreshedToken = await ensureHostToken(roomId, true);
    if (refreshedToken) {
      result = await _post(path, { ...data, hostToken: refreshedToken });
    }
  }

  return result;
}

export const PanelBridge = {
  baseUrl: SERVER_BASE,

  async roomCreate(roomId, name, host) {
    const normalizedRoomId = _normalizeRoomId(roomId);
    const result = await _post("/game/room/create", {
      roomId: normalizedRoomId,
      name: String(name || "").trim(),
      host: String(host || "").trim(),
    });
    if (result?.ok && result.hostToken) _storeHostToken(normalizedRoomId, result.hostToken);
    return result;
  },
  playerJoin: (roomId, playerId, playerName, hostToken) => _post("/game/player/join", {
    roomId: _normalizeRoomId(roomId),
    playerId: String(playerId || "").trim(),
    playerName: String(playerName || "").trim(),
    ...(hostToken ? { hostToken: String(hostToken) } : {}),
  }),
  playerLeave: (roomId, playerId, hostToken) => _hostPost("/game/player/leave", {
    roomId: _normalizeRoomId(roomId),
    playerId: String(playerId || "").trim(),
  }, { tokenOptional: true, suppliedToken: hostToken }),
  sessionStart: (roomId, hostToken) => _hostPost("/game/session/start", {
    roomId: _normalizeRoomId(roomId),
  }, { suppliedToken: hostToken }),
  sessionEnd: (roomId, hostToken) => _hostPost("/game/session/end", {
    roomId: _normalizeRoomId(roomId),
  }, { suppliedToken: hostToken }),
  video: (roomId, active, hostToken) => _hostPost("/game/video", {
    roomId: _normalizeRoomId(roomId), active: !!active,
  }, { suppliedToken: hostToken }),
  recording: (roomId, active, hostToken) => _hostPost("/game/recording", {
    roomId: _normalizeRoomId(roomId), active: !!active,
  }, { suppliedToken: hostToken }),
  approveJoin: (roomId, playerId, hostToken) => _hostPost("/game/room/approve-join", {
    roomId: _normalizeRoomId(roomId), playerId: String(playerId || "").trim(),
  }, { suppliedToken: hostToken }),
  denyJoin: (roomId, playerId, hostToken) => _hostPost("/game/room/deny-join", {
    roomId: _normalizeRoomId(roomId), playerId: String(playerId || "").trim(),
  }, { suppliedToken: hostToken }),
  joinStatus: (roomId, playerId) => _get(`/game/room/${encodeURIComponent(_normalizeRoomId(roomId))}/join-status?playerId=${encodeURIComponent(String(playerId || "").trim())}`),
  roomHeartbeat: (roomId) => _post("/game/room/heartbeat", { roomId: _normalizeRoomId(roomId) }),
};

// Exponha para scripts não-módulo (mobile.js, recording modal, etc.)
window.PanelBridge = PanelBridge;

let _panelBootRequest = null;

// ── Funções de ponte com o painel backend ─────────────────────────────────────

export async function panelBootRoom() {
  if (S.panelRoomBooted) return { ok: true, alreadyBooted: true };
  if (_panelBootRequest) return _panelBootRequest;

  const request = (async () => {
    let hostToken = _readHostToken(S.roomCode);
    const createResult = await PanelBridge.roomCreate(S.roomCode, S.roomName, S.playerName);
    const createCode   = _resultCode(createResult);

    if (createResult?.ok && createResult.hostToken) {
      hostToken = createResult.hostToken;
    } else if (createCode === "SALA_JA_EXISTE") {
      // Recarregar a página não deve inutilizar uma sala ainda ativa no painel.
      if (S.isHost) hostToken = (await ensureHostToken(S.roomCode, true)) || hostToken;
    } else {
      return createResult || { ok: false, error: "ERRO_GAME_ROOM_CREATE" };
    }

    const joinResult = await PanelBridge.playerJoin(
      S.roomCode,
      S.participantId,
      S.playerName,
      hostToken,
    );
    if (!joinResult?.ok) return joinResult;

    S.panelRoomBooted = true;
    return joinResult;
  })().catch((error) => {
    console.error("Erro ao registrar sala no painel:", error);
    return { ok: false, error: error?.message || String(error) };
  });

  _panelBootRequest = request;
  try {
    return await request;
  } finally {
    if (_panelBootRequest === request) _panelBootRequest = null;
  }
}

async function _getFirebaseIdToken() {
  try { return (await S.auth?.currentUser?.getIdToken()) || null; } catch (_) { return null; }
}

async function _participantAuth() {
  return { participantId: S.participantId, firebaseIdToken: await _getFirebaseIdToken() };
}

// ── Ritual: ações de host (backend constrói deck e avança cartas) ─────────────
export async function ritualStart(players) {
  const firebaseIdToken = await _getFirebaseIdToken();
  return _hostPost("/game/ritual/start", { roomId: S.roomCode, firebaseIdToken, players });
}

export async function ritualNextCard(players) {
  return _hostPost("/game/ritual/next-card", { roomId: S.roomCode, players });
}

export async function ritualReset(players) {
  const firebaseIdToken = await _getFirebaseIdToken();
  return _hostPost("/game/ritual/reset", { roomId: S.roomCode, firebaseIdToken, players });
}

// ── Ações de participante (votos, reações, AI, pressão social) ────────────────
export async function ritualVote(option) {
  return _post("/game/ritual/vote", { roomId: S.roomCode, ...(await _participantAuth()), option, sessionId: S.sessionId });
}

export async function ritualReact(emoji) {
  return _post("/game/ritual/react", { roomId: S.roomCode, ...(await _participantAuth()), emoji, playerName: S.playerName, sessionId: S.sessionId });
}

export async function ritualAiDetect(source, playerName, message) {
  return _post("/game/ritual/ai-detect", { roomId: S.roomCode, ...(await _participantAuth()), source, playerName, message: message || null, sessionId: S.sessionId });
}

export async function ritualSocialPressure() {
  return _post("/game/ritual/social-pressure", { roomId: S.roomCode, ...(await _participantAuth()), playerName: S.playerName, sessionId: S.sessionId });
}

export async function ritualResolveEffect(winner, dismissOnly) {
  return _hostPost("/game/ritual/resolve-effect", { roomId: S.roomCode, winner: winner || null, dismissOnly: !!dismissOnly, sessionId: S.sessionId });
}

export async function sessionLogEvent(type, payload = {}) {
  if (!S.sessionId) return { ok: false };
  return _post("/game/session/log-event", {
    roomId:    S.roomCode,
    sessionId: S.sessionId,
    ...(await _participantAuth()),
    type,
    payload,
  });
}

export async function panelMarkSessionStart() {
  if (S.panelSessionActive) return;
  try {
    const result = await PanelBridge.sessionStart(S.roomCode);
    if (result?.ok) S.panelSessionActive = true;
    return result;
  } catch (error) {
    console.error("Erro ao iniciar sessão no painel:", error);
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function panelMarkSessionEnd() {
  if (!S.panelSessionActive) return;
  try {
    const result = await PanelBridge.sessionEnd(S.roomCode);
    if (result?.ok) S.panelSessionActive = false;
    return result;
  } catch (error) {
    console.error("Erro ao encerrar sessão no painel:", error);
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function panelMarkVideo(active) {
  try { return await PanelBridge.video(S.roomCode, !!active); }
  catch (error) { console.error("Erro ao atualizar vídeo no painel:", error); return { ok: false, error: error?.message || String(error) }; }
}

export async function panelMarkRecording(active) {
  try { return await PanelBridge.recording(S.roomCode, !!active); }
  catch (error) { console.error("Erro ao atualizar gravação no painel:", error); return { ok: false, error: error?.message || String(error) }; }
}

// ── Sessão de jogo: presença e ciclo de vida (escritas via backend/Admin SDK) ──

export async function sessionPlayerJoin() {
  const idToken = await _getFirebaseIdToken();
  return _post("/game/session/player-join", {
    roomId:          S.roomCode,
    sessionId:       S.sessionId,
    participantId:   S.participantId,
    firebaseIdToken: idToken,
    nickname:        S.playerName,
  });
}

export async function sessionPlayerHeartbeat(connected = true) {
  const idToken = await _getFirebaseIdToken();
  return _post("/game/session/player-heartbeat", {
    roomId:          S.roomCode,
    sessionId:       S.sessionId,
    firebaseIdToken: idToken,
    connected:       !!connected,
  });
}

export async function fetchRoomSessions() {
  if (!S.roomCode) return { ok: false, sessions: [] };
  try {
    const idToken = await _getFirebaseIdToken();
    const res = await fetch(SERVER_BASE + `/game/room/${encodeURIComponent(S.roomCode)}/sessions`, {
      headers: idToken ? { "Authorization": `Bearer ${idToken}` } : {}
    });
    return (await res.json().catch(() => null)) || { ok: false, sessions: [] };
  } catch (_) {
    return { ok: false, sessions: [] };
  }
}

// ── Social: amizades e leaderboard ───────────────────────────────────────────

export async function sendFriendRequest(targetUid) {
  const idToken = await _getFirebaseIdToken();
  if (!idToken) return { ok: false };
  return _post("/social/friend-request", { targetUid, firebaseIdToken: idToken });
}

export async function respondFriendRequest(requesterUid, action) {
  const idToken = await _getFirebaseIdToken();
  if (!idToken) return { ok: false };
  return _post("/social/friend-respond", { requesterUid, action, firebaseIdToken: idToken });
}

export async function fetchFriendsLeaderboard() {
  try {
    const idToken = await _getFirebaseIdToken();
    if (!idToken) return { ok: false, leaderboard: [] };
    const res = await fetch(SERVER_BASE + "/social/leaderboard", {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    return (await res.json().catch(() => null)) || { ok: false, leaderboard: [] };
  } catch (_) { return { ok: false, leaderboard: [] }; }
}

export async function searchUsers(q) {
  try {
    const idToken = await _getFirebaseIdToken();
    if (!idToken) return { ok: false, results: [] };
    const res = await fetch(SERVER_BASE + `/social/search?q=${encodeURIComponent(q)}`, {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    return (await res.json().catch(() => null)) || { ok: false, results: [] };
  } catch (_) { return { ok: false, results: [] }; }
}

export async function fetchRoomStats() {
  if (!S.roomCode) return { ok: false, stats: null };
  try {
    const idToken = await _getFirebaseIdToken();
    if (!idToken) return { ok: false, stats: null };
    const res = await fetch(SERVER_BASE + `/analytics/room/${encodeURIComponent(S.roomCode)}/stats`, {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    return (await res.json().catch(() => null)) || { ok: false, stats: null };
  } catch (_) {
    return { ok: false, stats: null };
  }
}

// ── Cosméticos por moedas ─────────────────────────────────────────────────────

export async function buyWithCoins(cosmeticId) {
  const idToken = await _getFirebaseIdToken();
  if (!idToken) return { ok: false };
  return _post("/cosmetics/buy-with-coins", { cosmeticId, firebaseIdToken: idToken });
}

export async function redeemPendingCoins() {
  const idToken = await _getFirebaseIdToken();
  if (!idToken) return { ok: false, coinsAdded: 0 };
  return _post("/game/redeem-pending-coins", { firebaseIdToken: idToken });
}

export async function sessionEndGame() {
  return _hostPost("/game/session/end-game", {
    roomId:     S.roomCode,
    sessionId:  S.sessionId,
  });
}

// ── Hub "Entre Sessões" ───────────────────────────────────────────────────────
// Retorna: daily, world, friends, fragment, season, events, lastSession, unread

export async function fetchHub() {
  try {
    const idToken = await _getFirebaseIdToken();
    if (!idToken) return { ok: false };
    const res = await fetch(SERVER_BASE + "/hub", {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    return (await res.json().catch(() => null)) || { ok: false };
  } catch (_) { return { ok: false }; }
}

// ── Compatibilidade pairwise ──────────────────────────────────────────────────
// Retorna { overall, dimensions, confidence, label, hasData } ou null

export async function fetchCompatibility(targetUid) {
  try {
    const idToken = await _getFirebaseIdToken();
    if (!idToken) return null;
    const res = await fetch(SERVER_BASE + `/social/compatibility/${encodeURIComponent(targetUid)}`, {
      headers: { "Authorization": `Bearer ${idToken}` }
    });
    const json = await res.json().catch(() => null);
    return json?.compatibility || null;
  } catch (_) { return null; }
}

// Exponha para o video.js (usa window.panelMarkVideo)
window.panelMarkVideo     = panelMarkVideo;
window.panelMarkRecording = panelMarkRecording;
