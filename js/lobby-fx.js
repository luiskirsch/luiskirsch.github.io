/* Lobby FX — partículas de poeira, raios solares, grain cinematográfico */
(function () {
  'use strict';

  var viewer = document.getElementById('lobbyViewer');
  if (!viewer) return;

  /* ── Canvas ─────────────────────────────────────────────────────────── */
  var cvs = document.createElement('canvas');
  cvs.id = 'lobbyFxCanvas';
  Object.assign(cvs.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    zIndex: '2', pointerEvents: 'none', display: 'block',
  });
  viewer.appendChild(cvs);
  var ctx = cvs.getContext('2d');
  var W = 1, H = 1;

  function resize() {
    var r = viewer.getBoundingClientRect();
    W = cvs.width  = (r.width  || viewer.offsetWidth  || 900);
    H = cvs.height = (r.height || viewer.offsetHeight || 480);
  }
  resize();
  var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(viewer);

  /* ── Posição da janela (fonte de luz) — upper-right ─────────────────── */
  var LX = 0.64; // 0–1 normalizado
  var LY = 0.10;

  /* ── Raios de luz solar ─────────────────────────────────────────────── */
  var RAYS = [
    { aOff: -0.22, wMul: 1.5, aMul: 0.9, ph: 0.0  },
    { aOff: -0.10, wMul: 0.8, aMul: 1.7, ph: 1.4  },
    { aOff:  0.00, wMul: 1.1, aMul: 1.1, ph: 2.6  },
    { aOff:  0.12, wMul: 0.7, aMul: 1.5, ph: 0.9  },
    { aOff:  0.25, wMul: 1.2, aMul: 0.8, ph: 3.5  },
    { aOff:  0.38, wMul: 0.6, aMul: 1.0, ph: 1.8  },
  ];

  /* ── Partículas de poeira ────────────────────────────────────────────── */
  var N_DUST = 110;
  var dust = [];

  function mkDust(stagger) {
    var nearLight = Math.random() < 0.48;
    return {
      x:    nearLight ? (LX + (Math.random() - 0.5) * 0.38) * W : Math.random() * W,
      y:    nearLight
              ? (LY + 0.04 + Math.random() * 0.40) * H
              : (0.15 + Math.random() * 0.85) * H,
      vx:   (Math.random() - 0.5) * 0.20,
      vy:   -(0.06 + Math.random() * 0.30),
      r:    0.25 + Math.random() * 1.5,
      life: stagger ? Math.random() : 0,
      end:  0.50 + Math.random() * 0.50,
      bright: Math.random() < 0.30,
      wobble: (Math.random() - 0.5) * 7,
      seed: Math.random() * 100,
    };
  }
  for (var i = 0; i < N_DUST; i++) dust.push(mkDust(true));

  /* ── Partículas de faísca (mais brilhantes, menos frequentes) ───────── */
  var N_SPARK = 18;
  var sparks = [];
  function mkSpark(stagger) {
    return {
      x:    (LX + (Math.random() - 0.5) * 0.30) * W,
      y:    (LY + Math.random() * 0.25) * H,
      vx:   (Math.random() - 0.5) * 0.35,
      vy:   -(0.12 + Math.random() * 0.22),
      r:    0.2 + Math.random() * 0.6,
      life: stagger ? Math.random() : 0,
      end:  0.35 + Math.random() * 0.30,
    };
  }
  for (var i = 0; i < N_SPARK; i++) sparks.push(mkSpark(true));

  /* ── Film grain ─────────────────────────────────────────────────────── */
  var gCvs = document.createElement('canvas');
  gCvs.width = gCvs.height = 256;
  var gCtx  = gCvs.getContext('2d');
  var gTick = 0;
  function bakeGrain() {
    var d = gCtx.createImageData(256, 256), px = d.data;
    for (var i = 0; i < px.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      px[i] = px[i+1] = px[i+2] = v;
      px[i+3] = 24;
    }
    gCtx.putImageData(d, 0, 0);
  }
  bakeGrain();

  /* ── Loop ────────────────────────────────────────────────────────────── */
  var running = true;
  var gPat   = null;

  function draw(t) {
    if (!running) return;
    if (document.body.classList.contains('ritual-started')) {
      running = false;
      if (ro) ro.disconnect();
      return;
    }
    requestAnimationFrame(draw);

    ctx.clearRect(0, 0, W, H);
    var lx = LX * W, ly = LY * H;

    /* 1 ── Brilho atmosférico na janela */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    var gAtm = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.min(W, H) * 0.6);
    gAtm.addColorStop(0,   'rgba(255,225,140,0.10)');
    gAtm.addColorStop(0.3, 'rgba(255,195, 80,0.05)');
    gAtm.addColorStop(1,   'rgba(255,150, 30,0.00)');
    ctx.fillStyle = gAtm;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* 2 ── Raios de luz solar */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var ri = 0; ri < RAYS.length; ri++) {
      var ray   = RAYS[ri];
      var pulse = 0.80 + 0.20 * Math.sin(t * 0.00048 + ray.ph);
      var alpha = 0.042 * ray.aMul * pulse;
      var hW    = 0.06 * ray.wMul * W * (0.85 + 0.15 * pulse);
      var angle = Math.PI * 0.54 + ray.aOff + 0.03 * Math.sin(t * 0.00022 + ray.ph);
      var len   = H * 1.6;
      var ex    = lx + Math.sin(angle) * len;
      var ey    = ly + Math.cos(angle) * len;
      var px2   = -Math.cos(angle) * hW;
      var py2   =  Math.sin(angle) * hW;

      var rg = ctx.createLinearGradient(lx, ly, ex, ey);
      rg.addColorStop(0,   'rgba(255,235,160,' + (alpha * 1.6).toFixed(3) + ')');
      rg.addColorStop(0.15,'rgba(255,215,110,' + alpha.toFixed(3) + ')');
      rg.addColorStop(1,   'rgba(255,175, 50,0)');

      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(ex + px2, ey + py2);
      ctx.lineTo(ex - px2, ey - py2);
      ctx.closePath();
      ctx.fillStyle = rg;
      ctx.fill();
    }
    ctx.restore();

    /* 3 ── Partículas de poeira */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < N_DUST; i++) {
      var p = dust[i];
      p.life += 0.0012;
      if (p.life > p.end || p.y < -6) { dust[i] = mkDust(false); continue; }
      p.x += p.vx + Math.sin(p.life * p.wobble + p.seed) * 0.06;
      p.y += p.vy;
      var prog = p.life / p.end;
      var fade = prog < 0.12 ? prog / 0.12 : prog > 0.68 ? (1 - prog) / 0.32 : 1;
      var ddx = p.x / W - LX, ddy = p.y / H - LY;
      var lit  = Math.max(0, 1 - Math.sqrt(ddx*ddx + ddy*ddy) * 2.6);
      var base = p.bright ? 0.72 : 0.20;
      var al   = base * fade * (0.30 + 0.70 * lit);
      if (al < 0.008) continue;
      var cr = p.bright ? 255 : 215, cg = p.bright ? 242 : 202, cb = p.bright ? 185 : 218;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + lit * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + al.toFixed(3) + ')';
      ctx.fill();
    }
    ctx.restore();

    /* 4 ── Faíscas brilhantes */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < N_SPARK; i++) {
      var s = sparks[i];
      s.life += 0.0020;
      if (s.life > s.end || s.y < -4) { sparks[i] = mkSpark(false); continue; }
      s.x += s.vx;
      s.y += s.vy;
      var prog = s.life / s.end;
      var fade = prog < 0.10 ? prog / 0.10 : prog > 0.60 ? (1 - prog) / 0.40 : 1;
      var al = 0.90 * fade;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,248,200,' + al.toFixed(3) + ')';
      ctx.fill();
      /* halo suave */
      var gh = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
      gh.addColorStop(0, 'rgba(255,230,130,' + (al * 0.4).toFixed(3) + ')');
      gh.addColorStop(1, 'rgba(255,200, 60,0)');
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
      ctx.fillStyle = gh;
      ctx.fill();
    }
    ctx.restore();

    /* 5 ── Film grain (a cada 2 frames) */
    if (++gTick % 2 === 0) { bakeGrain(); gPat = null; }
    if (!gPat) gPat = ctx.createPattern(gCvs, 'repeat');
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.065;
    ctx.fillStyle = gPat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  requestAnimationFrame(draw);
})();
