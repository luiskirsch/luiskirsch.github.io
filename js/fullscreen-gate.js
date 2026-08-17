/* ===== FULLSCREEN GATE ===== */
(function () {
  var gate = document.getElementById("fullscreenGate");
  if (!gate) return;

  var isMobile = window.matchMedia("(max-width: 960px)").matches;
  if (!isMobile) { gate.remove(); return; }

  var ua           = navigator.userAgent;
  // isIOS via UA + fallback para iPad iOS 13+ (que envia UA de Mac) e modo Desktop
  var isIOS        = /iphone|ipad|ipod/i.test(ua) ||
                     (navigator.maxTouchPoints > 1 && /Mac/.test(ua) && !window.MSStream);
  // Fallback definitivo: se fullscreen API não existe, é iOS Safari
  var el = document.documentElement;
  var hasFullscreen = !!(el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen);
  if (!hasFullscreen) isIOS = true;

  var isStandalone = window.navigator.standalone === true;
  var isGoogleApp  = /GSA\//i.test(ua);           // app Google / Google Search
  var isChromeIOS  = /CriOS\//i.test(ua);         // Chrome no iPhone/iPad
  var isFirefoxIOS = /FxiOS\//i.test(ua);         // Firefox no iPhone/iPad
  var isInAppIOS   = isGoogleApp || isFirefoxIOS || (/Instagram|FBAN|FBAV|Twitter|Line|Snapchat/i.test(ua));

  var SHARE_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-bottom:1px"><polyline points="16 17 12 21 8 17"/><line x1="12" y1="21" x2="12" y2="3"/><polyline points="20 7 12 3 4 7"/></svg>';

  function step(n, html) {
    return '<div class="iosStep"><span class="iosStepNum">' + n + '</span><span>' + html + '</span></div>';
  }

  function trGate(key, fallback, vars) {
    try {
      var t = window.OSL_I18N && window.OSL_I18N.t;
      if (typeof t === 'function') {
        var v = t(key, vars || {});
        if (typeof v === 'string' && v && v !== key) return v;
      }
    } catch (_) { /* empty */ }
    if (vars && fallback) {
      return fallback.replace(/\{\{(\w+)\}\}/g, function(_, k) { return vars[k] || ''; });
    }
    return fallback;
  }

  function renderIosSteps() {
    var stepsHtml = "";
    if (isInAppIOS) {
      stepsHtml =
        step(1, trGate('sala:fullscreenGate.iosInApp.step1', 'Toque nos <strong>3 pontos ⋯</strong> ou no ícone de compartilhar do app')) +
        step(2, trGate('sala:fullscreenGate.iosInApp.step2', 'Escolha <strong>"Abrir no Safari"</strong>')) +
        step(3, trGate('sala:fullscreenGate.iosInApp.step3', 'No Safari: toque em {{shareIcon}} e depois em <strong>"Adicionar à Tela de Início"</strong>', { shareIcon: SHARE_SVG }));
    } else if (isChromeIOS) {
      stepsHtml =
        step(1, trGate('sala:fullscreenGate.iosChrome.step1', 'Toque nos <strong>3 pontos ⋯</strong> no canto inferior direito')) +
        step(2, trGate('sala:fullscreenGate.iosChrome.step2', 'Toque em <strong>"Adicionar à Tela de Início"</strong>')) +
        step(3, trGate('sala:fullscreenGate.iosChrome.step3', 'Toque em <strong>"Adicionar"</strong> e abra pelo ícone criado'));
    } else {
      stepsHtml =
        step(1, trGate('sala:fullscreenGate.iosSafari.step1', 'Toque no ícone {{shareIcon}} <strong>na barra do Safari</strong> (superior ou inferior)', { shareIcon: SHARE_SVG })) +
        step(2, trGate('sala:fullscreenGate.iosSafari.step2', 'Role e toque em <strong>"Adicionar à Tela de Início"</strong>')) +
        step(3, trGate('sala:fullscreenGate.iosSafari.step3', 'Toque em <strong>"Adicionar"</strong> e abra pelo ícone criado'));
    }
    document.getElementById("fullscreenGateCta").textContent =
      trGate('sala:fullscreenGate.ctaSkip', 'Continuar sem tela cheia');
    document.getElementById("fullscreenGateIosSteps").innerHTML = stepsHtml;
  }

  if (isIOS && !isStandalone) {
    renderIosSteps();
    document.getElementById("fullscreenGateIosHint").style.display = "block";
    // Re-render quando i18n carregar
    document.addEventListener('osl:i18n-ready', renderIosSteps, { once: true });
  }

  var cta = document.getElementById("fullscreenGateCta");

  function enterAndDismiss(e) {
    e.preventDefault();
    e.stopPropagation();

    var el  = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req && !isIOS) req.call(el).catch(function () {});
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("portrait").catch(function () {});
    }

    // Bloqueia todo toque/click no body durante o fade — impede ativar o jogo abaixo
    document.body.style.pointerEvents = "none";
    gate.classList.add("fading");
    setTimeout(function () {
      gate.remove();
      document.body.style.pointerEvents = "";
    }, 200);
  }

  // Só o botão CTA fecha o gate — usar touchend evita ghost click no jogo abaixo
  cta.addEventListener("touchend", enterAndDismiss, { once: true, passive: false });
  cta.addEventListener("click",    enterAndDismiss, { once: true });
}());

/* ===== ARENA MODE ===== */
(function () {
  const html = document.documentElement;

  function syncArenaControls() {
    const cc = document.querySelector('.cardCenter');
    const ac = document.getElementById('arenaControls');
    const sair = document.getElementById('exitArenaBtn');
    if (!cc || !ac) return;
    const r = cc.getBoundingClientRect();
    ac.style.left  = r.left + 'px';
    ac.style.right = (window.innerWidth - r.right) + 'px';
    if (sair) sair.style.left = (r.left - 16) + 'px';
  }

  /* ── Holographic tilt — lerp suave via rAF ── */
  (function(){
    const wrap = document.getElementById('ritualCardWrap');
    if (!wrap) return;
    const visual = wrap.querySelector('.ritualVisualCard');

    let raf = null;
    let rx = 0, ry = 0, rs = 1, ry_off = 0;
    let txRx = 0, txRy = 0, txS = 1;
    let over = false;

    function lerp(a, b, t){ return a + (b - a) * t; }

    function isFlipping(){
      return wrap.classList.contains('ritualCardWrap--flipping') ||
             wrap.classList.contains('ritualCardWrap--first-reveal');
    }

    function tick(){
      // Pausa tilt durante o flip — evita conflito de transform
      if (isFlipping()){ raf = requestAnimationFrame(tick); return; }

      const tRx  = over ? txRx : 0;
      const tRy  = over ? txRy : 0;
      const tS   = over ? 1.04 : 1;
      const tY   = over ? -10  : 0;

      rx = lerp(rx,   tRx, over ? 0.10 : 0.06);
      ry = lerp(ry,   tRy, over ? 0.10 : 0.06);
      rs = lerp(rs,   tS,  over ? 0.10 : 0.06);
      ry_off = lerp(ry_off, tY, over ? 0.10 : 0.06);

      wrap.style.transform =
        `perspective(1000px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) scale(${rs.toFixed(4)}) translateY(${ry_off.toFixed(2)}px)`;

      const done = !over
        && Math.abs(rx) < 0.02
        && Math.abs(ry) < 0.02
        && Math.abs(rs - 1) < 0.001
        && Math.abs(ry_off) < 0.1;

      if (done){
        wrap.style.transform = '';
        raf = null;
      } else {
        raf = requestAnimationFrame(tick);
      }
    }

    wrap.addEventListener('mousemove', function(e){
      if (wrap.classList.contains('ritualCardWrap--facedown')) return;
      if (isFlipping()) return;
      const r = wrap.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top)  / r.height;
      txRx = -(ny - 0.5) * 20;
      txRy =  (nx - 0.5) * 16;
      over = true;
      if (visual){
        visual.style.setProperty('--mx', (nx * 100).toFixed(1) + '%');
        visual.style.setProperty('--my', (ny * 100).toFixed(1) + '%');
      }
      if (!raf) raf = requestAnimationFrame(tick);
    });

    wrap.addEventListener('mouseleave', function(){
      over = false;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  })();

  /* ── Binary room title — letras formadas por 0s e 1s ── */
  (function(){
    const canvas = document.getElementById('roomTitleCanvas');
    if (!canvas) return;

    const TEXT  = 'SEXTOLUGAR';
    const CW    = 4;    // char width px
    const CH    = 6;    // char height px
    const FSAMP = 160;  // fonte de amostragem — alta resolução

    // 1. Renderiza o texto em grande numa canvas oculta
    const hid  = document.createElement('canvas');
    const hCtx = hid.getContext('2d');
    hCtx.font  = `800 ${FSAMP}px Georgia,"Times New Roman",serif`;
    const tw   = Math.ceil(hCtx.measureText(TEXT).width) + FSAMP * 0.3;
    hid.width  = tw;
    hid.height = Math.ceil(FSAMP * 1.15);
    hCtx.fillStyle = '#000';
    hCtx.fillRect(0, 0, hid.width, hid.height);
    hCtx.fillStyle = '#fff';
    hCtx.font = `800 ${FSAMP}px Georgia,"Times New Roman",serif`;
    hCtx.textBaseline = 'alphabetic';
    hCtx.fillText(TEXT, FSAMP * 0.05, FSAMP * 0.88);

    const px   = hCtx.getImageData(0, 0, hid.width, hid.height).data;
    const COLS = Math.floor(hid.width  / CW);
    const ROWS = Math.floor(hid.height / CH);

    // 2. Canvas visível — CSS escala para caber no header
    canvas.width  = COLS * CW;
    canvas.height = ROWS * CH;
    canvas.style.cssText = 'display:block;width:100%;height:auto;max-height:52px;';

    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${CH - 1}px "Courier New",monospace`;
    ctx.textBaseline = 'top';

    // 3. Amostra média de brilho por célula (mais preciso que ponto único)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let sum = 0, n = 0;
        for (let dy = 0; dy < CH; dy++) {
          for (let dx = 0; dx < CW; dx++) {
            const idx = ((r*CH+dy) * hid.width + (c*CW+dx)) * 4;
            sum += px[idx]; n++;
          }
        }
        const avg = sum / n;
        if (avg > 80) {
          const a = (0.55 + (avg/255) * 0.45).toFixed(2);
          ctx.fillStyle = `rgba(246,239,228,${a})`;
          ctx.fillText(Math.random() > .5 ? '1' : '0', c*CW, r*CH);
        }
      }
    }
  })();

  function trArena(key, fallback) {
    try {
      const t = window.OSL_I18N && window.OSL_I18N.t;
      if (typeof t === 'function') {
        const v = t(key);
        if (typeof v === 'string' && v && v !== key) return v;
      }
    } catch (_) { /* empty */ }
    return fallback;
  }

  function activateArenaMode() {
    sessionStorage.removeItem("osl_arena_optout");
    html.classList.add("arenaMode");
    sessionStorage.setItem("osl_arena", "1");

    const btn = document.getElementById("arenaBtn");
    if (btn) {
      btn.textContent = trArena("sala:topbar.actions.arenaActive", "⚔️ Sair Arena");
      btn.title = trArena("sala:topbar.actions.arenaActiveTitle", "Sair do Modo Arena");
    }

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    requestAnimationFrame(syncArenaControls);
  }

  function deactivateArenaMode() {
    html.classList.remove("arenaMode");
    sessionStorage.removeItem("osl_arena");

    const btn = document.getElementById("arenaBtn");
    if (btn) {
      btn.textContent = trArena("sala:topbar.actions.arena", "⚔️ Arena");
      btn.title = trArena("sala:topbar.actions.arenaTitle", "Alternar Modo Arena");
    }

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function toggleArenaMode() {
    if (html.classList.contains("arenaMode")) {
      deactivateArenaMode();
    } else {
      activateArenaMode();
    }
  }

  // Expõe globalmente para o listener Firebase chamar
  window.activateArenaMode   = activateArenaMode;
  window.deactivateArenaMode = deactivateArenaMode;

  // Botão do topbar — só visível/funcional para o host (hidden definido em bindRoom)
  document.getElementById("arenaBtn")
    ?.addEventListener("click", () => {
      if (!html.classList.contains("arenaMode") && sessionStorage.getItem("osl_arena_optout") === "1") {
        activateArenaMode();
        window._osl?.reenterArenaView?.();
        return;
      }
      window._osl?.toggleArena?.().catch?.(() => {});
    });

  // Botão de saída flutuante — só o host sai e sincroniza para todos
  document.getElementById("exitArenaBtn")
    ?.addEventListener("click", () => {
      window._osl?.deactivateArenaForAll?.().catch?.(() => {});
    });

  // ESC — só o host sai e sincroniza para todos
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!html.classList.contains("arenaMode")) return;
    const profileModal = document.getElementById("profileModal");
    if (profileModal && !profileModal.classList.contains("hidden")) return;
    window._osl?.deactivateArenaForAll?.().catch?.(() => {});
  });

  const isMobileDevice = window.matchMedia("(max-width: 960px)").matches;

  if (isMobileDevice) {
    // No mobile: sempre começa sem arenaMode.
    // O Firebase listener é a única fonte de verdade — ativa quando started:true.
    // Isso evita que sessões anteriores (sessionStorage) mostrem a mesa
    // antes do ritual ser confirmado pelo Firestore.
    deactivateArenaMode();
  } else if (sessionStorage.getItem("osl_arena") === "1") {
    activateArenaMode();
  }

  window.addEventListener('resize', () => {
    if (html.classList.contains('arenaMode')) syncArenaControls();
  });
})();
