// Recompensas diárias, sistema de XP, level-up, painel de níveis, compartilhamento
import { S } from "../state.js";
import { setDoc, getDoc, getDocs, query, orderBy } from "../firebase.js";
import { escapeHtml } from "../utils.js";
import { OSL_XP_TITLES, OSL_XP_EVENTS, DAILY_STREAK_XP } from "../constants.js";
import { OSL_XP, OSL_ACHIEVEMENTS } from "./effects.js";

// Localização: pega title/unlock do namespace xptitles (level == índice 1..50)
function localizedTitleInfo(level, info) {
  if (!info) return info;
  const tr = window.oslTr;
  if (typeof tr !== "function") return info;
  const titleKey = `xptitles:titles.${level - 1}`;
  const t = tr(titleKey, info.title);
  const out = { ...info, title: t };
  if (info.unlock) {
    const unlockKey = `xptitles:unlocks.${level - 1}`;
    const u = tr(unlockKey, info.unlock);
    if (u) out.unlock = u;
  }
  return out;
}

// ── Atualização do card de XP na topbar ───────────────────────────────────────
export function updateXpCard(xp) {
  S._currentXp = xp;
  try { localStorage.setItem("osl_xp_cache", String(xp)); } catch (_) {}

  const lv   = OSL_XP.levelFromXP(xp);
  const info = localizedTitleInfo(lv, OSL_XP.titleForLevel(lv));
  const curr = OSL_XP.xpForLevel(lv);
  const next = OSL_XP.xpForNextLevel(lv);
  const pct  = next > curr ? Math.round((xp - curr) / (next - curr) * 100) : 100;
  const inLv = xp - curr, needed = next - curr;

  const lvEl = document.getElementById("xpCardLevel");
  if (lvEl) { lvEl.textContent = `${info.icon} ${oslTr("sala:xpUI.level", "Nv.{{n}}", { n: lv })} ${info.title}`; lvEl.dataset.tier = info.tier; }
  const fillEl = document.getElementById("xpCardFill");
  if (fillEl) fillEl.style.width = `${pct}%`;
  const xpEl = document.getElementById("xpCardXp");
  if (xpEl) xpEl.textContent = oslTr("sala:topbar.xpTotal", "{{xp}} XP", { xp });
  const numsEl = document.getElementById("xpCardNums");
  if (numsEl) numsEl.textContent = next > curr ? oslTr("sala:topbar.xpNumsTemplate", "{{cur}} / {{max}} XP", { cur: inLv, max: needed }) : oslTr("sala:xpUI.max", "MAX");

  if (S._xpPrevLevel > 0 && lv > S._xpPrevLevel) showLevelUpModal(lv, info);
  S._xpPrevLevel = lv;
}

export function showLevelUpModal(lv, info) {
  info = localizedTitleInfo(lv, info);
  const overlay = document.createElement("div");
  overlay.className = "levelUpOverlay";
  const unlockBlock = info.unlock ? `<div class="levelUpCard__unlock"><strong>${oslTr("sala:xpUI.levelUp.unlock", "Desbloqueado")}</strong>${escapeHtml(info.unlock)}</div>` : "";
  overlay.innerHTML = `
    <div class="levelUpCard">
      <div class="levelUpCard__badge">${info.icon}</div>
      <div class="levelUpCard__eyebrow">${oslTr("sala:xpUI.levelUp.eyebrow", "Subiu de nível")}</div>
      <div class="levelUpCard__level">${lv}</div>
      <div class="levelUpCard__title">${escapeHtml(info.title)}</div>
      ${unlockBlock}
      <button class="levelUpCard__close">${oslTr("sala:xpUI.levelUp.continue", "Continuar →")}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".levelUpCard__close").addEventListener("click", () => {
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 320);
  });
  setTimeout(() => { if (overlay.isConnected) overlay.querySelector(".levelUpCard__close").click(); }, 8000);
}

// ── Painel de todos os níveis ─────────────────────────────────────────────────
export function showLevelPanel(currentXp) {
  const lv   = OSL_XP.levelFromXP(currentXp);
  const info = localizedTitleInfo(lv, OSL_XP.titleForLevel(lv));
  const curr = OSL_XP.xpForLevel(lv);
  const next = OSL_XP.xpForNextLevel(lv);
  const pct  = next > curr ? Math.round((currentXp - curr) / (next - curr) * 100) : 100;
  const inLv = currentXp - curr, needed = next - curr;

  const TIERS = [
    { key:"bronze",   label: oslTr("sala:xpUI.tier.bronze",   "Bronze"),    range:[1,10]  },
    { key:"silver",   label: oslTr("sala:xpUI.tier.silver",   "Prata"),     range:[11,20] },
    { key:"gold",     label: oslTr("sala:xpUI.tier.gold",     "Ouro"),      range:[21,30] },
    { key:"prestige", label: oslTr("sala:xpUI.tier.prestige", "Prestígio"), range:[31,50] },
  ];

  const overlay = document.createElement("div");
  overlay.className = "lvlPanelOverlay";

  const tierHTML = TIERS.map(tier => {
    const rows = [];
    for (let i = tier.range[0]; i <= tier.range[1]; i++) {
      const t = localizedTitleInfo(i, OSL_XP.titleForLevel(i));
      const isNow = i === lv, isDone = i < lv, isLocked = i > lv, hasMile = !!t.unlock;
      let rowClass = "lvlPanel__lvlRow";
      if (isNow)    rowClass += " lvlPanel__lvlRow--current";
      if (isDone)   rowClass += " lvlPanel__lvlRow--unlocked";
      if (isLocked) rowClass += " lvlPanel__lvlRow--locked";
      if (hasMile)  rowClass += " lvlPanel__lvlRow--milestone";
      const badgeHTML = isNow ? `<div class="lvlPanel__lvlBadge lvlPanel__lvlBadge--current">▶</div>` : isDone ? `<div class="lvlPanel__lvlBadge lvlPanel__lvlBadge--done">✓</div>` : `<div class="lvlPanel__lvlBadge lvlPanel__lvlBadge--locked">🔒</div>`;
      const unlockHTML = hasMile ? `<div class="lvlPanel__lvlUnlock${isDone ? " lvlPanel__lvlUnlock--done" : ""}">${isDone ? "✓" : "🔓"} ${escapeHtml(t.unlock)}</div>` : "";
      rows.push(`<div class="${rowClass}" ${isNow ? 'id="lvlPanel__currentRow"' : ""}><div class="lvlPanel__lvlNum">${i}</div><div class="lvlPanel__lvlIcon">${t.icon}</div><div class="lvlPanel__lvlInfo"><div class="lvlPanel__lvlTitle">${escapeHtml(t.title)}</div>${unlockHTML}</div>${badgeHTML}</div>`);
    }
    return `<div class="lvlPanel__tierHeader lvlPanel__tierHeader--${tier.key}"><span>${oslTr("sala:xpUI.levelPanel.tierLevels", "{{label}} · Níveis {{from}}–{{to}}", { label: tier.label, from: tier.range[0], to: tier.range[1] })}</span></div>${rows.join("")}`;
  }).join("");

  const xpNextLabel = lv >= 50 ? `<strong>${oslTr("sala:xpUI.levelPanel.maxLevel", "Nível máximo")}</strong>` : oslTr("sala:xpUI.levelPanel.nextNeeded", "<strong>{{cur}}</strong> / {{needed}} XP para o próximo", { cur: inLv, needed });
  const tierLocalized = oslTr("sala:xpUI.tier." + info.tier, info.tier.charAt(0).toUpperCase() + info.tier.slice(1));

  overlay.innerHTML = `
    <div class="lvlPanel">
      <div class="lvlPanel__header"><div class="lvlPanel__headerTitle">${oslTr("sala:xpUI.levelPanel.headerTitle", "Sua Jornada")}</div><button class="lvlPanel__close" id="lvlPanelClose">✕</button></div>
      <div class="lvlPanel__hero">
        <div class="lvlPanel__heroTop">
          <div class="lvlPanel__heroIcon">${info.icon}</div>
          <div class="lvlPanel__heroMeta">
            <div class="lvlPanel__heroEyebrow">${oslTr("sala:xpUI.levelPanel.current", "Nível atual")}</div>
            <div class="lvlPanel__heroLevelNum">${lv}</div>
            <div class="lvlPanel__heroTitle">${escapeHtml(info.title)}</div>
            <div class="lvlPanel__heroTier">${escapeHtml(oslTr("sala:xpUI.levelPanel.tierTotal", "{{tier}} · {{xp}} XP total", { tier: tierLocalized, xp: currentXp }))}</div>
          </div>
        </div>
        <div class="lvlPanel__xpSection">
          <div class="lvlPanel__xpLabel"><span>${oslTr("sala:xpUI.levelPanel.progressTo", "Progresso para o próximo nível")}</span>${xpNextLabel}</div>
          <div class="lvlPanel__xpTrack"><div class="lvlPanel__xpBar" style="width:${pct}%"></div></div>
          <div class="lvlPanel__xpSub">${oslTr("sala:xpUI.levelPanel.percentDone", "{{pct}}% concluído", { pct })}</div>
        </div>
      </div>
      <div class="lvlPanel__body" id="lvlPanelBody">${tierHTML}</div>
    </div>`;

  document.body.appendChild(overlay);
  const panel = overlay.querySelector(".lvlPanel");
  panel.addEventListener("animationend", () => { panel.style.willChange = "auto"; overlay.querySelector("#lvlPanel__currentRow")?.scrollIntoView({ block:"center", behavior:"smooth" }); }, { once: true });
  const close = () => { overlay.classList.add("closing"); setTimeout(() => overlay.remove(), 300); };
  overlay.querySelector("#lvlPanelClose").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
}

// ── Recompensa diária ─────────────────────────────────────────────────────────
function todayLocal()     { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function yesterdayLocal() { const d = new Date(Date.now() - 86400000); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

export async function checkDailyReward() {
  if (!S.userId) return;
  try {
    const snap = await getDoc(S.userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const today     = todayLocal();
    const alreadyClaimed = (data.lastDailyReward || "") === today;
    const pendingXp = data.pendingDailyXp || 0;
    if (alreadyClaimed && pendingXp === 0) return;
    let streak, xp;
    if (alreadyClaimed && pendingXp > 0) {
      streak = data.dailyStreak || 1; xp = pendingXp;
    } else {
      streak = (data.lastDailyReward === yesterdayLocal()) ? (data.dailyStreak || 0) + 1 : 1;
      xp = DAILY_STREAK_XP[Math.min(streak - 1, DAILY_STREAK_XP.length - 1)];
      await setDoc(S.userRef, { lastDailyReward: today, dailyStreak: streak, pendingDailyXp: xp }, { merge: true });
    }
    showDailyRewardModal(streak, xp, async () => {
      await OSL_XP.award(S.userRef, null, xp);
      await setDoc(S.userRef, { pendingDailyXp: 0 }, { merge: true });
    });
  } catch (_) {}
}

function showDailyRewardModal(streak, xp, onCollect) {
  const icon = streak >= 7 ? "🔥" : streak >= 3 ? "⚡" : "✨";
  const dots  = Array.from({ length: 7 }, (_, i) => `<div class="dailyRewardCard__dot${i < streak ? " dailyRewardCard__dot--on" : ""}"></div>`).join("");
  const overlay = document.createElement("div");
  overlay.className = "dailyRewardModal";
  overlay.innerHTML = `
    <div class="dailyRewardCard">
      <div class="dailyRewardCard__flame">${icon}</div>
      <div class="dailyRewardCard__title">${oslTr("sala:xpUI.daily.title", "Recompensa Diária")}</div>
      <div class="dailyRewardCard__streak">${oslTr("sala:xpUI.daily.day", "DIA {{streak}}", { streak })}</div>
      <div class="dailyRewardCard__bar">${dots}</div>
      <div class="dailyRewardCard__xp">+${xp}</div>
      <div class="dailyRewardCard__xplabel">XP</div>
      <button class="dailyRewardCard__btn" id="dailyRewardBtn">${oslTr("sala:xpUI.daily.collect", "COLETAR")}</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("dailyRewardBtn").addEventListener("click", async () => {
    overlay.classList.add("closing");
    setTimeout(async () => { overlay.remove(); await onCollect(); }, 250);
  });
}

// ── Resultado de votação ──────────────────────────────────────────────────────
let lastVoteResultTimestamp = 0;

export function showVoteResultOverlay(winner, resolvedAt) {
  if (!winner || resolvedAt === lastVoteResultTimestamp) return;
  if (Date.now() - resolvedAt > 8000) return;
  lastVoteResultTimestamp = resolvedAt;
  const overlay = document.createElement("div");
  overlay.className = "voteResultOverlay";
  overlay.innerHTML = `<div class="voteResultOverlay__word">${winner.toUpperCase()}</div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("voteResultOverlay--visible")));
  setTimeout(() => { overlay.classList.remove("voteResultOverlay--visible"); setTimeout(() => overlay.remove(), 700); }, 3500);
}

// ── Recap de sessão ───────────────────────────────────────────────────────────
export async function showSessionRecap(onNewSession, primaryLabel) {
  primaryLabel = primaryLabel ?? oslTr("sala:xpUI.recap.newSession", "NOVA SESSÃO");
  const [histSnap, msgsSnap, ritualSnap] = await Promise.all([
    getDocs(query(S.ritualHistoryRef, orderBy("createdAt", "asc"))),
    getDocs(query(S.messagesRef, orderBy("createdAt", "asc"))),
    getDoc(S.ritualRef)
  ]);

  const histItems    = histSnap.docs.map(d => d.data());
  const cardsRevealed = histItems.filter(h => h.type && h.type !== "Ritual").length;
  const ritualData   = ritualSnap?.data?.() || {};

  let durationStr = "—";
  if (ritualData.sessionStartedAt) {
    const mins = Math.round((Date.now() - ritualData.sessionStartedAt) / 60000);
    durationStr = mins < 1 ? "< 1 min" : `${mins} min`;
    OSL_ACHIEVEMENTS.onSessionComplete(mins);
  }

  const reactions = ritualData.reactions || {};
  const emojiTally = {};
  Object.values(reactions).forEach(r => { if (r?.emoji) emojiTally[r.emoji] = (emojiTally[r.emoji] || 0) + 1; });
  const topEmoji = Object.entries(emojiTally).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

  const reactionCounts = ritualData.reactionCounts || {};
  let topReactor = null, topCount = 0;
  Object.entries(reactionCounts).forEach(([pid, n]) => { if (n > topCount) { topCount = n; topReactor = pid; } });
  const topReactorName = S.currentPlayers.find(p => p.id === topReactor)?.name || null;

  const msgCountByPlayer = {};
  msgsSnap.docs.forEach(d => { const aid = d.data().authorId; if (aid) msgCountByPlayer[aid] = (msgCountByPlayer[aid] || 0) + 1; });
  let topChatter = null, topMsgCount = 0;
  Object.entries(msgCountByPlayer).forEach(([pid, n]) => { if (n > topMsgCount) { topMsgCount = n; topChatter = pid; } });
  const topChatterName = S.currentPlayers.find(p => p.id === topChatter)?.name || null;

  const statReactor = topReactorName ? `<div class="recapStat"><div class="recapStat__icon">🎭</div><div class="recapStat__value">${escapeHtml(topReactorName)}</div><div class="recapStat__label">Mais expressivo</div></div>` : "";
  const statChatter = topChatterName ? `<div class="recapStat"><div class="recapStat__icon">💬</div><div class="recapStat__value">${escapeHtml(topChatterName)}</div><div class="recapStat__label">Mais no chat</div></div>` : "";
  const statEmoji   = topEmoji       ? `<div class="recapStat"><div class="recapStat__icon">${topEmoji}</div><div class="recapStat__value">Favorita</div><div class="recapStat__label">Reação do grupo</div></div>` : "";
  const newSessionBtn = onNewSession  ? `<button class="recapCard__btn recapCard__btn--primary" id="recapNewBtn">${primaryLabel}</button>` : "";

  const overlay = document.createElement("div");
  overlay.className = "recapOverlay";
  overlay.innerHTML = `
    <div class="recapCard">
      <div class="recapCard__eyebrow">Fim do Ritual</div>
      <div class="recapCard__title">Recap da Sessão</div>
      <div class="recapStats">
        <div class="recapStat"><div class="recapStat__icon">🃏</div><div class="recapStat__value">${cardsRevealed}</div><div class="recapStat__label">Cartas reveladas</div></div>
        <div class="recapStat"><div class="recapStat__icon">⏱</div><div class="recapStat__value">${durationStr}</div><div class="recapStat__label">Duração</div></div>
        ${statReactor}${statChatter}${statEmoji}
      </div>
      <div class="recapCard__actions">
        ${newSessionBtn}
        <button class="recapCard__btn recapCard__btn--share" id="recapShareBtn">📤 COMPARTILHAR</button>
        <button class="recapCard__btn recapCard__btn--ghost" id="recapCloseBtn">FECHAR</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const closeRecap = () => { overlay.classList.add("closing"); setTimeout(() => overlay.remove(), 300); };
  document.getElementById("recapCloseBtn").addEventListener("click", closeRecap);
  document.getElementById("recapShareBtn").addEventListener("click", () => shareSessionCard({ cards: cardsRevealed, duration: durationStr, topEmoji, playerCount: S.currentPlayers.length }));
  if (onNewSession) document.getElementById("recapNewBtn").addEventListener("click", () => { closeRecap(); onNewSession(); });
}

// ── Compartilhamento de card ──────────────────────────────────────────────────
export async function shareSessionCard({ cards, duration, topEmoji, playerCount }) {
  const canvas = document.createElement("canvas");
  canvas.width = 800; canvas.height = 800;
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0,0,0,800); bg.addColorStop(0,"#0c0804"); bg.addColorStop(0.5,"#1a1006"); bg.addColorStop(1,"#0c0804");
  ctx.fillStyle = bg; ctx.fillRect(0,0,800,800);
  ctx.strokeStyle = "rgba(212,168,75,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(16,16,768,768,32); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(212,168,75,0.6)"; ctx.font = "700 13px system-ui"; ctx.fillText("O SEXTOLUGAR", 400, 100);
  ctx.fillStyle = "#f0e8d8"; ctx.font = "900 52px system-ui"; ctx.fillText("Ritual Concluído", 400, 175);
  ctx.strokeStyle = "rgba(212,168,75,0.2)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(80,210); ctx.lineTo(720,210); ctx.stroke();
  const drawStat = (icon, value, label, cx, cy) => { ctx.font="48px system-ui"; ctx.fillStyle="#f0e8d8"; ctx.fillText(icon,cx,cy); ctx.font="900 40px system-ui"; ctx.fillText(value,cx,cy+56); ctx.font="400 15px system-ui"; ctx.fillStyle="rgba(255,255,255,0.35)"; ctx.fillText(label.toUpperCase(),cx,cy+80); };
  drawStat("🃏",String(cards),"cartas",200,310); drawStat("⏱",String(duration),"duração",600,310); drawStat(topEmoji||"🎭","Favorita","reação",200,510); drawStat("👥",String(playerCount),"jogadores",600,510);
  ctx.fillStyle = "rgba(212,168,75,0.5)"; ctx.font = "400 16px system-ui"; ctx.fillText("sextolugar.com.br", 400, 680);
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "osl-recap.png", { type:"image/png" });
    if (navigator.canShare?.({ files:[file] })) { try { await navigator.share({ files:[file], title:"SEXTOLUGAR — Ritual Concluído" }); return; } catch (_) {} }
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "osl-recap.png"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}
