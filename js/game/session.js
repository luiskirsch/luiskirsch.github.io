// Game Session — ciclo de vida gerenciado pelo backend via Admin SDK.
// O cliente não escreve em sessions/* diretamente (Firestore rules: if false).
// Estrutura: salas/{roomCode}/sessions/{sessionId}/events/{id}
//            salas/{roomCode}/sessions/{sessionId}/players/{participantId}

import { S } from "../state.js";
import { updateDoc, getDoc, doc } from "../firebase.js";
import { sessionPlayerJoin, sessionPlayerHeartbeat, sessionEndGame, sessionLogEvent } from "../api.js";

// ── Referência de sessão ──────────────────────────────────────────────────────

export function setSessionId(sessionId) {
  S.sessionId        = sessionId || null;
  S.sessionRef       = sessionId && S.db && S.roomCode
    ? doc(S.db, "salas", S.roomCode, "sessions", sessionId)
    : null;
  S.sessionEventsRef = null; // cliente não escreve eventos diretamente
}

// ── No-ops — backend assume escrita de eventos authoritative ─────────────────

export async function createGameSession() {}
export async function updateSessionGameState() {}

// Eventos gerados pelo cliente: allowlist estrita no backend (PLAYER_LEFT, MISSION_COMPLETED)
export async function logEvent(type, payload = {}) {
  if (!S.sessionId) return;
  sessionLogEvent(type, payload).catch(() => {});
}

// ── Player tracking ───────────────────────────────────────────────────────────

export async function joinSessionAsPlayer() {
  if (!S.sessionId || !S.participantId) return false;
  try {
    const result = await sessionPlayerJoin();
    return result?.isReconnect || false;
  } catch (e) {
    console.warn("[session] joinSessionAsPlayer:", e.message);
    return false;
  }
}

export async function setPlayerConnected(connected) {
  if (!S.sessionId) return;
  sessionPlayerHeartbeat(connected).catch(() => {});
}

export async function clearActiveSession() {
  if (!S.userRef) return;
  try { await updateDoc(S.userRef, { activeSession: null }); } catch (_) {}
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────

let _endGameRequest = null;

export async function endGameSession() {
  let sessionId = S.sessionId;
  if (!sessionId && S.isHost && S.ritualStarted && S.roomRef) {
    const [roomSnap, ritualSnap] = await Promise.all([
      getDoc(S.roomRef).catch(() => null),
      S.ritualRef ? getDoc(S.ritualRef).catch(() => null) : Promise.resolve(null),
    ]);
    sessionId = roomSnap?.data?.()?.currentSessionId
      || ritualSnap?.data?.()?.sessionId
      || null;
    if (sessionId) setSessionId(sessionId);
  }
  if (!sessionId) {
    return S.ritualStarted
      ? { ok: false, code: "SESSION_ID_INDISPONIVEL" }
      : { ok: true, skipped: "no-session" };
  }

  const roomId = S.roomCode;
  const requestKey = `${roomId}:${sessionId}`;
  if (_endGameRequest?.key === requestKey) return _endGameRequest.promise;

  const promise = (async () => {
  try {
    let result = { ok: true };
    if (S.isHost) {
      result = await sessionEndGame(roomId, sessionId);
      if (!result?.ok) throw new Error(result?.error || result?.code || "SESSION_END_FAILED");
      // Persiste summary para o showSessionRecap que virá a seguir
      if (result?.summary) S._lastSessionSummary = result.summary;
    } else {
      result = await sessionPlayerHeartbeat(false);
    }
    await clearActiveSession();
    // Uma sincronização pode ter publicado outra sessão enquanto a requisição
    // estava em voo. Nunca limpe referências de uma sessão mais nova.
    if (S.sessionId === sessionId) {
      S.sessionId        = null;
      S.sessionRef       = null;
      S.sessionEventsRef = null;
      S.sessionPlayerRef = null;
    }
    return result || { ok: true };
  } catch (error) {
    console.warn("[session] não foi possível encerrar a sessão:", error);
    return { ok: false, error: error?.message || String(error) };
  }
  })();

  _endGameRequest = { key: requestKey, promise };
  try {
    return await promise;
  } finally {
    if (_endGameRequest?.promise === promise) _endGameRequest = null;
  }
}
