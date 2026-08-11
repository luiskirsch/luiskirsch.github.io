// Estado global mutável compartilhado por todos os módulos.
// Todos os módulos importam este objeto e mutam suas propriedades diretamente.

const params = new URLSearchParams(window.location.search);

export const S = {
  // ── Firebase ────────────────────────────────────────────────────────
  db:   null,
  auth: null,
  // Refs Firestore — inicializadas em firebase.js após init
  userRef:              null,
  roomRef:              null,
  playerRef:            null,
  messagesRef:          null,
  ritualRef:            null,
  ritualHistoryRef:     null,
  typingRef:            null,
  typingCollectionRef:  null,
  playersCollectionRef: null,
  sessionRef:           null,
  sessionEventsRef:     null,
  sessionId:            null,

  // ── Identidade da sessão ─────────────────────────────────────────────
  playerName: (params.get("nome") || localStorage.getItem("osl_nome") || "Visitante").trim().slice(0, 40),
  roomCode: (params.get("sala") || localStorage.getItem("osl_sala") || "SL-0001").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20),
  roomName: (params.get("nomeSala") || localStorage.getItem("osl_nome_sala") || "Sala de Espera").trim().slice(0, 50),
  participantId: "",
  userId: "",
  isHost: false,
  _isSpectator: params.get("spectator") === "1",

  // ── Estado do ritual ─────────────────────────────────────────────────
  ritualDeck: [],
  ritualStarted: false,
  ritualCardsRevealedCount: 0,
  missionsAssigned: false,
  currentCard: null,
  currentPlayers: [],
  currentActiveEffect: null,
  activeEffectTimer: null,
  effectPanelCloseTimer: null,

  // ── Animação de carta ─────────────────────────────────────────────────
  lastRevealedCardKey: null,
  revealAnimating: false,
  cardFaceDown: true,

  // ── Missões ───────────────────────────────────────────────────────────
  currentSecretMission: null,
  missionCompleted: false,
  missionShownTs: 0,
  missionNameMentionCount: 0,
  missionSpeechRec: null,

  // ── AI VAD ────────────────────────────────────────────────────────────
  aiVADStopFn: null,
  aiVADSilenceTimer: null,

  // ── Reações ───────────────────────────────────────────────────────────
  shownReactions: new Map(),
  _feelingBadges: new Map(),

  // ── Subscriptions Firebase ────────────────────────────────────────────
  roomUnsub:          null,
  playersUnsub:       null,
  messagesUnsub:      null,
  typingUnsub:        null,
  ritualUnsub:        null,
  ritualHistoryUnsub: null,

  // ── Timers & flags ────────────────────────────────────────────────────
  heartbeatTimer: null,
  typingTimer: null,
  panelRoomBooted: false,
  panelSessionActive: false,
  autoRecordingStarted: false,
  leaving: false,
  initialMessagesLoaded: false,
  knownMessageIds: new Set(),

  // ── XP e prestige ────────────────────────────────────────────────────
  _xpPrevLevel: 0,
  _currentXp: 0,
  _isPrestige: false,

  // ── Compras verificadas pelo servidor (não forjáveis via localStorage) ───
  _serverUnlockedPacks: null, // null = ainda não sincronizado; [] = sincronizado sem packs

  // ── Perfil & customização ────────────────────────────────────────────
  selectedAvatarEmoji: "🔮",
  selectedAvatarColor: "#342718",
  selectedAvatarPhoto: null,
  selectedBgTheme: localStorage.getItem("osl_bg") || "default",
  selectedCardStyle: localStorage.getItem("osl_card_style") || "padrao",
  selectedFx: localStorage.getItem("osl_fx") || "none",
  openedProfileUserId: null,
  openedProfileData: null,

  // ── Audio ─────────────────────────────────────────────────────────────
  audioCtx: null,
  audioReady: false,

  // ── Multiplayer / Espectador ──────────────────────────────────────────
  _multiPollTimer: null,
  _joinTarget: null,
  _joinPollTimer: null,
  _hostSseSource: null,
  _pendingJoinId: null,
  _specUnsubs: [],
  _specLkRoom: null,
  _specPlayers: [],

  // ── Vote result tracking ──────────────────────────────────────────────
  lastVoteResultTimestamp: 0,
};
