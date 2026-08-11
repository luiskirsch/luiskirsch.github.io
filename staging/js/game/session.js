// Game Session — entidade separada de ROOM para rastrear uma partida específica.
// Estrutura: salas/{roomCode}/sessions/{sessionId}/events/{id}
//            salas/{roomCode}/sessions/{sessionId}/players/{participantId}
// Fase 1: event log. Fase 2: player tracking + gameState + reconnect bookmark.
// Fase 3: reconnect detection, notificação cross-player, visibilitychange disconnect.
import { S } from "../state.js";
import { addDoc, setDoc, updateDoc, getDoc, serverTimestamp, doc, collection } from "../firebase.js";

// ── Internals ─────────────────────────────────────────────────────────────────

function _sessPath() {
  return ["salas", S.roomCode, "sessions", S.sessionId];
}

// ── Event log ─────────────────────────────────────────────────────────────────

export async function logEvent(type, payload = {}) {
  if (!S.sessionEventsRef) return;
  try {
    await addDoc(S.sessionEventsRef, {
      type,
      ts: serverTimestamp(),
      actor: S.participantId || null,
      payload
    });
  } catch (e) {
    console.warn("[session]", type, e.message);
  }
}

// ── Player tracking ───────────────────────────────────────────────────────────

// Retorna true se o player estava na sessão antes (reconnect), false se é novo join.
export async function joinSessionAsPlayer() {
  if (!S.db || !S.sessionId || !S.participantId || !S.userId) return false;
  try {
    const playerRef    = doc(S.db, ...(_sessPath()), "players", S.participantId);
    const existingSnap = await getDoc(playerRef);
    const isReconnect  = existingSnap.exists();

    const playerData = {
      playerId: S.participantId,
      userId: S.userId,
      nickname: S.playerName,
      connected: true,
      lastSeenAt: serverTimestamp()
    };
    if (!isReconnect) {
      playerData.joinedAt = serverTimestamp();
    } else {
      playerData.reconnectCount    = (existingSnap.data().reconnectCount || 0) + 1;
      playerData.lastReconnectedAt = serverTimestamp();
    }

    await setDoc(playerRef, playerData, { merge: true });
    S.sessionPlayerRef = playerRef;

    if (S.userRef) {
      await updateDoc(S.userRef, {
        activeSession: { sessionId: S.sessionId, roomCode: S.roomCode }
      });
    }

    if (isReconnect) {
      await logEvent("PLAYER_RECONNECTED", { nickname: S.playerName, userId: S.userId });
      updateDoc(S.sessionRef, {
        reconnectNotification: {
          nickname: S.playerName,
          participantId: S.participantId,
          ts: serverTimestamp()
        }
      }).catch(() => {});
    } else {
      await logEvent("PLAYER_JOINED", { nickname: S.playerName, userId: S.userId });
    }

    return isReconnect;
  } catch (e) {
    console.warn("[session] joinSessionAsPlayer:", e.message);
    return false;
  }
}

export async function setPlayerConnected(connected) {
  if (!S.sessionPlayerRef) return;
  try {
    await updateDoc(S.sessionPlayerRef, { connected, lastSeenAt: serverTimestamp() });
  } catch (_) {}
}

export async function clearActiveSession() {
  if (!S.userRef) return;
  try { await updateDoc(S.userRef, { activeSession: null }); } catch (_) {}
}

// ── Game state mirror ─────────────────────────────────────────────────────────

export async function updateSessionGameState(state) {
  if (!S.sessionRef) return;
  try {
    await updateDoc(S.sessionRef, { gameState: state, updatedAt: serverTimestamp() });
  } catch (_) {}
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export async function createGameSession() {
  if (!S.db || !S.roomCode) return;
  try {
    const sessCollection = collection(S.db, "salas", S.roomCode, "sessions");
    const sessRef = doc(sessCollection);
    const players = S.currentPlayers.map(p => ({
      playerId: p.id,
      userId: p.userId || null,
      nickname: p.name
    }));
    await setDoc(sessRef, {
      sessionId: sessRef.id,
      roomId: S.roomCode,
      hostId: S.participantId,
      status: "active",
      createdAt: serverTimestamp(),
      gameState: { cardsRevealedCount: 0, currentCardTitle: null, phase: "playing" },
      players
    });
    S.sessionId        = sessRef.id;
    S.sessionRef       = sessRef;
    S.sessionEventsRef = collection(S.db, "salas", S.roomCode, "sessions", sessRef.id, "events");
    if (S.roomRef) {
      updateDoc(S.roomRef, { currentSessionId: sessRef.id }).catch(() => {});
    }
    await joinSessionAsPlayer();
  } catch (e) {
    console.warn("[session] createGameSession:", e.message);
  }
}

export async function endGameSession() {
  if (!S.sessionRef) return;
  try {
    await logEvent("GAME_ENDED", {});
    await updateDoc(S.sessionRef, { status: "ended", endedAt: serverTimestamp() });
    if (S.roomRef) updateDoc(S.roomRef, { currentSessionId: null }).catch(() => {});
    await setPlayerConnected(false);
    await clearActiveSession();
  } catch (e) {
    console.warn("[session] endGameSession:", e.message);
  } finally {
    S.sessionId        = null;
    S.sessionRef       = null;
    S.sessionEventsRef = null;
    S.sessionPlayerRef = null;
  }
}
