import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330",
  measurementId: "G-D6HG779ZFR"
};

const BACKEND_BASE_URL = "https://osl-video-server.onrender.com";

// Acorda o servidor Render silenciosamente ao carregar a página
fetch(`${BACKEND_BASE_URL}/health`).catch(() => {});

// Fetch com timeout + retry automático
async function fetchComRetry(url, options = {}, { tentativas = 3, timeoutMs = 18000 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      ultimoErro = err;
      if (i < tentativas - 1) {
        setStatus(`Servidor iniciando, aguardando… (tentativa ${i + 2}/${tentativas})`);
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }
  throw ultimoErro;
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const nomeEl = document.getElementById("nome");
const usernameEl = document.getElementById("username");
const emailEl = document.getElementById("email");
const licenseEl = document.getElementById("license");
const statusEl = document.getElementById("status");
const playBtn = document.getElementById("playBtn");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");
const linkLicenseBtn = document.getElementById("linkLicenseBtn");
const licenseInput = document.getElementById("licenseInput");
const licenseHelper = document.getElementById("licenseHelper");
const licenseBadgeEl = document.getElementById("licenseBadge");
const heroAccessBadgeEl = document.getElementById("heroAccessBadge");
const heroUserBadgeEl = document.getElementById("heroUserBadge");

const coinsEl = document.getElementById("coins");
const withdrawableCoinsEl = document.getElementById("withdrawableCoins");
const referralsApprovedEl = document.getElementById("referralsApproved");
const referralsPendingEl = document.getElementById("referralsPending");
const refCodeEl = document.getElementById("refCode");
const refLinkEl = document.getElementById("refLink");
const commissionApprovedEl = document.getElementById("commissionApproved");
const totalPaidOutEl = document.getElementById("totalPaidOut");
const pixKeyInput = document.getElementById("pixKeyInput");
const savePixBtn = document.getElementById("savePixBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const withdrawBtn = document.getElementById("withdrawBtn");
const affiliateStatusEl = document.getElementById("affiliateStatus");
const historyListEl = document.getElementById("historyList");
const progressFillEl = document.getElementById("progressFill");
const progressTextEl = document.getElementById("progressText");

let currentUser = null;
let currentProfile = null;
let currentAffiliate = null;
let isProcessingLicense = false;
let isProcessingAffiliate = false;

function setStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status";
  if (type) statusEl.classList.add(type);
}

function setAffiliateStatus(text, type = "") {
  affiliateStatusEl.textContent = text;
  affiliateStatusEl.className = "status";
  if (type) affiliateStatusEl.classList.add(type);
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "-";

  let dateValue = null;

  if (typeof value === "string" || typeof value === "number") {
    dateValue = new Date(value);
  } else if (value?.seconds) {
    dateValue = new Date(value.seconds * 1000);
  } else if (typeof value?.toDate === "function") {
    dateValue = value.toDate();
  }

  if (!dateValue || Number.isNaN(dateValue.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(dateValue);
}

function normalizeLicenseCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

function getLocalLicenseCode() {
  return localStorage.getItem("osl_license_code") || "";
}

function getLocalAccessToken() {
  return sessionStorage.getItem("osl_access_token") || "";
}

function getLocalLicenseEmail() {
  return localStorage.getItem("osl_license_email") || "";
}

function clearLocalSessionTokens() {
  sessionStorage.removeItem("osl_access_token");
  sessionStorage.removeItem("osl_access_expires_at");
  localStorage.removeItem("osl_license_token");
  localStorage.removeItem("osl_license_code");
  localStorage.removeItem("osl_license_email");
}

function canEnterGame(profileData) {
  return !!profileData?.access?.active && !!getLocalAccessToken();
}

function syncLicenseInput(profileData = null) {
  const code =
    profileData?.licenseCode ||
    getLocalLicenseCode() ||
    "";
  licenseInput.value = code;
}

function updateAccessBadges(profileData, firebaseUser) {
  const hasAccess = canEnterGame(profileData);

  heroUserBadgeEl.textContent = firebaseUser?.email ? "Conta conectada" : "Conta";
  heroUserBadgeEl.className = "heroBadge";

  if (hasAccess) {
    heroAccessBadgeEl.textContent = "Acesso liberado";
    heroAccessBadgeEl.className = "heroBadge active";

    licenseBadgeEl.textContent = "Licença ativa";
    licenseBadgeEl.className = "licenseBadge active";
  } else {
    heroAccessBadgeEl.textContent = "Sem acesso";
    heroAccessBadgeEl.className = "heroBadge inactive";

    licenseBadgeEl.textContent = "Licença inativa";
    licenseBadgeEl.className = "licenseBadge inactive";
  }
}

function refreshUI(profileData, firebaseUser) {
  currentProfile = profileData;

  nomeEl.textContent =
    profileData?.displayName ||
    localStorage.getItem("osl_nome") ||
    firebaseUser?.displayName ||
    "-";

  usernameEl.textContent = profileData?.username
    ? "@" + profileData.username
    : (localStorage.getItem("osl_username")
        ? "@" + localStorage.getItem("osl_username")
        : "-");

  emailEl.textContent =
    profileData?.email ||
    firebaseUser?.email ||
    getLocalLicenseEmail() ||
    "-";

  licenseEl.textContent =
    profileData?.licenseCode ||
    getLocalLicenseCode() ||
    "Não vinculada";

  syncLicenseInput(profileData);
  updateAccessBadges(profileData, firebaseUser);

  if (canEnterGame(profileData)) {
    setStatus("Acesso liberado.", "ok");
    playBtn.disabled = false;
    linkLicenseBtn.disabled = false;
    linkLicenseBtn.textContent = "Atualizar acesso";
    licenseHelper.textContent = "Sua conta já está liberada e a licença está vinculada a ela.";
    return;
  }

  if (profileData?.licenseLinked && !getLocalAccessToken()) {
    setStatus("Conta com licença vinculada, mas sem acesso ativo neste navegador.", "err");
    playBtn.disabled = true;
    linkLicenseBtn.disabled = false;
    linkLicenseBtn.textContent = "Restaurar acesso";
    licenseHelper.textContent = "Use o código da licença da própria conta para restaurar o acesso neste navegador.";
    return;
  }

  setStatus("Sem acesso ativo.", "err");
  playBtn.disabled = true;
  linkLicenseBtn.disabled = false;
  linkLicenseBtn.textContent = "Vincular licença";
  licenseHelper.textContent = "A licença será vinculada de forma exclusiva à conta logada.";
}

function refreshAffiliateUI(affiliate) {
  currentAffiliate = affiliate || null;

  if (!affiliate) {
    coinsEl.textContent = "0";
    withdrawableCoinsEl.textContent = "0";
    referralsApprovedEl.textContent = "0";
    referralsPendingEl.textContent = "0";
    refCodeEl.textContent = "-";
    refLinkEl.textContent = "-";
    commissionApprovedEl.textContent = formatMoney(0);
    totalPaidOutEl.textContent = formatMoney(0);
    pixKeyInput.value = "";
    progressFillEl.style.width = "0%";
    progressTextEl.textContent = "0 / 100 moedas";
    withdrawBtn.disabled = true;
    return;
  }

  const coins = Number(affiliate.coins || 0);
  const withdrawableCoins = Number(affiliate.withdrawableCoins || 0);
  const referralsApproved = Number(affiliate.referralsApproved || 0);
  const referralsPending = Number(affiliate.referralsPending || 0);
  const progress = Math.max(0, Math.min(100, withdrawableCoins));

  coinsEl.textContent = String(coins);
  withdrawableCoinsEl.textContent = String(withdrawableCoins);
  referralsApprovedEl.textContent = String(referralsApproved);
  referralsPendingEl.textContent = String(referralsPending);
  refCodeEl.textContent = affiliate.refCode || "-";
  refLinkEl.textContent = affiliate.referralLink || "-";
  commissionApprovedEl.textContent = formatMoney(affiliate.commissionApproved || 0);
  totalPaidOutEl.textContent = formatMoney(affiliate.totalPaidOutBRL || 0);
  pixKeyInput.value = affiliate.pixKey || "";
  progressFillEl.style.width = progress + "%";
  progressTextEl.textContent = `${withdrawableCoins} / 100 moedas`;

  withdrawBtn.disabled =
    withdrawableCoins < 100 ||
    !String(affiliate.pixKey || "").trim();
}

function renderHistory(items) {
  if (!Array.isArray(items) || !items.length) {
    historyListEl.innerHTML = `
      <div class="historyEmpty">
        Ainda não há ganhos registrados na sua conta.
      </div>
    `;
    return;
  }

  historyListEl.innerHTML = items.map((item) => {
    const type = String(item.type || item.status || "ganho");
    const createdAt = item.createdAt || item.approvedAt || item.date || null;
    const buyerEmail = item.buyerEmail || "";
    const coins = Number(item.coinsAwarded || item.coins || 0);
    const amountBRL = Number(item.commissionAmount || item.amountBRL || 0);
    const externalReference = item.externalReference || item.referralId || "-";

    return `
      <div class="historyItem">
        <div class="historyTop">
          <div class="historyType">${type}</div>
          <div class="historyDate">${formatDateTime(createdAt)}</div>
        </div>

        <div class="historyMain">
          ${coins > 0 ? `+${coins} moedas` : formatMoney(amountBRL)}
        </div>

        <div class="historyMeta">
          ${buyerEmail ? `Comprador: ${buyerEmail}<br>` : ""}
          ${amountBRL > 0 ? `Comissão: ${formatMoney(amountBRL)}<br>` : ""}
          Referência: ${externalReference}
        </div>
      </div>
    `;
  }).join("");
}

async function loadAffiliateHistory(user) {
  if (!user) return;

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/afiliado/historico/${user.uid}`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok || !Array.isArray(data.history)) {
      renderHistory([]);
      return;
    }

    renderHistory(data.history);
  } catch (err) {
    console.error(err);
    renderHistory([]);
  }
}

async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) return snap.data();

  const displayName =
    localStorage.getItem("osl_nome") ||
    user.displayName ||
    "Jogador";

  const email =
    user.email ||
    getLocalLicenseEmail() ||
    "";

  const username =
    localStorage.getItem("osl_username") ||
    String(email).split("@")[0] ||
    "jogador";

  const profileData = {
    uid: user.uid,
    userId: user.uid,
    email,
    displayName,
    username,
    avatarEmoji: "🔮",
    bio: "Novo participante do ritual.",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    licenseLinked: false,
    licenseCode: "",
    product: "",
    access: {
      active: false
    },
    stats: {
      gamesPlayed: 0,
      wins: 0
    },
    friends: [],
    incomingRequests: [],
    outgoingRequests: []
  };

  await setDoc(userRef, profileData, { merge: true });

  return {
    ...profileData,
    createdAt: null,
    updatedAt: null
  };
}

async function saveProfileAccess(user, payload) {
  const userRef = doc(db, "users", user.uid);

  await setDoc(userRef, {
    email: payload.email || user.email || "",
    licenseLinked: true,
    licenseCode: payload.licenseCode || "",
    product: payload.product || "osl_ritual_completo",
    access: {
      active: true
    },
    updatedAt: serverTimestamp()
  }, { merge: true });

  const refreshedSnap = await getDoc(userRef);
  if (refreshedSnap.exists()) {
    refreshUI(refreshedSnap.data(), user);
  }
}

async function markProfileWithoutAccess(user) {
  const userRef = doc(db, "users", user.uid);

  await setDoc(userRef, {
    access: {
      active: false
    },
    updatedAt: serverTimestamp()
  }, { merge: true });

  const refreshedSnap = await getDoc(userRef);
  if (refreshedSnap.exists()) {
    refreshUI(refreshedSnap.data(), user);
  }
}

async function validateCurrentAccessTokenForUser(user) {
  const accessToken = getLocalAccessToken();
  if (!accessToken) return false;

  try {
    const res = await fetchComRetry(
      `${BACKEND_BASE_URL}/verificar-acesso`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken })
      },
      { tentativas: 2, timeoutMs: 12000 }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.liberado) return false;
    return true;
  } catch (err) {
    // Servidor offline → assume token local como válido se existir
    console.warn("Servidor offline ao verificar acesso, usando local:", err);
    return !!accessToken;
  }
}

async function tryRestoreWithCode(user, rawCode) {
  const typedCode = normalizeLicenseCode(rawCode);

  if (!typedCode) {
    setStatus("Digite o código da licença.", "err");
    return false;
  }

  // Se o perfil já tem a licença vinculada, pula a validação e vai direto para emitir acesso
  const alreadyLinked = currentProfile?.licenseLinked &&
    normalizeLicenseCode(currentProfile?.licenseCode || "") === typedCode;

  if (!alreadyLinked) {
    setStatus("Validando código da licença...");

    const verifyRes = await fetchComRetry(
      `${BACKEND_BASE_URL}/validar-codigo-licenca`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode: typedCode, uid: user.uid, email: user.email || "" })
      }
    );

    const verifyData = await verifyRes.json().catch(() => ({}));

    if (!verifyRes.ok || !verifyData.valid) {
      if (verifyData?.error === "LICENCA_JA_VINCULADA_A_OUTRA_CONTA") {
        setStatus("Esta licença já está vinculada a outra conta.", "err");
      } else if (verifyData?.error === "LICENCA_INATIVA") {
        setStatus("Licença encontrada mas marcada como inativa. Entre em contato com o suporte.", "err");
      } else {
        setStatus(`Código inválido ou não encontrado. (${verifyData?.error || "erro"})`, "err");
      }
      return false;
    }
  }

  setStatus("Emitindo acesso...");

  const accessRes = await fetchComRetry(
    `${BACKEND_BASE_URL}/emitir-acesso-por-codigo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseCode: typedCode, uid: user.uid, email: user.email || "" })
    },
    { tentativas: 4, timeoutMs: 25000 }
  );

  const accessData = await accessRes.json().catch(() => ({}));

  if (!accessRes.ok || !accessData.accessToken) {
    if (accessData?.error === "LICENCA_JA_VINCULADA_A_OUTRA_CONTA") {
      setStatus("Esta licença já está vinculada a outra conta.", "err");
    } else if (accessData?.error === "LICENCA_INATIVA") {
      setStatus("Licença inativa. Entre em contato com o suporte.", "err");
    } else {
      setStatus(`Não foi possível emitir o acesso. (${accessData?.error || "erro"})`, "err");
    }
    return false;
  }

  sessionStorage.setItem("osl_access_token", accessData.accessToken);
  sessionStorage.setItem("osl_access_expires_at", String(accessData.expiresAt || ""));
  localStorage.setItem("osl_license_code", verifyData.licenseCode || typedCode);
  localStorage.setItem("osl_license_email", verifyData.email || user.email || "");

  await saveProfileAccess(user, {
    licenseCode: verifyData.licenseCode || typedCode,
    email: verifyData.email || user.email || "",
    product: verifyData.product || "osl_ritual_completo"
  });

  setStatus("Licença vinculada com sucesso. Acesso liberado.", "ok");
  return true;
}

async function restoreAccess(user, silent = false) {
  if (isProcessingLicense) return;
  isProcessingLicense = true;

  try {
    linkLicenseBtn.disabled = true;
    playBtn.disabled = true;

    const typedCode = normalizeLicenseCode(licenseInput.value);
    if (typedCode) {
      const restoredByTypedCode = await tryRestoreWithCode(user, typedCode);
      if (restoredByTypedCode) return;
    }

    const profileCode = normalizeLicenseCode(currentProfile?.licenseCode || "");
    if (profileCode && profileCode !== typedCode) {
      const restoredByProfileCode = await tryRestoreWithCode(user, profileCode);
      if (restoredByProfileCode) return;
    }

    if (!silent) {
      setStatus("Nenhuma licença válida foi encontrada para esta conta. Cole o código da licença para continuar.", "err");
    }
  } catch (err) {
    console.error(err);
    setStatus("Erro ao restaurar licença.", "err");
  } finally {
    isProcessingLicense = false;
    linkLicenseBtn.disabled = false;
  }
}

async function loadAffiliate(user) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/afiliado/garantir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email || "",
        nome: currentProfile?.displayName || user.displayName || "Jogador"
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.affiliate) {
      setAffiliateStatus("Não foi possível carregar a área de afiliado.", "err");
      refreshAffiliateUI(null);
      return;
    }

    refreshAffiliateUI(data.affiliate);
    setAffiliateStatus("Área de afiliado carregada.", "ok");
  } catch (err) {
    console.error(err);
    setAffiliateStatus("Erro ao carregar área de afiliado.", "err");
    refreshAffiliateUI(null);
  }
}

async function loadCompras(user) {
  const comprasListEl = document.getElementById("comprasList");
  if (!comprasListEl) return;
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${BACKEND_BASE_URL}/minhas-compras`, {
      headers: { "Authorization": "Bearer " + idToken }
    });
    const data = await res.json().catch(function(){ return {}; });
    const compras = Array.isArray(data.compras) ? data.compras : [];

    // Também sincroniza no localStorage
    let localCompras = [];
    try { localCompras = JSON.parse(localStorage.getItem("osl_compras") || "[]"); } catch(e){}
    const localRefs = new Set(localCompras.map(function(c){ return c.ref; }));
    compras.forEach(function(c){ if (!localRefs.has(c.ref)) localCompras.push(c); });
    localStorage.setItem("osl_compras", JSON.stringify(localCompras));

    if (!compras.length) {
      comprasListEl.innerHTML = '<div class="historyEmpty">Nenhuma compra registrada ainda.</div>';
      return;
    }

    const tipoLabel = { pack: "Pacote", consumable: "Sessão", cosmetic: "Cosmético", license: "Licença" };
    comprasListEl.innerHTML = compras.map(function(c) {
      const d = new Date(c.ts);
      const dataStr = d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" });
      const tipo = tipoLabel[c.tipo] || c.tipo || "—";
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)">' +
        '<div><div style="font-size:14px;color:#e6c07b;font-weight:600">' + c.titulo + '</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:2px">' + tipo + ' · ' + dataStr + '</div></div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,.7)">R$ ' + (c.valor || "—") + '</div>' +
        '</div>';
    }).join("");
  } catch(e) {
    if (comprasListEl) comprasListEl.innerHTML = '<div class="historyEmpty">Erro ao carregar compras.</div>';
  }
}

async function loadAll(user) {
  const profile = await ensureUserProfile(user);
  refreshUI(profile, user);
  // Afiliado e compras em paralelo — não bloqueia UI
  Promise.all([
    loadAffiliate(user),
    loadAffiliateHistory(user),
    loadCompras(user)
  ]).catch(console.error);
}

async function copyText(text) {
  if (!text) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  currentUser = user;

  try {
    await loadAll(user);

    const currentAccessIsValidForThisUser = await validateCurrentAccessTokenForUser(user);

    if (currentAccessIsValidForThisUser) {
      if (currentProfile && !currentProfile?.access?.active) {
        await saveProfileAccess(user, {
          licenseCode: currentProfile?.licenseCode || getLocalLicenseCode() || "",
          email: currentProfile?.email || user.email || "",
          product: currentProfile?.product || "osl_ritual_completo"
        });
      } else {
        refreshUI(currentProfile, user);
        setStatus("Acesso liberado.", "ok");
        playBtn.disabled = false;
      }
      return;
    }

    clearLocalSessionTokens();

    if (currentProfile?.access?.active) {
      await markProfileWithoutAccess(user);
    }

    refreshUI(currentProfile, user);
  } catch (err) {
    console.error(err);
    setStatus("Erro ao carregar perfil.", "err");
    playBtn.disabled = true;
  }
});

linkLicenseBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  await restoreAccess(currentUser, false);
});

refreshBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  try {
    refreshBtn.disabled = true;
    setStatus("Atualizando painel...");
    setAffiliateStatus("Atualizando área de afiliado...");

    await loadAll(currentUser);

    const stillValid = await validateCurrentAccessTokenForUser(currentUser);

    if (stillValid) {
      setStatus("Painel atualizado.", "ok");
      playBtn.disabled = false;
    } else {
      clearLocalSessionTokens();
      if (currentProfile?.access?.active) {
        await markProfileWithoutAccess(currentUser);
      }
      setStatus("Painel atualizado. Acesso não ativo neste navegador.", "err");
    }
  } catch (err) {
    console.error(err);
    setStatus("Erro ao atualizar painel.", "err");
  } finally {
    refreshBtn.disabled = false;
  }
});

playBtn.addEventListener("click", async () => {
  if (!currentProfile || !currentUser) {
    setStatus("Perfil ainda não carregado.", "err");
    return;
  }

  const stillValidForThisUser = await validateCurrentAccessTokenForUser(currentUser);

  if (!stillValidForThisUser) {
    clearLocalSessionTokens();
    await markProfileWithoutAccess(currentUser);
    setStatus("Seu acesso não pertence a esta conta neste navegador. Vincule a licença antes de entrar.", "err");
    return;
  }

  window.location.href = "./entrada.html";
});

copyLinkBtn.addEventListener("click", async () => {
  if (!currentAffiliate?.referralLink) {
    setAffiliateStatus("Seu link ainda não está disponível.", "err");
    return;
  }

  const ok = await copyText(currentAffiliate.referralLink);
  if (ok) {
    setAffiliateStatus("Link de indicação copiado.", "ok");
  } else {
    setAffiliateStatus("Não foi possível copiar o link.", "err");
  }
});

savePixBtn.addEventListener("click", async () => {
  if (!currentUser || isProcessingAffiliate) return;

  const pixKey = String(pixKeyInput.value || "").trim();

  if (!pixKey) {
    setAffiliateStatus("Digite sua chave Pix.", "err");
    return;
  }

  try {
    isProcessingAffiliate = true;
    savePixBtn.disabled = true;
    setAffiliateStatus("Salvando chave Pix...");

    const res = await fetch(`${BACKEND_BASE_URL}/afiliado/pix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        uid: currentUser.uid,
        pixKey
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      setAffiliateStatus("Não foi possível salvar a chave Pix.", "err");
      return;
    }

    await loadAffiliate(currentUser);
    setAffiliateStatus("Chave Pix salva com sucesso.", "ok");
  } catch (err) {
    console.error(err);
    setAffiliateStatus("Erro ao salvar a chave Pix.", "err");
  } finally {
    isProcessingAffiliate = false;
    savePixBtn.disabled = false;
  }
});

withdrawBtn.addEventListener("click", async () => {
  if (!currentUser || isProcessingAffiliate) return;

  try {
    isProcessingAffiliate = true;
    withdrawBtn.disabled = true;
    setAffiliateStatus("Solicitando saque...");

    const res = await fetch(`${BACKEND_BASE_URL}/afiliado/solicitar-saque`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        uid: currentUser.uid
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      if (data?.error === "PIX_NAO_CADASTRADO") {
        setAffiliateStatus("Cadastre sua chave Pix antes de solicitar saque.", "err");
      } else if (data?.error === "SALDO_INSUFICIENTE") {
        setAffiliateStatus("Você ainda não tem 100 moedas disponíveis para saque.", "err");
      } else {
        setAffiliateStatus("Não foi possível solicitar o saque.", "err");
      }
      return;
    }

    await loadAffiliate(currentUser);
    await loadAffiliateHistory(currentUser);
    setAffiliateStatus("Solicitação de saque criada com sucesso.", "ok");
  } catch (err) {
    console.error(err);
    setAffiliateStatus("Erro ao solicitar saque.", "err");
  } finally {
    isProcessingAffiliate = false;
    withdrawBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    clearLocalSessionTokens();
    await signOut(auth);
  } catch (err) {
    console.error(err);
  }
  window.location.href = "./login.html";
});
