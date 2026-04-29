// Modal de configuração e controle de transmissão ao vivo (RTMP)
// Phase 1: 1 plataforma por sessão. Backend já suporta múltiplas — UI evolui em Phase 2.
(function () {
  'use strict';

  const STREAM_BASE = window.PANEL_SERVER_BASE || "https://osl-video-server-production.up.railway.app";
  const roomCode = (new URLSearchParams(window.location.search)).get("sala") || localStorage.getItem("osl_sala") || "SL-0001";

  let liveActive = false, livePollTimer = null, liveStartedAt = 0, livePlatformName = "";

  const liveBtn        = document.getElementById("liveBtn");
  const liveOverlay    = document.getElementById("liveOverlay");
  const liveStep1      = document.getElementById("liveStep1");
  const liveStep2      = document.getElementById("liveStep2");
  const livePlatform   = document.getElementById("livePlatform");
  const liveKeyHint    = document.getElementById("liveKeyHint");
  const liveKey        = document.getElementById("liveKey");
  const liveStartBtn   = document.getElementById("liveStartBtn");
  const liveCancelBtn  = document.getElementById("liveCancelBtn");
  const liveStopBtn    = document.getElementById("liveStopBtn");
  const liveStatusEl   = document.getElementById("liveStatus");
  const liveDuration   = document.getElementById("liveDuration");
  const livePlatformActive = document.getElementById("livePlatformActive");

  const PLATFORM_HINTS = {
    youtube:  "YouTube Studio → Transmitir ao Vivo → Stream Key (não compartilhe!)",
    twitch:   "Twitch → Settings → Stream → Primary Stream key",
    facebook: "Facebook → Live Producer → Stream Key (Persistent Stream Key recomendado)",
    kick:     "Kick → Settings → Stream Key",
    tiktok:   "⚠️ TikTok exige conta com Live aprovado (1000+ seguidores). Cole a URL completa começando com rtmp://",
    custom:   "Cole a URL RTMP completa (ex: rtmp://servidor.com/app/sua-key)"
  };

  const PLATFORM_LABELS = {
    youtube: "YouTube", twitch: "Twitch", facebook: "Facebook Live",
    kick: "Kick", tiktok: "TikTok", custom: "RTMP Custom"
  };

  function openModal()  { if (liveOverlay) liveOverlay.classList.add("open"); }
  function closeModal() { if (liveOverlay) liveOverlay.classList.remove("open"); }

  function setHint() {
    if (liveKeyHint && livePlatform) liveKeyHint.textContent = PLATFORM_HINTS[livePlatform.value] || "";
    if (liveKey) {
      const isCustom = livePlatform?.value === "custom" || livePlatform?.value === "tiktok";
      liveKey.placeholder = isCustom ? "rtmp://..." : "Cole sua Stream Key";
    }
  }

  function showLiveActive(platformName, startedAt) {
    liveActive = true;
    livePlatformName = platformName;
    liveStartedAt = startedAt || Date.now();
    if (liveBtn) {
      liveBtn.classList.add("is-live");
      liveBtn.textContent = "🔴 Ao vivo";
      liveBtn.title = "Clique para parar a transmissão";
    }
    if (liveStep1) liveStep1.style.display = "none";
    if (liveStep2) liveStep2.style.display = "block";
    if (livePlatformActive) livePlatformActive.textContent = PLATFORM_LABELS[platformName] || platformName;
    startDurationTicker();
  }

  function showLiveInactive() {
    liveActive = false;
    livePlatformName = "";
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

  async function startLive() {
    const platform = livePlatform?.value;
    const streamKey = (liveKey?.value || "").trim();
    if (!platform)  { alert("Escolha uma plataforma."); return; }
    if (!streamKey) { alert("Cole sua Stream Key."); return; }

    liveStartBtn.disabled = true;
    liveStartBtn.textContent = "Iniciando...";

    try {
      const res = await fetch(STREAM_BASE + "/streaming/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomCode,
          platforms: [{ name: platform, streamKey }]
        })
      });
      const data = await res.json();
      if (data.ok) {
        if (liveKey) liveKey.value = ""; // limpa key da memória do form
        showLiveActive(platform, data.startedAt);
      } else {
        alert("Erro ao iniciar: " + (data.error || "desconhecido"));
        liveStartBtn.disabled = false;
        liveStartBtn.textContent = "🔴 Iniciar Live";
      }
    } catch (err) {
      alert("Erro de conexão: " + err.message);
      liveStartBtn.disabled = false;
      liveStartBtn.textContent = "🔴 Iniciar Live";
    }
  }

  async function stopLive() {
    if (!liveActive) return;
    if (!confirm("Parar a transmissão ao vivo?")) return;
    try {
      await fetch(STREAM_BASE + "/streaming/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomCode })
      });
    } catch (_) {}
    showLiveInactive();
    if (liveStartBtn) { liveStartBtn.disabled = false; liveStartBtn.textContent = "🔴 Iniciar Live"; }
    closeModal();
  }

  // --- Bindings ---

  if (liveBtn) {
    liveBtn.addEventListener("click", () => {
      if (liveActive) stopLive();
      else openModal();
    });
  }

  if (livePlatform) livePlatform.addEventListener("change", setHint);
  if (liveStartBtn) liveStartBtn.addEventListener("click", startLive);
  if (liveStopBtn)  liveStopBtn.addEventListener("click", stopLive);
  if (liveCancelBtn) liveCancelBtn.addEventListener("click", closeModal);
  if (liveOverlay)   liveOverlay.addEventListener("click", e => { if (e.target === liveOverlay) closeModal(); });

  // Status check ao carregar página (caso já tenha stream rolando)
  (async function () {
    try {
      const r = await fetch(STREAM_BASE + "/streaming/status/" + encodeURIComponent(roomCode));
      const d = await r.json();
      if (d.active) {
        const platformName = d.platforms?.[0]?.name || "youtube";
        showLiveActive(platformName, d.startedAt);
      }
    } catch (_) {}
  })();

  setHint();
})();
