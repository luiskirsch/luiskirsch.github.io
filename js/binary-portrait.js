/**
 * Binary Biosignature — Sobel edge detection + binary scatter
 * Só os contornos do rosto ficam visíveis, como uma assinatura técnica.
 */
export function binaryPortrait(canvas, src, opts = {}) {
  const CHAR_W  = opts.charW  || 6;
  const CHAR_H  = opts.charH  || 10;
  const FPS     = opts.fps    || 9;
  const THRESH  = opts.threshold || 0.11;   // sensibilidade do edge
  const BOOST   = opts.boost     || 2.8;    // amplificação dos contornos

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    // --- dimensiona canvas ao container ---
    const W = canvas.parentElement.offsetWidth  || 900;
    const H = canvas.parentElement.offsetHeight || 160;
    const COLS = Math.floor(W / CHAR_W);
    const ROWS = Math.floor(H / CHAR_H);

    canvas.width  = W;
    canvas.height = H;

    // --- amostra a imagem no grid de chars ---
    // Centraliza o rosto na metade esquerda
    // Quadrado: faceW * CHAR_W == faceH * CHAR_H  →  faceW = ROWS * (CHAR_H / CHAR_W)
    const faceW = Math.round(ROWS * CHAR_H / CHAR_W);
    const faceH = ROWS;

    const sampler = document.createElement('canvas');
    sampler.width  = faceW;
    sampler.height = faceH;
    const sc = sampler.getContext('2d');

    // Recorta o rosto — ocupa o centro horizontal da foto
    const cropX = img.width  * 0.10;
    const cropW = img.width  * 0.80;
    const cropY = 0;
    const cropH = img.height * 0.85; // topo até o pescoço
    sc.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, faceW, faceH);
    const px = sc.getImageData(0, 0, faceW, faceH).data;

    // --- brilho por pixel ---
    const bright = new Float32Array(faceW * faceH);
    for (let i = 0; i < faceW * faceH; i++) {
      const o = i * 4;
      bright[i] = (px[o] * 0.299 + px[o+1] * 0.587 + px[o+2] * 0.114) / 255;
    }

    // --- Sobel edge detection ---
    const edge = new Float32Array(faceW * faceH);
    for (let y = 1; y < faceH - 1; y++) {
      for (let x = 1; x < faceW - 1; x++) {
        const g = (dx, dy) => bright[(y + dy) * faceW + (x + dx)];
        const gx = -g(-1,-1) + g(1,-1) - 2*g(-1,0) + 2*g(1,0) - g(-1,1) + g(1,1);
        const gy = -g(-1,-1) - 2*g(0,-1) - g(1,-1) + g(-1,1) + 2*g(0,1) + g(1,1);
        edge[y * faceW + x] = Math.min(Math.sqrt(gx*gx + gy*gy) * BOOST, 1);
      }
    }

    // --- grade de chars para os contornos ---
    const faceChars = new Uint8Array(faceW * faceH);
    for (let i = 0; i < faceChars.length; i++) faceChars[i] = Math.random() > 0.5 ? 1 : 0;

    // --- scatter de binários no fundo (estático) ---
    const scatter = [];
    const tokens = ['0','1','01','10','00','11','010','101','110','001','1010','0101','1100','0011','10','01','1','0'];
    const count = Math.floor((COLS * ROWS) * 0.022);
    for (let i = 0; i < count; i++) {
      scatter.push({
        x:    Math.random() * W,
        y:    Math.random() * H,
        txt:  tokens[Math.floor(Math.random() * tokens.length)],
        sz:   Math.floor(Math.random() * 7 + 7),   // 7–14px
        a:    Math.random() * 0.12 + 0.03,          // 3–15% opacity
        gold: Math.random() > 0.6,
      });
    }

    // --- render ---
    const ctx = canvas.getContext('2d');

    function render() {
      ctx.clearRect(0, 0, W, H);

      // fundo — scatter binário
      scatter.forEach(s => {
        ctx.globalAlpha = s.a;
        ctx.font = `${s.sz}px "Courier New", Courier, monospace`;
        ctx.fillStyle = s.gold ? '#e6c07b' : '#a89060';
        ctx.fillText(s.txt, s.x, s.y);
      });

      // contornos do rosto
      ctx.font = `bold ${CHAR_H - 1}px "Courier New", Courier, monospace`;
      for (let row = 0; row < faceH; row++) {
        for (let col = 0; col < faceW; col++) {
          const e = edge[row * faceW + col];
          if (e < THRESH) continue;

          const a = Math.pow(e, 0.55);
          if      (e > 0.68) ctx.fillStyle = `rgba(255,252,230,${a})`;
          else if (e > 0.38) ctx.fillStyle = `rgba(225,192,105,${a})`;
          else               ctx.fillStyle = `rgba(165,128,55,${(a * 0.75).toFixed(3)})`;

          ctx.globalAlpha = 1;
          ctx.fillText(
            faceChars[row * faceW + col] ? '1' : '0',
            col * CHAR_W,
            row * CHAR_H
          );
        }
      }
      ctx.globalAlpha = 1;
    }

    render();

    // flicker nos contornos
    const flickN = Math.max(1, Math.floor(faceW * faceH * 0.025));
    setInterval(() => {
      for (let i = 0; i < flickN; i++) {
        const idx = Math.floor(Math.random() * faceW * faceH);
        if (edge[idx] >= THRESH) faceChars[idx] ^= 1;
      }
      render();
    }, 1000 / FPS);
  };

  img.onerror = () => console.warn('[binaryPortrait] imagem não encontrada:', src);
  img.src = src;
}
