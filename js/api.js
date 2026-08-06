import { S } from "./state.js";

const SERVER_BASE =
  window.PANEL_SERVER_BASE ||
  "https://osl-video-server-production.up.railway.app";

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

export const PanelBridge = {
  baseUrl: SERVER_BASE,

  roomCreate:   (roomId, name, host)           => _post("/game/room/create",   { roomId: String(roomId||"").trim(), name: String(name||"").trim(), host: String(host||"").trim() }),
  playerJoin:   (roomId, playerId, playerName) => _post("/game/player/join",   { roomId: String(roomId||"").trim(), playerId: String(playerId||"").trim(), playerName: String(playerName||"").trim() }),
  playerLeave:  (roomId, playerId)             => _post("/game/player/leave",  { roomId: String(roomId||"").trim(), playerId: String(playerId||"").trim() }),
  sessionStart: (roomId)                        => _post("/game/session/start", { roomId: String(roomId||"").trim() }),
  sessionEnd:   (roomId)                        => _post("/game/session/end",   { roomId: String(roomId||"").trim() }),
  video:        (roomId, active)                => _post("/game/video",         { roomId: String(roomId||"").trim(), active: !!active }),
  recording:    (roomId, active)                => _post("/game/recording",     { roomId: String(roomId||"").trim(), active: !!active }),
  roomHeartbeat:(roomId)                        => _post("/game/room/heartbeat",{ roomId: String(roomId||"").trim() })
};

// Exponha para scripts não-módulo (mobile.js, recording modal, etc.)
window.PanelBridge = PanelBridge;

// ── Funções de ponte com o painel backend ─────────────────────────────────────

export async function panelBootRoom() {
  if (S.panelRoomBooted) return;
  S.panelRoomBooted = true;
  try {
    const result = await PanelBridge.roomCreate(S.roomCode, S.roomName, S.playerName);
    if (result?.ok && result?.hostToken) {
      sessionStorage.setItem("osl_host_token", result.hostToken);
    }
    await PanelBridge.playerJoin(S.roomCode, S.participantId, S.playerName);
  } catch (error) {
    console.error("Erro ao registrar sala no painel:", error);
  }
}

async function _getFirebaseIdToken() {
  try { return (await S.auth?.currentUser?.getIdToken()) || null; } catch (_) { return null; }
}

async function _participantAuth() {
  return { participantId: S.participantId, firebaseIdToken: await _getFirebaseIdToken() };
}

export async function ritualStart(players) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  const firebaseIdToken = await _getFirebaseIdToken();
  return _post("/game/ritual/start", { roomId: S.roomCode, hostToken, firebaseIdToken, players });
}

export async function ritualNextCard(players) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  return _post("/game/ritual/next-card", { roomId: S.roomCode, hostToken, players });
}

export async function ritualReset(players) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  const firebaseIdToken = await _getFirebaseIdToken();
  return _post("/game/ritual/reset", { roomId: S.roomCode, hostToken, firebaseIdToken, players });
}

// ── Ações de participante (votos, reações, AI, pressão social) ────────────────
// Todas verificadas server-side via Firebase ID token ou membership na sala.

export async function ritualVote(option) {
  return _post("/game/ritual/vote", { roomId: S.roomCode, ...(await _participantAuth()), option });
}

export async function ritualReact(emoji) {
  return _post("/game/ritual/react", { roomId: S.roomCode, ...(await _participantAuth()), emoji, playerName: S.playerName });
}

export async function ritualAiDetect(source, playerName, message) {
  return _post("/game/ritual/ai-detect", { roomId: S.roomCode, ...(await _participantAuth()), source, playerName, message: message || null });
}

export async function ritualSocialPressure() {
  return _post("/game/ritual/social-pressure", { roomId: S.roomCode, ...(await _participantAuth()), playerName: S.playerName });
}

// Ação exclusiva do host: resolve efeito ativo e/ou descarta AI detection.
// dismissOnly=true → apenas limpa aiDetection sem encerrar o efeito.
export async function ritualResolveEffect(winner, dismissOnly) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  return _post("/game/ritual/resolve-effect", { roomId: S.roomCode, hostToken, winner: winner || null, dismissOnly: !!dismissOnly });
}

export async function panelMarkSessionStart() {
  if (S.panelSessionActive) return;
  S.panelSessionActive = true;
  try { await PanelBridge.sessionStart(S.roomCode); }
  catch (error) { console.error("Erro ao iniciar sessão no painel:", error); }
}

export async function panelMarkSessionEnd() {
  if (!S.panelSessionActive) return;
  S.panelSessionActive = false;
  try { await PanelBridge.sessionEnd(S.roomCode); }
  catch (error) { console.error("Erro ao encerrar sessão no painel:", error); }
}

export async function panelMarkVideo(active) {
  try { await PanelBridge.video(S.roomCode, !!active); }
  catch (error) { console.error("Erro ao atualizar vídeo no painel:", error); }
}

export async function panelMarkRecording(active) {
  try { await PanelBridge.recording(S.roomCode, !!active); }
  catch (error) { console.error("Erro ao atualizar gravação no painel:", error); }
}

// Exponha para o video.js (usa window.panelMarkVideo)
window.panelMarkVideo     = panelMarkVideo;
window.panelMarkRecording = panelMarkRecording;
