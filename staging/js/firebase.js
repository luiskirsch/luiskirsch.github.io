// Game-runtime Firebase wrapper. Imports the shared app from firebase-app.js
// and re-exports the Firestore/auth functions used across the room modules.

import { db, auth } from "./firebase-app.js";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, addDoc, onSnapshot, query, where, limit, orderBy,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { S } from "./state.js";

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
