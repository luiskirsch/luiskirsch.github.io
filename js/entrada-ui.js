const modalBack    = document.getElementById("modalBack");
const btnRitual    = document.getElementById("btnRitual");
const btnClose     = document.getElementById("btnClose");
const scene        = document.getElementById("scene");
const statusEl     = document.getElementById("status");

const nomeJogadorEl = document.getElementById("nomeJogador");
const nomeSalaEl    = document.getElementById("nomeSala");
const codigoSalaEl  = document.getElementById("codigoSala");

const btnCriarSala  = document.getElementById("btnCriarSala");
const btnEntrarSala = document.getElementById("btnEntrarSala");

btnRitual.addEventListener("click", () => {
  modalBack.style.display = "flex";
});

btnClose.addEventListener("click", () => {
  modalBack.style.display = "none";
});

modalBack.addEventListener("click", (e) => {
  if (e.target === modalBack) modalBack.style.display = "none";
});

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.classList.remove("ok", "err");
  if (type) statusEl.classList.add(type);
}

function normalizarCodigoSala(valor) {
  return valor
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 20);
}

function gerarCodigoSala() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return "SL-" + n;
}

function gerarPlayerId() {
  return "player-" + Math.random().toString(36).slice(2, 10);
}

function obterNomeJogador() {
  return nomeJogadorEl.value.trim().slice(0, 40);
}

function obterNomeSala() {
  return nomeSalaEl.value.trim().slice(0, 40);
}

async function entrarNaSala({ nomeJogador, codigoSala, nomeSala }) {
  localStorage.setItem("osl_nome", nomeJogador);
  localStorage.setItem("osl_sala", codigoSala);
  localStorage.setItem("osl_nome_sala", nomeSala);

  sessionStorage.setItem("osl_room_id", codigoSala);
  sessionStorage.setItem("osl_player_name", nomeJogador);

  let playerId = sessionStorage.getItem("osl_player_id");
  if (!playerId) {
    playerId = localStorage.getItem("osl_player_id") || gerarPlayerId();
    localStorage.setItem("osl_player_id", playerId);
    sessionStorage.setItem("osl_player_id", playerId);
  }

  // A sala cria/valida o membership somente depois que o Firebase restaurou a
  // identidade. O bridge antigo tentava registrar antes disso e podia gerar
  // uma segunda identidade ou falar com o servidor obsoleto.

  const url = new URL("./sala.html", window.location.href);
  url.searchParams.set("nome", nomeJogador);
  url.searchParams.set("sala", codigoSala);
  url.searchParams.set("nomeSala", nomeSala);

  setStatus("Entrando na sala…", "ok");
  scene.classList.add("fadeOut");

  setTimeout(() => {
    window.location.href = url.toString();
  }, 560);
}

btnCriarSala.addEventListener("click", async () => {
  const nomeJogador = obterNomeJogador();
  if (!nomeJogador) {
    setStatus("Digite seu nome para criar a sala.", "err");
    nomeJogadorEl.focus();
    return;
  }

  let nomeSala = obterNomeSala();
  if (!nomeSala) nomeSala = "Sala de Espera";

  let codigoSala = normalizarCodigoSala(codigoSalaEl.value);
  if (!codigoSala) {
    codigoSala = gerarCodigoSala();
    codigoSalaEl.value = codigoSala;
  }

  // Verificar se o código já está em uso
  setStatus("Verificando código…", "");
  btnCriarSala.disabled = true;
  try {
    const disponivel = await window.verificarCodigoDisponivel(codigoSala);
    if (!disponivel) {
      const sugestao = gerarCodigoSala();
      codigoSalaEl.value = sugestao;
      setStatus(`Código já em uso. Sugestão: ${sugestao}`, "err");
      btnCriarSala.disabled = false;
      return;
    }
  } catch (err) {
    setStatus("Erro ao verificar código: " + (err?.message || err), "err");
    btnCriarSala.disabled = false;
    return;
  }
  btnCriarSala.disabled = false;

  await entrarNaSala({ nomeJogador, codigoSala, nomeSala });
});

btnEntrarSala.addEventListener("click", async () => {
  const nomeJogador = obterNomeJogador();
  const codigoSala  = normalizarCodigoSala(codigoSalaEl.value);
  const nomeSala    = obterNomeSala();

  if (!nomeJogador) {
    setStatus("Digite seu nome para entrar na sala.", "err");
    nomeJogadorEl.focus();
    return;
  }

  if (!codigoSala) {
    setStatus("Digite o código da sala.", "err");
    codigoSalaEl.focus();
    return;
  }

  if (!nomeSala) {
    setStatus("Digite o nome da sala para entrar.", "err");
    nomeSalaEl.focus();
    return;
  }

  codigoSalaEl.value = codigoSala;
  setStatus("Verificando sala…", "");
  btnEntrarSala.disabled = true;

  try {
    const resultado = await window.validarEntradaSala(codigoSala, nomeSala);
    if (!resultado.ok) {
      setStatus(resultado.erro, "err");
      btnEntrarSala.disabled = false;
      return;
    }
    await entrarNaSala({ nomeJogador, codigoSala, nomeSala: resultado.nomeSala });
  } catch (err) {
    console.error(err);
    setStatus("Erro ao verificar a sala. Tente novamente.", "err");
    btnEntrarSala.disabled = false;
  }
});

window.addEventListener("pageshow", () => {
  scene.classList.remove("fadeOut");
});

// ── Reconnect banner ──────────────────────────────────────────────────────────
(async function initReconnectBanner() {
  const banner    = document.getElementById("reconnectBanner");
  const codeEl    = document.getElementById("reconnectRoomCode");
  const retakeBtn = document.getElementById("reconnectBtn");
  const dismissBtn= document.getElementById("reconnectDismiss");
  if (!banner || !retakeBtn || !dismissBtn) return;

  let sess = null;
  try { sess = await window.checkActiveSession?.(); } catch (_) {}
  if (!sess) return;

  if (codeEl) codeEl.textContent = sess.roomCode;
  banner.style.display = "flex";

  retakeBtn.addEventListener("click", () => {
    const nome     = localStorage.getItem("osl_nome")      || "Jogador";
    const nomeSala = localStorage.getItem("osl_nome_sala") || "Sala";
    localStorage.setItem("osl_reconnect_flag", "1"); // Phase 3: suprime flash do lobby
    const url = new URL("./sala.html", window.location.href);
    url.searchParams.set("sala",     sess.roomCode);
    url.searchParams.set("nome",     nome);
    url.searchParams.set("nomeSala", nomeSala);
    window.location.href = url.toString();
  });

  dismissBtn.addEventListener("click", () => { banner.style.display = "none"; });
})();
