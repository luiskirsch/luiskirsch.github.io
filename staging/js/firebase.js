import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, where, limit, orderBy,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
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
  db, auth,
  initFirebaseRefs,
  // Firestore functions re-exportadas para que os módulos não precisem importar CDN diretamente
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, where, limit, orderBy,
  serverTimestamp, increment, onAuthStateChanged
};
