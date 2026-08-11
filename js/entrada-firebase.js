import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Aguarda onAuthStateChanged antes de decidir sobre signInAnonymously.
// Chamada direta a signInAnonymously() destruía a sessão real do usuário vindo
// de página.html, pois auth.currentUser é sempre null no carregamento síncrono.
const _authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();
    if (user) {
      // Preserva sessão real e sincroniza osl_auth_uid para utils.js
      if (!user.isAnonymous) localStorage.setItem("osl_auth_uid", user.uid);
      resolve(user);
    } else {
      // Sem sessão — sign-in anônimo para leituras Firestore (allow read: if true em salas/{id})
      signInAnonymously(auth).then(c => c.user).catch(() => null).then(resolve);
    }
  });
});

async function ensureAuth() {
  await _authReady;
}

window.verificarCodigoDisponivel = async function (codigoSala) {
  await ensureAuth();
  const snap = await getDoc(doc(db, "salas", codigoSala));
  if (!snap.exists()) return true;
  return snap.data().status === "closed";
};

window.checkActiveSession = async function () {
  const uid = localStorage.getItem("osl_auth_uid");
  if (!uid) return null;
  await _authReady;
  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return null;
    const { activeSession } = userSnap.data();
    if (!activeSession?.sessionId || !activeSession?.roomCode) return null;
    const sessSnap = await getDoc(doc(db, "salas", activeSession.roomCode, "sessions", activeSession.sessionId));
    if (!sessSnap.exists() || sessSnap.data().status !== "active") {
      updateDoc(doc(db, "users", uid), { activeSession: null }).catch(() => {});
      return null;
    }
    return {
      sessionId: activeSession.sessionId,
      roomCode:  activeSession.roomCode,
      playerCount: sessSnap.data().players?.length || 0
    };
  } catch (_) { return null; }
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
