// Modais de monetização in-session: carta bloqueada, revelação final, segunda chance, salvar sessão
(function () {
  'use strict';

  const OSL_BASE = "https://osl-video-server-production.up.railway.app";
  const OSL_LOCK_EVERY = 4;
  const OSL_FINAL_CHANCE = 0.20;

  let oslRevealCount = parseInt(sessionStorage.getItem("osl_rev") || "0");
  let oslSaveProduto = null;
  let oslBypassReveal = false;
  let oslBypassLeave = false;

  function oslOpenModal(id) {
    document.getElementById("oslOverlay").classList.add("osl-open");
    document.querySelectorAll(".osl-modal").forEach(function (m) { m.classList.remove("osl-active"); });
    document.getElementById(id).classList.add("osl-active");
  }

  function oslCloseAll() {
    document.getElementById("oslOverlay").classList.remove("osl-open");
    document.querySelectorAll(".osl-modal").forEach(function (m) { m.classList.remove("osl-active"); });
  }

  function oslPrefill(nomeId, emailId) {
    var savedNome  = localStorage.getItem("osl_checkout_nome")  || localStorage.getItem("osl_nome") || "";
    var savedEmail = localStorage.getItem("osl_checkout_email") || "";
    var nEl = document.getElementById(nomeId);
    var eEl = document.getElementById(emailId);
    if (nEl && savedNome  && !nEl.value) nEl.value = savedNome;
    if (eEl && savedEmail && !eEl.value) eEl.value = savedEmail;
  }

  function oslShowFields(fieldsId)  { var el = document.getElementById(fieldsId); if (el) el.classList.add("osl-show"); }
  function oslHideFields(fieldsId)  { var el = document.getElementById(fieldsId); if (el) el.classList.remove("osl-show"); }

  async function oslPay(nome, email, produtoId, valor, statusId, btnEl) {
    var statusEl = document.getElementById(statusId);
    if (btnEl) btnEl.disabled = true;
    if (statusEl) statusEl.textContent = "Criando pagamento...";
    try {
      var res  = await fetch(OSL_BASE + "/criar-pagamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, email, produto: produtoId, valor }) });
      var data = await res.json();
      if (data && data.url) {
        localStorage.setItem("osl_checkout_nome", nome);
        localStorage.setItem("osl_checkout_email", email);
        window.open(data.url, "_blank");
        if (statusEl) statusEl.textContent = "Pagamento aberto em nova aba. Retorne após confirmar.";
        if (btnEl) btnEl.textContent = "✓ Aguardando pagamento";
      } else {
        var msg = (data && (data.message || data.error)) || "Erro ao criar pagamento.";
        if (statusEl) statusEl.textContent = msg;
        if (btnEl) btnEl.disabled = false;
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = "Erro de conexão. Tente novamente.";
      if (btnEl) btnEl.disabled = false;
    }
  }

  function oslValidate(nomeId, emailId, statusId) {
    var nome    = document.getElementById(nomeId).value.trim();
    var email   = document.getElementById(emailId).value.trim().toLowerCase();
    var statusEl = document.getElementById(statusId);
    if (!nome)  { statusEl.textContent = "Digite seu nome."; return null; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { statusEl.textContent = "E-mail inválido."; return null; }
    return { nome, email };
  }

  // ── Modal 1: Carta Bloqueada ──
  var oslLockedPhase = 0;

  function oslShowLocked() {
    oslLockedPhase = 0; oslHideFields("oslLockedFields");
    document.getElementById("oslLockedStatus").textContent = "";
    var btn = document.getElementById("oslLockedDesbloq"); btn.disabled = false; btn.textContent = "Desbloquear agora — R$ 2,90";
    oslOpenModal("oslModalLocked");
  }

  document.getElementById("oslLockedDesbloq").addEventListener("click", async function () {
    if (oslLockedPhase === 0) { oslLockedPhase = 1; oslShowFields("oslLockedFields"); oslPrefill("oslLockedNome", "oslLockedEmail"); this.textContent = "Confirmar pagamento"; return; }
    var v = oslValidate("oslLockedNome", "oslLockedEmail", "oslLockedStatus"); if (!v) return;
    await oslPay(v.nome, v.email, "carta-bloqueada", "2.90", "oslLockedStatus", this);
  });

  document.getElementById("oslLockedPular").addEventListener("click", function () {
    oslLockedPhase = 0; oslCloseAll();
    var rb = document.getElementById("revealCardBtn");
    if (rb && !rb.disabled) { oslBypassReveal = true; rb.click(); }
  });

  // ── Modal 2: Carta de Revelação Final ──
  var oslFinalPhase = 0;

  function oslShowFinal() {
    oslFinalPhase = 0; oslHideFields("oslFinalFields");
    document.getElementById("oslFinalStatus").textContent = "";
    var btn = document.getElementById("oslFinalRevelar"); btn.disabled = false; btn.textContent = "Revelar agora — R$ 4,90";
    oslOpenModal("oslModalFinal");
  }

  document.getElementById("oslFinalRevelar").addEventListener("click", async function () {
    if (oslFinalPhase === 0) { oslFinalPhase = 1; oslShowFields("oslFinalFields"); oslPrefill("oslFinalNome", "oslFinalEmail"); this.textContent = "Confirmar pagamento"; return; }
    var v = oslValidate("oslFinalNome", "oslFinalEmail", "oslFinalStatus"); if (!v) return;
    await oslPay(v.nome, v.email, "carta-final", "4.90", "oslFinalStatus", this);
  });

  document.getElementById("oslFinalPular").addEventListener("click", function () {
    oslFinalPhase = 0; oslCloseAll();
    var rb = document.getElementById("revealCardBtn");
    if (rb && !rb.disabled) { oslBypassReveal = true; rb.click(); }
  });

  // ── Modal 3: Segunda Chance ──
  var oslScPhase = 0;
  var oslScShown = false;

  function oslShowSC() {
    if (oslScShown) return; oslScShown = true; oslScPhase = 0; oslHideFields("oslScFields");
    document.getElementById("oslScStatus").textContent = "";
    var btn = document.getElementById("oslScAdicionar"); btn.disabled = false; btn.textContent = "Adicionar 3 cartas — R$ 1,90";
    oslOpenModal("oslModalSC");
  }

  document.getElementById("oslScAdicionar").addEventListener("click", async function () {
    if (oslScPhase === 0) { oslScPhase = 1; oslShowFields("oslScFields"); oslPrefill("oslScNome", "oslScEmail"); this.textContent = "Confirmar pagamento"; return; }
    var v = oslValidate("oslScNome", "oslScEmail", "oslScStatus"); if (!v) return;
    await oslPay(v.nome, v.email, "segunda-chance", "1.90", "oslScStatus", this);
  });

  document.getElementById("oslScEncerrar").addEventListener("click", function () { oslScPhase = 0; oslCloseAll(); });

  // ── Modal 4: Salvar Sessão ──
  var oslSaveRef = null, oslSaveEmailVal = null, oslSavePollTimer = null;

  function oslGetRoomCode() {
    return (window._osl && window._osl.getRoomCode && window._osl.getRoomCode())
      || (new URLSearchParams(window.location.search)).get("sala")
      || localStorage.getItem("osl_sala") || "SL-0001";
  }

  window.oslSelecionarGravacao = function (prodId, valor, el) {
    oslSaveProduto = { id: prodId, valor };
    document.querySelectorAll(".osl-rec-item").forEach(function (i) { i.classList.remove("osl-selected"); });
    el.classList.add("osl-selected");
    oslShowFields("oslSaveFields"); oslPrefill("oslSaveNome", "oslSaveEmail");
    document.getElementById("oslSaveStatus").textContent = "";
    document.getElementById("oslSaveDownload").style.display = "none";
    var btn = document.getElementById("oslSaveSubmit"); btn.disabled = false; btn.textContent = "Confirmar e pagar";
  };

  document.getElementById("oslSaveSubmit").addEventListener("click", async function () {
    if (!oslSaveProduto) return;
    var v = oslValidate("oslSaveNome", "oslSaveEmail", "oslSaveStatus"); if (!v) return;
    var statusEl = document.getElementById("oslSaveStatus");
    var btn = this; btn.disabled = true; statusEl.textContent = "Criando pagamento...";
    try {
      var res  = await fetch(OSL_BASE + "/criar-pagamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: v.nome, email: v.email, produto: oslSaveProduto.id, valor: oslSaveProduto.valor, roomId: oslGetRoomCode() }) });
      var data = await res.json();
      if (data && data.ref && data.url) {
        oslSaveRef = data.ref; oslSaveEmailVal = v.email;
        localStorage.setItem("osl_checkout_nome", v.nome); localStorage.setItem("osl_checkout_email", v.email);
        window.open(data.url, "_blank"); btn.textContent = "✓ Aguardando pagamento";
        statusEl.textContent = "PIX aberto em nova aba. Aguardando confirmação...";
        oslStartSavePoll();
      } else { statusEl.textContent = (data && (data.message || data.error)) || "Erro ao criar pagamento."; btn.disabled = false; }
    } catch (e) { statusEl.textContent = "Erro de conexão. Tente novamente."; btn.disabled = false; }
  });

  function oslStartSavePoll() {
    var attempts = 0; clearInterval(oslSavePollTimer);
    oslSavePollTimer = setInterval(async function () {
      if (!oslSaveRef) { clearInterval(oslSavePollTimer); return; }
      if (++attempts > 40) { clearInterval(oslSavePollTimer); document.getElementById("oslSaveStatus").textContent = "Tempo esgotado. Se já pagou, entre em contato."; return; }
      try {
        var r = await fetch(OSL_BASE + "/status-pagamento/" + encodeURIComponent(oslSaveRef));
        var d = await r.json();
        if (d.approved) {
          clearInterval(oslSavePollTimer);
          document.getElementById("oslSaveStatus").textContent = "Pagamento confirmado! Salvando vídeo...";
          var claimRes = await fetch(OSL_BASE + "/recording/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: oslGetRoomCode(), ref: oslSaveRef, email: oslSaveEmailVal, type: oslSaveProduto?.id || "gravacao-download" }) });
          var claimData = await claimRes.json();
          if (claimData.ok && claimData.downloadUrl) {
            document.getElementById("oslSaveStatus").textContent = "✅ Vídeo salvo com sucesso!";
            var dlDiv = document.getElementById("oslSaveDownload"); var dlLink = document.getElementById("oslSaveDownloadLink");
            dlLink.href = claimData.downloadUrl; dlDiv.style.display = "block";
          } else { document.getElementById("oslSaveStatus").textContent = "Vídeo em processamento. Você receberá por e-mail em breve."; }
        }
      } catch (_) {}
    }, 3000);
  }

  document.getElementById("oslSaveSair").addEventListener("click", async function () {
    try { await fetch(OSL_BASE + "/recording/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: oslGetRoomCode() }) }); } catch (_) {}
    clearInterval(oslSavePollTimer); oslCloseAll();
    var lb = document.getElementById("leaveBtn"); if (lb) { oslBypassLeave = true; lb.click(); }
  });

  // ── Intercept: Reveal Button ──
  var revealBtn = document.getElementById("revealCardBtn");
  if (revealBtn) {
    revealBtn.addEventListener("click", function (e) {
      if (revealBtn.disabled) return;
      if (oslBypassReveal) { oslBypassReveal = false; return; }
      if (window._isPrestige) return;
      oslRevealCount++;
      sessionStorage.setItem("osl_rev", String(oslRevealCount));
      if (oslRevealCount % OSL_LOCK_EVERY === 0) {
        e.stopImmediatePropagation();
        if (Math.random() < OSL_FINAL_CHANCE) oslShowFinal(); else oslShowLocked();
      }
    }, true);
  }

  // ── Reset count on ritual reset ──
  var resetBtn = document.getElementById("resetRitualBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () { oslRevealCount = 0; oslScShown = false; sessionStorage.setItem("osl_rev", "0"); }, true);
  }

  // ── Watch for empty deck → segunda chance ──
  var deckInfo = document.getElementById("deckInfo");
  if (deckInfo) {
    new MutationObserver(function () {
      if (!window._isPrestige && !oslScShown && deckInfo.textContent.includes("deck chegou ao fim")) setTimeout(oslShowSC, 900);
    }).observe(deckInfo, { childList: true, subtree: true });
  }

  // ── Intercept: Leave Button ──
  var leaveBtn = document.getElementById("leaveBtn");
  if (leaveBtn) {
    leaveBtn.addEventListener("click", function (e) {
      if (oslBypassLeave) { oslBypassLeave = false; return; }
      if (window._isPrestige) return;
      var ritualStarted = window._osl && window._osl.isStarted && window._osl.isStarted();
      if (!ritualStarted) return;
      e.stopImmediatePropagation();
      oslSaveProduto = null; oslHideFields("oslSaveFields");
      document.getElementById("oslSaveStatus").textContent = "";
      document.querySelectorAll(".osl-rec-item").forEach(function (i) { i.classList.remove("osl-selected"); });
      oslOpenModal("oslModalSave");
    }, true);
  }

  // ── Shop FAB ──
  document.getElementById("oslShopFab").addEventListener("click", function () { window.open("./vendas.html", "_blank"); });

  // ── Close on backdrop ──
  document.getElementById("oslOverlay").addEventListener("click", function (e) { if (e.target === this) oslCloseAll(); });

})();
