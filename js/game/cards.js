// Sistema de cartas: deck, revelação, renderização e estado do ritual
import { S } from "../state.js";
import { setDoc, addDoc, getDoc, getDocs, updateDoc, serverTimestamp } from "../firebase.js";
import { escapeHtml } from "../utils.js";
import { OSL_BASIC_CARDS, OSL_PACK_CARDS, OSL_CARD_EFFECTS } from "../constants.js";
import { fireRevealAnimation } from "../ui/animations.js";
import { renderActiveEffect, checkAIDetection, renderReactions, OSL_XP, OSL_TENSION, OSL_ACHIEVEMENTS, initPressureBtn, resetPressureBtn, bindSocialPressure } from "./effects.js";
import { showVoteResultOverlay } from "./rewards.js";
import { assignSecretMissions } from "./missions.js";
import { panelMarkSessionStart } from "../api.js";

// ── Engine de efeitos (prepare) ───────────────────────────────────────────────
const OSL_EFFECTS = {
  prepare(effect, players, phase) {
    if (!effect) return null;
    const base = { id: Math.random().toString(36).slice(2), type: effect.type, phase: phase || "battlecry", label: effect.label || null, params: {}, votes: {}, resolved: false };
    switch (effect.type) {
      case "force_player": {
        const pool = players.length > 1 ? players.filter(p => p.id !== S.participantId) : players;
        if (effect.target === "two_random") {
          const s = [...pool].sort(() => Math.random() - 0.5);
          base.params = { targetId: s[0]?.id || "", targetName: s[0]?.name || oslTr("sala:players.fallbackName", "Jogador"), targetId2: s[1]?.id || s[0]?.id || "", targetName2: s[1]?.name || s[0]?.name || oslTr("sala:players.fallbackName", "Jogador") };
        } else {
          const t = pool[Math.floor(Math.random() * pool.length)] || players[0];
          base.params = { targetId: t?.id || "", targetName: t?.name || oslTr("sala:players.fallbackName", "Jogador") };
        }
        break;
      }
      case "set_timer":    { base.params = { duration: effect.duration || 60, startedAt: Date.now() }; break; }
      case "vote":         { base.params = { question: effect.question || "Vote:", options: effect.options || players.map(p => p.name) }; break; }
      case "next_category":
      case "chain_card":   { base.params = { category: effect.category || "" }; break; }
      case "give_xp":      { base.params = { amount: effect.amount || 10 }; break; }
    }
    return base;
  },
  prepareCard(card, players) {
    if (!card) return { battlecry: null, deathrattle: null };
    const effects = OSL_CARD_EFFECTS[card.title] || {};
    return {
      battlecry:   effects.battlecry   ? this.prepare(effects.battlecry,   players, "battlecry")   : null,
      deathrattle: effects.deathrattle ? this.prepare(effects.deathrattle, players, "deathrattle") : null
    };
  }
};

// ── Deck building ─────────────────────────────────────────────────────────────
export function getUnlockedPacks() {
  if (S._isPrestige) return Object.keys(OSL_PACK_CARDS);
  try {
    const compras = JSON.parse(localStorage.getItem("osl_compras") || "[]");
    return compras.map(c => c.produto);
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
    const deckRef  = doc(S.db, "users", userId, "decks", deckId);
    const snap     = await getDoc(deckRef);
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

// ── Estado de botões do ritual ────────────────────────────────────────────────
export function updateRitualButtons() {
  const revealCardBtn = document.getElementById("revealCardBtn");
  const resetRitualBtn = document.getElementById("resetRitualBtn");
  const canControl    = S.isHost && S.ritualStarted;
  const effectBlocking = !!(S.currentActiveEffect && !S.currentActiveEffect.resolved);
  if (revealCardBtn) {
    revealCardBtn.disabled  = !canControl || S.ritualDeck.length === 0 || effectBlocking;
    revealCardBtn.textContent = (S.ritualStarted && !S.currentCard) ? oslTr("sala:table.revealFirst", "Revelar Primeira Carta") : oslTr("sala:table.revealNext", "Revelar Próxima Carta");
  }
  if (resetRitualBtn) resetRitualBtn.disabled = !S.isHost || !S.ritualStarted;
}

// Listener de evento customizado (disparado pelo módulo de animações ao terminar)
document.addEventListener("osl:updateRitualButtons", updateRitualButtons);

// ── Estado de espera ──────────────────────────────────────────────────────────
export function setRitualWaitingState() {
  S.ritualStarted = false;
  S.ritualDeck    = [];
  OSL_TENSION.stop();
  const ritualCardType  = document.getElementById("ritualCardType");
  const ritualCardTitle = document.getElementById("ritualCardTitle");
  const ritualCardText  = document.getElementById("ritualCardText");
  const deckInfo        = document.getElementById("deckInfo");
  const historyList     = document.getElementById("historyList");
  if (ritualCardType)  ritualCardType.textContent  = "RITUAL";
  if (ritualCardTitle) ritualCardTitle.textContent = oslTr("sala:table.ritualWaitingTitle", "Aguardando revelação");
  if (ritualCardText)  ritualCardText.innerHTML    = oslTr("sala:ritual.noNextCardYet", "O anfitrião ainda não revelou a próxima carta.");
  const _mid = document.getElementById("ritualMidDetails");
  const _div = document.getElementById("ritualCardDivider");
  const _phr = document.getElementById("ritualCardPhrase");
  if (_mid) _mid.style.display = "none";
  if (_div) _div.style.display = "none";
  if (_phr) _phr.style.display = "none";
  if (deckInfo) deckInfo.innerHTML = oslTr("sala:table.deckWaitingFull", "Aguardando o anfitrião iniciar.<br>Depois disso, a mesa se transforma.");
  if (historyList) historyList.innerHTML = `<div class="historyItem"><div class="historyType">${oslTr("sala:history.waiting", "Aguardando")}</div><div class="historyText">${oslTr("sala:history.none", "Nenhuma carta revelada ainda.")}</div></div>`;
  updateRitualButtons();
}

// ── Persistência ──────────────────────────────────────────────────────────────
export async function addHistoryItem(type, text) {
  try { await addDoc(S.ritualHistoryRef, { type, text, createdAt: serverTimestamp() }); }
  catch (error) { console.error("Erro ao adicionar histórico do ritual:", error); }
}

export async function saveRitualState(card, activeEffect, pendingDeathrattle) {
  try {
    await setDoc(S.ritualRef, {
      started: S.ritualStarted,
      remainingDeck: S.ritualDeck,
      currentCard: card || null,
      activeEffect: activeEffect !== undefined ? (activeEffect || null) : null,
      pendingDeathrattle: pendingDeathrattle !== undefined ? (pendingDeathrattle || null) : null,
      cardsRevealedCount: S.ritualCardsRevealedCount,
      updatedAt: serverTimestamp(),
      updatedBy: S.participantId
    }, { merge: true });
  } catch (error) { console.error("Erro ao salvar estado do ritual:", error); }
}

// ── Aplicar conteúdo de carta no DOM ─────────────────────────────────────────
export function applyCardContent(card) {
  const ritualCardType  = document.getElementById("ritualCardType");
  const ritualCardTitle = document.getElementById("ritualCardTitle");
  const ritualCardText  = document.getElementById("ritualCardText");
  const deckInfo        = document.getElementById("deckInfo");
  const midDetails    = document.getElementById("ritualMidDetails");
  const cardRule      = document.getElementById("ritualCardRule");
  const subruleDivider= document.getElementById("ritualSubruleDivider");
  const cardSubrule   = document.getElementById("ritualCardSubrule");
  const cardDivider   = document.getElementById("ritualCardDivider");
  const cardPhrase    = document.getElementById("ritualCardPhrase");

  if (card) {
    if (ritualCardType)  ritualCardType.textContent = (card.type || oslTr("sala:table.typeRitual", "Ritual")).toUpperCase();
    if (ritualCardTitle) ritualCardTitle.textContent = card.title || oslTr("sala:ritual.fallbackTitle", "Carta revelada");
    if (ritualCardText)  ritualCardText.innerHTML = (card.text || "").replace(/\n/g, "<br>");
    const hasRule = !!card.rule, hasSubrule = !!card.subrule, hasPhrase = !!card.phrase;
    if (midDetails)    midDetails.style.display    = (hasRule || hasSubrule) ? "" : "none";
    if (cardRule)      cardRule.innerHTML           = hasRule ? card.rule.replace(/\n/g, "<br>") : "";
    if (subruleDivider)subruleDivider.style.display = hasSubrule ? "" : "none";
    if (cardSubrule)   { cardSubrule.style.display = hasSubrule ? "" : "none"; if (hasSubrule) cardSubrule.innerHTML = card.subrule.replace(/\n/g, "<br>"); }
    if (cardDivider)   cardDivider.style.display   = hasPhrase ? "" : "none";
    if (cardPhrase)    { cardPhrase.style.display  = hasPhrase ? "" : "none"; if (hasPhrase) cardPhrase.innerHTML = card.phrase.replace(/\n/g, "<br>"); }
  } else {
    if (ritualCardType)  ritualCardType.textContent  = "RITUAL";
    if (ritualCardTitle) ritualCardTitle.textContent = oslTr("sala:table.ritualWaitingTitle", "Aguardando revelação");
    if (ritualCardText)  ritualCardText.innerHTML    = oslTr("sala:ritual.noNextCardYet", "O anfitrião ainda não revelou a próxima carta.");
    if (midDetails)  midDetails.style.display  = "none";
    if (cardDivider) cardDivider.style.display = "none";
    if (cardPhrase)  cardPhrase.style.display  = "none";
  }
  if (deckInfo) {
    deckInfo.innerHTML = S.ritualDeck.length > 0
      ? oslTr("sala:ritual.deckRemaining", "{{count}} carta(s) restante(s) no deck.<br>O anfitrião pode revelar a próxima.", { count: S.ritualDeck.length })
      : oslTr("sala:ritual.deckEnded", "O deck chegou ao fim.<br>Reinicie o ritual para embaralhar novamente.");
  }
  updateRitualButtons();
}

// ── Reveal da próxima carta (host) ────────────────────────────────────────────
export async function revealNextRitualCard() {
  if (!S.ritualStarted || !S.isHost || !S.ritualDeck.length) return;

  const nextCard = S.ritualDeck.shift();
  S.ritualCardsRevealedCount++;
  const { battlecry, deathrattle } = OSL_EFFECTS.prepareCard(nextCard, S.currentPlayers);

  await saveRitualState(nextCard, battlecry, deathrattle);
  await addHistoryItem(nextCard.type, nextCard.title);

  if (S.ritualCardsRevealedCount === 2 && !S.missionsAssigned) {
    S.missionsAssigned = true;
    await assignSecretMissions(S.currentPlayers);
  }

  await OSL_XP.award(S.userRef, "CARD_REVEALED");
  if (["Segredo","Casais"].includes(nextCard.type)) await OSL_XP.award(S.userRef, "DEEP_CARD");

  OSL_TENSION.heat(12);
  OSL_ACHIEVEMENTS.onCardRevealed((await getDocs(S.ritualHistoryRef)).size, nextCard.type);
  resetPressureBtn();
  updateRitualButtons();
}

// ── Iniciar deck ──────────────────────────────────────────────────────────────
export async function startRitualDeck() {
  S.ritualStarted = true;
  S.ritualDeck    = await buildRitualDeck();

  await setDoc(S.ritualRef, {
    started: true,
    remainingDeck: S.ritualDeck,
    currentCard: null,
    activeEffect: null,
    pendingDeathrattle: null,
    cardsRevealedCount: 0,
    updatedAt: serverTimestamp(),
    updatedBy: S.participantId
  }, { merge: true });

  S.ritualCardsRevealedCount = 0;
  S.missionsAssigned = false;
  await addHistoryItem(oslTr("sala:table.typeRitual", "Ritual"), oslTr("sala:table.ritualStarted", "O ritual foi iniciado."));
  await setDoc(S.ritualRef, { sessionStartedAt: Date.now() }, { merge: true });

  await updateDoc(S.roomRef, { arenaActive: true });

  await OSL_XP.award(S.userRef, "SESSION_JOIN");
  OSL_TENSION.startDecay();
  resetPressureBtn();
  initPressureBtn();
  bindSocialPressure();
  updateRitualButtons();
}

// ── Reiniciar deck ────────────────────────────────────────────────────────────
export async function resetRitualDeck() {
  if (!S.isHost) return;
  S.ritualStarted = true;
  S.ritualDeck    = await buildRitualDeck();

  await setDoc(S.ritualRef, {
    started: true,
    remainingDeck: S.ritualDeck,
    currentCard: null,
    activeEffect: null,
    pendingDeathrattle: null,
    cardsRevealedCount: 0,
    updatedAt: serverTimestamp(),
    updatedBy: S.participantId
  }, { merge: true });

  S.ritualCardsRevealedCount = 0;
  S.missionsAssigned = false;
  await addHistoryItem(oslTr("sala:table.typeRitual", "Ritual"), oslTr("sala:table.ritualReset", "O ritual foi reiniciado."));
  await panelMarkSessionStart();
  updateRitualButtons();
}

// ── Renderiza estado do ritual (recebido do Firestore) ────────────────────────
export function renderRitualCardFromState(data) {
  const started = !!data?.started;
  const card    = data?.currentCard || null;

  S.ritualStarted            = started;
  S.currentCard              = card;
  S.ritualDeck               = Array.isArray(data?.remainingDeck) ? data.remainingDeck : [];
  S.ritualCardsRevealedCount = data?.cardsRevealedCount || 0;
  if (S.ritualCardsRevealedCount >= 2) S.missionsAssigned = true;

  const gameStatusEl = document.getElementById("gameStatus");
  if (gameStatusEl) gameStatusEl.textContent = started ? oslTr("sala:topbar.status.playing", "Jogando") : oslTr("sala:topbar.status.waiting", "Espera");

  S.currentActiveEffect = data?.activeEffect || null;
  renderActiveEffect(S.currentActiveEffect);
  checkAIDetection(data?.aiDetection);
  updateRitualButtons();
  renderReactions(data?.reactions);

  const reactionBar = document.getElementById("reactionBar");
  if (reactionBar) reactionBar.classList.toggle("reactionBar--visible", started);

  const voteResult = data?.voteResult || null;
  if (voteResult?.winner) showVoteResultOverlay(voteResult.winner, voteResult.resolvedAt);

  if (!started) { S.lastRevealedCardKey = null; setRitualWaitingState(); return; }

  // Auto-start recording quando ritual começa
  if (S.isHost && !S.autoRecordingStarted) {
    S.autoRecordingStarted = true;
    fetch("https://osl-video-server-production.up.railway.app/recording/auto-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: S.roomCode })
    }).catch(() => {});
  }

  const newKey       = card ? (card.title || "__card__") : "__waiting__";
  const isFirstRender = S.lastRevealedCardKey === null;
  const cardChanged  = !isFirstRender && newKey !== S.lastRevealedCardKey;
  S.lastRevealedCardKey = newKey;

  if (cardChanged) {
    fireRevealAnimation(card, applyCardContent);
  } else {
    applyCardContent(card);
  }
}

// ── Listener do ritual (Firestore) ────────────────────────────────────────────
export function bindRitual(onSnapshotFn, orderByFn, queryFn) {
  if (S.ritualUnsub) S.ritualUnsub();
  if (S.ritualHistoryUnsub) S.ritualHistoryUnsub();

  S.ritualUnsub = onSnapshotFn(S.ritualRef, (snap) => {
    if (!snap.exists()) { setRitualWaitingState(); return; }
    renderRitualCardFromState(snap.data());
  });

  const historyList = document.getElementById("historyList");
  const q = queryFn(S.ritualHistoryRef, orderByFn("createdAt", "desc"));
  S.ritualHistoryUnsub = onSnapshotFn(q, (snapshot) => {
    if (!historyList) return;
    const docs = snapshot.docs.map(d => d.data());
    if (!docs.length) {
      historyList.innerHTML = `<div class="historyItem"><div class="historyType">${oslTr("sala:history.waiting", "Aguardando")}</div><div class="historyText">${oslTr("sala:history.none", "Nenhuma carta revelada ainda.")}</div></div>`;
      return;
    }
    historyList.innerHTML = docs.map(item => `<div class="historyItem"><div class="historyType">${escapeHtml(item.type || oslTr("sala:table.typeRitual", "Ritual"))}</div><div class="historyText">${escapeHtml(item.text || "")}</div></div>`).join("");
  });
}
