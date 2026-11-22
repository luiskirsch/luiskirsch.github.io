/* Lobby: os jogadores da sala sentados à mesa da cabana 3D, cada um com o próprio avatar.
 *
 * A cabana é a cena Godot no iframe de cena.preludiojogos.com.br (js/lobby-cena3d.js). Aqui:
 * a lista de jogadores (evento "osl:players" disparado por js/ui/room.js a cada mudança) + o avatar
 * salvo na conta de cada um (users/{userId}.avatar, criado em avatar.html) acompanhado por
 * onSnapshot — quem salvar um avatar novo aparece na mesa de todos na hora. A cena recebe
 * {cabana: 'jogadores', lista: [{id, nome, voce, avatar}]}; quem não tem avatar ganha um padrão
 * (fixo por pessoa) lá dentro (sextolugar-godot: scripts/avatar/mesa_avatares.gd).
 */
import { S } from "./state.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ORIGEM = "https://cena.preludiojogos.com.br";
const LUGARES = 6;

let jogadores = Array.isArray(S.currentPlayers) ? S.currentPlayers : [];
const avatares = new Map();   // userId → avatar (objeto) ou null
const ouvintes = new Map();   // userId → cancelar onSnapshot
let agendado = 0;

function frameCena() {
  return document.querySelector("iframe.lobbyViewer__cena");
}

function enviar() {
  agendado = 0;
  const f = frameCena();
  if (!f || !f.contentWindow) return;
  const lista = jogadores.slice(0, LUGARES).map((p) => ({
    id: String(p.id || "").slice(0, 64),
    nome: String(p.name || "").slice(0, 40),
    voce: p.id === S.participantId,
    avatar: p.userId ? (avatares.get(p.userId) || null) : null,
  })).filter((p) => p.id);
  f.contentWindow.postMessage({ cabana: "jogadores", lista }, ORIGEM);
}

function agendar() {
  if (!agendado) agendado = setTimeout(enviar, 120);
}

function acompanhar(uid) {
  if (!uid || ouvintes.has(uid) || !S.db) return;
  const cancelar = onSnapshot(doc(S.db, "users", uid), (snap) => {
    const a = snap.exists() ? snap.data().avatar : null;
    avatares.set(uid, a && typeof a === "object" && !Array.isArray(a) ? a : null);
    agendar();
  }, () => {
    avatares.set(uid, null);
    agendar();
  });
  ouvintes.set(uid, cancelar);
}

function atualizar(lista) {
  jogadores = Array.isArray(lista) ? lista : [];
  const ativos = new Set(jogadores.map((p) => p.userId).filter(Boolean));
  for (const [uid, cancelar] of ouvintes) {
    if (!ativos.has(uid)) {
      cancelar();
      ouvintes.delete(uid);
      avatares.delete(uid);
    }
  }
  ativos.forEach(acompanhar);
  agendar();
}

document.addEventListener("osl:players", (e) => atualizar(e.detail));

// a cena carregou (ou recarregou) e pede a lista
window.addEventListener("message", (e) => {
  if (e.origin !== ORIGEM || !e.data) return;
  if (e.data.cabana === "pronta" || e.data.cabana === "quer-jogadores") agendar();
});

if (jogadores.length) atualizar(jogadores);
