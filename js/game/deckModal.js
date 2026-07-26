import { S } from "../state.js";
import { getDocs, updateDoc, collection } from "../firebase.js";

export async function showDeckModal() {
  const overlay = document.createElement("div");
  overlay.className = "deckModalOverlay";

  const loading = `<div class="deckModal__loading">Carregando seus decks…</div>`;

  overlay.innerHTML = `
    <div class="deckModal" role="dialog" aria-modal="true" aria-label="Selecionar deck">
      <div class="deckModal__header">
        <span class="deckModal__title">🃏 Deck</span>
        <button class="deckModal__close" aria-label="Fechar">✕</button>
      </div>
      <div class="deckModal__body" id="deckModalBody">${loading}</div>
      <div class="deckModal__footer">
        <a class="deckModal__editBtn" href="deck-builder.html" target="_blank" rel="noopener">
          ✏️ Editar decks
        </a>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));

  function close() {
    overlay.classList.add("closing");
    overlay.addEventListener("animationend", () => overlay.remove(), { once: true });
  }

  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  overlay.querySelector(".deckModal__close").addEventListener("click", close);

  // Carrega decks do Firestore
  try {
    const uid = S.userId;
    if (!uid || !S.db) throw new Error("not_authed");

    const snap = await getDocs(collection(S.db, "users", uid, "decks"));
    const decks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Descobre qual deck está ativo para este jogador
    const myPlayer = S.currentPlayers?.find(p => p.userId === uid);
    const activeId = myPlayer?.activeDeckId || null;

    renderDecks(decks, activeId);
  } catch (_) {
    renderDecks([], null);
  }

  function renderDecks(decks, activeId) {
    const body = document.getElementById("deckModalBody");
    if (!body) return;

    const standardActive = !activeId;
    const standardClass  = standardActive ? " deckModal__deck--active" : "";

    const standardCard = `
      <div class="deckModal__deck${standardClass}" data-deck-id="">
        <div class="deckModal__deckIcon">🎴</div>
        <div class="deckModal__deckInfo">
          <div class="deckModal__deckName">Deck Padrão</div>
          <div class="deckModal__deckCount">Cartas básicas + packs desbloqueados</div>
        </div>
        ${standardActive ? `<span class="deckModal__activeBadge">✓ Ativo</span>` : ""}
      </div>`;

    const customCards = decks.map(d => {
      const isActive = d.id === activeId;
      return `
        <div class="deckModal__deck${isActive ? " deckModal__deck--active" : ""}" data-deck-id="${d.id}">
          <div class="deckModal__deckIcon">🃏</div>
          <div class="deckModal__deckInfo">
            <div class="deckModal__deckName">${d.name || "Sem nome"}</div>
            <div class="deckModal__deckCount">${(d.cards || []).length} carta(s)</div>
          </div>
          ${isActive ? `<span class="deckModal__activeBadge">✓ Ativo</span>` : ""}
        </div>`;
    }).join("");

    const emptyNote = decks.length === 0
      ? `<p class="deckModal__emptyNote">Você ainda não criou nenhum deck personalizado.<br>Clique em <strong>Editar decks</strong> para começar.</p>`
      : "";

    body.innerHTML = `
      <p class="deckModal__hint">Selecione o deck que você levará para o ritual.</p>
      ${standardCard}
      ${customCards}
      ${emptyNote}`;

    body.querySelectorAll(".deckModal__deck").forEach(el => {
      el.addEventListener("click", () => activateDeck(el.dataset.deckId, decks, body));
    });
  }

  async function activateDeck(deckId, decks, body) {
    if (!S.playerRef) return;
    try {
      await updateDoc(S.playerRef, { activeDeckId: deckId || null });
      // Rerender com novo activeId
      renderDecks(decks, deckId || null);
    } catch (err) {
      console.error("deckModal activateDeck:", err);
    }
  }
}
