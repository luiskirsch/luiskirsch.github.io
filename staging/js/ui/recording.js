// Modal de controle de gravação de sessão
(function () {
  'use strict';

  const REC_BASE = "https://osl-video-server-production.up.railway.app";
  const roomCode = (new URLSearchParams(window.location.search)).get("sala") || localStorage.getItem("osl_sala") || "SL-0001";

  let recPlan = null, recRef = null, recPollTimer = null, recActive = false;

  const recBtn         = document.getElementById("recBtn");
  const recOverlay     = document.getElementById("recOverlay");
  const recStep1       = document.getElementById("recStep1");
  const recStep2       = document.getElementById("recStep2");
  const recFields      = document.getElementById("recFields");
  const recStep1Acts   = document.getElementById("recStep1Actions");
  const recPayBtn      = document.getElementById("recPayBtn");
  const recPayStatus   = document.getElementById("recPayStatus");
  const recWaitStatus  = document.getElementById("recWaitStatus");
  const recDownloadBox = document.getElementById("recDownloadBox");
  const recDownloadLink= document.getElementById("recDownloadLink");
  const recStatusBadge = document.getElementById("recStatusBadge");
  const recStatusText  = document.getElementById("recStatusText");

  function openModal()  { recOverlay.classList.add("open"); }
  function closeModal() { recOverlay.classList.remove("open"); clearPoll(); }

  function setPayStatus(msg, cls)  { if (recPayStatus)  { recPayStatus.textContent  = msg; recPayStatus.className  = "recStatus" + (cls ? " " + cls : ""); } }
  function setWaitStatus(msg, cls) { if (recWaitStatus) { recWaitStatus.textContent = msg; recWaitStatus.className = "recStatus" + (cls ? " " + cls : ""); } }

  function clearPoll() { if (recPollTimer) { clearInterval(recPollTimer); recPollTimer = null; } }

  function showRecordingActive() {
    recActive = true;
    recStatusBadge.classList.add("visible");
    if (recBtn) { recBtn.classList.add("is-recording"); recBtn.textContent = "⏹ Parar Gravação"; recBtn.title = "Clique para parar a gravação"; }
  }

  function showRecordingInactive() {
    recActive = false;
    recStatusBadge.classList.remove("visible");
    if (recBtn) { recBtn.classList.remove("is-recording"); recBtn.textContent = "🔴 Gravar"; recBtn.title = "Gravar sessão"; }
  }

  window.recSelectPlan = function (planId, valor, el) {
    recPlan = { id: planId, valor };
    document.querySelectorAll(".recPlan").forEach(function (p) { p.classList.remove("selected"); });
    el.classList.add("selected"); recFields.classList.add("show"); recStep1Acts.style.display = "flex";
    var savedNome  = localStorage.getItem("osl_checkout_nome")  || localStorage.getItem("osl_nome") || "";
    var savedEmail = localStorage.getItem("osl_checkout_email") || "";
    var nEl = document.getElementById("recNome"); var eEl = document.getElementById("recEmail");
    if (nEl && savedNome  && !nEl.value) nEl.value = savedNome;
    if (eEl && savedEmail && !eEl.value) eEl.value = savedEmail;
    setPayStatus("");
  };

  if (recPayBtn) {
    recPayBtn.addEventListener("click", async function () {
      if (this.dataset.passEmail) {
        var passEmail = this.dataset.passEmail; this.disabled = true; setPayStatus("Iniciando gravação...");
        recStep1.style.display = "none"; recStep2.style.display = "flex"; recStep2.style.flexDirection = "column"; recStep2.style.gap = "20px";
        setWaitStatus("Iniciando gravação com passe mensal..."); await startRecording("gravacao-mensal", passEmail); return;
      }
      if (!recPlan) { setPayStatus("Selecione um plano.", "err"); return; }
      var nome  = (document.getElementById("recNome")?.value  || "").trim();
      var email = (document.getElementById("recEmail")?.value || "").trim().toLowerCase();
      if (!nome)  { setPayStatus("Digite seu nome.", "err"); return; }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setPayStatus("E-mail inválido.", "err"); return; }
      recPayBtn.disabled = true; setPayStatus("Criando pagamento...");
      try {
        var res  = await fetch(REC_BASE + "/criar-pagamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, email, produto: recPlan.id, valor: recPlan.valor, roomId: roomCode }) });
        var data = await res.json();
        if (data && data.ref && data.url) {
          localStorage.setItem("osl_checkout_nome", nome); localStorage.setItem("osl_checkout_email", email);
          recRef = data.ref; window.open(data.url, "_blank");
          recStep1.style.display = "none"; recStep2.style.display = "flex"; recStep2.style.flexDirection = "column"; recStep2.style.gap = "20px";
          setWaitStatus("Aguardando confirmação do pagamento..."); startPaymentPoll();
        } else { setPayStatus((data && (data.message || data.error)) || "Erro ao criar pagamento.", "err"); recPayBtn.disabled = false; }
      } catch (e) { setPayStatus("Erro de conexão. Tente novamente.", "err"); recPayBtn.disabled = false; }
    });
  }

  function startPaymentPoll() {
    var attempts = 0; clearPoll();
    recPollTimer = setInterval(async function () {
      if (!recRef) { clearPoll(); return; }
      if (++attempts > 40) { clearPoll(); setWaitStatus("Tempo esgotado. Se já pagou, entre em contato.", "err"); return; }
      try {
        var r = await fetch(REC_BASE + "/status-pagamento/" + encodeURIComponent(recRef));
        var d = await r.json();
        if (d.approved) { clearPoll(); setWaitStatus("Pagamento confirmado! Iniciando gravação..."); var email = document.getElementById("recEmail")?.value?.trim() || ""; await startRecording(d.produto || recPlan?.id || "gravacao-download", email); }
      } catch (_) {}
    }, 3000);
  }

  async function startRecording(type, email) {
    try {
      var res  = await fetch(REC_BASE + "/recording/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: roomCode, ref: recRef || "", type, email: email || "" }) });
      var data = await res.json();
      if (data.ok) { setWaitStatus("🔴 Gravação ativa! Pode fechar esta janela.", "ok"); showRecordingActive(); startStatusPoll(); }
      else          { setWaitStatus(data.error || "Erro ao iniciar gravação.", "err"); }
    } catch (e) { setWaitStatus("Erro ao iniciar gravação. Tente novamente.", "err"); }
  }

  function startStatusPoll() {
    clearPoll();
    recPollTimer = setInterval(async function () {
      try {
        var r = await fetch(REC_BASE + "/recording/status/" + encodeURIComponent(roomCode));
        var d = await r.json();
        if (!d.active && d.completed) { clearPoll(); showRecordingInactive(); if (d.downloadUrl) { recDownloadLink.href = d.downloadUrl; recDownloadBox.classList.add("show"); setWaitStatus("Gravação finalizada.", "ok"); } }
        else if (!d.active && !d.completed) { clearPoll(); showRecordingInactive(); }
      } catch (_) {}
    }, 8000);
  }

  async function stopRecording() {
    if (!recActive) return;
    try {
      var res  = await fetch(REC_BASE + "/recording/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: roomCode }) });
      var data = await res.json();
      showRecordingInactive(); clearPoll();
      if (data.downloadUrl) { openModal(); recStep1.style.display = "none"; recStep2.style.display = "flex"; recStep2.style.flexDirection = "column"; recStep2.style.gap = "20px"; recDownloadLink.href = data.downloadUrl; recDownloadBox.classList.add("show"); setWaitStatus("Gravação finalizada.", "ok"); }
    } catch (e) { console.error("Erro ao parar gravação:", e); }
  }

  async function checkMonthlyPass(email) {
    if (!email) return null;
    if (window._isPrestige) return { active: true, expiresAt: 9999999999999, type: "prestige" };
    try { var r = await fetch(REC_BASE + "/recording/pass/" + encodeURIComponent(email)); var d = await r.json(); return d.active ? d : null; }
    catch (_) { return null; }
  }

  if (recBtn) {
    recBtn.addEventListener("click", async function () {
      if (recActive) { if (confirm("Parar a gravação agora?")) stopRecording(); return; }
      recPlan = null; recRef = null;
      document.querySelectorAll(".recPlan").forEach(function (p) { p.classList.remove("selected"); });
      recFields.classList.remove("show"); recStep1Acts.style.display = "none";
      recStep1.style.display = "block"; recStep2.style.display = "none"; recDownloadBox.classList.remove("show");
      if (recPayBtn) { recPayBtn.disabled = false; recPayBtn.textContent = "Confirmar e pagar"; delete recPayBtn.dataset.passEmail; }
      setPayStatus(""); clearPoll();
      var savedEmail = localStorage.getItem("osl_checkout_email") || "";
      var passBadge  = document.getElementById("recPassBadge");
      var planGrid   = document.getElementById("recPlanGrid");
      if (savedEmail) {
        var pass = await checkMonthlyPass(savedEmail);
        if (pass) {
          if (passBadge) { passBadge.textContent = pass.type === "prestige" ? "⬡ Nível 50 — gravações incluídas permanentemente" : "✅ Passe mensal ativo até " + new Date(pass.expiresAt).toLocaleDateString("pt-BR") + " — gravação gratuita!"; passBadge.style.display = "block"; }
          if (planGrid) planGrid.style.display = "none";
          recFields.classList.add("show"); recStep1Acts.style.display = "flex";
          if (recPayBtn) { recPayBtn.textContent = "Iniciar gravação"; recPayBtn.dataset.passEmail = savedEmail; }
        } else { if (passBadge) passBadge.style.display = "none"; if (planGrid) planGrid.style.display = "grid"; }
      }
      openModal();
    });
  }

  document.getElementById("recCancelBtn")?.addEventListener("click", closeModal);
  document.getElementById("recStep2CancelBtn")?.addEventListener("click", closeModal);
  recOverlay?.addEventListener("click", function (e) { if (e.target === recOverlay) closeModal(); });

  // Verifica se já tem gravação ativa ao carregar a página
  (async function () {
    try {
      var r = await fetch(REC_BASE + "/recording/status/" + encodeURIComponent(roomCode));
      var d = await r.json();
      if (d.active) { showRecordingActive(); startStatusPoll(); }
    } catch (_) {}
  })();

})();
