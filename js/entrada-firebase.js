import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

// Autenticação anônima — necessária pois a regra /salas exige request.auth != null.
// O usuário ainda não fez login no app, mas o read é legítimo (só lê status/nome da sala).
let _authReady = signInAnonymously(auth).catch(() => null);

async function ensureAuth() {
  await _authReady;
}

window.verificarCodigoDisponivel = async function (codigoSala) {
  await ensureAuth();
  const snap = await getDoc(doc(db, "salas", codigoSala));
  if (!snap.exists()) return true;
  return snap.data().status === "closed";
};

window.validarEntradaSala = async function (codigoSala, nomeSalaDigitado) {
  await ensureAuth();
  const snap = await getDoc(doc(db, "salas", codigoSala));
  if (!snap.exists()) return { ok: false, erro: "Sala não encontrada. Verifique o código." };

  const data = snap.data();
  if (data.status === "closed") return { ok: false, erro: "Esta sala foi encerrada." };

  const armazenado = (data.name || "").trim().toLowerCase();
  const informado  = nomeSalaDigitado.trim().toLowerCase();

  if (armazenado !== informado) return { ok: false, erro: "Nome da sala incorreto." };

  return { ok: true, nomeSala: data.name || nomeSalaDigitado };
};
