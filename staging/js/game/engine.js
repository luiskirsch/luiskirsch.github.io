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
import { logEvent, createGameSession, endGameSession, updateSessionGameState } from "./session.js";
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
    return;
  }
  await _handlers[type](payload);
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const _handlers = {

  [CMD.INIT]({ players = [] } = {}) {
    _patch({ ...makeInitialState(), phase: PHASE.LOBBY, players });
  },

  [CMD.SET_PLAYERS]({ players = [] } = {}) {
    _patch({ players });
  },

  [CMD.SYNC_FROM_FIRESTORE](data = {}) {
    const started   = !!data.started;
    const prevPhase = _state.phase;
    const nextPhase = started ? PHASE.RITUAL_ACTIVE : PHASE.LOBBY;

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
  },

  async [CMD.START_RITUAL]({ players = [] } = {}) {
    // Optimista: transiciona para arena imediatamente; lobby some sem aguardar backend
    _patch({ phase: PHASE.RITUAL_ACTIVE, players, currentCard: null, deck: [], cardsRevealedCount: 0, missionsAssigned: false, activeEffect: null, pendingDeathrattle: null });

    const apiPlayers = players.map(p => ({ id: p.id, name: p.name, userId: p.userId || null, activeDeckId: p.activeDeckId || null }));
    const result = await ritualStart(apiPlayers);

    if (!result?.ok) {
      console.error('[engine] START_RITUAL falhou:', result?.error);
      _patch({ phase: PHASE.LOBBY }); // rollback
      return;
    }

    await createGameSession();
  },

  async [CMD.RESET_RITUAL]({ players = [] } = {}) {
    _patch({ phase: PHASE.RITUAL_ACTIVE, players, currentCard: null, deck: [], cardsRevealedCount: 0, missionsAssigned: false, activeEffect: null, pendingDeathrattle: null });

    const apiPlayers = players.map(p => ({ id: p.id, name: p.name, userId: p.userId || null, activeDeckId: p.activeDeckId || null }));
    const result = await ritualReset(apiPlayers);

    if (!result?.ok) {
      console.error('[engine] RESET_RITUAL falhou:', result?.error);
      return;
    }

    await createGameSession();
    await panelMarkSessionStart();
  },

  async [CMD.REVEAL_CARD]({ players = [] } = {}) {
    const result = await ritualNextCard(players.map(p => ({ id: p.id, name: p.name })));

    if (!result?.ok) {
      console.error('[engine] REVEAL_CARD falhou:', result?.error);
      return;
    }

    const newCount = result.cardsRevealedCount ?? (_state.cardsRevealedCount + 1);

    logEvent('CARD_REVEALED', {
      title: result.card?.title ?? null,
      type:  result.card?.type  ?? null,
      count: newCount,
    }).catch(() => {});

    updateSessionGameState({
      cardsRevealedCount: newCount,
      currentCardTitle:   result.card?.title ?? null,
      phase:              'playing',
    }).catch(() => {});

    // Atualização parcial local — SYNC_FROM_FIRESTORE vai completar
    _patch({ cardsRevealedCount: newCount, missionsAssigned: newCount >= 2 });
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
