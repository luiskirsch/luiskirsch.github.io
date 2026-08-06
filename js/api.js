import { S } from "./state.js";

const SERVER_BASE =
  window.PANEL_SERVER_BASE ||
  localStorage.getItem("PANEL_SERVER_BASE") ||
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

export async function ritualStart(deckCards, players) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  return _post("/game/ritual/start", { roomId: S.roomCode, hostToken, deckCards, players });
}

export async function ritualNextCard(players) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  return _post("/game/ritual/next-card", { roomId: S.roomCode, hostToken, players });
}

export async function ritualReset(deckCards) {
  const hostToken = sessionStorage.getItem("osl_host_token");
  return _post("/game/ritual/reset", { roomId: S.roomCode, hostToken, deckCards });
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
