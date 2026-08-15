// Perfil, avatar, temas, estilos de carta, efeitos visuais, amizades
import { S } from "../state.js";
import { setDoc, updateDoc, getDoc, getDocs, deleteDoc, doc, query, where, limit, collection, serverTimestamp, onAuthStateChanged, updateProfile, signOut } from "../firebase.js";
import { escapeHtml, initials, normalizeUsername, uniqueArray } from "../utils.js";
import { BG_THEMES, BG_PACK_THEMES, CARD_STYLES, FX_STYLES, COIN_COSMETICS, PRESTIGE_PRODUTOS, BACKEND_BASE_URL } from "../constants.js";
import { sendFriendRequest, respondFriendRequest, fetchFriendsLeaderboard, searchUsers, buyWithCoins, fetchCompatibility } from "../api.js";

const BACKEND_BASE_URL_OSL = BACKEND_BASE_URL; // alias mantido pra não trocar 1000 referências

Object.defineProperty(window, "_isPrestige", {
  get: () => S._isPrestige,
  set: () => {},
  enumerable: false,
  configurable: false
});

// Set populado pelo servidor — null enquanto não carregou, Set após resposta
let _verifiedProdutos = null;

function _hasCompra(produto) {
  return _verifiedProdutos !== null ? _verifiedProdutos.has(produto) : false;
}

export function getVerifiedProdutos() { return _verifiedProdutos; }

// ── Prestige ──────────────────────────────────────────────────────────────────
export function applyPrestigeUnlocks() {
  S._isPrestige = true;
  if (_verifiedProdutos !== null) {
    PRESTIGE_PRODUTOS.forEach(p => _verifiedProdutos.add(p));
  }
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
  refreshCoinSwatches();
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
    const data          = await res.json();
    const serverCompras = Array.isArray(data.compras) ? data.compras : [];

    // Fonte da verdade: Set in-memory verificado pelo servidor
    _verifiedProdutos = new Set(serverCompras.map(c => c.produto));

    // Preserva prestige se já foi aplicado nesta sessão
    if (S._isPrestige) {
      PRESTIGE_PRODUTOS.forEach(p => _verifiedProdutos.add(p));
    }

    // Compras locais não confirmadas (compradas antes de fazer login/vincular conta)
    let localCompras = [];
    try { localCompras = JSON.parse(localStorage.getItem("osl_compras") || "[]"); } catch (_) {}
    const serverRefs = new Set(serverCompras.map(c => c.ref));
    const localOnly = localCompras.filter(c => c.tipo !== "prestige" && !serverRefs.has(c.ref));

    // Tenta registrar no servidor cada compra local não sincronizada (best-effort)
    for (const c of localOnly) {
      try {
        const r = await fetch(BACKEND_BASE_URL_OSL + "/registrar-compra", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
          body: JSON.stringify({ ref: c.ref })
        });
        if (r.ok) {
          const d = await r.json();
          if (d.compra) { serverCompras.push(d.compra); _verifiedProdutos.add(d.compra.produto); }
        }
      } catch (_) {}
    }

    // localStorage: dados do servidor + itens ainda não recuperáveis (para não perder rastro)
    const unregistered = localOnly.filter(c => !serverCompras.some(s => s.ref === c.ref));
    localStorage.setItem("osl_compras", JSON.stringify([...serverCompras, ...unregistered]));

    refreshPackSwatches();
    refreshCardStyleSwatches();
    refreshFxSwatches();
    refreshCoinSwatches();
  } catch (_) {}
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function safeProfileImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    // Também torna o valor seguro para os renderers legados que o colocam em
    // uma declaração CSS dentro de um atributo HTML.
    return parsed.href.replace(/["'\\()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  } catch (_) {
    return null;
  }
}

function resolveProfileAvatar(profile = {}) {
  const nested = profile.avatar && typeof profile.avatar === "object" ? profile.avatar : {};
  const hasNestedUrl = Object.prototype.hasOwnProperty.call(nested, "url")
    || Object.prototype.hasOwnProperty.call(nested, "photoURL")
    || Object.prototype.hasOwnProperty.call(nested, "photoUrl");
  const nestedUrl = nested.url ?? nested.photoURL ?? nested.photoUrl ?? null;
  const legacyUrl = profile.avatarPhotoUrl ?? profile.avatarPhotoURL ?? profile.photoURL ?? profile.photoUrl ?? null;
  const url = hasNestedUrl ? nestedUrl : legacyUrl;
  const emoji = nested.emoji ?? profile.avatarEmoji ?? "";
  const color = nested.color ?? profile.avatarColor ?? "";
  const requestedKind = nested.kind || "";
  const kind = ["image", "emoji", "generated"].includes(requestedKind)
    ? requestedKind
    : (url ? "image" : "emoji");
  return {
    kind,
    url: safeProfileImageUrl(url),
    emoji: typeof emoji === "string" ? emoji : "",
    color: typeof color === "string" ? color : ""
  };
}

function normalizeProfileData(profile = {}, fallbackUid = null) {
  const avatar = resolveProfileAvatar(profile);
  const uid = profile.uid || profile.userId || fallbackUid || null;
  return {
    ...profile,
    uid,
    userId: profile.userId || uid,
    avatar,
    // Campos derivados mantêm os componentes visuais antigos funcionando.
    avatarPhotoUrl: avatar.url,
    avatarEmoji: avatar.emoji || null,
    avatarColor: avatar.color || null
  };
}

function isHttpAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

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
  if (photoUrl) {
    btn.innerHTML = ""; const img = document.createElement("img"); img.src = photoUrl; img.style.cssText = "width:28px;height:28px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0";
    btn.appendChild(img); btn.appendChild(document.createTextNode("Perfil")); if (badge) btn.appendChild(badge);
  } else { btn.textContent = (emoji || "👤") + " Perfil"; if (badge) btn.appendChild(badge); }
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
  if (S._isPrestige) return true;
  const packId = BG_PACK_THEMES[theme];
  if (packId) return _hasCompra(packId);           // tema de pacote (dinheiro real)
  const coinId = "bg-" + theme;
  if (COIN_COSMETICS[coinId]) return _hasCompra(coinId); // tema de moeda
  return true;                                       // tema gratuito
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
  if (S._isPrestige) return true;
  if (["dourado","obsidiana","pergaminho","neon"].includes(style)) return _hasCompra("estilo-carta");
  if (COIN_COSMETICS["card-" + style]) return _hasCompra("card-" + style);
  return false;
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
// Sem argumento: verifica se os efeitos pagos (dinheiro real) estão liberados — usado em refreshFxSwatches
export function isFxUnlocked(fx) {
  if (S._isPrestige) return true;
  if (!fx || ["particulas","nevoa","pulsos"].includes(fx)) return _hasCompra("efeitos-visuais");
  if (COIN_COSMETICS["fx-" + fx]) return _hasCompra("fx-" + fx);
  return fx === "none";
}

export function applyVisualEffect(fx) {
  const f = FX_STYLES.includes(fx) ? fx : "none";
  FX_STYLES.forEach(k => document.documentElement.classList.remove("effect-" + k));
  if (f !== "none") document.documentElement.classList.add("effect-" + f);
}

export function setFxSelection(fx) {
  if (fx !== "none" && !isFxUnlocked(fx)) return;
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
  refreshCoinSwatches();
}

export function refreshCoinSwatches() {
  document.querySelectorAll(".bgSwatch--coin").forEach(sw => {
    const coinId = sw.dataset.coinId;
    if (!coinId) return;
    const unlocked = S._isPrestige || _hasCompra(coinId);
    sw.classList.toggle("bgSwatch--locked", !unlocked);
    const lock = sw.querySelector(".lockIcon"); if (lock) lock.style.display = unlocked ? "none" : "";
    const priceEl = sw.querySelector(".coinPrice"); if (priceEl) priceEl.style.display = unlocked ? "none" : "";
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
    if (!expires) { acessoEl.innerHTML = `<span class="profBadge profBadge--red">Não autenticado</span>`; }
    else { const expDate = new Date(Number(expires)); const expired = Date.now() > Number(expires); const label = expDate.toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"numeric" }); acessoEl.innerHTML = expired ? `<span class="profBadge profBadge--red">Expirado em ${label}</span>` : `<span class="profBadge profBadge--green">Ativo até ${label}</span>`; }
  }
}

function fillSessaoTab() {
  const salaCode = localStorage.getItem("osl_sala") || S.roomCode || "—";
  const salaNome = localStorage.getItem("osl_nome_sala") || "—";
  const papel    = S.isHost ? "Anfitrião" : "Jogador";
  const videoConn = (typeof window.lkRoom !== "undefined" && window.lkRoom?.state === "connected") ? "Conectado" : "Desconectado";
  const salaEl = document.getElementById("sessSala");   if (salaEl) salaEl.textContent = salaCode;
  const nomeEl = document.getElementById("sessNomeSala"); if (nomeEl) nomeEl.textContent = salaNome;
  const papelEl = document.getElementById("sessPapel"); if (papelEl) papelEl.textContent = papel;
  const videoEl = document.getElementById("sessVideo");  if (videoEl) videoEl.textContent = videoConn;
}

function fillPacksTab() {
  const grid = document.getElementById("profPackGrid"); if (!grid) return;
  const packs = [
    { id:"pacote-conexao",  name:"Conexão",  price:"R$ 9,90",  desc:"12 cartas · leve e emocional",   theme:"ambar",   themeName:"Âmbar",   themeColor:"#0e0a02" },
    { id:"pacote-verdades", name:"Verdades", price:"R$ 12,90", desc:"15 cartas · desconforto leve",    theme:"cristal", themeName:"Cristal", themeColor:"#05070e" },
    { id:"pacote-conflito", name:"Conflito", price:"R$ 14,90", desc:"15 cartas · provocações",         theme:"chama",   themeName:"Chama",   themeColor:"#120600" },
    { id:"pacote-segredos", name:"Segredos", price:"R$ 19,90", desc:"18 cartas · psicológico intenso", theme:"veu",     themeName:"Véu",     themeColor:"#07000e" },
    { id:"pacote-casais",   name:"Casais",   price:"R$ 19,90", desc:"18 cartas · nichado",             theme:"vinho",   themeName:"Vinho",   themeColor:"#0e0007" }
  ];
  grid.innerHTML = "";
  const basicCard = document.createElement("div"); basicCard.className = "profPackCard profPackCard--unlocked";
  basicCard.innerHTML = `<div class="profPackName">Deck Básico</div><div class="profPackDesc">8 cartas · sempre incluído</div><span class="profPackBadge profPackBadge--ok">✓ Incluído</span>`;
  grid.appendChild(basicCard);
  packs.forEach(pack => {
    const unlocked = _verifiedProdutos !== null
      ? _verifiedProdutos.has(pack.id)
      : JSON.parse(localStorage.getItem("osl_compras") || "[]").some(c => c.produto === pack.id);
    const card = document.createElement("div"); card.className = `profPackCard ${unlocked ? "profPackCard--unlocked" : "profPackCard--locked"}`;
    card.innerHTML = `<div class="profPackName">${pack.name}</div><div class="profPackDesc">${pack.desc}</div><div class="profPackDesc" style="display:flex;align-items:center;gap:6px;margin-top:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${pack.themeColor};border:1px solid rgba(255,255,255,.15);flex-shrink:0"></span><span style="color:rgba(243,237,229,.5);font-size:.7rem">Tema <strong style="color:rgba(215,176,107,.75)">${pack.themeName}</strong></span></div>${unlocked ? `<span class="profPackBadge profPackBadge--ok">✓ Desbloqueado</span>` : `<span class="profPackBadge profPackBadge--locked">🔒 ${pack.price}</span><a class="profileActionBtn" href="./vendas.html" style="margin-top:6px;font-size:.75rem;padding:4px 10px">Ver na loja</a>`}`;
    grid.appendChild(card);
  });
}

async function fillProfileUI(user, isSelfView) {
  user = normalizeProfileData(user, isSelfView ? S.userId : null);
  const profileAvatarLarge = document.getElementById("profileAvatarLarge");
  applyAvatarDisplay(profileAvatarLarge, user.avatarPhotoUrl, user.avatarEmoji || initials(user.displayName || "Jogador"), user.avatarColor);
  if (isSelfView && user.bgTheme) { S.selectedBgTheme = user.bgTheme; localStorage.setItem("osl_bg", user.bgTheme); applyBgTheme(user.bgTheme); }
  if (isSelfView) { const fab = document.getElementById("mobileProfileBtn"); if (fab) applyAvatarDisplay(fab, user.avatarPhotoUrl, user.avatarEmoji, user.avatarColor); }
  document.getElementById("profileName").textContent     = user.displayName || "Jogador";
  document.getElementById("profileUsername").textContent = `@${user.username || "jogador"}`;
  document.getElementById("profileBio").textContent      = user.bio || "Sem descrição.";
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
  fillFriendsPanel(user, isSelfView).catch(() => {});
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
      document.getElementById("profileBio").textContent      = "Perfil não encontrado.";
      document.getElementById("editProfileBtn").hidden = true; document.getElementById("addFriendBtn").hidden = true;
      document.getElementById("friendsPanel")?.classList.add("hidden");
      document.getElementById("profileModal").classList.remove("hidden"); return;
    }
    const user = normalizeProfileData(snap.data(), targetUserId);
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
      document.getElementById("profileBio").textContent      = "Erro ao carregar perfil: " + (error?.code || error?.message || String(error));
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

// ── Painel de amizades ────────────────────────────────────────────────────────

function _friendAvatar(p) {
  const avatar = resolveProfileAvatar(p);
  if (avatar.url) return `<div class="friendAvatar" style="background-image:url('${avatar.url}');background-size:cover;background-position:center;font-size:0"></div>`;
  return `<div class="friendAvatar" style="background:${avatar.color || "#342718"}">${avatar.emoji || "🔮"}</div>`;
}

function _compatBadge(compat) {
  if (!compat || !compat.hasData || (compat.confidence || 0) < 0.10) return "";
  return `<div class="friendCompat" title="${escapeHtml(compat.label || "")} · ${Math.round((compat.confidence||0)*100)}% confiança">
    <span class="friendCompat__score">${compat.overall}%</span>
    <span class="friendCompat__label">${escapeHtml(compat.label || "")}</span>
  </div>`;
}

function renderFriendItem(p, actions = [], compat = null) {
  const div = document.createElement("div");
  div.className = "friendItem";
  const btns = actions.map(a =>
    `<button class="friendBtn ${a.cls || ""}" data-action="${a.action}" data-uid="${p.uid}">${a.label}</button>`
  ).join("");
  div.innerHTML = `
    <div class="friendLeft">
      ${_friendAvatar(p)}
      <div class="friendMeta">
        <div class="friendName">${escapeHtml(p.displayName || "Jogador")}</div>
        <div class="friendUsername">@${escapeHtml(p.username || "jogador")}</div>
      </div>
    </div>
    <div class="friendActions">${_compatBadge(compat)}${btns}</div>`;
  return div;
}

async function loadUserProfileData(uid) {
  try {
    const snap = await getDoc(doc(S.db, "users", uid));
    return snap.exists() ? normalizeProfileData(snap.data(), uid) : null;
  } catch (_) { return null; }
}

export async function fillFriendsPanel(user, isSelfView) {
  const panel         = document.getElementById("friendsPanel");
  const listEl        = document.getElementById("friendsList");
  const incomingEl    = document.getElementById("incomingRequestsList");
  const searchBlock   = document.getElementById("friendSearchBlock");
  const incomingBlock = document.getElementById("incomingRequestsBlock");

  if (!panel) return;
  if (!isSelfView) { panel.classList.add("hidden"); return; }

  panel.classList.remove("hidden");
  if (searchBlock) searchBlock.hidden = false;

  // ── Amigos ────────────────────────────────────────────────────────────────
  const friendUids = (user.friends || []).slice(0, 20);
  if (listEl) {
    listEl.innerHTML = "";
    if (friendUids.length === 0) {
      listEl.innerHTML = `<div class="friendEmpty">Nenhum amigo ainda. Busque pelo @usuário acima.</div>`;
    } else {
      const profiles = await Promise.all(friendUids.map(loadUserProfileData));
      const validProfiles = profiles.filter(Boolean);

      // Busca compatibility de todos em paralelo (best-effort, não bloqueia render)
      const compatResults = await Promise.allSettled(
        validProfiles.map(p => fetchCompatibility(p.uid))
      );
      const compatMap = {};
      validProfiles.forEach((p, i) => {
        compatMap[p.uid] = compatResults[i].status === "fulfilled" ? compatResults[i].value : null;
      });

      validProfiles.forEach(p => {
        const item = renderFriendItem(p, [{ label: "Ver perfil", action: "view" }], compatMap[p.uid] || null);
        item.querySelector("[data-action='view']")?.addEventListener("click", () => {
          closeProfile();
          openProfile({ userId: p.uid, name: p.displayName }).catch(() => {});
        });
        listEl.appendChild(item);
      });
    }
  }

  // ── Pedidos recebidos ─────────────────────────────────────────────────────
  const incomingUids = (user.incomingRequests || []).slice(0, 10);
  if (incomingBlock) incomingBlock.hidden = incomingUids.length === 0;
  if (incomingEl) {
    incomingEl.innerHTML = "";
    if (incomingUids.length > 0) {
      const profiles = await Promise.all(incomingUids.map(loadUserProfileData));
      profiles.filter(Boolean).forEach(p => {
        const item = renderFriendItem(p, [
          { label: "Aceitar",  action: "accept", cls: "friendBtn--accept" },
          { label: "Recusar",  action: "reject"  },
        ]);
        item.querySelectorAll("[data-action]").forEach(btn => {
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            const action = btn.dataset.action;
            try {
              await respondFriendRequest(p.uid, action);
              item.remove();
              if (action === "accept") {
                const freshSnap = await getDoc(S.userRef);
                if (freshSnap.exists()) fillFriendsPanel(normalizeProfileData(freshSnap.data(), S.userId), true);
              }
            } catch (_) { btn.disabled = false; }
          });
        });
        incomingEl.appendChild(item);
      });
    }
  }

  // ── Botão de leaderboard ──────────────────────────────────────────────────
  if (friendUids.length > 0 && !panel.querySelector("#leaderboardBtn")) {
    const lb = document.createElement("button");
    lb.id = "leaderboardBtn";
    lb.className = "profileActionBtn";
    lb.style.cssText = "width:100%;margin-top:4px;font-size:12px;opacity:.7;";
    lb.textContent = "🏆 Ranking de amigos";
    lb.addEventListener("click", () => showLeaderboardModal());
    panel.appendChild(lb);
  }
}

async function showLeaderboardModal() {
  document.querySelector(".leaderboardOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "recapOverlay leaderboardOverlay";
  overlay.innerHTML = `<div class="recapCard" style="max-height:80vh;overflow-y:auto;">
    <div class="recapCard__eyebrow">Amigos</div>
    <div class="recapCard__title">Ranking de XP</div>
    <div id="leaderboardRows" style="margin:16px 0;"><div style="opacity:.4;text-align:center;padding:20px 0;">Carregando…</div></div>
    <div class="recapCard__actions">
      <button class="recapCard__btn recapCard__btn--ghost" id="lbCloseBtn">FECHAR</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById("lbCloseBtn").addEventListener("click", () => {
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 300);
  });

  const result = await fetchFriendsLeaderboard();
  const rowsEl = document.getElementById("leaderboardRows");
  if (!rowsEl) return;

  const board = result?.leaderboard || [];
  if (!board.length) { rowsEl.innerHTML = `<div style="opacity:.4;text-align:center;padding:20px 0;">Nenhum dado ainda.</div>`; return; }

  rowsEl.innerHTML = board.map((e, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const selfMark = e.isSelf ? ' <span style="opacity:.5;font-size:11px;">(você)</span>' : "";
    const avatar = resolveProfileAvatar(e);
    const avatarStyle = avatar.url
      ? `style="background-image:url('${avatar.url}');background-size:cover;background-position:center;font-size:0"`
      : `style="background:${avatar.color || "#342718"}"`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="width:28px;text-align:center;font-size:16px;">${medal}</span>
      <div class="friendAvatar" ${avatarStyle}>${avatar.url ? "" : (avatar.emoji || "🔮")}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:700;">${escapeHtml(e.displayName)}${selfMark}</div>
        <div style="font-size:11px;opacity:.5;">Nv. ${e.level} · ${e.xp.toLocaleString("pt-BR")} XP</div>
      </div>
    </div>`;
  }).join("");
}

// ── Loja de Moedas ────────────────────────────────────────────────────────────

export function openCoinShop() {
  document.querySelector(".coinShopOverlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "recapOverlay coinShopOverlay";

  const currentCoins = parseInt(localStorage.getItem("osl_coins") || "0", 10);

  const items = Object.entries(COIN_COSMETICS);
  const itemsHTML = items.map(([id, c]) => {
    const owned = S._isPrestige || _hasCompra(id);
    const previewStyle = _coinItemPreviewStyle(id);
    return `<div class="coinShopItem${owned ? " coinShopItem--owned" : ""}" data-coin-id="${id}">
      <div class="coinShopItem__preview" style="${previewStyle}"></div>
      <div class="coinShopItem__info">
        <div class="coinShopItem__name">${escapeHtml(c.title)}</div>
        <div class="coinShopItem__cat">${_coinCatLabel(c.categoria)}</div>
      </div>
      <div class="coinShopItem__action">
        ${owned
          ? `<span class="coinShopItem__owned">✓ Seu</span>`
          : `<button class="coinShopItem__buy" data-coin-id="${id}" data-price="${c.coins}" ${currentCoins < c.coins ? "disabled" : ""}>
               🪙 ${c.coins}
             </button>`
        }
      </div>
    </div>`;
  }).join("");

  overlay.innerHTML = `
    <div class="recapCard" style="max-width:400px;max-height:88vh;overflow-y:auto;">
      <div class="recapCard__eyebrow">Personalização</div>
      <div class="recapCard__title">Loja de Moedas</div>
      <div class="coinShopBalance">🪙 <strong id="coinShopBalanceNum">${currentCoins.toLocaleString("pt-BR")}</strong> moedas disponíveis</div>
      <div id="coinShopItems" style="margin:16px 0;">${itemsHTML}</div>
      <div class="recapCard__actions">
        <button class="recapCard__btn recapCard__btn--ghost" id="coinShopCloseBtn">FECHAR</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  document.getElementById("coinShopCloseBtn").addEventListener("click", () => {
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 300);
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) { overlay.classList.add("closing"); setTimeout(() => overlay.remove(), 300); } });

  overlay.addEventListener("click", async e => {
    const btn = e.target.closest(".coinShopItem__buy");
    if (!btn || btn.disabled) return;
    const coinId = btn.dataset.coinId;
    const price  = parseInt(btn.dataset.price, 10);
    btn.disabled = true;
    btn.textContent = "Comprando…";

    const result = await buyWithCoins(coinId).catch(() => null);

    if (result?.ok && !result.alreadyOwned) {
      // Atualiza saldo local + UI
      const newBalance = result.newCoinBalance ?? 0;
      try { localStorage.setItem("osl_coins", String(newBalance)); } catch (_) {}
      const balEl = document.getElementById("coinBalanceNum") || document.getElementById("coinBalance");
      if (balEl) balEl.textContent = newBalance.toLocaleString("pt-BR");
      const shopBal = document.getElementById("coinShopBalanceNum");
      if (shopBal) shopBal.textContent = newBalance.toLocaleString("pt-BR");

      // Marca como comprado no _verifiedProdutos
      if (_verifiedProdutos !== null) _verifiedProdutos.add(coinId);

      // Atualiza o item no modal
      const itemEl = overlay.querySelector(`.coinShopItem[data-coin-id="${coinId}"]`);
      if (itemEl) {
        itemEl.classList.add("coinShopItem--owned");
        const actionEl = itemEl.querySelector(".coinShopItem__action");
        if (actionEl) actionEl.innerHTML = `<span class="coinShopItem__owned">✓ Seu</span>`;
      }

      // Atualiza swatches no perfil
      refreshCoinSwatches();
      refreshPackSwatches();
    } else if (result?.alreadyOwned) {
      btn.textContent = "✓ Já seu";
    } else if (result?.error === "MOEDAS_INSUFICIENTES") {
      btn.textContent = "Moedas insuf.";
      setTimeout(() => { btn.disabled = false; btn.textContent = `🪙 ${price}`; }, 2000);
    } else {
      btn.disabled = false;
      btn.textContent = `🪙 ${price}`;
    }
  });
}

function _coinCatLabel(cat) {
  return cat === "bg" ? "Fundo de sala" : cat === "card" ? "Estilo de carta" : "Efeito visual";
}

function _coinItemPreviewStyle(coinId) {
  const previews = {
    "bg-crepusculo": "background:radial-gradient(ellipse 120% 60% at 50% 95%,rgba(220,80,20,.5) 0%,transparent 60%),linear-gradient(180deg,#06040c 0%,#1a0c10 30%,#240c04 65%,#0e0604 100%);",
    "bg-pedra":      "background:linear-gradient(160deg,#0c0d14 0%,#141520 50%,#0a0b10 100%);",
    "bg-espelho":    "background:radial-gradient(ellipse 100% 70% at 50% 50%,rgba(180,195,215,.2) 0%,transparent 65%),linear-gradient(145deg,#0c1018 0%,#1a1e28 45%,#0a0e14 100%);",
    "card-cinza":    "background:linear-gradient(180deg,#151820 0%,#0c0e14 100%);border-color:rgba(150,165,195,.30);",
    "fx-centelhas":  "background:radial-gradient(circle,rgba(215,176,107,.7) 2px,transparent 2px),radial-gradient(circle,rgba(255,255,255,.8) 1.5px,transparent 1.5px),#06040a;background-size:20px 20px,14px 14px,auto;background-position:5px 8px,12px 4px,0 0;",
  };
  return previews[coinId] || "background:#080608;";
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

  addFriendBtn?.addEventListener("click", async () => {
    const targetUid = S.openedProfileUserId;
    if (!targetUid || targetUid === S.userId) return;
    addFriendBtn.disabled = true;
    addFriendBtn.textContent = "Enviando…";
    try {
      const result = await sendFriendRequest(targetUid);
      if (result?.status === "auto_accepted" || result?.status === "already_friends") {
        addFriendBtn.textContent = "✓ Amigos!";
      } else if (result?.ok) {
        addFriendBtn.textContent = "✓ Pedido enviado";
      } else {
        addFriendBtn.textContent = "Adicionar amigo";
        addFriendBtn.disabled = false;
      }
    } catch (_) {
      addFriendBtn.textContent = "Adicionar amigo";
      addFriendBtn.disabled = false;
    }
  });

  profileEditor?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editDisplayName = document.getElementById("editDisplayName");
    const editUsername    = document.getElementById("editUsername");
    const editBio         = document.getElementById("editBio");
    const displayName     = editDisplayName.value.trim().slice(0,40) || "Jogador";
    const username        = normalizeUsername(editUsername.value) || "jogador";
    const bio             = editBio.value.trim().slice(0,180);
    const avatarUrl       = safeProfileImageUrl(S.selectedAvatarPhoto);
    const avatarEmoji     = S.selectedAvatarEmoji || "🔮";
    const avatarColor     = S.selectedAvatarColor || "#342718";
    const avatar          = {
      kind: avatarUrl ? "image" : "emoji",
      url: avatarUrl,
      emoji: avatarEmoji,
      color: avatarColor
    };
    S.selectedAvatarPhoto = avatarUrl;
    const avatarUpdate    = avatarUrl
      ? { avatarPhotoUrl: avatarUrl, avatarEmoji: null }
      : { avatarEmoji, avatarPhotoUrl: null };
    const firebaseUser    = S.auth?.currentUser || null;
    const canonicalUid    = S.userId || firebaseUser?.uid || null;
    try {
      await updateDoc(S.userRef, {
        schemaVersion: 1,
        uid: canonicalUid,
        userId: canonicalUid,
        displayName,
        username,
        bio,
        avatar,
        ...avatarUpdate,
        avatarColor,
        bgTheme: S.selectedBgTheme,
        cardStyle: S.selectedCardStyle,
        visualEffect: S.selectedFx,
        updatedAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      });
      if (firebaseUser) {
        const authProfile = { displayName };
        // Firestore é a fonte canônica. A sincronização visual do Firebase Auth
        // é complementar e nunca pode impedir que o perfil do jogo seja salvo.
        if (isHttpAvatarUrl(avatarUrl)) authProfile.photoURL = avatarUrl;
        await updateProfile(firebaseUser, authProfile).catch(error => {
          console.warn("Não foi possível sincronizar o perfil no Firebase Auth:", error);
        });
      }
      if (canonicalUid) localStorage.setItem("osl_cache_uid", canonicalUid);
      localStorage.setItem("osl_bg", S.selectedBgTheme); localStorage.setItem("osl_card_style", S.selectedCardStyle); localStorage.setItem("osl_fx", S.selectedFx);
      applyBgTheme(S.selectedBgTheme); applyCardStyle(S.selectedCardStyle); applyVisualEffect(S.selectedFx);
      if (S.openedProfileUserId === S.userId) { S.playerName = displayName; localStorage.setItem("osl_nome", displayName); }
      const snap = await getDoc(S.userRef); S.openedProfileData = normalizeProfileData(snap.data(), canonicalUid); await fillProfileUI(S.openedProfileData, true);
      if (avatarUrl) { localStorage.setItem("osl_avatar_photo", avatarUrl); localStorage.removeItem("osl_avatar"); }
      else { localStorage.removeItem("osl_avatar_photo"); localStorage.setItem("osl_avatar", avatarEmoji); }
      updateDesktopProfileBtn(S.selectedAvatarPhoto, S.selectedAvatarEmoji);
      await setDoc(S.playerRef, { name: displayName, avatarEmoji: avatarUrl ? null : avatarEmoji, avatarPhotoUrl: avatarUrl, avatarColor }, { merge: true });
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
      const packNames = { "pacote-conexao":"Conexão","pacote-verdades":"Verdades","pacote-conflito":"Conflito","pacote-segredos":"Segredos","pacote-casais":"Casais" };
      const hint = document.getElementById("bgPackHint");
      if (hint) { hint.textContent = `Exclusivo do Pacote ${packNames[BG_PACK_THEMES[bg]] || "um pacote"}`; hint.style.opacity = "1"; clearTimeout(_bgHintTimer); _bgHintTimer = setTimeout(() => { hint.style.opacity = "0"; }, 2200); }
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
      if (hint) { hint.textContent = "Exclusivo do produto Estilo de Carta"; hint.style.opacity = "1"; clearTimeout(_cardHintTimer); _cardHintTimer = setTimeout(() => { hint.style.opacity = "0"; }, 2200); }
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
      if (hint) { hint.textContent = "Exclusivo do produto Efeitos Visuais"; hint.style.opacity = "1"; clearTimeout(_fxHintTimer); _fxHintTimer = setTimeout(() => { hint.style.opacity = "0"; }, 2200); }
      return;
    }
    setFxSelection(fx); localStorage.setItem("osl_fx", fx);
    try { await updateDoc(doc(S.db, "users", S.userId), { visualEffect: fx, lastSeen: serverTimestamp() }); } catch (_) {}
  });

  // ── Swatches com moedas (bg, card, fx) ───────────────────────────────────────
  document.querySelectorAll(".bgSwatch--coin,.cardStyleSwatch--coin,.fxSwatch--coin").forEach(sw => {
    sw.addEventListener("click", async event => {
      // Impede que o listener do grupo aplique o cosmético bloqueado antes da compra.
      event.stopPropagation();
      const coinId = sw.dataset.coinId;
      if (!coinId) return;
      const unlocked = S._isPrestige || _hasCompra(coinId);
      if (unlocked) {
        const item = COIN_COSMETICS[coinId];
        if (!item) return;
        if (item.categoria === "bg")   { setBgSelection(item.key); localStorage.setItem("osl_bg", item.key); try { await updateDoc(doc(S.db, "users", S.userId), { bgTheme: item.key }); } catch (_) {} }
        if (item.categoria === "card") { setCardStyleSelection(item.key); localStorage.setItem("osl_card_style", item.key); try { await updateDoc(doc(S.db, "users", S.userId), { cardStyle: item.key }); } catch (_) {} }
        if (item.categoria === "fx")   { setFxSelection(item.key); localStorage.setItem("osl_fx", item.key); try { await updateDoc(doc(S.db, "users", S.userId), { visualEffect: item.key }); } catch (_) {} }
      } else {
        openCoinShop();
      }
    });
  });

  // ── Busca de jogadores ──────────────────────────────────────────────────────
  const friendSearchInput = document.getElementById("friendSearchInput");
  const friendSearchBtn   = document.getElementById("friendSearchBtn");
  const friendSearchResults = document.getElementById("friendSearchResults");

  async function runFriendSearch() {
    const q = friendSearchInput?.value.trim();
    if (!q || q.length < 2 || !friendSearchResults) return;
    friendSearchBtn.disabled = true;
    friendSearchResults.innerHTML = `<div style="opacity:.4;font-size:13px;padding:8px 0;">Buscando…</div>`;
    try {
      const result = await searchUsers(q);
      const results = result?.results || [];
      friendSearchResults.innerHTML = "";
      if (!results.length) {
        friendSearchResults.innerHTML = `<div class="friendEmpty">Nenhum jogador encontrado com "@${escapeHtml(q)}".</div>`;
      } else {
        const myFriends = new Set((S.openedProfileData?.friends || []));
        results.forEach(p => {
          const isFriend = myFriends.has(p.uid);
          const item = renderFriendItem(p, isFriend
            ? [{ label: "Já são amigos", action: "noop", cls: "friendBtn--pending" }]
            : [{ label: "Adicionar", action: "add" }]
          );
          const addBtn = item.querySelector("[data-action='add']");
          if (addBtn) {
            addBtn.addEventListener("click", async () => {
              addBtn.disabled = true;
              addBtn.textContent = "Enviando…";
              try {
                const r = await sendFriendRequest(p.uid);
                addBtn.textContent = (r?.status === "auto_accepted") ? "✓ Amigos!" : "✓ Enviado";
              } catch (_) { addBtn.disabled = false; addBtn.textContent = "Adicionar"; }
            });
          }
          friendSearchResults.appendChild(item);
        });
      }
    } catch (_) {
      friendSearchResults.innerHTML = `<div class="friendEmpty">Erro ao buscar.</div>`;
    } finally {
      friendSearchBtn.disabled = false;
    }
  }

  friendSearchBtn?.addEventListener("click", runFriendSearch);
  friendSearchInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runFriendSearch(); } });

  document.getElementById("copyRoomCodeBtn")?.addEventListener("click", () => {
    const code = localStorage.getItem("osl_sala") || S.roomCode || "";
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => { const btn = document.getElementById("copyRoomCodeBtn"); btn.textContent = "Copiado!"; setTimeout(() => btn.textContent = "Copiar código da sala", 2000); });
  });

  document.getElementById("profCopyLicBtn")?.addEventListener("click", () => {
    const lic = localStorage.getItem("osl_license_code") || "";
    if (!lic) return;
    navigator.clipboard.writeText(lic).then(() => { const btn = document.getElementById("profCopyLicBtn"); btn.textContent = "✓"; setTimeout(() => btn.textContent = "⎘", 2000); });
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    if (!confirm("Sair da conta? Você será redirecionado para a entrada.")) return;
    try { await signOut(S.auth); } catch (error) { console.warn("Falha ao encerrar sessão Firebase:", error); }
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("./entrada.html");
  });

  // Ouve evento de abrir perfil (disparado por room.js)
  document.addEventListener("osl:openProfileModal", e => openProfile(e.detail).catch(console.error));

  // Clique no saldo de moedas abre a loja
  document.getElementById("coinBalanceWrap")?.addEventListener("click", () => openCoinShop());
}
