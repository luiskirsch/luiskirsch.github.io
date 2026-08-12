// Tipos de comando do Game Engine. Imutável — nunca concatenar strings aqui.
export const CMD = Object.freeze({
  INIT:                'INIT',
  START_RITUAL:        'START_RITUAL',
  RESET_RITUAL:        'RESET_RITUAL',
  REVEAL_CARD:         'REVEAL_CARD',
  END_GAME:            'END_GAME',
  SYNC_FROM_FIRESTORE: 'SYNC_FROM_FIRESTORE',
  SET_PLAYERS:         'SET_PLAYERS',
});
