// Game Session — ciclo de vida gerenciado pelo backend via Admin SDK.
// O cliente não escreve em sessions/* diretamente (Firestore rules: if false).
// Estrutura: salas/{roomCode}/sessions/{sessionId}/events/{id}
//            salas/{roomCode}/sessions/{sessionId}/players/{participantId}

import { S } from "../state.js";
import { updateDoc, doc } from "../firebase.js";
import { sessionPlayerJoin, sessionPlayerHeartbeat, sessionEndGame } from "../api.js";

// ── Referência de sessão ──────────────────────────────────────────────────────

export function setSessionId(sessionId) {
  S.sessionId        = sessionId || null;
  S.sessionRef       = sessionId && S.db && S.roomCode
    ? doc(S.db, "salas", S.roomCode, "sessions", sessionId)
    : null;
  S.sessionEventsRef = null; // cliente não escreve eventos diretamente
}

// ── No-ops — backend assume escrita ───────────────────────────────────────────

export async function createGameSession() {}
export async function logEvent() {}
export async function updateSessionGameState() {}

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

export async function endGameSession() {
  if (!S.sessionId) return;
  try {
    if (S.isHost) {
      await sessionEndGame();
    } else {
      await sessionPlayerHeartbeat(false);
    }
    await clearActiveSession();
  } catch (_) {} finally {
    S.sessionId        = null;
    S.sessionRef       = null;
    S.sessionEventsRef = null;
    S.sessionPlayerRef = null;
  }
}
