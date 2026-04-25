/**
 * Binary Portrait — face visível por densidade (brilho → opacidade dos chars)
 * + scatter binário em degradê da esquerda para a direita
 */
export function binaryPortrait(canvas, src, opts = {}) {
  const CHAR_W  = opts.charW  || 5;
  const CHAR_H  = opts.charH  || 8;
  const FPS     = opts.fps    || 10;
  const THRESH  = opts.threshold || 0.13;

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    const H = canvas.parentElement.offsetHeight || 110;
    const W = canvas.parentElement.offsetWidth  || 1400;

    canvas.width  = W;
    canvas.height = H;

    const ROWS = Math.floor(H / CHAR_H);
    const COLS = Math.floor(W / CHAR_W);

    // Área do rosto — quadrado exato em pixels
    const faceH = ROWS;
    const faceW = Math.round(H / CHAR_W); // H px / CHAR_W = cols para quadrado

    // Amostra a imagem no grid do rosto
    const sampler = document.createElement('canvas');
    sampler.width  = faceW;
    sampler.height = faceH;
    const sc = sampler.getContext('2d');
    sc.drawImage(img, 0, 0, faceW, faceH);
    const px = sc.getImageData(0, 0, faceW, faceH).data;

    const bright = new Float32Array(faceW * faceH);
    for (let i = 0; i < faceW * faceH; i++) {
      const o = i * 4;
      bright[i] = (px[o] * 0.299 + px[o+1] * 0.587 + px[o+2] * 0.114) / 255;
    }

    // Grade de chars animados
    const faceChars = new Uint8Array(faceW * faceH);
    for (let i = 0; i < faceChars.length; i++) faceChars[i] = Math.random() > 0.5 ? 1 : 0;

    // Scatter binário — cobre o canvas inteiro (fade controlado por x em JS)
    const tokens = ['0','1','01','10','00','11','010','101','001','1010','0110','1100','0001','11'];
    const SCATTER_N = Math.floor(COLS * ROWS * 0.018);
    const scatter = Array.from({length: SCATTER_N}, () => {
      const x = Math.random() * W;
      // Opacidade cai com a distância — mais denso perto do rosto, some à direita
      const xFrac = x / W;
      const baseAlpha = Math.random() * 0.13 + 0.04;
      const falloff   = Math.max(0, 1 - xFrac * 1.5);
      return {
        x, y: Math.random() * H,
        txt: tokens[Math.floor(Math.random() * tokens.length)],
        sz:  Math.floor(Math.random() * 5 + 7),
        a:   baseAlpha * falloff,
      };
    }).filter(s => s.a > 0.005);

    const ctx = canvas.getContext('2d');

    function render() {
      ctx.clearRect(0, 0, W, H);

      // Scatter de fundo
      scatter.forEach(s => {
        ctx.globalAlpha = s.a;
        ctx.font        = `${s.sz}px "Courier New", Courier, monospace`;
        ctx.fillStyle   = '#c8a45a';
        ctx.fillText(s.txt, s.x, s.y);
      });

      // Rosto — cada char tem opacidade = brilho do pixel
      ctx.font = `bold ${CHAR_H - 1}px "Courier New", Courier, monospace`;
      for (let row = 0; row < faceH; row++) {
        for (let col = 0; col < faceW; col++) {
          const b = bright[row * faceW + col];
          if (b < THRESH) continue;

          const a = Math.pow(b, 0.50);
          if      (b > 0.68) ctx.fillStyle = `rgba(255,252,232,${a.toFixed(3)})`;
          else if (b > 0.38) ctx.fillStyle = `rgba(228,195,112,${a.toFixed(3)})`;
          else               ctx.fillStyle = `rgba(160,122,52,${(a*0.75).toFixed(3)})`;

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

    // Flicker dos chars do rosto
    const flickN = Math.max(1, Math.floor(faceW * faceH * 0.028));
    setInterval(() => {
      for (let i = 0; i < flickN; i++) {
        const idx = Math.floor(Math.random() * faceW * faceH);
        if (bright[idx] >= THRESH) faceChars[idx] ^= 1;
      }
      render();
    }, 1000 / FPS);
  };

  img.onerror = () => console.warn('[binaryPortrait] imagem não encontrada:', src);
  img.src = src;
}
