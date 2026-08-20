/* Lobby FX — luz solar volumétrica, poeira ultra-realista, grain de cinema */
(function () {
  'use strict';

  var viewer = document.getElementById('lobbyViewer');
  if (!viewer) return;

  var cvs = document.createElement('canvas');
  cvs.id = 'lobbyFxCanvas';
  Object.assign(cvs.style, {
    position:'absolute', inset:'0', width:'100%', height:'100%',
    zIndex:'3', pointerEvents:'none', display:'block',
  });
  viewer.appendChild(cvs);
  var ctx = cvs.getContext('2d');
  var W = 1, H = 1;

  function resize() {
    var r = viewer.getBoundingClientRect();
    W = cvs.width  = r.width  || viewer.offsetWidth  || 900;
    H = cvs.height = r.height || viewer.offsetHeight || 480;
  }
  resize();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(viewer);

  /*
   * Janela ESQUERDA ≈ x:0.30, y:0.18  (principal — mais luz)
   * Janela DIREITA  ≈ x:0.84, y:0.16  (secundária)
   */
  var L = { x: 0.30, y: 0.18 };   // left window
  var R = { x: 0.84, y: 0.16 };   // right window

  /* ── Raios solares ───────────────────────────────────────────────────── */
  /*
   * Cada raio: origem na janela, aponta para baixo com desvio lateral.
   * angle = desvio do eixo Y (para baixo). Positivo = vai para a DIREITA.
   * Para janela esquerda os raios vão para a direita (+).
   * Para janela direita vão para a esquerda (-).
   */
  var RAYS_L = [
    { a: +0.50, w: 0.040, alpha: 0.10, ph: 0.0 },
    { a: +0.35, w: 0.065, alpha: 0.15, ph: 1.4 },
    { a: +0.20, w: 0.085, alpha: 0.18, ph: 2.7 },
    { a: +0.05, w: 0.070, alpha: 0.14, ph: 0.8 },
    { a: -0.12, w: 0.050, alpha: 0.09, ph: 3.3 },
  ];
  var RAYS_R = [
    { a: -0.45, w: 0.035, alpha: 0.07, ph: 1.0 },
    { a: -0.28, w: 0.055, alpha: 0.11, ph: 2.2 },
    { a: -0.12, w: 0.065, alpha: 0.12, ph: 0.4 },
    { a:  0.05, w: 0.040, alpha: 0.08, ph: 3.8 },
  ];

  function drawRaySet(rays, sx, sy, t) {
    var lx = sx * W, ly = sy * H;
    for (var i = 0; i < rays.length; i++) {
      var ray   = rays[i];
      var pulse = 0.75 + 0.25 * Math.sin(t * 0.00050 + ray.ph);
      var al    = ray.alpha * pulse;
      var hW    = ray.w * W * (0.85 + 0.15 * pulse);
      var ang   = ray.a;
      var len   = H * 2.0;
      var ex    = lx + Math.sin(ang) * len;
      var ey    = ly + Math.cos(ang) * len;
      var px    = -Math.cos(ang) * hW;
      var py    =  Math.sin(ang) * hW;

      /* dupla passagem: halo difuso + núcleo nítido */
      var passes = [
        { mul: 3.5, aMul: 0.25 },
        { mul: 1.0, aMul: 1.00 },
      ];
      for (var p = 0; p < passes.length; p++) {
        var m  = passes[p].mul, am = passes[p].aMul;
        var rg = ctx.createLinearGradient(lx, ly, ex, ey);
        rg.addColorStop(0,    'rgba(255,238,165,' + Math.min(1, al * am * 2.0).toFixed(3) + ')');
        rg.addColorStop(0.06, 'rgba(255,220,120,' + Math.min(1, al * am      ).toFixed(3) + ')');
        rg.addColorStop(0.45, 'rgba(255,195, 70,' + (al * am * 0.30).toFixed(3) + ')');
        rg.addColorStop(1,    'rgba(255,160, 30,0)');

        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(ex + px*m, ey + py*m);
        ctx.lineTo(ex - px*m, ey - py*m);
        ctx.closePath();
        ctx.fillStyle = rg;
        ctx.fill();
      }
    }
  }

  /* ── Partículas de poeira ultra-realistas ────────────────────────────── */
  var N = 180;
  var dust = [];

  /* retorna intensidade de luz (0-1) em posição normalizada */
  function lit(nx, ny) {
    var dL = Math.hypot(nx - L.x, ny - L.y);
    var dR = Math.hypot(nx - R.x, ny - R.y);
    return Math.max(0, 1 - Math.min(dL, dR) * 2.5);
  }

  function mkDust(stagger, idx) {
    var inBeam  = Math.random() < 0.60;
    var useSrc  = Math.random() < 0.70 ? L : R;
    var x, y;
    if (inBeam) {
      x = (useSrc.x + (Math.random() - 0.5) * 0.35) * W;
      y = (useSrc.y + 0.02 + Math.random() * 0.60) * H;
    } else {
      x = Math.random() * W;
      y = (0.08 + Math.random() * 0.92) * H;
    }
    return {
      x: x, y: y,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -(0.03 + Math.random() * 0.22),
      r:   0.5 + Math.random() * 2.2,
      life: stagger ? Math.random() : 0,
      end:  0.50 + Math.random() * 0.50,
      mote: Math.random() < 0.25,           // partícula maior e brilhante
      twk:  Math.random() * Math.PI * 2,
      twkS: 0.20 + Math.random() * 0.80,
      wb:   (Math.random() - 0.5) * 6,
      seed: (idx || 0) * 37.3,
    };
  }
  for (var i = 0; i < N; i++) dust.push(mkDust(true, i));

  /* ── Film grain ──────────────────────────────────────────────────────── */
  var gCvs = document.createElement('canvas');
  gCvs.width = gCvs.height = 256;
  var gCtx = gCvs.getContext('2d');
  var gTick = 0, gPat = null;
  function bakeGrain() {
    var d = gCtx.createImageData(256,256), px = d.data;
    for (var k = 0; k < px.length; k += 4) {
      var v = (Math.random()*255)|0;
      px[k]=px[k+1]=px[k+2]=v; px[k+3]=22;
    }
    gCtx.putImageData(d, 0, 0);
  }
  bakeGrain();

  /* ── Loop principal ──────────────────────────────────────────────────── */
  var running = true;

  function draw(t) {
    if (!running) return;
    if (document.body.classList.contains('ritual-started')) {
      running = false; return;
    }
    requestAnimationFrame(draw);
    ctx.clearRect(0, 0, W, H);

    /* 1. Brilho suave nas janelas */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    var gL = ctx.createRadialGradient(L.x*W, L.y*H, 0, L.x*W, L.y*H, W*0.38);
    gL.addColorStop(0,   'rgba(255,238,160,0.13)');
    gL.addColorStop(0.35,'rgba(255,205, 85,0.05)');
    gL.addColorStop(1,   'rgba(255,165, 30,0.00)');
    ctx.fillStyle = gL; ctx.fillRect(0,0,W,H);

    var gRr = ctx.createRadialGradient(R.x*W, R.y*H, 0, R.x*W, R.y*H, W*0.25);
    gRr.addColorStop(0,   'rgba(255,238,160,0.09)');
    gRr.addColorStop(0.35,'rgba(255,205, 85,0.03)');
    gRr.addColorStop(1,   'rgba(255,165, 30,0.00)');
    ctx.fillStyle = gRr; ctx.fillRect(0,0,W,H);
    ctx.restore();

    /* 2. Raios solares */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawRaySet(RAYS_L, L.x, L.y, t);
    drawRaySet(RAYS_R, R.x, R.y, t);
    ctx.restore();

    /* 3. Partículas de poeira */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < N; i++) {
      var p = dust[i];
      p.life += 0.00090;
      if (p.life > p.end || p.y < -10) { dust[i] = mkDust(false, i); continue; }

      p.x += p.vx + Math.sin(t * 0.00028 * p.twkS + p.seed) * 0.055;
      p.y += p.vy;

      var prog = p.life / p.end;
      var fade = prog < 0.10 ? prog/0.10 : prog > 0.72 ? (1-prog)/0.28 : 1;
      var twk  = 0.65 + 0.35 * Math.sin(t * p.twkS * 0.0012 + p.twk);
      var lum  = lit(p.x/W, p.y/H);
      var base = p.mote ? 0.92 : 0.26;
      var al   = base * fade * twk * (0.18 + 0.82 * lum);
      if (al < 0.006) continue;

      if (p.mote) {
        /* mote: gradiente radial com halo dourado */
        var gr  = p.r * (3 + lum * 3);
        var gmg = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,gr);
        gmg.addColorStop(0,   'rgba(255,252,225,' + Math.min(1,al).toFixed(3) + ')');
        gmg.addColorStop(0.25,'rgba(255,235,150,' + (al*0.65).toFixed(3) + ')');
        gmg.addColorStop(0.6, 'rgba(255,210, 80,' + (al*0.18).toFixed(3) + ')');
        gmg.addColorStop(1,   'rgba(255,185, 40,0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, gr, 0, Math.PI*2);
        ctx.fillStyle = gmg;
        ctx.fill();
      } else {
        /* poeira fina: ponto com mini-halo */
        var rr = p.r * (1 + lum * 0.9);
        /* halo */
        var gh = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,rr*3.5);
        gh.addColorStop(0, 'rgba(255,245,195,' + (al*0.55).toFixed(3) + ')');
        gh.addColorStop(1, 'rgba(255,210,100,0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr*3.5, 0, Math.PI*2);
        ctx.fillStyle = gh;
        ctx.fill();
        /* núcleo */
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,248,200,' + Math.min(1,al*1.4).toFixed(3) + ')';
        ctx.fill();
      }
    }
    ctx.restore();

    /* 4. Film grain (a cada 2 frames) */
    if (++gTick % 2 === 0) { bakeGrain(); gPat = null; }
    if (!gPat) gPat = ctx.createPattern(gCvs, 'repeat');
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = gPat;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  requestAnimationFrame(draw);
})();
