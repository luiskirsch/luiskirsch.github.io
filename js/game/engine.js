// Game Engine: única fonte de verdade para estado e transições de fase.
// Comandos entram via dispatch(). Subscribers (cards, effects, missions, UI)
// recebem snapshots imutáveis do estado. O engine não conhece UI.
//
// Diagrama de fases:
//   IDLE ──INIT──▶ LOBBY ──START_RITUAL──▶ RITUAL_ACTIVE
//                    ▲                          │
//                    └──────── END_GAME ─────────┘
//                    └──── RESET_RITUAL (in-place, stays RITUAL_ACTIVE)

import { S } from "../state.js";
import { CMD } from "./commands.js";
import { setSessionId, joinSessionAsPlayer, endGameSession } from "./session.js";
import { ritualStart, ritualNextCard, ritualReset, panelMarkSessionStart } from "../api.js";

// ── Fases ─────────────────────────────────────────────────────────────────────

export const PHASE = Object.freeze({
  IDLE:          'IDLE',
  LOBBY:         'LOBBY',
  RITUAL_ACTIVE: 'RITUAL_ACTIVE',
});

// Comandos legais por fase
const ALLOWED = {
  [PHASE.IDLE]:          new Set([CMD.INIT]),
  [PHASE.LOBBY]:         new Set([CMD.START_RITUAL, CMD.SYNC_FROM_FIRESTORE, CMD.SET_PLAYERS]),
  [PHASE.RITUAL_ACTIVE]: new Set([CMD.REVEAL_CARD, CMD.END_GAME, CMD.RESET_RITUAL, CMD.SYNC_FROM_FIRESTORE, CMD.SET_PLAYERS]),
};

// ── Estado ───────────────────────────────────────────────────────────────────

function makeInitialState() {
  return {
    phase:              PHASE.IDLE,
    players:            [],
    currentCard:        null,
    deck:               [],
    cardsRevealedCount: 0,
    missionsAssigned:   false,
    activeEffect:       null,
    pendingDeathrattle: null,
    aiDetection:        null,
    reactions:          null,
    voteResult:         null,
  };
}

let _state = makeInitialState();
const _subs = new Set();

function _patch(fields) {
  _state = { ..._state, ...fields };
  // Mantém os campos legados sincronizados enquanto os consumidores antigos
  // (Arena, mobile, reações e paywall) migram para o engine.
  S.ritualStarted            = _state.phase === PHASE.RITUAL_ACTIVE;
  S.ritualDeck               = Array.isArray(_state.deck) ? _state.deck : [];
  S.ritualCardsRevealedCount = _state.cardsRevealedCount || 0;
  S.missionsAssigned         = !!_state.missionsAssigned;
  S.currentCard              = _state.currentCard || null;
  S.currentActiveEffect      = _state.activeEffect || null;
  const snap = Object.freeze({ ..._state });
  _subs.forEach(fn => {
    try { fn(snap); } catch (e) { console.error('[engine] subscriber threw:', e); }
  });
}

// ── API pública ───────────────────────────────────────────────────────────────

export function getState() {
  return Object.freeze({ ..._state });
}

/** Registra subscriber. Recebe snapshot imediato com estado atual.
 *  Retorna função de unsubscribe. */
export function subscribe(fn) {
  _subs.add(fn);
  try { fn(getState()); } catch (e) { console.error('[engine] subscriber (init):', e); }
  return () => _subs.delete(fn);
}

/** Despacha um comando. Bloqueia silenciosamente se a transição não for legal.
 *  Todos os handlers são async para acomodar I/O (backend, Firestore). */
export async function dispatch({ type, payload = {} }) {
  if (!ALLOWED[_state.phase]?.has(type)) {
    console.warn(`[engine] transição bloqueada: ${_state.phase} + ${type}`);
    return { ok: false, code: "TRANSICAO_INVALIDA", phase: _state.phase, command: type };
  }
  return _handlers[type](payload);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const _handlers = {

  [CMD.INIT]({ players = [] } = {}) {
    _patch({ ...makeInitialState(), phase: PHASE.LOBBY, players });
  },

  [CMD.SET_PLAYERS]({ players = [] } = {}) {
    _patch({ players });
  },

  async [CMD.SYNC_FROM_FIRESTORE](data = {}) {
    const started      = !!data.started;
    const prevPhase    = _state.phase;
    const nextPhase    = started ? PHASE.RITUAL_ACTIVE : PHASE.LOBBY;
    const newSessionId = data.sessionId || null;

    // Transitando de RITUAL_ACTIVE → LOBBY via snapshot: encerra a sessão
    if (!started && prevPhase === PHASE.RITUAL_ACTIVE) {
      endGameSession().catch(() => {});
    }

    _patch({
      phase:              nextPhase,
      currentCard:        data.currentCard        ?? null,
      deck:               Array.isArray(data.remainingDeck) ? data.remainingDeck : [],
      cardsRevealedCount: data.cardsRevealedCount  ?? 0,
      missionsAssigned:   (data.cardsRevealedCount ?? 0) >= 2,
      activeEffect:       data.activeEffect        ?? null,
      pendingDeathrattle: data.pendingDeathrattle  ?? null,
      aiDetection:        data.aiDetection         ?? null,
      reactions:          data.reactions            ?? null,
      voteResult:         data.voteResult           ?? null,
    });

    // Registra presença na sessão se o sessionId mudou (cobre reconexão do host e
    // o caso em que SYNC_FROM_FIRESTORE chega antes do observer do room doc).
    // Para não-hosts cujo room.js já agiu primeiro, newSessionId === S.sessionId → skip.
    if (newSessionId && newSessionId !== S.sessionId && started) {
      setSessionId(newSessionId);
      const isReconnect = await joinSessionAsPlayer();
      if (isReconnect) {
        window.dispatchEvent(new CustomEvent("osl:session-reconnected"));
      }
    }
  },

  async [CMD.START_RITUAL]({ players = [] } = {}) {
    const apiPlayers = players.map(p => ({ id: p.id, name: p.name, userId: p.userId || null, activeDeckId: p.activeDeckId || null }));
    const result = await ritualStart(apiPlayers);

    if (!result?.ok) {
      console.error('[engine] START_RITUAL falhou:', result?.error);
      return result || { ok: false, error: "Não foi possível iniciar o ritual." };
    }

    // O snapshot do Firestore é a confirmação autoritativa da transição.
    // Se ele ainda não chegou, registramos a sessão uma única vez aqui.
    if (result.sessionId && result.sessionId !== S.sessionId) {
      setSessionId(result.sessionId);
      joinSessionAsPlayer().catch(() => {});
    }
    return result;
  },

  async [CMD.RESET_RITUAL]({ players = [] } = {}) {
    const apiPlayers = players.map(p => ({ id: p.id, name: p.name, userId: p.userId || null, activeDeckId: p.activeDeckId || null }));
    const result = await ritualReset(apiPlayers);

    if (!result?.ok) {
      console.error('[engine] RESET_RITUAL falhou:', result?.error);
      return result || { ok: false, error: "Não foi possível reiniciar o ritual." };
    }

    if (result.sessionId && result.sessionId !== S.sessionId) {
      setSessionId(result.sessionId);
      joinSessionAsPlayer().catch(() => {});
    }
    await panelMarkSessionStart();
    return result;
  },

  async [CMD.REVEAL_CARD]({ players = [] } = {}) {
    const result = await ritualNextCard(players.map(p => ({ id: p.id, name: p.name })));

    if (!result?.ok) {
      console.error('[engine] REVEAL_CARD falhou:', result?.error);
      return result || { ok: false, error: "Não foi possível revelar a carta." };
    }

    const newCount = result.cardsRevealedCount ?? (_state.cardsRevealedCount + 1);

    // Backend já loga CARD_REVEALED e atualiza gameState na sessão
    // Atualização parcial local — SYNC_FROM_FIRESTORE vai completar
    _patch({ cardsRevealedCount: newCount, missionsAssigned: newCount >= 2 });
    return result;
  },

  async [CMD.END_GAME]() {
    await endGameSession().catch(() => {});
    _patch({
      phase:              PHASE.LOBBY,
      currentCard:        null,
      deck:               [],
      cardsRevealedCount: 0,
      missionsAssigned:   false,
      activeEffect:       null,
      pendingDeathrattle: null,
      aiDetection:        null,
      reactions:          null,
      voteResult:         null,
    });
  },
};
