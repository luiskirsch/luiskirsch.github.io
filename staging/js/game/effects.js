// Motor de efeitos, votação, AI VAD, reações, tensão, conquistas e pressão social
import { S } from "../state.js";
import { setDoc, updateDoc, increment, onSnapshot } from "../firebase.js";
import { escapeHtml } from "../utils.js";
import { spawnReactionFloat } from "../ui/animations.js";
import { OSL_XP_EVENTS, OSL_XP_TITLES } from "../constants.js";

// ── OSL_XP — sistema de experiência ──────────────────────────────────────────
export const OSL_XP = {
  titleForLevel(lv)   { return OSL_XP_TITLES[Math.min(lv - 1, OSL_XP_TITLES.length - 1)]; },
  levelFromXP(xp)     { return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1; },
  xpForLevel(lv)      { return Math.pow(lv - 1, 2) * 50; },
  xpForNextLevel(lv)  { return Math.pow(lv, 2) * 50; },
  progressToNextLevel(xp) {
    const lv = this.levelFromXP(xp);
    const curr = this.xpForLevel(lv);
    const next = this.xpForNextLevel(lv);
    return next > curr ? (xp - curr) / (next - curr) : 1;
  },
  async award(ref, eventKey, customAmount) {
    const amount = customAmount !== undefined ? customAmount : (OSL_XP_EVENTS[eventKey] || 0);
    if (!amount || !ref) return;
    try { await setDoc(ref, { xp: increment(amount) }, { merge: true }); }
    catch (e) { console.warn("XP award error:", e); }
  }
};

// ── Temperatura da sala — Tension Meter ───────────────────────────────────────
export const OSL_TENSION = (() => {
  let value = 0, criticalFired = false, decayInterval = null;
  const ICONS = ["🧊","❄️","🌡️","🌶️","🔥"];
  const T = { warm: 40, hot: 70, critical: 100 };

  function getIcon(v) { if (v<25) return ICONS[0]; if (v<45) return ICONS[1]; if (v<65) return ICONS[2]; if (v<85) return ICONS[3]; return ICONS[4]; }

  function render() {
    const fill  = document.getElementById("tensionFill");
    const icon  = document.getElementById("tensionIcon");
    const meter = document.getElementById("tensionMeter");
    if (!fill || !icon || !meter) return;
    fill.style.width = Math.min(value, 100) + "%";
    fill.classList.toggle("tensionMeter__fill--warm", value >= T.warm && value < T.hot);
    fill.classList.toggle("tensionMeter__fill--hot",  value >= T.hot);
    meter.classList.toggle("tensionMeter--critical",  value >= T.critical);
    icon.textContent = getIcon(value);
  }

  function fireMomentoCritico() {
    const n = document.createElement("div");
    n.className = "momentoCriticoNotif";
    n.innerHTML = `<div class="momentoCriticoNotif__label">⚡ Momento Crítico</div><div class="momentoCriticoNotif__title">A sala está em chamas</div><div class="momentoCriticoNotif__sub">Tensão máxima atingida pelo grupo</div>`;
    document.body.appendChild(n);
    if (S.userRef) OSL_XP.award(S.userRef, null, 15);
    OSL_ACHIEVEMENTS.onTensionCritical();
    setTimeout(() => { n.classList.add("momentoCriticoNotif--out"); setTimeout(() => n.remove(), 400); value = 10; criticalFired = false; render(); }, 4000);
  }

  return {
    heat(amount)  { value = Math.min(100, value + amount); render(); if (value >= T.critical && !criticalFired) { criticalFired = true; fireMomentoCritico(); } },
    startDecay()  { decayInterval = setInterval(() => { if (value > 0) { value = Math.max(0, value - 1.5); render(); } }, 3000); },
    stop()        { clearInterval(decayInterval); value = 0; criticalFired = false; render(); }
  };
})();

// ── Conquistas ────────────────────────────────────────────────────────────────
export const OSL_ACHIEVEMENTS = (() => {
  const BADGES = [
    { id:"first_session",   icon:"🎴", name:"Primeiro Ritual",         xp:50  },
    { id:"ten_cards",       icon:"📚", name:"Dez Camadas",             xp:30  },
    { id:"fire_streak",     icon:"🔥", name:"Faísca",                  xp:20  },
    { id:"deep_card_3",     icon:"🌑", name:"Abismo",                  xp:40  },
    { id:"critical_heat",   icon:"🌋", name:"Erupção",                 xp:35  },
    { id:"pressure_5",      icon:"👊", name:"Pressão Social",          xp:25  },
    { id:"mission_3",       icon:"🎯", name:"Agente",                  xp:60  },
    { id:"level_10",        icon:"🛡️",  name:"Guardião",                xp:100 },
    { id:"level_20",        icon:"🌟", name:"Oráculo",                 xp:200 },
    { id:"level_30",        icon:"👑", name:"Hierofante",              xp:500 },
    { id:"level_50",        icon:"⬡",  name:"O Sexto",                 xp:2000},
    { id:"night_owl",       icon:"🦉", name:"Coruja",                  xp:15  },
    { id:"marathon",        icon:"⏳", name:"Maratona",                xp:45  },
    { id:"reactor_king",    icon:"🎭", name:"Rei das Reações",         xp:30  },
    { id:"silent_watcher",  icon:"👤", name:"Observador Silencioso",   xp:20  },
  ];

  let _unlocked = new Set();
  let _sessionReactions = 0, _sessionFireReactions = 0, _pressureVotes = 0, _missionsCompleted = 0;
  let _toastQueue = [], _toastShowing = false;

  function showToast(badge) {
    _toastQueue.push(badge);
    if (!_toastShowing) drainQueue();
  }

  function drainQueue() {
    if (!_toastQueue.length) { _toastShowing = false; return; }
    _toastShowing = true;
    const b = _toastQueue.shift();
    const t = document.createElement("div");
    t.className = "achievementToast";
    t.innerHTML = `<div class="achievementToast__icon">${b.icon}</div><div class="achievementToast__body"><div class="achievementToast__name">${escapeHtml(b.name)}</div><div class="achievementToast__sub">Conquista desbloqueada!</div></div>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("achievementToast--visible")));
    setTimeout(() => { t.classList.remove("achievementToast--visible"); setTimeout(() => { t.remove(); drainQueue(); }, 400); }, 4000);
  }

  async function grant(id) {
    if (_unlocked.has(id)) return;
    const badge = BADGES.find(b => b.id === id);
    if (!badge) return;
    _unlocked.add(id);
    if (S.userRef) {
      try {
        await setDoc(S.userRef, { achievements: { [id]: { unlockedAt: Date.now() } } }, { merge: true });
        await OSL_XP.award(S.userRef, null, badge.xp);
      } catch (e) { console.warn("Achievement save error:", e); }
    }
    showToast(badge);
  }

  return {
    init(unlockedIds) {
      _unlocked = new Set(unlockedIds || []);
      if (new Date().getHours() >= 0 && new Date().getHours() < 5) grant("night_owl");
    },
    grant,
    onReaction(emoji) {
      _sessionReactions++;
      if (emoji === "🔥") { _sessionFireReactions++; if (_sessionFireReactions >= 5) grant("fire_streak"); }
    },
    onCardRevealed(total /*, type */) {
      if (total >= 10) grant("ten_cards");
      // (deep-card achievement removido — contador interno nunca foi implementado)
    },
    onSessionComplete(durationMin) { if (durationMin >= 45) grant("marathon"); },
    onPressureVote()    { _pressureVotes++; if (_pressureVotes >= 5) grant("pressure_5"); },
    onMissionComplete() { _missionsCompleted++; if (_missionsCompleted >= 3) grant("mission_3"); },
    onLevelUp(lv) {
      if (lv >= 10) grant("level_10");
      if (lv >= 20) grant("level_20");
      if (lv >= 30) grant("level_30");
      if (lv >= 50) {
        grant("level_50");
        if (!S._isPrestige) {
          S._isPrestige = true;
          document.dispatchEvent(new CustomEvent("osl:applyPrestige"));
          setDoc(S.userRef, { prestige: true }, { merge: true }).catch(err => console.warn("Prestige save failed:", err));
        }
      }
    },
    onTensionCritical() { grant("critical_heat"); }
  };
})();

// ── Pressão Social ────────────────────────────────────────────────────────────
let _pressureVotedThisCard = false;

export function initPressureBtn() {
  const btn = document.getElementById("pressureBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (_pressureVotedThisCard) return;
    _pressureVotedThisCard = true;
    btn.classList.add("pressureBtn--voted");
    btn.textContent = "✓ Votado";
    if (S.userRef) OSL_XP.award(S.userRef, "PRESSURE_VOTE");
    OSL_ACHIEVEMENTS.onPressureVote();
    try {
      await setDoc(S.ritualRef, { socialPressure: { ts: Date.now(), votedBy: S.playerName, roomCode: S.roomCode } }, { merge: true });
    } catch (e) { console.warn("Pressure vote error:", e); }
    OSL_TENSION.heat(20);
  });
}

export function resetPressureBtn() {
  _pressureVotedThisCard = false;
  const btn = document.getElementById("pressureBtn");
  if (btn) { btn.classList.remove("pressureBtn--voted"); btn.textContent = "🔥 Quer mais"; }
}

export function bindSocialPressure() {
  if (!S.ritualRef) return;
  let _lastPressureTs = 0;
  onSnapshot(S.ritualRef, (snap) => {
    if (!snap.exists()) return;
    const sp = snap.data().socialPressure;
    if (sp?.ts && sp.ts > _lastPressureTs) {
      _lastPressureTs = sp.ts;
      if (sp.votedBy !== S.playerName) {
        const n = document.createElement("div");
        n.className = "pressureNotif";
        n.innerHTML = `A sala quer mais<div class="pressureNotif__sub">${escapeHtml(sp.votedBy)} votou para continuar</div>`;
        document.body.appendChild(n);
        OSL_TENSION.heat(18);
        setTimeout(() => { n.classList.add("pressureNotif--out"); setTimeout(() => n.remove(), 380); }, 3500);
      }
    }
  });
}

// ── Efeitos de carta ──────────────────────────────────────────────────────────
export function clearEffectTimer() {
  if (S.activeEffectTimer) { clearInterval(S.activeEffectTimer); S.activeEffectTimer = null; }
}

export async function resolveActiveEffect(winner) {
  if (!S.isHost) return;
  const update = { activeEffect: null, aiDetection: null };
  if (winner) update.voteResult = { winner, resolvedAt: Date.now() };
  await setDoc(S.ritualRef, update, { merge: true });
  const toast = document.getElementById("aiDetectToast");
  if (toast) toast.classList.remove("aiDetectToast--visible");
}

export function getVoteWinner(votes) {
  const counts = {};
  Object.values(votes).forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export async function castEffectVote(option) {
  await updateDoc(S.ritualRef, { [`activeEffect.votes.${S.participantId}`]: option });
}
window.castEffectVote = castEffectVote;

// ── AI Detection (VAD + Chat) ─────────────────────────────────────────────────
export function startAIVAD(effect) {
  stopAIVAD();
  if (!effect?.params?.targetId || S.participantId !== effect.params.targetId) return;
  if (typeof window.isInVideoCall !== "function" || !window.isInVideoCall()) return;
  if (typeof window.watchLocalSpeaking !== "function") return;
  let hasSpoken = false;
  S.aiVADStopFn = window.watchLocalSpeaking((isSpeaking) => {
    if (isSpeaking) {
      hasSpoken = true;
      if (S.aiVADSilenceTimer) { clearTimeout(S.aiVADSilenceTimer); S.aiVADSilenceTimer = null; }
    } else if (hasSpoken && !S.aiVADSilenceTimer) {
      S.aiVADSilenceTimer = setTimeout(() => { writeAIDetection("voice", S.playerName, null); stopAIVAD(); }, 4000);
    }
  });
}

export function stopAIVAD() {
  if (S.aiVADStopFn) { S.aiVADStopFn(); S.aiVADStopFn = null; }
  clearTimeout(S.aiVADSilenceTimer); S.aiVADSilenceTimer = null;
}

export async function writeAIDetection(source, name, message) {
  try { await setDoc(S.ritualRef, { aiDetection: { source, playerName: name, message: message || null, detectedAt: Date.now() } }, { merge: true }); }
  catch (_) {}
}

export function checkAIDetection(aiDetection) {
  if (!S.isHost) return;
  const toast = document.getElementById("aiDetectToast");
  const msg   = document.getElementById("aiDetectToastMsg");
  if (!toast || !msg) return;
  if (!aiDetection?.detectedAt || Date.now() - aiDetection.detectedAt > 30000) { toast.classList.remove("aiDetectToast--visible"); return; }
  msg.textContent = aiDetection.source === "voice"
    ? `${aiDetection.playerName} terminou de falar`
    : `${aiDetection.playerName} respondeu no chat`;
  toast.classList.add("aiDetectToast--visible");
}

export async function confirmAIDetection() {
  await resolveActiveEffect();
  await setDoc(S.ritualRef, { aiDetection: null }, { merge: true });
  document.getElementById("aiDetectToast")?.classList.remove("aiDetectToast--visible");
}

export async function dismissAIDetection() {
  await setDoc(S.ritualRef, { aiDetection: null }, { merge: true });
  document.getElementById("aiDetectToast")?.classList.remove("aiDetectToast--visible");
}

window.confirmAIDetection = confirmAIDetection;
window.dismissAIDetection = dismissAIDetection;

// ── Reações ───────────────────────────────────────────────────────────────────
export async function sendReaction(emoji, sourceEl) {
  if (!S.ritualStarted) return;
  const ts = Date.now();
  S.shownReactions.set(S.participantId, ts);
  spawnReactionFloat(S.participantId, emoji, sourceEl);
  OSL_TENSION.heat(8);
  OSL_ACHIEVEMENTS.onReaction(emoji);
  if (S.userRef) OSL_XP.award(S.userRef, "REACTION_SENT");
  try {
    await setDoc(S.ritualRef, {
      [`reactions.${S.participantId}`]: { emoji, name: S.playerName, ts },
      [`reactionCounts.${S.participantId}`]: increment(1)
    }, { merge: true });
  } catch (_) {}
}

export function renderReactions(reactions) {
  if (!reactions) return;
  const now = Date.now();
  Object.entries(reactions).forEach(([pid, r]) => {
    if (!r?.ts || now - r.ts > 4500) return;
    if (S.shownReactions.get(pid) === r.ts) return;
    S.shownReactions.set(pid, r.ts);
    spawnReactionFloat(pid, r.emoji, null);
    if (pid !== S.participantId) {
      document.dispatchEvent(new CustomEvent("osl:checkMissionReaction", { detail: { fromPid: pid, emoji: r.emoji } }));
    }
  });
}

window.sendReaction = sendReaction;

// ── Renderização de efeito ativo ──────────────────────────────────────────────
export function renderActiveEffect(effect) {
  const panel = document.getElementById("effectPanel");
  if (!panel) return;
  const cardCenter = panel.closest(".cardCenter");

  if (!effect || effect.resolved) {
    if (panel.style.display !== "none") {
      if (S.effectPanelCloseTimer) clearTimeout(S.effectPanelCloseTimer);
      panel.classList.add("effectPanel--closing");
      if (cardCenter) cardCenter.classList.remove("cardCenter--effect-open");
      S.effectPanelCloseTimer = setTimeout(() => {
        panel.style.display = "none";
        panel.classList.remove("effectPanel--closing");
        S.effectPanelCloseTimer = null;
      }, 220);
    }
    clearEffectTimer();
    stopAIVAD();
    return;
  }

  if (S.effectPanelCloseTimer) { clearTimeout(S.effectPanelCloseTimer); S.effectPanelCloseTimer = null; panel.classList.remove("effectPanel--closing"); }
  panel.style.display = "flex";
  if (cardCenter) cardCenter.classList.add("cardCenter--effect-open");

  const titleEl   = panel.querySelector(".effectPanel__title");
  const bodyEl    = panel.querySelector(".effectPanel__body");
  const phaseLabel = effect.phase === "deathrattle" ? "⚰ DEATHRATTLE" : "⚡ BATTLECRY";
  if (titleEl) titleEl.textContent = phaseLabel;

  const old = panel.querySelector(".effectPanel__confirm");
  if (old) old.remove();

  const needsConfirm = effect.type === "force_player";

  switch (effect.type) {
    case "force_player": {
      const names = effect.params.targetId2
        ? `${effect.params.targetName} & ${effect.params.targetName2}`
        : effect.params.targetName;
      if (bodyEl) bodyEl.innerHTML = `<span class="effectPanel__highlight">${names}</span><br>${effect.label || "está em foco"}`;
      startAIVAD(effect);
      break;
    }
    case "set_timer": {
      const duration  = effect.params.duration || 60;
      const startedAt = effect.params.startedAt || Date.now();
      if (bodyEl) bodyEl.innerHTML = `<span class="effectPanel__timer" id="effectTimerDisplay">--</span>`;
      clearEffectTimer();
      S.activeEffectTimer = setInterval(() => {
        const elapsed   = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = Math.max(0, duration - elapsed);
        const display   = document.getElementById("effectTimerDisplay");
        if (display) { const m = Math.floor(remaining / 60).toString().padStart(2,"0"); const s = (remaining % 60).toString().padStart(2,"0"); display.textContent = `${m}:${s}`; }
        if (remaining === 0) { clearEffectTimer(); if (S.isHost) resolveActiveEffect(); }
      }, 500);
      break;
    }
    case "vote": {
      const opts  = effect.params.options || [];
      const votes = effect.votes || {};
      const myVote = votes[S.participantId];
      const voteCounts = {};
      Object.values(votes).forEach(v => { voteCounts[v] = (voteCounts[v] || 0) + 1; });
      const totalVoted   = Object.keys(votes).length;
      const totalPlayers = S.currentPlayers.length || 1;
      if (bodyEl) bodyEl.innerHTML = `
        <div class="effectPanel__question">${effect.params.question || "Vote:"}</div>
        <div class="effectPanel__voteOptions">
          ${opts.map(opt => `<button class="effectPanel__voteBtn${myVote === opt ? " effectPanel__voteBtn--active" : ""}" onclick="castEffectVote('${opt.replace(/'/g,"\\'")}')">
            ${opt}${voteCounts[opt] ? ` <span class="effectPanel__voteCount">${voteCounts[opt]}</span>` : ""}
          </button>`).join("")}
        </div>
        <div class="effectPanel__voteProgress">${totalVoted}/${totalPlayers} votaram</div>`;
      if (S.isHost && totalVoted >= totalPlayers) setTimeout(() => resolveActiveEffect(getVoteWinner(votes)), 600);
      break;
    }
    case "give_xp": {
      if (bodyEl) bodyEl.innerHTML = `<span class="effectPanel__xp">+${effect.params.amount || 10} XP</span><br>para todos na sala!`;
      if (!S.isHost) OSL_XP.award(S.userRef, null, effect.params.amount).catch(() => {});
      if (S.isHost) setTimeout(() => resolveActiveEffect(), 3000);
      break;
    }
    case "next_category": {
      if (bodyEl) bodyEl.innerHTML = `Próxima carta será de <strong>${effect.params.category}</strong>`;
      if (S.isHost) setTimeout(() => resolveActiveEffect(), 3000);
      break;
    }
    default:
      if (bodyEl) bodyEl.textContent = "";
      if (S.isHost) setTimeout(() => resolveActiveEffect(), 1500);
  }

  if (needsConfirm && S.isHost) {
    const btn = document.createElement("button");
    btn.className = "effectPanel__confirm";
    btn.textContent = "Concluído ✓";
    btn.onclick = resolveActiveEffect;
    panel.appendChild(btn);
  }
}
