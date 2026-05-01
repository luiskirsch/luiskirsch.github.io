// Modal de configuração e controle de transmissão ao vivo (RTMP)
// Phase 2.A: multi-plataforma simultâneo. Backend manda todas URLs num único egress.
(function () {
  'use strict';

  const STREAM_BASE = window.PANEL_SERVER_BASE || "https://osl-video-server-production.up.railway.app";
  const roomCode = (new URLSearchParams(window.location.search)).get("sala") || localStorage.getItem("osl_sala") || "SL-0001";

  // Catálogo de plataformas suportadas. Ordem aqui = ordem na UI.
  const PLATFORMS = [
    {
      id: "youtube", name: "YouTube", icon: "▶️",
      hint: "YouTube Studio → Transmitir Ao Vivo → Chave de Transmissão",
      tutorialUrl: "https://studio.youtube.com",
      tutorialSteps: [
        "Clique em \"Abrir YouTube Studio\" abaixo",
        "Lateral esquerda: \"Criar\" → \"Transmitir Ao Vivo\"",
        "Em \"Configurações de Transmissão\" → copie a \"Chave de Transmissão\"",
        "Cole aqui no campo acima"
      ]
    },
    {
      id: "twitch", name: "Twitch", icon: "🟣",
      hint: "Twitch Dashboard → Configurações → Transmissão → Chave Principal",
      tutorialUrl: "https://dashboard.twitch.tv/settings/stream",
      tutorialSteps: [
        "Clique em \"Abrir Twitch Dashboard\" abaixo",
        "Procure por \"Chave de Transmissão Principal\"",
        "Clique em \"Copiar\" (não precisa apertar \"Mostrar\")",
        "Cole aqui no campo acima"
      ]
    },
    {
      id: "facebook", name: "Facebook Live", icon: "🔵",
      hint: "Facebook Live Producer → Stream Key (Persistent recomendado)",
      tutorialUrl: "https://www.facebook.com/live/producer",
      tutorialSteps: [
        "Clique em \"Abrir Facebook Live Producer\" abaixo",
        "Em \"Configurações da live\" selecione \"Usar Stream Key\"",
        "Use \"Persistent Stream Key\" se quiser a mesma chave em várias lives",
        "Copie a key e cole aqui no campo acima"
      ]
    },
    {
      id: "kick", name: "Kick", icon: "🟢",
      hint: "Kick → Settings → Stream Key",
      tutorialUrl: "https://kick.com/dashboard/settings/stream",
      tutorialSteps: [
        "Clique em \"Abrir Kick Dashboard\" abaixo",
        "Em \"Stream Key\" → copie o código",
        "Cole aqui no campo acima"
      ]
    },
    {
      id: "tiktok", name: "TikTok", icon: "⚫",
      hint: "⚠️ Requer Live aprovado pela TikTok. Cole a URL completa começando com rtmp://",
      tutorialUrl: "https://livecenter.tiktok.com/",
      tutorialSteps: [
        "⚠️ Requer aprovação prévia da TikTok (geralmente conta com 1000+ seguidores)",
        "Clique em \"Abrir TikTok Live Studio\" abaixo",
        "Inicie uma Live escolhendo \"RTMP\" como fonte de transmissão",
        "TikTok gera uma URL completa começando com rtmp://...",
        "Cole a URL completa aqui (não só a key)"
      ]
    },
    {
      id: "custom", name: "RTMP Custom", icon: "⚙️",
      hint: "Cole a URL RTMP completa (ex: rtmp://servidor.com/app/sua-key)",
      tutorialUrl: "",
      tutorialSteps: [
        "Use pra Restream, servidor próprio ou outras plataformas com RTMP",
        "Cole a URL RTMP completa que a plataforma forneceu",
        "Formato esperado: rtmp://servidor.com/app/sua-chave"
      ]
    }
  ];

  let liveActive = false, livePollTimer = null, liveStartedAt = 0, liveActivePlatforms = [];
  let liveSelectedLayout = "cards";

  function userEmail() {
    return (localStorage.getItem("osl_license_email") || localStorage.getItem("osl_checkout_email") || "").trim().toLowerCase();
  }

  // Security #2: chamadas autenticadas via Firebase ID token. As 4 rotas de
  // stats/history/pass/usage agora exigem token. Sem usuário Firebase logado,
  // retorna fetch sem header — o backend devolve 401 e a UI trata.
  async function authFetch(url, opts = {}) {
    const token = window._oslGetIdToken ? await window._oslGetIdToken() : null;
    const headers = Object.assign({}, opts.headers || {});
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  }

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
  const liveStatusBanner = document.getElementById("liveStatusBanner");
  const liveUpgradeBtn   = document.getElementById("liveUpgradeBtn");

  // --- Render dos cards de plataforma ---

  function renderPlatformCards() {
    if (!livePlatformList) return;
    livePlatformList.innerHTML = PLATFORMS.map(p => {
      const stepsHtml = p.tutorialSteps.map(s => `<li>${s}</li>`).join("");
      const openBtn = p.tutorialUrl
        ? `<a href="${p.tutorialUrl}" target="_blank" rel="noopener" class="livePlatformCard__open">Abrir ${p.name} ↗</a>`
        : "";
      return `
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
          <details class="livePlatformCard__tutorial">
            <summary>ℹ️ Como pegar a Stream Key?</summary>
            <ol>${stepsHtml}</ol>
            ${openBtn}
          </details>
        </div>
      </div>
    `;
    }).join("");

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
    const email = userEmail();
    if (!email) {
      setValidationHint("Faça login com sua licença antes de transmitir.");
      return;
    }

    liveStartBtn.disabled = true;
    liveStartBtn.textContent = "Iniciando...";
    clearValidationHint();

    try {
      const res = await authFetch(STREAM_BASE + "/streaming/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomCode, platforms, layoutId: liveSelectedLayout })
      });
      const data = await res.json();
      if (data.ok) {
        livePlatformList?.querySelectorAll(".livePlatformCard__key").forEach(k => k.value = "");
        showLiveActive(platforms, data.startedAt);
      } else {
        const msg = errorMessage(data);
        setValidationHint(msg);
        liveStartBtn.disabled = false;
        liveStartBtn.textContent = "🔴 Iniciar Live";
        if (data.error === "QUOTA_DIARIA_ESGOTADA") {
          showBuyPassCta();
        }
      }
    } catch (err) {
      setValidationHint("Erro de conexão: " + err.message);
      liveStartBtn.disabled = false;
      liveStartBtn.textContent = "🔴 Iniciar Live";
    }
  }

  function errorMessage(data) {
    switch (data.error) {
      case "SALA_LIVEKIT_VAZIA":      return "Pra POV ou Grid, ative Câmera ou Mic primeiro. Cards funciona mesmo sem vídeo.";
      case "QUOTA_DIARIA_ESGOTADA":   return `Quota gratuita de hoje esgotada (60 min/dia). Compre o Stream Pass mensal pra streamar sem limite.`;
      case "EMAIL_OBRIGATORIO":       return "Faça login com sua licença antes de transmitir.";
      case "STREAM_JA_ATIVO":         return "Já existe um stream ativo nesta sala.";
      default:                        return "Erro: " + (data.error || "desconhecido");
    }
  }

  function showBuyPassCta() {
    if (!liveValidationHint) return;
    liveValidationHint.innerHTML += ` <a href="#" id="liveBuyPassLink" style="color:#ffaa66;font-weight:700;text-decoration:underline">Comprar Stream Pass (R$ 14,90/mês)</a>`;
    document.getElementById("liveBuyPassLink")?.addEventListener("click", e => {
      e.preventDefault();
      startUpgrade();
    });
  }

  // --- Status badge: prestige / pass / free tier ---

  function setUpgradeBtnVisible(visible) {
    if (liveUpgradeBtn) liveUpgradeBtn.hidden = !visible;
  }

  // --- Phase 4: stats agregados + badge ---

  function fmtTotalMin(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const rem = min % 60;
    return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
  }

  async function fetchStats(email) {
    try {
      const r = await authFetch(STREAM_BASE + "/streaming/stats/" + encodeURIComponent(email));
      return await r.json();
    } catch (_) { return { totalMinutes: 0, totalSessions: 0 }; }
  }

  async function fetchHistory(email) {
    try {
      const r = await authFetch(STREAM_BASE + "/streaming/history/" + encodeURIComponent(email) + "?limit=10");
      const d = await r.json();
      return d.sessions || [];
    } catch (_) { return []; }
  }

  function applyStreamerBadge(totalSessions) {
    const titleEl = document.querySelector(".liveModal-title span");
    if (!titleEl) return;
    const existing = titleEl.querySelector(".liveStreamerBadge");
    if (totalSessions > 0 && !existing) {
      const badge = document.createElement("span");
      badge.className = "liveStreamerBadge";
      badge.textContent = "🎬";
      badge.title = "Streamer ativo";
      badge.style.cssText = "font-size:14px;margin-left:6px;vertical-align:middle";
      titleEl.appendChild(badge);
    } else if (totalSessions === 0 && existing) {
      existing.remove();
    }
  }

  async function renderHistorySection(email) {
    const container = document.getElementById("liveHistorySection");
    if (!container) return;
    const sessions = await fetchHistory(email);
    if (!sessions.length) {
      container.innerHTML = "";
      return;
    }
    const platformLabel = id => PLATFORMS.find(p => p.id === id)?.name || id;
    const rows = sessions.slice(0, 5).map(s => {
      const date = s.endedAt ? new Date(s.endedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
      const dur  = fmtTotalMin(Math.ceil((s.durationMs || 0) / 60000));
      const plats = (s.platforms || []).map(platformLabel).join(", ") || "—";
      return `<li><span class="liveHist__date">${date}</span> · ${dur} · ${plats}</li>`;
    }).join("");
    container.innerHTML = `
      <details class="liveHistory">
        <summary>📊 Histórico (${sessions.length} ${sessions.length === 1 ? "sessão" : "sessões"})</summary>
        <ol>${rows}</ol>
      </details>`;
  }

  async function refreshStatusBanner() {
    if (!liveStatusBanner) return;
    const email = userEmail();
    if (!email) {
      liveStatusBanner.textContent = "Faça login pra ver seu plano de transmissão.";
      liveStatusBanner.className = "liveStatusBanner liveStatusBanner--warn";
      setUpgradeBtnVisible(false);
      return;
    }

    try {
      const passRes = await authFetch(STREAM_BASE + "/streaming/pass/" + encodeURIComponent(email));
      const pass = await passRes.json();
      if (pass.active && pass.type === "prestige") {
        liveStatusBanner.textContent = "✨ Plano Prestige — streaming ilimitado incluído";
        liveStatusBanner.className = "liveStatusBanner liveStatusBanner--gold";
        setUpgradeBtnVisible(false);
        return;
      }
      if (pass.active) {
        const dt = pass.expiresAt ? new Date(pass.expiresAt).toLocaleDateString("pt-BR") : "—";
        liveStatusBanner.textContent = `✓ Stream Pass ativo até ${dt} — sem limite de tempo`;
        liveStatusBanner.className = "liveStatusBanner liveStatusBanner--ok";
        setUpgradeBtnVisible(false);
        return;
      }
      // Sem pass — checa quota free tier
      const usageRes = await authFetch(STREAM_BASE + "/streaming/usage/" + encodeURIComponent(email));
      const usage = await usageRes.json();
      const remaining = usage.remainingMin ?? 60;
      if (remaining > 0) {
        liveStatusBanner.textContent = `Plano gratuito · Restam ${remaining} min de transmissão hoje`;
        liveStatusBanner.className = "liveStatusBanner liveStatusBanner--info";
      } else {
        liveStatusBanner.textContent = "Quota gratuita de hoje esgotada · Compre o Stream Pass (R$ 14,90/mês)";
        liveStatusBanner.className = "liveStatusBanner liveStatusBanner--warn";
      }
      setUpgradeBtnVisible(true);
    } catch (_) {
      liveStatusBanner.textContent = "";
      liveStatusBanner.className = "liveStatusBanner";
      setUpgradeBtnVisible(false);
    }

    // Phase 4: badge de streamer + histórico
    try {
      const stats = await fetchStats(email);
      applyStreamerBadge(stats.totalSessions || 0);
      if (stats.totalMinutes > 0 && liveStatusBanner.textContent) {
        liveStatusBanner.textContent += ` · Total: ${fmtTotalMin(stats.totalMinutes)} (${stats.totalSessions} sessões)`;
      }
      renderHistorySection(email);
    } catch (_) {}
  }

  // --- Fluxo de pagamento (Stream Pass mensal) ---

  let upgradePollTimer = null;

  async function startUpgrade() {
    const email = userEmail();
    if (!email) {
      setValidationHint("Faça login com sua licença antes de comprar.");
      return;
    }
    const nome = (localStorage.getItem("osl_checkout_nome") || localStorage.getItem("osl_nome") || "Jogador").trim();

    if (!liveUpgradeBtn) return;
    liveUpgradeBtn.disabled = true;
    liveUpgradeBtn.textContent = "Iniciando...";
    clearValidationHint();

    try {
      const res = await fetch(STREAM_BASE + "/criar-pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome, email,
          produto: "streaming-mensal",
          valor: 14.90,
          roomId: roomCode
        })
      });
      const data = await res.json();
      if (!data?.ref || !data?.url) {
        setValidationHint("Erro ao criar pagamento: " + (data?.error || data?.message || "desconhecido"));
        liveUpgradeBtn.disabled = false;
        liveUpgradeBtn.textContent = "✨ Upgrade";
        return;
      }

      localStorage.setItem("osl_checkout_email", email);
      if (nome) localStorage.setItem("osl_checkout_nome", nome);

      window.open(data.url, "_blank");
      liveUpgradeBtn.textContent = "⏳ Aguardando…";
      setValidationHint("⏳ Concluindo o pagamento na outra aba… Volta aqui quando terminar.");
      pollUpgrade(data.ref);
    } catch (err) {
      setValidationHint("Erro de conexão: " + err.message);
      liveUpgradeBtn.disabled = false;
      liveUpgradeBtn.textContent = "✨ Upgrade";
    }
  }

  function pollUpgrade(ref) {
    if (upgradePollTimer) clearInterval(upgradePollTimer);
    let attempts = 0;
    upgradePollTimer = setInterval(async () => {
      if (++attempts > 60) { // ~3 min
        clearInterval(upgradePollTimer);
        upgradePollTimer = null;
        setValidationHint("Tempo esgotado. Se já pagou, recarregue a página em alguns segundos.");
        if (liveUpgradeBtn) { liveUpgradeBtn.disabled = false; liveUpgradeBtn.textContent = "✨ Upgrade"; }
        return;
      }
      try {
        const r = await fetch(STREAM_BASE + "/status-pagamento/" + encodeURIComponent(ref));
        const d = await r.json();
        if (d.approved) {
          clearInterval(upgradePollTimer);
          upgradePollTimer = null;
          setValidationHint("");
          if (liveUpgradeBtn) {
            liveUpgradeBtn.disabled = false;
            liveUpgradeBtn.textContent = "✓ Ativado";
          }
          await refreshStatusBanner(); // mostra novo status com pass ativo
        }
      } catch (_) {}
    }, 3000);
  }

  async function stopLive() {
    if (!liveActive) return;
    if (!confirm("Parar a transmissão ao vivo em todas as plataformas?")) return;
    try {
      await authFetch(STREAM_BASE + "/streaming/stop", {
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
      else { openModal(); refreshStatusBanner(); }
    });
  }

  if (liveStartBtn)   liveStartBtn.addEventListener("click", startLive);
  if (liveStopBtn)    liveStopBtn.addEventListener("click", stopLive);
  if (liveCancelBtn)  liveCancelBtn.addEventListener("click", closeModal);
  if (liveUpgradeBtn) liveUpgradeBtn.addEventListener("click", startUpgrade);
  if (liveOverlay)    liveOverlay.addEventListener("click", e => { if (e.target === liveOverlay) closeModal(); });

  // Status check ao carregar página (caso já tenha stream rolando)
  // /streaming/status é público (só retorna info da sala, não cross-user)
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
