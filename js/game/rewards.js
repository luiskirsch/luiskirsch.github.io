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
    durationStr = mins < 1
      ? oslTr("sala:xpUI.recap.lessThanMin", "< 1 min")
      : oslTr("sala:xpUI.recap.minutes", "{{n}} min", { n: mins });
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

  const statReactor = topReactorName ? `<div class="recapStat recapStat--wide"><div class="recapStat__icon">🎭</div><div class="recapStat__value">${escapeHtml(topReactorName)}</div><div class="recapStat__label">${oslTr("sala:xpUI.recap.topReactor", "Mais expressivo")}</div></div>` : "";
  const statChatter = topChatterName ? `<div class="recapStat recapStat--wide"><div class="recapStat__icon">💬</div><div class="recapStat__value">${escapeHtml(topChatterName)}</div><div class="recapStat__label">${oslTr("sala:xpUI.recap.topChatter", "Mais no chat")}</div></div>` : "";
  const statEmoji   = topEmoji       ? `<div class="recapStat recapStat--wide"><div class="recapStat__icon">${topEmoji}</div><div class="recapStat__value">${oslTr("sala:xpUI.recap.favoriteReaction", "Favorita")}</div><div class="recapStat__label">${oslTr("sala:xpUI.recap.groupReaction", "Reação do grupo")}</div></div>` : "";
  const newSessionBtn = onNewSession  ? `<button class="recapCard__btn recapCard__btn--primary" id="recapNewBtn">${primaryLabel}</button>` : "";

  const overlay = document.createElement("div");
  overlay.className = "recapOverlay";
  overlay.innerHTML = `
    <div class="recapCard">
      <div class="recapCard__brand">O SextoLugar</div>
      <div class="recapCard__ornament">
        <span class="recapCard__ornamentLine"></span>
        <span class="recapCard__ornamentGem">◆ ◆ ◆</span>
        <span class="recapCard__ornamentLine"></span>
      </div>
      <div class="recapCard__eyebrow">${oslTr("sala:xpUI.recap.endOfRitual", "Fim do Ritual")}</div>
      <div class="recapCard__title">${oslTr("sala:xpUI.recap.title", "Recap da Sessão")}</div>
      <div class="recapStats">
        <div class="recapStat"><div class="recapStat__value">${cardsRevealed}</div><div class="recapStat__label">${oslTr("sala:xpUI.recap.cardsRevealed", "Cartas reveladas")}</div></div>
        <div class="recapStat"><div class="recapStat__value">${durationStr}</div><div class="recapStat__label">${oslTr("sala:xpUI.recap.duration", "Duração")}</div></div>
        ${statReactor}${statChatter}${statEmoji}
      </div>
      <div class="recapCard__sep">● ● ●</div>
      <div class="recapCard__actions">
        <button class="recapCard__btn recapCard__btn--share" id="recapShareBtn">✦ ${oslTr("sala:xpUI.recap.shareBtn2", "Compartilhar sessão")}</button>
        ${newSessionBtn}
        <button class="recapCard__btn recapCard__btn--ghost" id="recapCloseBtn">${oslTr("sala:xpUI.recap.closeBtn", "Fechar")}</button>
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
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const cx = W / 2;

  // ── Fundo ─────────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#05040E"); bgGrad.addColorStop(0.5, "#0E0B1F"); bgGrad.addColorStop(1, "#05040E");
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  // Glow radial central
  const glow = ctx.createRadialGradient(cx, H * 0.42, 0, cx, H * 0.42, 560);
  glow.addColorStop(0, "rgba(191,155,84,0.13)"); glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // ── Anéis decorativos ────────────────────────────────────────────────────
  const drawRing = (r, alpha) => {
    ctx.beginPath(); ctx.arc(cx, H * 0.42, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(191,155,84,${alpha})`; ctx.lineWidth = 1; ctx.stroke();
  };
  drawRing(480, 0.07); drawRing(380, 0.1); drawRing(260, 0.12);

  // ── Borda do card ─────────────────────────────────────────────────────────
  const pad = 48, cardX = pad, cardY = H * 0.08, cardW = W - pad * 2, cardH = H * 0.84;
  ctx.strokeStyle = "rgba(191,155,84,0.35)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 40); ctx.stroke();
  // inner glow border
  ctx.strokeStyle = "rgba(191,155,84,0.08)"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(cardX + 3, cardY + 3, cardW - 6, cardH - 6, 38); ctx.stroke();

  // ── Brand topo ────────────────────────────────────────────────────────────
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(191,155,84,0.45)";
  ctx.font = "700 28px system-ui,-apple-system,sans-serif";
  ctx.letterSpacing = "12px";
  ctx.fillText("O SEXTOLUGAR", cx, cardY + 90);
  ctx.letterSpacing = "0px";

  // Linha ornamental
  const lineY = cardY + 118;
  const lineGrad = ctx.createLinearGradient(cardX + 60, 0, cardX + cardW - 60, 0);
  lineGrad.addColorStop(0, "transparent"); lineGrad.addColorStop(0.5, "rgba(191,155,84,0.4)"); lineGrad.addColorStop(1, "transparent");
  ctx.strokeStyle = lineGrad; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cardX + 60, lineY); ctx.lineTo(cardX + cardW - 60, lineY); ctx.stroke();

  // ── Eyebrow ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(191,155,84,0.55)";
  ctx.font = "600 22px system-ui,-apple-system,sans-serif";
  ctx.letterSpacing = "8px";
  ctx.fillText("FIM DO RITUAL", cx, cardY + 175);
  ctx.letterSpacing = "0px";

  // ── Título principal (serif italic via measureText trick) ─────────────────
  ctx.fillStyle = "#EDE0C4";
  ctx.font = "italic 900 96px Georgia,'Times New Roman',serif";
  ctx.fillText("Ritual Concluído", cx, cardY + 300);

  // ── Divisor ornamental ────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(191,155,84,0.5)";
  ctx.font = "400 24px system-ui";
  ctx.fillText("◆  ◆  ◆", cx, cardY + 360);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const statsTop = cardY + 420;
  const statColW = cardW / 2;

  const drawStatBlock = (value, label, bx, by) => {
    // Top gold accent
    const accentGrad = ctx.createLinearGradient(bx + 80, 0, bx + statColW - 80, 0);
    accentGrad.addColorStop(0, "transparent"); accentGrad.addColorStop(0.5, "rgba(191,155,84,0.5)"); accentGrad.addColorStop(1, "transparent");
    ctx.strokeStyle = accentGrad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx + 80, by); ctx.lineTo(bx + statColW - 80, by); ctx.stroke();

    // Value
    ctx.fillStyle = "#EDE0C4";
    ctx.font = "900 80px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(value, bx + statColW / 2, by + 90);

    // Label
    ctx.fillStyle = "rgba(191,155,84,0.5)";
    ctx.font = "600 20px system-ui,-apple-system,sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText(label.toUpperCase(), bx + statColW / 2, by + 122);
    ctx.letterSpacing = "0px";
  };

  // Vertical divider between stats
  ctx.strokeStyle = "rgba(191,155,84,0.15)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, statsTop - 20); ctx.lineTo(cx, statsTop + 250); ctx.stroke();
  // Horizontal divider
  ctx.beginPath(); ctx.moveTo(cardX + 60, statsTop + 160); ctx.lineTo(cardX + cardW - 60, statsTop + 160); ctx.stroke();

  drawStatBlock(String(cards), oslTr("sala:xpUI.recap.share.cards", "Cartas"), cardX, statsTop);
  drawStatBlock(String(duration), oslTr("sala:xpUI.recap.share.duration", "Duração"), cardX + statColW, statsTop);
  drawStatBlock(topEmoji || "🎭", oslTr("sala:xpUI.recap.share.reaction", "Reação"), cardX, statsTop + 170);
  drawStatBlock(String(playerCount), oslTr("sala:xpUI.recap.share.players", "Jogadores"), cardX + statColW, statsTop + 170);

  // ── Frase de encerramento ─────────────────────────────────────────────────
  const phraseY = statsTop + 430;
  ctx.fillStyle = "rgba(191,155,84,0.3)";
  ctx.font = "italic 32px Georgia,'Times New Roman',serif";
  ctx.fillText("Cada sessão deixa uma marca.", cx, phraseY);

  // Linha separadora inferior
  const sep2 = phraseY + 50;
  ctx.strokeStyle = lineGrad; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cardX + 60, sep2); ctx.lineTo(cardX + cardW - 60, sep2); ctx.stroke();

  // ── URL / watermark ───────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(191,155,84,0.35)";
  ctx.font = "500 28px system-ui,-apple-system,sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("preludiojogos.com", cx, cardY + cardH - 60);
  ctx.letterSpacing = "0px";

  // ── Exportar ──────────────────────────────────────────────────────────────
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "osl-recap.png", { type: "image/png" });
    // Share nativo só no mobile — no desktop a share sheet do SO não tem "salvar"
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: oslTr("sala:xpUI.recap.shareTitle", "SEXTOLUGAR — Ritual Concluído") }); return; } catch (_) {}
    }
    // Desktop ou fallback: download direto
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "osl-recap.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}
