import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, where, limit, orderBy,
  serverTimestamp, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { S } from "./state.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330",
  measurementId: "G-D6HG779ZFR"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Aguarda o Firebase SDK restaurar a sessão persistida (IndexedDB) antes de decidir se
// precisa de sign-in anônimo. auth.currentUser é sempre null no carregamento síncrono do
// módulo — checar diretamente causava uma corrida onde signInAnonymously sobrescrevia a
// sessão real do usuário com um UID anônimo diferente, quebrando as regras Firestore que
// exigem request.auth.uid == uid (adicionadas na auditoria 2026-08-04).
const _authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();
    if (user) {
      // Grava Firebase UID no localStorage para getUserId() e getParticipantId().
      // osl_auth_uid é a chave que garante que o UID usado no Firestore bate com
      // request.auth.uid nas regras de segurança.
      localStorage.setItem("osl_auth_uid", user.uid);
      resolve(user);
    } else {
      signInAnonymously(auth)
        .then(c => {
          if (c.user?.uid) localStorage.setItem("osl_auth_uid", c.user.uid);
          return c.user;
        })
        .catch(() => null)
        .then(resolve);
    }
  });
});

// Popula state com as referências Firebase após inicialização
function initFirebaseRefs() {
  S.db   = db;
  S.auth = auth;

  const { roomCode, userId, participantId } = S;

  S.userRef              = doc(db, "users", userId);
  S.roomRef              = doc(db, "salas", roomCode);
  S.playerRef            = doc(db, "salas", roomCode, "players", participantId);
  S.messagesRef          = collection(db, "salas", roomCode, "messages");
  S.ritualRef            = doc(db, "salas", roomCode, "ritual", "state");
  S.ritualHistoryRef     = collection(db, "salas", roomCode, "ritual", "state", "history");
  S.typingRef            = doc(db, "salas", roomCode, "typing", participantId);
  S.typingCollectionRef  = collection(db, "salas", roomCode, "typing");
  S.playersCollectionRef = collection(db, "salas", roomCode, "players");
}

export {
  db, auth, _authReady,
  initFirebaseRefs,
  // Firestore functions re-exportadas para que os módulos não precisem importar CDN diretamente
  doc, getDoc, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, where, limit, orderBy,
  serverTimestamp, increment, runTransaction, onAuthStateChanged, updateProfile, signOut
};
