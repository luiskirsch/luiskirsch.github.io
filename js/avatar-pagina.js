/**
 * avatar.html — criador de avatar 3D do SEXTOLUGAR.
 *
 * O criador é uma build Godot própria (sextolugar-godot: cenas/criar_avatar.tscn, preset
 * "Web Avatar"), servida por cena.preludiojogos.com.br/avatar/ (Worker cloudflare/cena). Outro site
 * (.com.br ≠ .com): roda num processo próprio e conversa com esta página só por postMessage:
 *   cena → página  {tipo:'sextolugar-avatar-pronto'}            criador carregado
 *   cena → página  {tipo:'sextolugar-avatar-salvar', avatar}     jogador clicou em "Salvar avatar"
 *   página → cena  {tipo:'sextolugar-avatar-carregar', avatar}   avatar salvo na conta
 * O avatar fica em users/{uid}.avatar (o dono pode escrever; não é campo financeiro). É só uma
 * configuração (sexo, formas, cabelo, cores, roupa): quem lê valida (AvatarControles.normalizar).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ORIGEM = "https://cena.preludiojogos.com.br";
const CRIADOR = ORIGEM + "/avatar/atual.html" + (location.hash === "#olhos" ? "#olhos" : "");
const LIMITE = 8000;   // bytes do JSON do avatar (uma config típica tem ~1 KB)

const cfg = {
  apiKey: "AIzaSyAkA9JXidiHEE3tFcd6o5yBcAYI2RT2daM",
  authDomain: "osextolugar-jogo.firebaseapp.com",
  projectId: "osextolugar-jogo",
  storageBucket: "osextolugar-jogo.firebasestorage.app",
  messagingSenderId: "720257993401",
  appId: "1:720257993401:web:a9d7a41c1ef8b47d5b6968",
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

const frame = document.getElementById("avatarFrame");
const estado = document.getElementById("avatarEstado");
const tela = document.getElementById("avatarTela");

let usuario = null;
let avatarConta = null;
let cenaPronta = false;

function mostrar(texto, tipo) {
  estado.textContent = texto;
  estado.className = "estado" + (tipo ? " " + tipo : "");
}

// Carrega o estúdio enquanto a conta é consultada. Os penteados são baixados sob demanda.
frame.src = CRIADOR;

function enviarParaCena() {
  if (!cenaPronta || !avatarConta || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ tipo: "sextolugar-avatar-carregar", avatar: avatarConta }, ORIGEM);
}

/** Só os campos do criador, valores arredondados e formas zeradas fora (cabe no link do app). */
function enxuto(av) {
  const r = {};
  for (const k of ["v", "sexo", "cabelo", "cor_cabelo", "sobrancelha", "cilios", "olhos", "roupa", "sapato"]) {
    if (typeof av[k] === "string" || typeof av[k] === "number") r[k] = av[k];
  }
  if (av.modelo === "metahuman" || av.modelo === "personalizado") r.modelo = av.modelo;
  if (typeof av.cor_camisa === "string" && /^[0-9a-f]{6}$/i.test(av.cor_camisa)) {
    r.cor_camisa = av.cor_camisa.toLowerCase();
  }
  if (typeof av.penteado_metahuman === "string" && /^[a-z0-9_-]{1,64}$/.test(av.penteado_metahuman)) {
    r.penteado_metahuman = av.penteado_metahuman;
  }
  if (typeof av.pele === "number") r.pele = Math.round(av.pele * 1000) / 1000;
  if (typeof av.barba === "number" && Number.isFinite(av.barba)) r.barba = Math.max(0, Math.min(1, Math.round(av.barba * 1000) / 1000));
  for (const grupo of ["corpo", "formas"]) {
    const g = av[grupo];
    if (!g || typeof g !== "object") continue;
    const s = {};
    for (const [k, v] of Object.entries(g)) {
      if (typeof v !== "number" || !isFinite(v)) continue;
      const x = Math.round(v * 100) / 100;
      if (grupo === "formas" && x === 0) continue;
      s[k.slice(0, 40)] = x;
    }
    r[grupo] = s;
  }
  return r;
}

async function salvar(av) {
  if (!av || typeof av !== "object" || Array.isArray(av)) return;
  const limpo = enxuto(av);
  if (JSON.stringify(limpo).length > LIMITE) {
    mostrar("Avatar grande demais para salvar", "erro");
    return;
  }
  if (!usuario) {
    mostrar("Entre na sua conta para salvar", "erro");
    return;
  }
  mostrar("Salvando…");
  try {
    await setDoc(doc(db, "users", usuario.uid), { avatar: limpo, avatarAtualizadoEm: serverTimestamp() },
      { mergeFields: ["avatar", "avatarAtualizadoEm"] });
    avatarConta = limpo;
    mostrar("Salvo na sua conta", "ok");
  } catch (erro) {
    console.warn("[avatar] não salvou na conta:", erro);
    mostrar("Salvo só neste navegador — a conta não respondeu", "erro");
  }
}

window.addEventListener("message", (e) => {
  if (e.origin !== ORIGEM || e.source !== frame.contentWindow) return;
  const d = e.data || {};
  if (d.tipo === "sextolugar-avatar-pronto") {
    cenaPronta = true;
    enviarParaCena();
  } else if (d.tipo === "sextolugar-avatar-salvar") {
    salvar(d.avatar);
  } else if (d.avatarCarga === "progresso") {
    const p = Math.round(Math.max(0, Math.min(1, Number(d.valor) || 0)) * 100);
    mostrar("Carregando o estúdio · " + p + "%");
  } else if (d.avatarCarga === "pronta") {
    mostrar(avatarConta ? "Avatar da sua conta" : "Monte seu avatar e salve");
  } else if (d.avatarCarga === "erro") {
    mostrar("O navegador não conseguiu abrir o 3D", "erro");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user || user.isAnonymous) {
    location.href = "./página.html";
    return;
  }
  usuario = user;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const av = snap.exists() ? snap.data().avatar : null;
    if (av && typeof av === "object" && !Array.isArray(av)) {
      avatarConta = av;
      enviarParaCena();
    }
  } catch (erro) {
    console.warn("[avatar] não leu a conta:", erro);
  }
});

// A mesma sessão de edição e o salvamento da conta continuam ativos em tela cheia.
if (tela && document.fullscreenEnabled) {
  tela.hidden = false;
  tela.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      mostrar("O navegador bloqueou a tela cheia", "erro");
    }
  });
  document.addEventListener("fullscreenchange", () => {
    tela.textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia";
  });
}
