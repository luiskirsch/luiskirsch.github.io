// Perfil, avatar, temas, estilos de carta, efeitos visuais, amizades
import { S } from "../state.js";
import { setDoc, updateDoc, getDoc, getDocs, deleteDoc, doc, query, where, limit, collection, serverTimestamp, onAuthStateChanged } from "../firebase.js";
import { escapeHtml, initials, normalizeUsername, uniqueArray } from "../utils.js";
import { BG_THEMES, BG_PACK_THEMES, CARD_STYLES, FX_STYLES, PRESTIGE_PRODUTOS } from "../constants.js";

const BACKEND_BASE_URL_OSL = "https://osl-video-server-production.up.railway.app";

// ── Prestige ──────────────────────────────────────────────────────────────────
export function applyPrestigeUnlocks() {
  S._isPrestige = true;
  window._isPrestige = true;
  let compras = [];
  try { compras = JSON.parse(localStorage.getItem("osl_compras") || "[]"); } catch (_) {}
  const existingProds = new Set(compras.map(c => c.produto));
  PRESTIGE_PRODUTOS.forEach(prod => {
    if (!existingProds.has(prod)) compras.push({ ref:"prestige_lv50", produto:prod, titulo:"Prestígio Nv.50", tipo:"prestige", valor:0, ts:Date.now() });
  });
  localStorage.setItem("osl_compras", JSON.stringify(compras));
  refreshPackSwatches();
  refreshCardStyleSwatches();
  refreshFxSwatches();
}

// Ouve o evento disparado por effects.js quando level 50 é atingido
document.addEventListener("osl:applyPrestige", applyPrestigeUnlocks);

// ── Compras da conta ──────────────────────────────────────────────────────────
export async function syncAccountPurchases() {
  try {
    const user = await new Promise(resolve => {
      const unsub = onAuthStateChanged(S.auth, u => { unsub(); resolve(u); });
    });
    if (!user) return;
    const idToken = await user.getIdToken();
    const res     = await fetch(BACKEND_BASE_URL_OSL + "/minhas-compras", { headers:{"Authorization":"Bearer " + idToken} });
    if (!res.ok) return;
    const data        = await res.json();
    const serverCompras = Array.isArray(data.compras) ? data.compras : [];
    if (!serverCompras.length) return;
    let localCompras = [];
    try { localCompras = JSON.parse(localStorage.getItem("osl_compras") || "[]"); } catch (_) {}
    const localRefs = new Set(localCompras.map(c => c.ref));
    serverCompras.forEach(c => { if (!localRefs.has(c.ref)) localCompras.push(c); });
    localStorage.setItem("osl_compras", JSON.stringify(localCompras));
    refreshPackSwatches();
  } catch (_) {}
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function applyAvatarDisplay(el, photoUrl, emoji, color) {
  if (!el) return;
  if (photoUrl) {
    el.style.background = "none"; el.style.backgroundImage = `url('${photoUrl}')`; el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center"; el.style.fontSize = "0";
    el.classList.add("has-photo"); el.textContent = "";
  } else {
    el.style.backgroundImage = ""; el.style.backgroundSize = ""; el.style.backgroundPosition = ""; el.style.fontSize = "";
    el.classList.remove("has-photo"); el.textContent = emoji || "🔮";
    if (color) el.style.background = color;
  }
}

export function updateDesktopProfileBtn(photoUrl, emoji) {
  const btn   = document.getElementById("myProfileBtn");
  if (!btn) return;
  const badge = btn.querySelector(".badge") || btn.querySelector("#desktopProfileBadge");
  // O label "Perfil" vem do i18n (sala:topbar.actions.profile = "👤 Perfil"/"👤 Profile");
  // tira o emoji 👤 do início pra usar emoji/foto do usuário.
  const fullLabel = oslTr("sala:topbar.actions.profile", "👤 Perfil");
  const labelText = fullLabel.replace(/^[^\s]+\s*/, "");
  if (photoUrl) {
    btn.innerHTML = ""; const img = document.createElement("img"); img.src = photoUrl; img.style.cssText = "width:28px;height:28px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0";
    btn.appendChild(img); btn.appendChild(document.createTextNode(labelText)); if (badge) btn.appendChild(badge);
  } else { btn.textContent = (emoji || "👤") + " " + labelText; if (badge) btn.appendChild(badge); }
}

export function setAvatarSelection(emoji) {
  S.selectedAvatarEmoji = emoji || "🔮";
  const avatarPicker = document.getElementById("avatarPicker");
  if (avatarPicker) avatarPicker.querySelectorAll(".avatarOption").forEach(btn => btn.classList.toggle("active", btn.dataset.avatar === S.selectedAvatarEmoji));
  if (S.selectedAvatarPhoto) {
    S.selectedAvatarPhoto = null;
    const photoBtn = document.getElementById("avatarPhotoBtn");
    if (photoBtn) { photoBtn.classList.remove("active"); photoBtn.textContent = "📷 Usar minha foto"; }
  }
  applyAvatarDisplay(document.getElementById("profileAvatarLarge"), null, S.selectedAvatarEmoji, S.selectedAvatarColor);
}

export function setColorSelection(color) {
  S.selectedAvatarColor = color || "#342718";
  document.getElementById("colorSwatchRow")?.querySelectorAll(".colorSwatch").forEach(sw => sw.classList.toggle("colorSwatch--active", sw.dataset.color === S.selectedAvatarColor));
}

export function compressAvatarImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const SIZE = 120; const canvas = document.createElement("canvas"); canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext("2d"); const s = Math.min(img.width, img.height); const ox = (img.width-s)/2; const oy = (img.height-s)/2;
      ctx.drawImage(img, ox, oy, s, s, 0, 0, SIZE, SIZE); URL.revokeObjectURL(url); resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = reject; img.src = url;
  });
}

export function setAvatarPhoto(dataUrl) {
  S.selectedAvatarPhoto = dataUrl;
  const photoBtn = document.getElementById("avatarPhotoBtn");
  if (photoBtn) { photoBtn.classList.toggle("active", !!dataUrl); photoBtn.textContent = dataUrl ? "✓ Foto selecionada — clique para trocar" : "📷 Usar minha foto"; }
  if (dataUrl) { const avatarPicker = document.getElementById("avatarPicker"); if (avatarPicker) avatarPicker.querySelectorAll(".avatarOption").forEach(b => b.classList.remove("active")); }
  applyAvatarDisplay(document.getElementById("profileAvatarLarge"), dataUrl, S.selectedAvatarEmoji, S.selectedAvatarColor);
}

// ── Temas de fundo ────────────────────────────────────────────────────────────
export function isThemeUnlocked(theme) {
  const requiredPack = BG_PACK_THEMES[theme];
  if (!requiredPack) return true;
  if (S._isPrestige || window._isPrestige) return true;
  const compras = JSON.parse(localStorage.getItem("osl_compras") || "[]");
  return compras.some(c => c.produto === requiredPack);
}

export function applyBgTheme(theme) {
  const t = BG_THEMES.includes(theme) ? theme : "default";
  BG_THEMES.forEach(k => document.documentElement.classList.remove("bg-" + k));
  if (t !== "default") document.documentElement.classList.add("bg-" + t);
  else { const s = document.documentElement.style; s.removeProperty("--bg-1"); s.removeProperty("--bg-2"); s.removeProperty("--bg-3"); }
}

export function setBgSelection(theme) {
  if (BG_PACK_THEMES[theme] && !isThemeUnlocked(theme)) return;
  S.selectedBgTheme = BG_THEMES.includes(theme) ? theme : "default";
  document.getElementById("bgSwatchRow")?.querySelectorAll(".bgSwatch").forEach(sw => sw.classList.toggle("bgSwatch--active", sw.dataset.bg === S.selectedBgTheme));
  applyBgTheme(S.selectedBgTheme);
}

export function refreshPackSwatches() {
  document.getElementById("bgSwatchRow")?.querySelectorAll(".bgSwatch--pack").forEach(sw => {
    const unlocked = isThemeUnlocked(sw.dataset.bg);
    sw.classList.toggle("bgSwatch--locked", !unlocked);
    const lock = sw.querySelector(".lockIcon"); if (lock) lock.style.display = unlocked ? "none" : "";
  });
}

// ── Estilos de carta ──────────────────────────────────────────────────────────
export function isCardStyleUnlocked(style) {
  if (style === "padrao") return true;
  if (S._isPrestige || window._isPrestige) return true;
  return JSON.parse(localStorage.getItem("osl_compras") || "[]").some(c => c.produto === "estilo-carta");
}

export function applyCardStyle(style) {
  const s = CARD_STYLES.includes(style) ? style : "padrao";
  CARD_STYLES.forEach(k => document.documentElement.classList.remove("card-" + k));
  if (s !== "padrao") document.documentElement.classList.add("card-" + s);
}

export function setCardStyleSelection(style) {
  if (style !== "padrao" && !isCardStyleUnlocked(style)) return;
  S.selectedCardStyle = CARD_STYLES.includes(style) ? style : "padrao";
  document.getElementById("cardStyleRow")?.querySelectorAll(".cardStyleSwatch").forEach(sw => sw.classList.toggle("bgSwatch--active", sw.dataset.style === S.selectedCardStyle));
  applyCardStyle(S.selectedCardStyle);
}

export function refreshCardStyleSwatches() {
  const unlocked = isCardStyleUnlocked("dourado");
  document.getElementById("cardStyleRow")?.querySelectorAll(".cardStyleSwatch--paid").forEach(sw => {
    sw.classList.toggle("bgSwatch--locked", !unlocked);
    const lock = sw.querySelector(".lockIcon"); if (lock) lock.style.display = unlocked ? "none" : "";
  });
}

// ── Efeitos visuais ───────────────────────────────────────────────────────────
export function isFxUnlocked() {
  if (S._isPrestige || window._isPrestige) return true;
  return JSON.parse(localStorage.getItem("osl_compras") || "[]").some(c => c.produto === "efeitos-visuais");
}

export function applyVisualEffect(fx) {
  const f = FX_STYLES.includes(fx) ? fx : "none";
  FX_STYLES.forEach(k => document.documentElement.classList.remove("effect-" + k));
  if (f !== "none") document.documentElement.classList.add("effect-" + f);
}

export function setFxSelection(fx) {
  if (fx !== "none" && !isFxUnlocked()) return;
  S.selectedFx = FX_STYLES.includes(fx) ? fx : "none";
  document.getElementById("fxStyleRow")?.querySelectorAll(".fxSwatch").forEach(sw => sw.classList.toggle("bgSwatch--active", sw.dataset.fx === S.selectedFx));
  applyVisualEffect(S.selectedFx);
}

export function refreshFxSwatches() {
  const unlocked = isFxUnlocked();
  document.getElementById("fxStyleRow")?.querySelectorAll(".fxSwatch--paid").forEach(sw => {
    sw.classList.toggle("bgSwatch--locked", !unlocked);
    const lock = sw.querySelector(".lockIcon"); if (lock) lock.style.display = unlocked ? "none" : "";
  });
}

// ── Perfil modal ──────────────────────────────────────────────────────────────
function maskEmail(email) { if (!email) return "—"; const [local, domain] = email.split("@"); if (!domain) return email; return local.slice(0,1) + "***@" + domain; }
function maskLicense(code) { if (!code) return "—"; const parts = code.split("-"); return parts.map((p, i) => (i > 0 && i < parts.length-1) ? "****" : p).join("-"); }
function formatMemberSince(ts) { if (!ts) return "—"; const date = ts.toDate ? ts.toDate() : new Date(ts); return date.toLocaleDateString("pt-BR", { month:"short", year:"numeric" }); }

function fillContaTab() {
  const email = localStorage.getItem("osl_license_email") || "";
  const lic   = localStorage.getItem("osl_license_code") || "";
  const expires = sessionStorage.getItem("osl_access_expires_at");
  const uid   = localStorage.getItem("osl_auth_uid") || S.userId || "";
  const emailEl = document.getElementById("contaEmail");   if (emailEl) emailEl.textContent = maskEmail(email);
  const licEl   = document.getElementById("contaLicenca"); if (licEl) licEl.textContent = maskLicense(lic);
  const uidEl   = document.getElementById("contaUid");     if (uidEl) uidEl.textContent = uid ? uid.slice(0,12) + "…" : "—";
  const acessoEl = document.getElementById("contaAcesso");
  if (acessoEl) {
    if (!expires) { acessoEl.innerHTML = `<span class="profBadge profBadge--red">${oslTr("sala:profile.accessNotAuthenticated", "Não autenticado")}</span>`; }
    else {
      const expDate = new Date(Number(expires));
      const expired = Date.now() > Number(expires);
      const localeTag = (window.OSL_I18N && window.OSL_I18N.locale && window.OSL_I18N.locale()) || "pt-BR";
      const label = expDate.toLocaleDateString(localeTag, { day:"2-digit", month:"short", year:"numeric" });
      acessoEl.innerHTML = expired
        ? `<span class="profBadge profBadge--red">${oslTr("sala:profile.accessExpiredOn", "Expirado em {{date}}", { date: label })}</span>`
        : `<span class="profBadge profBadge--green">${oslTr("sala:profile.accessActiveUntil", "Ativo até {{date}}", { date: label })}</span>`;
    }
  }
}

function fillSessaoTab() {
  const salaCode = localStorage.getItem("osl_sala") || S.roomCode || "—";
  const salaNome = localStorage.getItem("osl_nome_sala") || "—";
  const papel    = S.isHost ? oslTr("sala:players.host", "Anfitrião") : oslTr("sala:players.fallbackName", "Jogador");
  const videoConn = (typeof window.lkRoom !== "undefined" && window.lkRoom?.state === "connected") ? oslTr("sala:profile.videoConnected", "Conectado") : oslTr("sala:profile.videoDisconnected", "Desconectado");
  const salaEl = document.getElementById("sessSala");   if (salaEl) salaEl.textContent = salaCode;
  const nomeEl = document.getElementById("sessNomeSala"); if (nomeEl) nomeEl.textContent = salaNome;
  const papelEl = document.getElementById("sessPapel"); if (papelEl) papelEl.textContent = papel;
  const videoEl = document.getElementById("sessVideo");  if (videoEl) videoEl.textContent = videoConn;
}

function fillPacksTab() {
  const grid = document.getElementById("profPackGrid"); if (!grid) return;
  const compras = JSON.parse(localStorage.getItem("osl_compras") || "[]");
  // name/desc/themeName são localizados via sala:profile.packs.items.{id}; price/themeColor mantidos.
  const packs = [
    { id:"pacote-conexao",  price:"R$ 9,90",  themeColor:"#0e0a02" },
    { id:"pacote-verdades", price:"R$ 12,90", themeColor:"#05070e" },
    { id:"pacote-conflito", price:"R$ 14,90", themeColor:"#120600" },
    { id:"pacote-segredos", price:"R$ 19,90", themeColor:"#07000e" },
    { id:"pacote-casais",   price:"R$ 19,90", themeColor:"#0e0007" }
  ];
  grid.innerHTML = "";
  const basicCard = document.createElement("div"); basicCard.className = "profPackCard profPackCard--unlocked";
  basicCard.innerHTML = `<div class="profPackName">${oslTr("sala:profile.packs.basicName", "Deck Básico")}</div><div class="profPackDesc">${oslTr("sala:profile.packs.basicDesc", "8 cartas · sempre incluído")}</div><span class="profPackBadge profPackBadge--ok">${oslTr("sala:profile.packs.included", "✓ Incluído")}</span>`;
  grid.appendChild(basicCard);
  const themeLabel = oslTr("sala:profile.packs.themeLabel", "Tema");
  const unlockedLabel = oslTr("sala:profile.packs.unlocked", "✓ Desbloqueado");
  const shopBtnLabel = oslTr("sala:profile.packs.shopBtn", "Ver na loja");
  packs.forEach(pack => {
    const unlocked = compras.some(c => c.produto === pack.id);
    const name = oslTr(`sala:profile.packs.items.${pack.id}.name`, pack.id);
    const desc = oslTr(`sala:profile.packs.items.${pack.id}.desc`, "");
    const themeName = oslTr(`sala:profile.packs.items.${pack.id}.themeName`, "");
    const card = document.createElement("div"); card.className = `profPackCard ${unlocked ? "profPackCard--unlocked" : "profPackCard--locked"}`;
    card.innerHTML = `<div class="profPackName">${name}</div><div class="profPackDesc">${desc}</div><div class="profPackDesc" style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${pack.themeColor};border:1px solid rgba(255,255,255,.15);flex-shrink:0"></span><span style="color:rgba(243,237,229,.5);font-size:.7rem">${themeLabel} <strong style="color:rgba(215,176,107,.75)">${themeName}</strong></span></div>${unlocked ? `<span class="profPackBadge profPackBadge--ok">${unlockedLabel}</span>` : `<span class="profPackBadge profPackBadge--locked">🔒 ${pack.price}</span><a class="profileActionBtn" href="./vendas.html" style="margin-top:6px;font-size:.75rem;padding:4px 10px">${shopBtnLabel}</a>`}`;
    grid.appendChild(card);
  });
}

async function fillProfileUI(user, isSelfView) {
  const profileAvatarLarge = document.getElementById("profileAvatarLarge");
  applyAvatarDisplay(profileAvatarLarge, user.avatarPhotoUrl, user.avatarEmoji || initials(user.displayName || oslTr("sala:players.fallbackName", "Jogador")), user.avatarColor);
  if (isSelfView && user.bgTheme) { S.selectedBgTheme = user.bgTheme; localStorage.setItem("osl_bg", user.bgTheme); applyBgTheme(user.bgTheme); }
  if (isSelfView) { const fab = document.getElementById("mobileProfileBtn"); if (fab) applyAvatarDisplay(fab, user.avatarPhotoUrl, user.avatarEmoji, user.avatarColor); }
  document.getElementById("profileName").textContent     = user.displayName || oslTr("sala:players.fallbackName", "Jogador");
  document.getElementById("profileUsername").textContent = `@${user.username || "jogador"}`;
  // Auto-traduz bio default em PT que ficou persistida no Firestore antes do i18n
  const _bio = (user.bio === "Novo participante do ritual.")
    ? oslTr("sala:newProfile.bio", "Novo participante do ritual.")
    : (user.bio || oslTr("sala:profile.bioEmpty", "Sem descrição."));
  document.getElementById("profileBio").textContent      = _bio;
  const gEl = document.getElementById("profileGames"); if (gEl) gEl.textContent = user.stats?.gamesPlayed || 0;
  const wEl = document.getElementById("profileWins");  if (wEl) wEl.textContent = user.stats?.wins || 0;
  const sEl = document.getElementById("profileSince"); if (sEl) sEl.textContent = formatMemberSince(user.memberSince);
  document.getElementById("editProfileBtn").hidden = !isSelfView;
  document.getElementById("addFriendBtn").hidden   = isSelfView;
  const profBgSection = document.getElementById("profBgSection");
  if (profBgSection) { profBgSection.classList.toggle("hidden", !isSelfView); if (isSelfView) { refreshPackSwatches(); setBgSelection(user.bgTheme || S.selectedBgTheme); } }
  const profCardSection = document.getElementById("profCardSection");
  if (profCardSection) { profCardSection.classList.toggle("hidden", !isSelfView); if (isSelfView) { if (user.cardStyle) { S.selectedCardStyle = user.cardStyle; localStorage.setItem("osl_card_style", user.cardStyle); applyCardStyle(user.cardStyle); } refreshCardStyleSwatches(); setCardStyleSelection(S.selectedCardStyle); } }
  const profFxSection = document.getElementById("profFxSection");
  if (profFxSection) { profFxSection.classList.toggle("hidden", !isSelfView); if (isSelfView) { if (user.visualEffect) { S.selectedFx = user.visualEffect; localStorage.setItem("osl_fx", user.visualEffect); applyVisualEffect(user.visualEffect); } refreshFxSwatches(); setFxSelection(S.selectedFx); } }
  document.querySelectorAll(".profTab--selfOnly, .profPane--selfOnly").forEach(el => { el.style.display = isSelfView ? "" : "none"; });
  if (!isSelfView) {
    const alreadyFriend = (user.friends || []).includes(S.userId);
    const addFriendBtn  = document.getElementById("addFriendBtn");
    if (addFriendBtn) { addFriendBtn.textContent = alreadyFriend ? "Já são amigos" : "Adicionar amigo"; addFriendBtn.disabled = alreadyFriend; }
  } else {
    document.getElementById("addFriendBtn").disabled = false;
    fillSessaoTab(); fillContaTab();
  }
  fillPacksTab();
  const profileEditor   = document.getElementById("profileEditor");
  const profileActions  = document.getElementById("profileActions");
  if (profileEditor) profileEditor.classList.add("hidden");
  if (profileActions) profileActions.classList.remove("hidden");
}

export async function openProfile(player) {
  try {
    const targetUserId = player?.userId || S.userId;
    S.openedProfileUserId = targetUserId;
    const ref  = doc(S.db, "users", targetUserId);
    const snap = await getDoc(ref);
    const isSelfView = targetUserId === S.userId;
    if (isSelfView) {
      const mb = document.getElementById("mobileProfileBadge"); const db2 = document.getElementById("desktopProfileBadge");
      if (mb)  mb.classList.remove("visible");
      if (db2) db2.classList.remove("visible");
    }
    if (!snap.exists()) {
      const profileAvatarLarge = document.getElementById("profileAvatarLarge");
      if (profileAvatarLarge) profileAvatarLarge.textContent = initials(player?.name || S.playerName);
      document.getElementById("profileName").textContent     = player?.name || S.playerName;
      document.getElementById("profileUsername").textContent = "@jogador";
      document.getElementById("profileBio").textContent      = oslTr("sala:newProfile.notFound", "Perfil não encontrado.");
      document.getElementById("editProfileBtn").hidden = true; document.getElementById("addFriendBtn").hidden = true;
      document.getElementById("friendsPanel")?.classList.add("hidden");
      document.getElementById("profileModal").classList.remove("hidden"); return;
    }
    const user = snap.data();
    S.openedProfileData = user;
    await fillProfileUI(user, isSelfView);
    resetProfileTabs();
    document.getElementById("profileModal").classList.remove("hidden");
  } catch (error) {
    console.error("openProfile error:", error);
    try {
      const name = player?.name || S.playerName || "Jogador";
      document.getElementById("profileAvatarLarge").textContent = initials(name);
      document.getElementById("profileName").textContent     = name;
      document.getElementById("profileUsername").textContent = "@jogador";
      document.getElementById("profileBio").textContent      = oslTr("sala:newProfile.loadError", "Erro ao carregar perfil: ") + (error?.code || error?.message || String(error));
      document.getElementById("editProfileBtn").hidden = true; document.getElementById("addFriendBtn").hidden = true;
      document.getElementById("friendsPanel")?.classList.add("hidden");
      document.getElementById("profileModal").classList.remove("hidden");
    } catch (_) {}
  }
}

function resetProfileTabs() {
  document.querySelectorAll(".profTab").forEach(t => t.classList.remove("profTab--active"));
  document.querySelectorAll(".profPane").forEach(p => p.classList.remove("profPane--active"));
  document.querySelector(".profTab")?.classList.add("profTab--active");
  document.getElementById("profPaneIdentity")?.classList.add("profPane--active");
}

export function closeProfile() {
  document.getElementById("profileModal").classList.add("hidden");
  S.openedProfileUserId = null; S.openedProfileData = null;
  document.getElementById("friendsPanel")?.classList.add("hidden");
  resetProfileTabs();
}

// ── Bindings do perfil (inicializados por init.js) ────────────────────────────
export function bindProfileEvents() {
  const profileModal     = document.getElementById("profileModal");
  const closeProfileBtn  = document.getElementById("closeProfileBtn");
  const closeProfileXBtn = document.getElementById("closeProfileXBtn");
  const editProfileBtn   = document.getElementById("editProfileBtn");
  const cancelEditProfileBtn = document.getElementById("cancelEditProfileBtn");
  const addFriendBtn     = document.getElementById("addFriendBtn");
  const myProfileBtn     = document.getElementById("myProfileBtn");
  const profileEditor    = document.getElementById("profileEditor");
  const avatarPicker     = document.getElementById("avatarPicker");

  closeProfileBtn?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); closeProfile(); });
  closeProfileXBtn?.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); closeProfile(); });
  profileModal?.addEventListener("click", e => { if (e.target === profileModal) closeProfile(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !profileModal?.classList.contains("hidden")) closeProfile(); });
  myProfileBtn?.addEventListener("click", () => openProfile({ userId: S.userId, name: S.playerName, isHost: S.isHost }));
  editProfileBtn?.addEventListener("click", () => {
    if (!S.openedProfileData) return;
    const profileEditor = document.getElementById("profileEditor");
    const profileActions = document.getElementById("profileActions");
    const editDisplayName = document.getElementById("editDisplayName");
    const editUsername    = document.getElementById("editUsername");
    const editBio         = document.getElementById("editBio");
    if (profileEditor) profileEditor.classList.remove("hidden");
    if (profileActions) profileActions.classList.add("hidden");
    if (editDisplayName) editDisplayName.value = S.openedProfileData.displayName || "";
    if (editUsername)    editUsername.value    = S.openedProfileData.username || "";
    if (editBio)         editBio.value         = S.openedProfileData.bio || "";
    S.selectedAvatarPhoto = S.openedProfileData.avatarPhotoUrl || null;
    const photoBtn = document.getElementById("avatarPhotoBtn");
    if (photoBtn) { photoBtn.classList.toggle("active", !!S.selectedAvatarPhoto); photoBtn.textContent = S.selectedAvatarPhoto ? "✓ Foto selecionada — clique para trocar" : "📷 Usar minha foto"; }
    if (!S.selectedAvatarPhoto) setAvatarSelection(S.openedProfileData.avatarEmoji || "🔮");
    else if (avatarPicker) avatarPicker.querySelectorAll(".avatarOption").forEach(b => b.classList.remove("active"));
    setColorSelection(S.openedProfileData.avatarColor || "#342718");
  });
  cancelEditProfileBtn?.addEventListener("click", () => {
    document.getElementById("profileEditor")?.classList.add("hidden");
    document.getElementById("profileActions")?.classList.remove("hidden");
  });

  profileEditor?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editDisplayName = document.getElementById("editDisplayName");
    const editUsername    = document.getElementById("editUsername");
    const editBio         = document.getElementById("editBio");
    const displayName     = editDisplayName.value.trim().slice(0,40) || "Jogador";
    const username        = normalizeUsername(editUsername.value) || "jogador";
    const bio             = editBio.value.trim().slice(0,180);
    const avatarUpdate    = S.selectedAvatarPhoto ? { avatarPhotoUrl: S.selectedAvatarPhoto, avatarEmoji: null } : { avatarEmoji: S.selectedAvatarEmoji, avatarPhotoUrl: null };
    try {
      await updateDoc(S.userRef, { displayName, username, bio, ...avatarUpdate, avatarColor: S.selectedAvatarColor, bgTheme: S.selectedBgTheme, cardStyle: S.selectedCardStyle, visualEffect: S.selectedFx, lastSeen: serverTimestamp() });
      localStorage.setItem("osl_bg", S.selectedBgTheme); localStorage.setItem("osl_card_style", S.selectedCardStyle); localStorage.setItem("osl_fx", S.selectedFx);
      applyBgTheme(S.selectedBgTheme); applyCardStyle(S.selectedCardStyle); applyVisualEffect(S.selectedFx);
      if (S.openedProfileUserId === S.userId) { S.playerName = displayName; localStorage.setItem("osl_nome", displayName); }
      const snap = await getDoc(S.userRef); S.openedProfileData = snap.data(); await fillProfileUI(S.openedProfileData, true);
      if (S.selectedAvatarPhoto) { localStorage.setItem("osl_avatar_photo", S.selectedAvatarPhoto); localStorage.removeItem("osl_avatar"); }
      else { localStorage.removeItem("osl_avatar_photo"); }
      updateDesktopProfileBtn(S.selectedAvatarPhoto, S.selectedAvatarEmoji);
      await setDoc(S.playerRef, { name: displayName, avatarEmoji: S.selectedAvatarPhoto ? null : (S.selectedAvatarEmoji || "🔮"), avatarPhotoUrl: S.selectedAvatarPhoto || null, avatarColor: S.selectedAvatarColor }, { merge: true });
    } catch (error) { console.error(error); alert("Não foi possível salvar o perfil."); }
  });

  avatarPicker?.addEventListener("click", e => {
    const btn = e.target.closest(".avatarOption"); if (!btn) return;
    if (btn.dataset.avatarImg) { setAvatarPhoto(btn.dataset.avatarImg); avatarPicker.querySelectorAll(".avatarOption--img").forEach(b => b.classList.toggle("active", b === btn)); }
    else { avatarPicker.querySelectorAll(".avatarOption--img").forEach(b => b.classList.remove("active")); setAvatarSelection(btn.dataset.avatar); }
  });

  const avatarPhotoBtn   = document.getElementById("avatarPhotoBtn");
  const avatarPhotoInput = document.getElementById("avatarPhotoInput");
  if (avatarPhotoBtn && avatarPhotoInput) {
    avatarPhotoBtn.addEventListener("click", () => avatarPhotoInput.click());
    avatarPhotoInput.addEventListener("change", async e => {
      const file = e.target.files[0]; if (!file) return;
      try { setAvatarPhoto(await compressAvatarImage(file)); } catch (_) {}
      avatarPhotoInput.value = "";
    });
  }

  document.getElementById("profTabs")?.addEventListener("click", e => {
    const tab = e.target.closest(".profTab"); if (!tab || !tab.dataset.target) return;
    document.querySelectorAll(".profTab").forEach(t => t.classList.remove("profTab--active"));
    document.querySelectorAll(".profPane").forEach(p => p.classList.remove("profPane--active"));
    tab.classList.add("profTab--active");
    document.getElementById(tab.dataset.target)?.classList.add("profPane--active");
  });

  document.getElementById("colorSwatchRow")?.addEventListener("click", e => {
    const sw = e.target.closest(".colorSwatch"); if (!sw) return;
    setColorSelection(sw.dataset.color);
  });

  let _bgHintTimer = null;
  document.getElementById("bgSwatchRow")?.addEventListener("click", async e => {
    const sw = e.target.closest(".bgSwatch"); if (!sw) return;
    const bg = sw.dataset.bg;
    if (BG_PACK_THEMES[bg] && !isThemeUnlocked(bg)) {
      const packId = BG_PACK_THEMES[bg];
      const packName = packId ? oslTr(`sala:profile.packs.items.${packId}.name`, packId) : oslTr("sala:profile.packs.exclusiveOfPackFallback", "um pacote");
      const hint = document.getElementById("bgPackHint");
      if (hint) { hint.textContent = oslTr("sala:profile.packs.exclusiveOfPack", "Exclusivo do Pacote {{name}}", { name: packName }); hint.style.opacity = "1"; clearTimeout(_bgHintTimer); _bgHintTimer = setTimeout(() => { hint.style.opacity = "0"; }, 2200); }
      return;
    }
    setBgSelection(bg); localStorage.setItem("osl_bg", bg);
    try { await updateDoc(doc(S.db, "users", S.userId), { bgTheme: bg, lastSeen: serverTimestamp() }); } catch (_) {}
  });

  let _cardHintTimer = null;
  document.getElementById("cardStyleRow")?.addEventListener("click", async e => {
    const sw = e.target.closest(".cardStyleSwatch"); if (!sw) return;
    const style = sw.dataset.style;
    if (style !== "padrao" && !isCardStyleUnlocked(style)) {
      const hint = document.getElementById("cardStyleHint");
      if (hint) { hint.textContent = oslTr("sala:profile.packs.exclusiveCardStyle", "Exclusivo do produto Estilo de Carta"); hint.style.opacity = "1"; clearTimeout(_cardHintTimer); _cardHintTimer = setTimeout(() => { hint.style.opacity = "0"; }, 2200); }
      return;
    }
    setCardStyleSelection(style); localStorage.setItem("osl_card_style", style);
    try { await updateDoc(doc(S.db, "users", S.userId), { cardStyle: style, lastSeen: serverTimestamp() }); } catch (_) {}
  });

  let _fxHintTimer = null;
  document.getElementById("fxStyleRow")?.addEventListener("click", async e => {
    const sw = e.target.closest(".fxSwatch"); if (!sw) return;
    const fx = sw.dataset.fx;
    if (fx !== "none" && !isFxUnlocked()) {
      const hint = document.getElementById("fxHint");
      if (hint) { hint.textContent = oslTr("sala:profile.packs.exclusiveFx", "Exclusivo do produto Efeitos Visuais"); hint.style.opacity = "1"; clearTimeout(_fxHintTimer); _fxHintTimer = setTimeout(() => { hint.style.opacity = "0"; }, 2200); }
      return;
    }
    setFxSelection(fx); localStorage.setItem("osl_fx", fx);
    try { await updateDoc(doc(S.db, "users", S.userId), { visualEffect: fx, lastSeen: serverTimestamp() }); } catch (_) {}
  });

  document.getElementById("copyRoomCodeBtn")?.addEventListener("click", () => {
    const code = localStorage.getItem("osl_sala") || S.roomCode || "";
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => { const btn = document.getElementById("copyRoomCodeBtn"); const orig = oslTr("sala:profile.session.copyCode", "Copiar código da sala"); btn.textContent = oslTr("sala:profile.packs.copied", "Copiado!"); setTimeout(() => btn.textContent = orig, 2000); });
  });

  document.getElementById("profCopyLicBtn")?.addEventListener("click", () => {
    const lic = localStorage.getItem("osl_license_code") || "";
    if (!lic) return;
    navigator.clipboard.writeText(lic).then(() => { const btn = document.getElementById("profCopyLicBtn"); btn.textContent = "✓"; setTimeout(() => btn.textContent = "⎘", 2000); });
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (!confirm("Sair da conta? Você será redirecionado para a entrada.")) return;
    localStorage.clear(); window.location.href = "./entrada.html";
  });

  // Ouve evento de abrir perfil (disparado por room.js)
  document.addEventListener("osl:openProfileModal", e => openProfile(e.detail).catch(console.error));
}
