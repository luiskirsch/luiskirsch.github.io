import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330"
};

const db = getFirestore(initializeApp(firebaseConfig));

window.verificarCodigoDisponivel = async function (codigoSala) {
  const snap = await getDoc(doc(db, "salas", codigoSala));
  if (!snap.exists()) return true;
  return snap.data().status === "closed";
};

window.validarEntradaSala = async function (codigoSala, nomeSalaDigitado) {
  const snap = await getDoc(doc(db, "salas", codigoSala));
  if (!snap.exists()) return { ok: false, erro: "Sala não encontrada. Verifique o código." };

  const data = snap.data();
  if (data.status === "closed") return { ok: false, erro: "Esta sala foi encerrada." };

  const armazenado = (data.name || "").trim().toLowerCase();
  const informado  = nomeSalaDigitado.trim().toLowerCase();

  if (armazenado !== informado) return { ok: false, erro: "Nome da sala incorreto." };

  return { ok: true, nomeSala: data.name || nomeSalaDigitado };
};
