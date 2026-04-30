// Modal de configuração e controle de transmissão ao vivo (RTMP)
// Phase 2.A: multi-plataforma simultâneo. Backend manda todas URLs num único egress.
(function () {
  'use strict';

  const STREAM_BASE = window.PANEL_SERVER_BASE || "https://osl-video-server-production.up.railway.app";
  const roomCode = (new URLSearchParams(window.location.search)).get("sala") || localStorage.getItem("osl_sala") || "SL-0001";

  // Catálogo de plataformas suportadas. Ordem aqui = ordem na UI.
  const PLATFORMS = [
    { id: "youtube",  name: "YouTube",       icon: "▶️", hint: "YouTube Studio → Transmitir Ao Vivo → Chave de Transmissão" },
    { id: "twitch",   name: "Twitch",        icon: "🟣", hint: "Twitch Dashboard → Configurações → Transmissão → Chave Principal" },
    { id: "facebook", name: "Facebook Live", icon: "🔵", hint: "Facebook Live Producer → Stream Key (Persistent recomendado)" },
    { id: "kick",     name: "Kick",          icon: "🟢", hint: "Kick → Settings → Stream Key" },
    { id: "tiktok",   name: "TikTok",        icon: "⚫", hint: "⚠️ Requer Live aprovado pela TikTok. Cole a URL completa começando com rtmp://" },
    { id: "custom",   name: "RTMP Custom",   icon: "⚙️", hint: "Cole a URL RTMP completa (ex: rtmp://servidor.com/app/sua-key)" }
  ];

  let liveActive = false, livePollTimer = null, liveStartedAt = 0, liveActivePlatforms = [];
  let liveSelectedLayout = "cards";

  const liveBtn        = document.getElementById("liveBtn");
  const liveOverlay    = document.getElementById("liveOverlay");
  const liveStep1      = document.getElementById("liveStep1");
  const liveStep2      = document.getElementById("liveStep2");
  const livePlatformList = document.getElementById("livePlatformList");
  const liveLayoutGrid = document.getElementById("liveLayoutGrid");
  const liveStartBtn   = document.getElementById("liveStartBtn");
  const liveCancelBtn  = document.getElementById("liveCancelBtn");
  const liveStopBtn    = document.getElementById("liveStopBtn");
  const liveDuration   = document.getElementById("liveDuration");
  const livePlatformsActive = document.getElementById("livePlatformsActive");
  const liveValidationHint = document.getElementById("liveValidationHint");

  // --- Render dos cards de plataforma ---

  function renderPlatformCards() {
    if (!livePlatformList) return;
    livePlatformList.innerHTML = PLATFORMS.map(p => `
      <div class="livePlatformCard" data-platform="${p.id}">
        <label class="livePlatformCard__head">
          <span class="livePlatformCard__icon">${p.icon}</span>
          <span class="livePlatformCard__name">${p.name}</span>
          <input type="checkbox" class="livePlatformCard__toggle" id="livePlat_${p.id}">
        </label>
        <div class="livePlatformCard__body">
          <input type="password" class="livePlatformCard__key" data-platform="${p.id}"
                 placeholder="${p.id === 'tiktok' || p.id === 'custom' ? 'rtmp://...' : 'Cole sua Stream Key'}"
                 autocomplete="off" spellcheck="false">
          <div class="livePlatformCard__hint">${p.hint}</div>
        </div>
      </div>
    `).join("");

    // Wire toggles → expand/collapse + style
    livePlatformList.querySelectorAll(".livePlatformCard__toggle").forEach(toggle => {
      toggle.addEventListener("change", e => {
        const card = e.target.closest(".livePlatformCard");
        card.classList.toggle("is-on", e.target.checked);
        if (e.target.checked) {
          // Foca no input quando abre
          setTimeout(() => card.querySelector(".livePlatformCard__key")?.focus(), 100);
        }
        clearValidationHint();
      });
    });

    // Limpa hint quando usuário digita
    livePlatformList.querySelectorAll(".livePlatformCard__key").forEach(k => {
      k.addEventListener("input", clearValidationHint);
    });
  }

  // Wire seletor de layout
  function bindLayoutSelector() {
    if (!liveLayoutGrid) return;
    liveLayoutGrid.querySelectorAll(".liveLayoutBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        liveLayoutGrid.querySelectorAll(".liveLayoutBtn").forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        liveSelectedLayout = btn.dataset.layout || "cards";
      });
    });
  }

  function clearValidationHint() {
    if (liveValidationHint) liveValidationHint.textContent = "";
  }

  function setValidationHint(msg) {
    if (liveValidationHint) {
      liveValidationHint.textContent = msg;
      liveValidationHint.style.color = "#ff8a8a";
    }
  }

  // --- Coleta plataformas habilitadas com key preenchida ---

  function getEnabledPlatforms() {
    const result = [];
    for (const p of PLATFORMS) {
      const toggle = document.getElementById(`livePlat_${p.id}`);
      const keyInput = livePlatformList?.querySelector(`.livePlatformCard__key[data-platform="${p.id}"]`);
      if (!toggle?.checked) continue;
      const streamKey = (keyInput?.value || "").trim();
      if (!streamKey) continue;
      result.push({ name: p.id, streamKey });
    }
    return result;
  }

  // --- UI estado ativo/inativo ---

  function platformLabels(platforms) {
    return platforms
      .map(p => PLATFORMS.find(x => x.id === p.name)?.name || p.name)
      .join(", ");
  }

  function showLiveActive(platforms, startedAt) {
    liveActive = true;
    liveActivePlatforms = platforms || [];
    liveStartedAt = startedAt || Date.now();
    if (liveBtn) {
      liveBtn.classList.add("is-live");
      liveBtn.textContent = "🔴 Ao vivo";
      liveBtn.title = "Clique para parar a transmissão";
    }
    if (liveStep1) liveStep1.style.display = "none";
    if (liveStep2) liveStep2.style.display = "block";
    if (livePlatformsActive) livePlatformsActive.textContent = platformLabels(liveActivePlatforms) || "—";
    startDurationTicker();
  }

  function showLiveInactive() {
    liveActive = false;
    liveActivePlatforms = [];
    liveStartedAt = 0;
    if (liveBtn) {
      liveBtn.classList.remove("is-live");
      liveBtn.textContent = "🔴 Live";
      liveBtn.title = "Iniciar transmissão ao vivo";
    }
    if (liveStep1) liveStep1.style.display = "block";
    if (liveStep2) liveStep2.style.display = "none";
    stopDurationTicker();
  }

  function fmtDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  }

  function startDurationTicker() {
    stopDurationTicker();
    livePollTimer = setInterval(() => {
      if (liveDuration && liveActive) liveDuration.textContent = fmtDuration(Date.now() - liveStartedAt);
    }, 1000);
  }

  function stopDurationTicker() {
    if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
  }

  // --- Start/Stop ---

  async function startLive() {
    const platforms = getEnabledPlatforms();
    if (!platforms.length) {
      setValidationHint("Marque pelo menos uma plataforma e cole a Stream Key.");
      return;
    }

    liveStartBtn.disabled = true;
    liveStartBtn.textContent = "Iniciando...";
    clearValidationHint();

    try {
      const res = await fetch(STREAM_BASE + "/streaming/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomCode, platforms, layoutId: liveSelectedLayout })
      });
      const data = await res.json();
      if (data.ok) {
        // Limpa keys do form pra não ficarem em memória
        livePlatformList?.querySelectorAll(".livePlatformCard__key").forEach(k => k.value = "");
        showLiveActive(platforms, data.startedAt);
      } else {
        setValidationHint("Erro: " + (data.error || "desconhecido"));
        liveStartBtn.disabled = false;
        liveStartBtn.textContent = "🔴 Iniciar Live";
      }
    } catch (err) {
      setValidationHint("Erro de conexão: " + err.message);
      liveStartBtn.disabled = false;
      liveStartBtn.textContent = "🔴 Iniciar Live";
    }
  }

  async function stopLive() {
    if (!liveActive) return;
    if (!confirm("Parar a transmissão ao vivo em todas as plataformas?")) return;
    try {
      await fetch(STREAM_BASE + "/streaming/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomCode })
      });
    } catch (_) {}
    showLiveInactive();
    if (liveStartBtn) { liveStartBtn.disabled = false; liveStartBtn.textContent = "🔴 Iniciar Live"; }
    if (liveOverlay) liveOverlay.classList.remove("open");
  }

  // --- Bindings ---

  function openModal()  { if (liveOverlay) liveOverlay.classList.add("open"); }
  function closeModal() { if (liveOverlay) liveOverlay.classList.remove("open"); }

  if (liveBtn) {
    liveBtn.addEventListener("click", () => {
      if (liveActive) stopLive();
      else openModal();
    });
  }

  if (liveStartBtn)  liveStartBtn.addEventListener("click", startLive);
  if (liveStopBtn)   liveStopBtn.addEventListener("click", stopLive);
  if (liveCancelBtn) liveCancelBtn.addEventListener("click", closeModal);
  if (liveOverlay)   liveOverlay.addEventListener("click", e => { if (e.target === liveOverlay) closeModal(); });

  // Status check ao carregar página (caso já tenha stream rolando)
  (async function () {
    try {
      const r = await fetch(STREAM_BASE + "/streaming/status/" + encodeURIComponent(roomCode));
      const d = await r.json();
      if (d.active) showLiveActive(d.platforms || [], d.startedAt);
    } catch (_) {}
  })();

  renderPlatformCards();
  bindLayoutSelector();
})();
