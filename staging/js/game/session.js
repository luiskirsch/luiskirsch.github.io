// Game Session — entidade separada de ROOM para rastrear uma partida específica.
// Estrutura: salas/{roomCode}/sessions/{sessionId}/events/{id}
// Fase 1: event log apenas. Fase 2 adicionará reconnect flow e SESSION entity completa.
import { S } from "../state.js";
import { addDoc, setDoc, updateDoc, serverTimestamp, doc, collection } from "../firebase.js";

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
      players
    });
    S.sessionId = sessRef.id;
    S.sessionRef = sessRef;
    S.sessionEventsRef = collection(S.db, "salas", S.roomCode, "sessions", sessRef.id, "events");
    await logEvent("GAME_STARTED", { playerCount: players.length, players: players.map(p => p.nickname) });
  } catch (e) {
    console.warn("[session] createGameSession:", e.message);
  }
}

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

export async function endGameSession() {
  if (!S.sessionRef) return;
  try {
    await logEvent("GAME_ENDED", {});
    await updateDoc(S.sessionRef, { status: "ended", endedAt: serverTimestamp() });
  } catch (e) {
    console.warn("[session] endGameSession:", e.message);
  } finally {
    S.sessionId = null;
    S.sessionRef = null;
    S.sessionEventsRef = null;
  }
}
