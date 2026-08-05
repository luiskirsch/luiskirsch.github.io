// Recompensas diárias, sistema de XP, level-up, painel de níveis, compartilhamento
import { S } from "../state.js";
import { setDoc, getDoc, getDocFromServer, getDocs, query, orderBy } from "../firebase.js";
import { escapeHtml } from "../utils.js";
import { OSL_XP_TITLES, OSL_XP_EVENTS, DAILY_STREAK_XP, OSL_REACTION_UNLOCKS, OSL_COINS_PER_LEVEL } from "../constants.js";
import { OSL_XP, OSL_ACHIEVEMENTS } from "./effects.js";

// ── Barra de reações ──────────────────────────────────────────────────────────
export function updateReactionBar(level) {
  const bar = document.getElementById("reactionBar");
  if (!bar) return;
  if (bar.dataset.level === String(level)) return; // sem mudança de nível, não reconstrói
  bar.dataset.level = String(level);
  const emojis = OSL_REACTION_UNLOCKS
    .filter(r => r.minLevel <= level)
    .flatMap(r => r.emojis);
  bar.innerHTML = emojis.map(e =>
    `<button class="reactionBar__btn" onclick="sendReaction('${e}',this)" title="${e}">${e}</button>`
  ).join("");
}

// ── Moedas ────────────────────────────────────────────────────────────────────
export function getCoinDisplay() {
  try { return parseInt(localStorage.getItem("osl_coins") || "0", 10); } catch(_) { return 0; }
}

async function awardCoins(level) {
  const amount = OSL_COINS_PER_LEVEL[level - 1] ?? 25;
  try { localStorage.setItem("osl_coins", String(getCoinDisplay() + amount)); } catch(_) {}
  if (S.userRef) {
    try {
      const { updateDoc, increment } = await import("../firebase.js");
      await updateDoc(S.userRef, { coins: increment(amount) });
    } catch(_) {}
  }
  updateCoinDisplay();
  return amount;
}

export function updateCoinDisplay() {
  const el = document.getElementById("coinBalance");
  if (el) el.textContent = getCoinDisplay().toLocaleString("pt-BR");
}

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

  updateReactionBar(lv);
  if (S._xpPrevLevel > 0 && lv > S._xpPrevLevel) {
    awardCoins(lv).then(amount => showLevelUpModal(lv, info, amount));
  } else if (S._xpPrevLevel === 0) {
    updateCoinDisplay();
  }
  S._xpPrevLevel = lv;
}

export async function syncCoinsFromFirestore() {
  if (!S.userRef) return;
  try {
    const snap = await getDocFromServer(S.userRef);
    const coins = snap.data()?.coins ?? 0;
    try { localStorage.setItem("osl_coins", String(coins)); } catch(_) {}
    updateCoinDisplay();
  } catch(_) {
    getDoc(S.userRef).then(snap => {
      const coins = snap.data()?.coins ?? 0;
      try { localStorage.setItem("osl_coins", String(coins)); } catch(_) {}
      updateCoinDisplay();
    }).catch(() => {});
  }
}

export function showLevelUpModal(lv, info, coinsEarned) {
  info = localizedTitleInfo(lv, info);
  const overlay = document.createElement("div");
  overlay.className = "levelUpOverlay";
  const unlockBlock = info.unlock ? `<div class="levelUpCard__unlock"><strong>${oslTr("sala:xpUI.levelUp.unlock", "Desbloqueado")}</strong>${escapeHtml(info.unlock)}</div>` : "";
  const coinsBlock = coinsEarned ? `<div class="levelUpCard__coins">+${coinsEarned} <span class="levelUpCard__coinIcon">🪙</span></div>` : "";
  overlay.innerHTML = `
    <div class="levelUpCard">
      <div class="levelUpCard__badge">${info.icon}</div>
      <div class="levelUpCard__eyebrow">${oslTr("sala:xpUI.levelUp.eyebrow", "Subiu de nível")}</div>
      <div class="levelUpCard__level">${lv}</div>
      <div class="levelUpCard__title">${escapeHtml(info.title)}</div>
      ${coinsBlock}
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

// ── Modal de moedas ───────────────────────────────────────────────────────────
export function showCoinModal(currentXp) {
  const lv = OSL_XP.levelFromXP(currentXp ?? S._currentXp ?? 0);
  const balance = getCoinDisplay();

  // Earn tab: lista todos os 50 níveis com moedas
  const earnRows = OSL_COINS_PER_LEVEL.slice(0, 50).map((coins, i) => {
    const n = i + 1;
    const t = localizedTitleInfo(n, OSL_XP.titleForLevel(n));
    const isMilestone = n % 5 === 0;
    const isDone = n < lv, isNow = n === lv;
    return `<div class="coinModal__row${isDone ? " coinModal__row--done" : ""}${isNow ? " coinModal__row--now" : ""}${isMilestone ? " coinModal__row--milestone" : ""}" data-coinrow="${n}">
      <span class="coinModal__rowLv">${n}</span>
      <span class="coinModal__rowIcon">${t.icon}</span>
      <span class="coinModal__rowTitle">${escapeHtml(t.title)}</span>
      <span class="coinModal__rowCoins">${isMilestone ? "⭐ " : ""}+${coins} 🪙</span>
    </div>`;
  }).join("");

  // Buy tab: 3 pacotes com checkout real via MP
  const packages = [
    { id:"coins_150",  label:"Pacote Explorador", coins:150,  price:"R$ 4,90",  badge:""        },
    { id:"coins_500",  label:"Pacote Aliado",     coins:500,  price:"R$ 12,90", badge:"POPULAR" },
    { id:"coins_1500", label:"Pacote Mestre",     coins:1500, price:"R$ 29,90", badge:"MELHOR"  },
  ];
  const savedNome  = (()=>{ try { return localStorage.getItem("osl_checkout_nome") || localStorage.getItem("osl_nome") || ""; } catch(_){return "";} })();
  const savedEmail = (()=>{ try { return localStorage.getItem("osl_checkout_email") || ""; } catch(_){return "";} })();
  const buyRows = packages.map(p => `
    <div class="coinModal__pkg${p.badge ? " coinModal__pkg--highlight" : ""}" data-pkg="${p.id}">
      ${p.badge ? `<span class="coinModal__pkgBadge">${p.badge}</span>` : ""}
      <span class="coinModal__pkgCoins">🪙 ${p.coins.toLocaleString("pt-BR")}</span>
      <span class="coinModal__pkgLabel">${p.label}</span>
      <button class="coinModal__pkgBtn" data-pkg="${p.id}">${p.price}</button>
    </div>`).join("");

  const overlay = document.createElement("div");
  overlay.className = "coinModalOverlay";
  overlay.innerHTML = `
    <div class="coinModal">
      <div class="coinModal__header">
        <span class="coinModal__headerTitle">🪙 Moedas</span>
        <button class="coinModal__close" id="coinModalClose">✕</button>
      </div>
      <div class="coinModal__hero">
        <div class="coinModal__heroBalance">${balance.toLocaleString("pt-BR")}</div>
        <div class="coinModal__heroSub">moedas disponíveis</div>
      </div>
      <div class="coinModal__tabs">
        <button class="coinModal__tab coinModal__tab--active" id="coinTabEarn">Como ganhar</button>
        <button class="coinModal__tab" id="coinTabBuy">Comprar</button>
      </div>
      <div class="coinModal__body">
        <div class="coinModal__pane" id="coinPaneEarn">
          <p class="coinModal__hint">Suba de nível jogando para ganhar moedas automaticamente.</p>
          <div class="coinModal__list" id="coinModalCurrRow">${earnRows}</div>
        </div>
        <div class="coinModal__pane coinModal__pane--hidden" id="coinPaneBuy">
          <div class="coinModal__buyForm">
            <div class="coinModal__fieldRow">
              <div class="coinModal__field">
                <label class="coinModal__fieldLabel">Nome</label>
                <input class="coinModal__fieldInput" id="coinBuyNome" type="text" placeholder="Seu nome" value="${escapeHtml(savedNome)}" autocomplete="name" />
              </div>
              <div class="coinModal__field">
                <label class="coinModal__fieldLabel">E-mail</label>
                <input class="coinModal__fieldInput" id="coinBuyEmail" type="email" placeholder="seu@email.com" value="${escapeHtml(savedEmail)}" autocomplete="email" />
              </div>
            </div>
            <p class="coinModal__buyStatus" id="coinBuyStatus"></p>
          </div>
          <div class="coinModal__pkgList">${buyRows}</div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Compra real via MP
  const OSL_BASE = "https://osl-video-server-production.up.railway.app";
  overlay.querySelectorAll(".coinModal__pkgBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nome  = overlay.querySelector("#coinBuyNome").value.trim();
      const email = overlay.querySelector("#coinBuyEmail").value.trim().toLowerCase();
      const statusEl = overlay.querySelector("#coinBuyStatus");
      if (!nome)  { statusEl.textContent = "Digite seu nome."; statusEl.style.color = "#f88"; return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { statusEl.textContent = "E-mail inválido."; statusEl.style.color = "#f88"; return; }
      const produto = btn.dataset.pkg;
      btn.disabled = true;
      statusEl.style.color = "rgba(255,255,255,.4)";
      statusEl.textContent = "Criando pagamento…";
      try {
        const res  = await fetch(`${OSL_BASE}/criar-pagamento`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ nome, email, produto }) });
        const data = await res.json();
        if (data?.url) {
          try { localStorage.setItem("osl_checkout_nome", nome); localStorage.setItem("osl_checkout_email", email); } catch(_){}
          window.open(data.url, "_blank");
          statusEl.style.color = "rgba(120,220,120,.8)";
          statusEl.textContent = "Pagamento aberto em nova aba. Retorne após confirmar.";
          btn.textContent = "✓ Aguardando…";
        } else {
          statusEl.style.color = "#f88";
          statusEl.textContent = data?.message || "Erro ao criar pagamento.";
          btn.disabled = false;
        }
      } catch(_) {
        statusEl.style.color = "#f88";
        statusEl.textContent = "Erro de conexão. Tente novamente.";
        btn.disabled = false;
      }
    });
  });

  // Tab switching
  const tabEarn = overlay.querySelector("#coinTabEarn");
  const tabBuy  = overlay.querySelector("#coinTabBuy");
  const paneEarn = overlay.querySelector("#coinPaneEarn");
  const paneBuy  = overlay.querySelector("#coinPaneBuy");
  tabEarn.addEventListener("click", () => {
    tabEarn.classList.add("coinModal__tab--active"); tabBuy.classList.remove("coinModal__tab--active");
    paneEarn.classList.remove("coinModal__pane--hidden"); paneBuy.classList.add("coinModal__pane--hidden");
  });
  tabBuy.addEventListener("click", () => {
    tabBuy.classList.add("coinModal__tab--active"); tabEarn.classList.remove("coinModal__tab--active");
    paneBuy.classList.remove("coinModal__pane--hidden"); paneEarn.classList.add("coinModal__pane--hidden");
  });

  const close = () => { overlay.classList.add("closing"); setTimeout(() => overlay.remove(), 300); };
  overlay.querySelector("#coinModalClose").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  // Scroll até o nível atual na lista
  requestAnimationFrame(() => {
    overlay.querySelector(`[data-coinrow="${lv}"]`)?.scrollIntoView({ block:"center", behavior:"smooth" });
  });
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
  // 4:5 ratio — padrão feed Instagram; Reels/Stories letterboxam sem cortar
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const cx = W / 2;

  // Carrega logo antes de desenhar
  const logoImg = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/logo_oficial_fundo_transparente.png";
  });

  // ── Fundo ─────────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#05040E"); bgGrad.addColorStop(0.5, "#0E0B1F"); bgGrad.addColorStop(1, "#05040E");
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  // ── Borda do card ─────────────────────────────────────────────────────────
  const pad = 48, cardX = pad, cardY = 78, cardW = W - pad * 2, cardH = H - 78 * 2;
  ctx.strokeStyle = "rgba(191,155,84,0.40)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 36); ctx.stroke();
  ctx.strokeStyle = "rgba(191,155,84,0.08)"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(cardX + 3, cardY + 3, cardW - 6, cardH - 6, 34); ctx.stroke();

  // Linha gradiente reutilizável
  const lineGrad = ctx.createLinearGradient(cardX + 60, 0, cardX + cardW - 60, 0);
  lineGrad.addColorStop(0, "transparent"); lineGrad.addColorStop(0.5, "rgba(191,155,84,0.5)"); lineGrad.addColorStop(1, "transparent");

  // ── Brand topo ────────────────────────────────────────────────────────────
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(191,155,84,0.80)";
  ctx.font = "700 26px system-ui,-apple-system,sans-serif";
  ctx.letterSpacing = "11px";
  ctx.fillText("O SEXTOLUGAR", cx, cardY + 80);
  ctx.letterSpacing = "0px";

  ctx.strokeStyle = lineGrad; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cardX + 60, cardY + 106); ctx.lineTo(cardX + cardW - 60, cardY + 106); ctx.stroke();

  // ── Eyebrow ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(191,155,84,0.85)";
  ctx.font = "600 21px system-ui,-apple-system,sans-serif";
  ctx.letterSpacing = "7px";
  ctx.fillText("FIM DO RITUAL", cx, cardY + 158);
  ctx.letterSpacing = "0px";

  // ── Título ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#EDE0C4";
  ctx.font = "italic 900 90px Georgia,'Times New Roman',serif";
  ctx.fillText("Ritual Concluído", cx, cardY + 270);

  // ── Ornamento ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(191,155,84,0.75)";
  ctx.font = "400 22px system-ui";
  ctx.fillText("◆  ◆  ◆", cx, cardY + 332);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const statsTop = cardY + 400;
  const hasEmoji = !!topEmoji;
  const statColW = hasEmoji ? cardW / 2 : cardW / 3;

  const drawStatBlock = (value, label, colX, colW, by) => {
    const accentGrad = ctx.createLinearGradient(colX + 60, 0, colX + colW - 60, 0);
    accentGrad.addColorStop(0, "transparent"); accentGrad.addColorStop(0.5, "rgba(191,155,84,0.6)"); accentGrad.addColorStop(1, "transparent");
    ctx.strokeStyle = accentGrad; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(colX + 60, by); ctx.lineTo(colX + colW - 60, by); ctx.stroke();

    ctx.fillStyle = "#EDE0C4";
    ctx.font = "900 76px system-ui,-apple-system,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(value), colX + colW / 2, by + 88);

    ctx.fillStyle = "rgba(191,155,84,0.80)";
    ctx.font = "600 19px system-ui,-apple-system,sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText(label.toUpperCase(), colX + colW / 2, by + 118);
    ctx.letterSpacing = "0px";
  };

  let statsBottomY;
  if (hasEmoji) {
    ctx.strokeStyle = "rgba(191,155,84,0.20)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, statsTop - 10); ctx.lineTo(cx, statsTop + 300); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cardX + 60, statsTop + 148); ctx.lineTo(cardX + cardW - 60, statsTop + 148); ctx.stroke();
    drawStatBlock(cards,       oslTr("sala:xpUI.recap.share.cards",    "Cartas"),    cardX,            statColW, statsTop);
    drawStatBlock(duration,    oslTr("sala:xpUI.recap.share.duration", "Duração"),   cardX + statColW, statColW, statsTop);
    drawStatBlock(topEmoji,    oslTr("sala:xpUI.recap.share.reaction", "Reação"),    cardX,            statColW, statsTop + 158);
    drawStatBlock(playerCount, oslTr("sala:xpUI.recap.share.players",  "Jogadores"), cardX + statColW, statColW, statsTop + 158);
    statsBottomY = statsTop + 158 + 130;
  } else {
    ctx.strokeStyle = "rgba(191,155,84,0.20)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cardX + statColW,     statsTop - 10); ctx.lineTo(cardX + statColW,     statsTop + 135); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cardX + statColW * 2, statsTop - 10); ctx.lineTo(cardX + statColW * 2, statsTop + 135); ctx.stroke();
    drawStatBlock(cards,       oslTr("sala:xpUI.recap.share.cards",    "Cartas"),    cardX,                statColW, statsTop);
    drawStatBlock(duration,    oslTr("sala:xpUI.recap.share.duration", "Duração"),   cardX + statColW,     statColW, statsTop);
    drawStatBlock(playerCount, oslTr("sala:xpUI.recap.share.players",  "Jogadores"), cardX + statColW * 2, statColW, statsTop);
    statsBottomY = statsTop + 130;
  }

  // ── Frase de encerramento ─────────────────────────────────────────────────
  const phraseY = statsBottomY + 66;
  ctx.fillStyle = "rgba(191,155,84,0.60)";
  ctx.font = "italic 30px Georgia,'Times New Roman',serif";
  ctx.fillText("Cada sessão deixa uma marca.", cx, phraseY);

  ctx.strokeStyle = lineGrad; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cardX + 60, phraseY + 44); ctx.lineTo(cardX + cardW - 60, phraseY + 44); ctx.stroke();

  // ── Logo ──────────────────────────────────────────────────────────────────
  const watermarkY = cardY + cardH - 54;
  const logoAreaTop = phraseY + 56;
  const logoAreaBot = watermarkY - 50;
  const logoAreaH = logoAreaBot - logoAreaTop;
  if (logoImg && logoAreaH > 80) {
    // A imagem PNG tem espaço transparente abaixo do círculo.
    // Usa apenas a porção quadrada do topo onde o círculo realmente está
    // (o círculo ocupa a largura total e ~72% da altura da imagem).
    const srcW = logoImg.naturalWidth;
    const srcH = logoImg.naturalWidth; // corta o espaço vazio embaixo
    const drawSize = Math.min(logoAreaH, 240);
    const drawX = cx - drawSize / 2;
    const drawY = logoAreaTop + (logoAreaH - drawSize) / 2;
    ctx.globalAlpha = 0.90;
    ctx.drawImage(logoImg, 0, 0, srcW, srcH, drawX, drawY, drawSize, drawSize);
    ctx.globalAlpha = 1;
  }

  // ── URL / watermark ───────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(191,155,84,0.65)";
  ctx.font = "500 26px system-ui,-apple-system,sans-serif";
  ctx.letterSpacing = "3px";
  ctx.fillText("preludiojogos.com", cx, watermarkY);
  ctx.letterSpacing = "0px";

  // ── Exportar ──────────────────────────────────────────────────────────────
  canvas.toBlob(async (blob) => {
    const file = new File([blob], "osl-recap.png", { type: "image/png" });
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: oslTr("sala:xpUI.recap.shareTitle", "SEXTOLUGAR — Ritual Concluído") }); return; } catch (_) {}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "osl-recap.png"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}
