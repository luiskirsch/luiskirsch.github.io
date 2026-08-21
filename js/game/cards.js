// Sistema de cartas: deck, revelação, renderização.
// Comandos fluem para o engine via dispatch(). UI reage via subscribe().
// Session, backend e efeitos colaterais são orquestrados pelo engine.
import { S } from "../state.js";
import { addDoc, setDoc, getDoc, getDocs, serverTimestamp } from "../firebase.js";
import { escapeHtml } from "../utils.js";
import { OSL_BASIC_CARDS, OSL_PACK_CARDS, OSL_CARD_EFFECTS } from "../constants.js";
import { getVerifiedProdutos } from "../ui/profile.js";
import { fireRevealAnimation } from "../ui/animations.js";
import { showVoteResultOverlay } from "./rewards.js";
import { dispatch, subscribe, getState, PHASE } from "./engine.js";
import { CMD } from "./commands.js";

// ── Lobby/Arena visibility ───────────────────────────────────────────────────

function hideLobbyView() {
  const lv = document.getElementById("lobbyViewer");
  if (lv) lv.style.display = "none";
  document.body.classList.remove("lobby-mode");
  document.body.classList.add("ritual-started");
  window._lobby3d?.hide();
}

function showLobbyView() {
  const lv = document.getElementById("lobbyViewer");
  if (lv) lv.style.removeProperty("display");
  document.body.classList.remove("ritual-started");
  document.body.classList.add("lobby-mode");
  window._lobby3d?.show();
}

// A presença na partida e a tela exibida são estados diferentes: um jogador
// pode aguardar no lobby enquanto os demais continuam o ritual.
export function showLocalLobbyView() {
  _setLobbyUI();
}

export function showActiveRitualView() {
  hideLobbyView();
  document.getElementById("revealPanel")?.style.setProperty("display", "");
  document.getElementById("reactionBar")?.classList.add("reactionBar--visible");
  applyCardContent(getState().currentCard);
}

// ── Deck building ─────────────────────────────────────────────────────────────

export function getUnlockedPacks() {
  if (S._isPrestige) return Object.keys(OSL_PACK_CARDS);
  const verified = getVerifiedProdutos();
  if (verified !== null) return [...verified];
  try {
    return JSON.parse(localStorage.getItem("osl_compras") || "[]").map(c => c.produto);
  } catch (_) { return []; }
}

export function getUnlockedPackCards() {
  const packs = getUnlockedPacks();
  let cards = [];
  packs.forEach(packId => { if (OSL_PACK_CARDS[packId]) cards = cards.concat(OSL_PACK_CARDS[packId]); });
  return cards;
}

export async function loadUserDeck(userId, deckId) {
  try {
    const { doc } = await import("../firebase.js");
    const deckRef = doc(S.db, "users", userId, "decks", deckId);
    const snap    = await getDoc(deckRef);
    if (!snap.exists()) return null;
    return snap.data().cards || [];
  } catch (_) { return null; }
}

export function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function buildRitualDeck() {
  const customContributions = [];
  for (const player of S.currentPlayers) {
    if (player.userId && player.activeDeckId) {
      const cards = await loadUserDeck(player.userId, player.activeDeckId);
      if (cards?.length > 0) customContributions.push(...cards);
    }
  }
  if (customContributions.length === 0) return shuffleArray(OSL_BASIC_CARDS.concat(getUnlockedPackCards()));
  const allCards = OSL_BASIC_CARDS.concat(customContributions);
  const seen = new Set();
  return shuffleArray(allCards.filter(c => { if (seen.has(c.title)) return false; seen.add(c.title); return true; }));
}

// ── Histórico (Firestore) ─────────────────────────────────────────────────────

export async function addHistoryItem(type, text) {
  try { await addDoc(S.ritualHistoryRef, { type, text, createdAt: serverTimestamp() }); }
  catch (error) { console.error("Erro ao adicionar histórico do ritual:", error); }
}

// ── Botões do ritual ─────────────────────────────────────────────────────────

export function updateRitualButtons(snapOrEvent) {
  // Aceita snapshot do engine ou Event do DOM (osl:updateRitualButtons)
  const snap = (snapOrEvent && typeof snapOrEvent.phase === 'string') ? snapOrEvent : getState();
  const { phase, deck, activeEffect, currentCard } = snap;
  const revealCardBtn  = document.getElementById("revealCardBtn");
  const resetRitualBtn = document.getElementById("resetRitualBtn");
  const canControl     = S.isHost && phase === PHASE.RITUAL_ACTIVE;
  const effectBlocking = !!(activeEffect && !activeEffect.resolved);
  if (revealCardBtn) {
    revealCardBtn.disabled    = !canControl || deck.length === 0 || effectBlocking;
    revealCardBtn.textContent = (phase === PHASE.RITUAL_ACTIVE && !currentCard)
      ? oslTr("sala:table.revealFirst", "Revelar Primeira Carta")
      : oslTr("sala:table.revealNext",  "Revelar Próxima Carta");
  }
  if (resetRitualBtn) resetRitualBtn.disabled = !S.isHost || phase !== PHASE.RITUAL_ACTIVE;
}

document.addEventListener("osl:updateRitualButtons", updateRitualButtons);

// ── Auto-fit do título da carta ───────────────────────────────────────────────

let _fitObserver = null;

function autoFitCardTitle() {
  const el = document.getElementById("ritualCardTitle");
  if (!el) return;
  const frame = el.closest(".ritualCardFrame");
  if (!frame) return;
  const maxW = frame.clientWidth - 24;
  if (maxW <= 0) return;
  el.style.fontSize = "";
  let size = parseFloat(getComputedStyle(el).fontSize) || 17;
  const words = (el.textContent || "").split(/\s+/).filter(Boolean);
  if (!words.length) return;
  if (!autoFitCardTitle._canvas) autoFitCardTitle._canvas = document.createElement("canvas");
  const ctx = autoFitCardTitle._canvas.getContext("2d");
  const lsRatio = 0.05;
  for (let i = 0; i < 24; i++) {
    ctx.font = `700 ${size}px Georgia,"Times New Roman",serif`;
    const lsPx    = size * lsRatio;
    const longest = words.reduce((max, w) => {
      const pw = ctx.measureText(w).width + (w.length - 1) * lsPx;
      return pw > max ? pw : max;
    }, 0);
    if (longest <= maxW) break;
    size = Math.max(10, size - 0.5);
    el.style.fontSize = `${size}px`;
  }
}

function ensureCardTitleObserver() {
  if (_fitObserver) return;
  const wrap = document.getElementById("ritualCardWrap");
  if (!wrap || typeof ResizeObserver === "undefined") return;
  _fitObserver = new ResizeObserver(autoFitCardTitle);
  _fitObserver.observe(wrap);
}

// ── Conteúdo de carta no DOM ──────────────────────────────────────────────────

export function applyCardContent(card) {
  if (card && window.OSL_I18N && typeof window.OSL_I18N.localizeCard === "function") {
    card = window.OSL_I18N.localizeCard(card);
  }
  const ritualCardType  = document.getElementById("ritualCardType");
  const ritualCardTitle = document.getElementById("ritualCardTitle");
  const ritualCardText  = document.getElementById("ritualCardText");
  const deckInfo        = document.getElementById("deckInfo");
  const midDetails      = document.getElementById("ritualMidDetails");
  const cardRule        = document.getElementById("ritualCardRule");
  const subruleDivider  = document.getElementById("ritualSubruleDivider");
  const cardSubrule     = document.getElementById("ritualCardSubrule");
  const cardDivider     = document.getElementById("ritualCardDivider");
  const cardPhrase      = document.getElementById("ritualCardPhrase");
  const visualCard      = document.querySelector(".ritualVisualCard");

  if (visualCard) {
    visualCard.removeAttribute("data-world-territory");
    visualCard.removeAttribute("data-fragment-rarity");
    visualCard.style.removeProperty("--world-accent");
    visualCard.style.removeProperty("--world-depth");
    const influence = card?.worldInfluence || (card?.type === "fragmento" ? card : null);
    if (influence) {
      visualCard.dataset.worldTerritory = influence.territoryId || "limiar";
      if (card?.type === "fragmento") visualCard.dataset.fragmentRarity = card.rarity || "comum";
      visualCard.style.setProperty("--world-accent", influence.palette?.[0] || "#d4af37");
      visualCard.style.setProperty("--world-depth", influence.palette?.[1] || "#0d151c");
    }
  }

  if (card) {
    if (ritualCardType)  ritualCardType.textContent = ((card.sigil ? card.sigil + "  " : "") + (card.type || oslTr("sala:table.typeRitual", "Ritual")) + (card.fragmentId ? " · " + card.fragmentId : "")).toUpperCase();
    if (ritualCardTitle) {
      ritualCardTitle.style.fontSize = "";
      ritualCardTitle.textContent    = card.title || oslTr("sala:ritual.fallbackTitle", "Carta revelada");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        autoFitCardTitle();
        ensureCardTitleObserver();
      }));
    }
    if (ritualCardText) ritualCardText.innerHTML = escapeHtml(card.text || "").replace(/\n/g, "<br>");
    const hasRule    = !!card.rule;
    const hasSubrule = !!card.subrule;
    const hasPhrase  = !!card.phrase;
    if (midDetails)     midDetails.style.display     = (hasRule || hasSubrule) ? "" : "none";
    if (cardRule)       cardRule.innerHTML            = hasRule ? escapeHtml(card.rule).replace(/\n/g, "<br>") : "";
    if (subruleDivider) subruleDivider.style.display  = hasSubrule ? "" : "none";
    if (cardSubrule)    { cardSubrule.style.display   = hasSubrule ? "" : "none"; if (hasSubrule) cardSubrule.innerHTML = escapeHtml(card.subrule).replace(/\n/g, "<br>"); }
    if (cardDivider)    cardDivider.style.display     = hasPhrase ? "" : "none";
    if (cardPhrase)     { cardPhrase.style.display    = hasPhrase ? "" : "none"; if (hasPhrase) cardPhrase.innerHTML = escapeHtml(card.phrase).replace(/\n/g, "<br>"); }
  } else {
    if (ritualCardType)  ritualCardType.textContent  = "RITUAL";
    if (ritualCardTitle) ritualCardTitle.textContent = oslTr("sala:table.ritualWaitingTitle", "Aguardando revelação");
    if (ritualCardText)  ritualCardText.innerHTML    = oslTr("sala:ritual.noNextCardYet", "O anfitrião ainda não revelou a próxima carta.");
    if (midDetails)  midDetails.style.display  = "none";
    if (cardDivider) cardDivider.style.display = "none";
    if (cardPhrase)  cardPhrase.style.display  = "none";
  }

  const { phase, deck } = getState();
  if (deckInfo) {
    if (deck.length > 0) {
      deckInfo.innerHTML = S.isHost
        ? oslTr("sala:ritual.deckRemainingHost",   "{{count}} carta(s) restante(s) · Quando o grupo responder, revele a próxima.",                          { count: deck.length })
        : oslTr("sala:ritual.deckRemainingPlayer", "{{count}} carta(s) restante(s) · Responda via vídeo ou no chat — o anfitrião revela a próxima.", { count: deck.length });
    } else {
      deckInfo.innerHTML = oslTr("sala:ritual.deckEnded", "O deck chegou ao fim.<br>Reinicie o ritual para embaralhar novamente.");
    }
  }

  updateRitualButtons(getState());
}

// ── UI de lobby ───────────────────────────────────────────────────────────────

function _setLobbyUI() {
  document.getElementById("revealPanel")?.style.setProperty("display", "none");
  showLobbyView();
  const ritualCardType  = document.getElementById("ritualCardType");
  const ritualCardTitle = document.getElementById("ritualCardTitle");
  const ritualCardText  = document.getElementById("ritualCardText");
  const deckInfo        = document.getElementById("deckInfo");
  const historyList     = document.getElementById("historyList");
  if (ritualCardType)  ritualCardType.textContent  = "RITUAL";
  if (ritualCardTitle) ritualCardTitle.textContent = oslTr("sala:table.ritualWaitingTitle", "Aguardando revelação");
  if (ritualCardText)  ritualCardText.innerHTML    = oslTr("sala:ritual.noNextCardYet", "O anfitrião ainda não revelou a próxima carta.");
  ["ritualMidDetails","ritualCardDivider","ritualCardPhrase"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  if (deckInfo) deckInfo.innerHTML = oslTr("sala:table.deckWaitingFull", "Aguardando o anfitrião iniciar.<br>Depois disso, a mesa se transforma.");
  if (historyList) historyList.innerHTML = `<div class="historyItem"><div class="historyType">${oslTr("sala:history.waiting","Aguardando")}</div><div class="historyText">${oslTr("sala:history.none","Nenhuma carta revelada ainda.")}</div></div>`;
  document.getElementById("reactionBar")?.classList.remove("reactionBar--visible");
}

// Compatibilidade para o snapshot da sala, que pode chegar antes do documento
// de ritual. O engine continuará sendo a fonte de verdade assim que bindRitual
// receber o primeiro snapshot.
export function setRitualWaitingState() {
  S.ritualStarted = false;
  _setLobbyUI();
  updateRitualButtons(getState());
}

// ── Subscriber do engine ──────────────────────────────────────────────────────

let _prevPhase        = null;
let _prevCardKey      = null;
let _prevVoteResultTs = 0;

subscribe(snap => {
  const { phase, currentCard, deck, activeEffect, voteResult } = snap;
  const gameStatusEl = document.getElementById("gameStatus");

  if (phase !== _prevPhase) {
    if (phase === PHASE.RITUAL_ACTIVE) {
      if (gameStatusEl) gameStatusEl.textContent = oslTr("sala:topbar.status.playing", "Jogando");
      hideLobbyView();
      document.getElementById("revealPanel")?.style.setProperty("display", "");
      document.getElementById("reactionBar")?.classList.add("reactionBar--visible");

      // Auto-recording (host, uma vez por sessão)
      if (S.isHost && !S.autoRecordingStarted) {
        S.autoRecordingStarted = true;
        const base = window.PANEL_SERVER_BASE || "https://osl-video-server-production.up.railway.app";
        fetch(`${base}/recording/auto-start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: S.roomCode }),
        }).catch(() => {});
      }

      // Toast de reconexão — dispara apenas no primeiro snapshot ativo
      if (S._isReconnecting && _prevCardKey === null) {
        S._isReconnecting = false;
        window.showOslToast?.(oslTr("sala:reconnect.welcome", "Bem-vindo de volta! Sua partida continua."));
      }
    } else if (phase === PHASE.LOBBY) {
      if (gameStatusEl) gameStatusEl.textContent = oslTr("sala:topbar.status.waiting", "Espera");
      _setLobbyUI();
      _prevCardKey = null;
    }
    _prevPhase = phase;
  }

  // Atualiza carta quando fase é ativa
  if (phase === PHASE.RITUAL_ACTIVE) {
    const newKey    = currentCard ? (currentCard.title || "__card__") : "__waiting__";
    const isFirst   = _prevCardKey === null;
    const changed   = !isFirst && newKey !== _prevCardKey;
    _prevCardKey    = newKey;

    if (changed) {
      fireRevealAnimation(currentCard, applyCardContent);
    } else {
      applyCardContent(currentCard);
    }
  }

  // Vote result overlay
  if (voteResult?.winner && voteResult.resolvedAt !== _prevVoteResultTs) {
    _prevVoteResultTs = voteResult.resolvedAt;
    showVoteResultOverlay(voteResult.winner, voteResult.resolvedAt);
  }

  updateRitualButtons(snap);
});

// ── Comandos públicos (chamados por init.js / mobile / UI) ───────────────────

export async function startRitualDeck() {
  return dispatch({ type: CMD.START_RITUAL, payload: { players: S.currentPlayers } });
}

export async function resetRitualDeck() {
  if (!S.isHost) return { ok: false, code: "HOST_REQUIRED" };
  return dispatch({ type: CMD.RESET_RITUAL, payload: { players: S.currentPlayers } });
}

export async function revealNextRitualCard() {
  const { phase, deck, activeEffect } = getState();
  if (phase !== PHASE.RITUAL_ACTIVE || !S.isHost || deck.length === 0) {
    return { ok: false, code: "REVEAL_UNAVAILABLE" };
  }
  if (activeEffect && !activeEffect.resolved) return { ok: false, code: "EFFECT_PENDING" };
  return dispatch({ type: CMD.REVEAL_CARD, payload: { players: S.currentPlayers } });
}

// ── Listener do ritual (Firestore → engine) ───────────────────────────────────

export function bindRitual(onSnapshotFn, orderByFn, queryFn) {
  if (S.ritualUnsub)        S.ritualUnsub();
  if (S.ritualHistoryUnsub) S.ritualHistoryUnsub();

  S.ritualUnsub = onSnapshotFn(S.ritualRef, (snap) => {
    dispatch({
      type:    CMD.SYNC_FROM_FIRESTORE,
      payload: snap.exists() ? snap.data() : { started: false },
    });
  });

  const historyList = document.getElementById("historyList");
  const q = queryFn(S.ritualHistoryRef, orderByFn("createdAt", "desc"));
  S.ritualHistoryUnsub = onSnapshotFn(q, (snapshot) => {
    if (!historyList) return;
    const docs = snapshot.docs.map(d => d.data());
    if (!docs.length) {
      historyList.innerHTML = `<div class="historyItem"><div class="historyType">${oslTr("sala:history.waiting","Aguardando")}</div><div class="historyText">${oslTr("sala:history.none","Nenhuma carta revelada ainda.")}</div></div>`;
      return;
    }
    const HIST_TEXT_PT_TO_KEY = {
      "O ritual foi iniciado.":    "sala:table.ritualStarted",
      "O ritual foi reiniciado.":  "sala:table.ritualReset",
    };
    historyList.innerHTML = docs.map(item => {
      const rawType       = item.type || "Ritual";
      const localizedType = oslTr(`cards:types.${rawType}`, rawType);
      const rawText       = item.text || "";
      let   localizedText = rawText;
      const sysKey        = HIST_TEXT_PT_TO_KEY[rawText];
      if (sysKey) {
        localizedText = oslTr(sysKey, rawText);
      } else {
        const t       = window.OSL_I18N && window.OSL_I18N.t;
        const slugify = window.OSL_I18N && window.OSL_I18N.slugify;
        if (rawText && t && slugify) {
          const slug  = slugify(rawText);
          if (slug) {
            const packs = ["basic","packs.conexao","packs.verdades","packs.conflito","packs.segredos","packs.casais"];
            for (const ns of packs) {
              const key  = `cards:${ns}.${slug}.title`;
              const v    = t(key);
              const stub = key.includes(":") ? key.split(":")[1] : key;
              if (typeof v === "string" && v && v !== key && v !== stub) { localizedText = v; break; }
            }
          }
        }
      }
      return `<div class="historyItem"><div class="historyType">${escapeHtml(localizedType)}</div><div class="historyText">${escapeHtml(localizedText)}</div></div>`;
    }).join("");
  });
}
