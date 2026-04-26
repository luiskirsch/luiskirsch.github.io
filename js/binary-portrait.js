export function binaryPortrait(canvas, src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    const H = canvas.parentElement.offsetHeight || 130;
    const W = canvas.parentElement.offsetWidth  || 1400;
    canvas.width  = W;
    canvas.height = H;

    /* ── Helpers ────────────────────────────────────────────────── */
    function sample(srcImg, cols, rows, cropX = 0, cropW = 1) {
      const s = document.createElement('canvas');
      s.width = cols; s.height = rows;
      const sx = s.getContext('2d');
      const iw = srcImg.width, ih = srcImg.height;
      sx.drawImage(srcImg, iw * cropX, 0, iw * cropW, ih, 0, 0, cols, rows);
      const px = sx.getImageData(0, 0, cols, rows).data;
      const b = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        const o = i * 4;
        b[i] = (px[o] * .299 + px[o+1] * .587 + px[o+2] * .114) / 255;
      }
      return b;
    }

    function normalize(b) {
      let lo = 1, hi = 0;
      for (let i = 0; i < b.length; i++) { if (b[i] < lo) lo = b[i]; if (b[i] > hi) hi = b[i]; }
      const r = hi - lo || 1;
      for (let i = 0; i < b.length; i++) b[i] = (b[i] - lo) / r;
    }

    function sigmoid(b, k) {
      for (let i = 0; i < b.length; i++) b[i] = 1 / (1 + Math.exp(-k * (b[i] - 0.5)));
    }

    function sobel(b, cols, rows) {
      const e = new Float32Array(cols * rows);
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const g = (dx, dy) => b[(y + dy) * cols + (x + dx)];
          const gx = -g(-1,-1) + g(1,-1) - 2*g(-1,0) + 2*g(1,0) - g(-1,1) + g(1,1);
          const gy = -g(-1,-1) - 2*g(0,-1) - g(1,-1) + g(-1,1) + 2*g(0,1) + g(1,1);
          e[y * cols + x] = Math.min(Math.sqrt(gx*gx + gy*gy) * 2.5, 1);
        }
      }
      return e;
    }

    function randChar() { return Math.random() > .5 ? '1' : '0'; }

    /* ── PASSE 1 — Silhueta base (chars 4×7) ────────────────────── */
    const CW1 = 4, CH1 = 7;
    const FC1 = Math.round(H / CW1);
    const FR1 = Math.round(H / CH1);
    const b1  = sample(img, FC1, FR1);
    normalize(b1); sigmoid(b1, 8);
    const ch1 = new Uint8Array(FC1 * FR1);
    for (let i = 0; i < ch1.length; i++) ch1[i] = randChar() === '1' ? 1 : 0;

    /* ── PASSE 2 — Detalhes finos (chars 2×4) ────────────────────── */
    const CW2 = 2, CH2 = 4;
    const FC2 = Math.round(H / CW2);
    const FR2 = Math.round(H / CH2);
    const b2  = sample(img, FC2, FR2);
    normalize(b2);
    const e2  = sobel(b2, FC2, FR2); // detecta olhos, óculos, barba, cabelo
    const ch2 = new Uint8Array(FC2 * FR2);
    for (let i = 0; i < ch2.length; i++) ch2[i] = randChar() === '1' ? 1 : 0;

    /* ── Scatter ─────────────────────────────────────────────────── */
    const tok = ['0','1','01','10','00','11','010','101','001','1010','0101','10','01'];
    const sc  = [];
    const SCW = 22, SCH = 14;
    for (let gy = 0; gy < Math.ceil(H / SCH); gy++) {
      for (let gx = 0; gx < Math.ceil(W / SCW); gx++) {
        const x = gx * SCW + Math.random() * SCW;
        const y = gy * SCH + Math.random() * SCH;
        const decay = Math.max(0, 1 - (x / W) * 1.35);
        const a = (Math.random() * 0.11 + 0.03) * decay;
        if (a > 0.005) sc.push({ x, y, t: tok[Math.floor(Math.random() * tok.length)], sz: Math.floor(Math.random() * 3 + 7), a });
      }
    }

    /* ── Render ──────────────────────────────────────────────────── */
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Scatter de fundo
    sc.forEach(s => {
      ctx.globalAlpha = s.a;
      ctx.font = `${s.sz}px "Courier New",monospace`;
      ctx.fillStyle = '#c8a45a';
      ctx.fillText(s.t, s.x, s.y);
    });

    // Passe 1: silhueta
    const THR1 = 0.42;
    ctx.font = `bold ${CH1 - 1}px "Courier New",monospace`;
    for (let r = 0; r < FR1; r++) {
      for (let c = 0; c < FC1; c++) {
        const v = b1[r * FC1 + c];
        if (v < THR1) continue;
        const a = 0.65 + v * 0.35;
        ctx.globalAlpha = 1;
        ctx.fillStyle = v > .72 ? `rgba(255,254,240,${a.toFixed(3)})`
                      : v > .50 ? `rgba(238,205,128,${a.toFixed(3)})`
                      :           `rgba(195,152,72,${a.toFixed(3)})`;
        ctx.fillText(ch1[r * FC1 + c] ? '1' : '0', c * CW1, r * CH1);
      }
    }

    // Passe 2: detalhes finos onde Sobel é alto (olhos, óculos, cabelo, barba)
    const THR_E = 0.22;
    ctx.font = `bold ${CH2 - 1}px "Courier New",monospace`;
    for (let r = 0; r < FR2; r++) {
      for (let c = 0; c < FC2; c++) {
        const e = e2[r * FC2 + c];
        if (e < THR_E) continue;
        const a = 0.55 + e * 0.45;
        ctx.globalAlpha = 1;
        ctx.fillStyle = e > .6 ? `rgba(255,255,248,${a.toFixed(3)})`
                                : `rgba(220,185,100,${a.toFixed(3)})`;
        ctx.fillText(ch2[r * FC2 + c] ? '1' : '0', c * CW2, r * CH2);
      }
    }

    ctx.globalAlpha = 1;
  };

  img.src = src;
}
