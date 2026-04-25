/**
 * Binary Portrait — rosto visível por brilho + scatter em degradê
 */
export function binaryPortrait(canvas, src, opts = {}) {
  const CHAR_W = opts.charW  || 6;
  const CHAR_H = opts.charH  || 10;
  const FPS    = opts.fps    || 10;
  const THRESH = opts.threshold || 0.12;

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    const H = canvas.parentElement.offsetHeight || 130;
    const W = canvas.parentElement.offsetWidth  || 1400;

    canvas.width  = W;
    canvas.height = H;

    // Rosto ocupa uma área quadrada de H×H pixels no canto esquerdo
    // faceW_chars × CHAR_W = H  →  faceW_chars = H / CHAR_W
    // faceH_chars × CHAR_H = H  →  faceH_chars = H / CHAR_H
    const faceW = Math.round(H / CHAR_W);   // cols de chars para largura = H px
    const faceH = Math.round(H / CHAR_H);   // rows de chars para altura  = H px

    // Amostra a imagem na resolução do grid
    const sampler = document.createElement('canvas');
    sampler.width  = faceW;
    sampler.height = faceH;
    const sc = sampler.getContext('2d');

    // Usa a região central da foto para evitar bordas vazias
    const margin = img.width * 0.05;
    sc.drawImage(img, margin, 0, img.width - margin * 2, img.height, 0, 0, faceW, faceH);
    const px = sc.getImageData(0, 0, faceW, faceH).data;

    const bright = new Float32Array(faceW * faceH);
    for (let i = 0; i < faceW * faceH; i++) {
      const o = i * 4;
      bright[i] = (px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114) / 255;
    }

    // Grade de 0s e 1s animados
    const faceChars = new Uint8Array(faceW * faceH);
    for (let i = 0; i < faceChars.length; i++) faceChars[i] = Math.random() > 0.5 ? 1 : 0;

    // Scatter — todo o canvas, opacidade cai com x
    const tokens = ['0','1','01','10','00','11','010','101','001','1010','0110','1100'];
    const scatter = [];
    const n = Math.floor((W / CHAR_W) * (H / CHAR_H) * 0.02);
    for (let i = 0; i < n; i++) {
      const x    = Math.random() * W;
      const xFrac = Math.max(0, (x - H) / (W - H)); // 0 = junto ao rosto, 1 = fim
      const alpha = (Math.random() * 0.12 + 0.04) * Math.max(0, 1 - xFrac * 1.4);
      if (alpha > 0.008) scatter.push({
        x, y: Math.random() * H,
        txt: tokens[Math.floor(Math.random() * tokens.length)],
        sz:  Math.floor(Math.random() * 5 + CHAR_H - 2),
        a:   alpha,
      });
    }

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

      // Rosto
      ctx.font = `bold ${CHAR_H - 1}px "Courier New", Courier, monospace`;
      for (let row = 0; row < faceH; row++) {
        for (let col = 0; col < faceW; col++) {
          const b = bright[row * faceW + col];
          if (b < THRESH) continue;

          const a = Math.pow(b, 0.48);
          ctx.globalAlpha = 1;
          if      (b > 0.65) ctx.fillStyle = `rgba(255,252,232,${a.toFixed(3)})`;
          else if (b > 0.35) ctx.fillStyle = `rgba(228,195,112,${a.toFixed(3)})`;
          else               ctx.fillStyle = `rgba(158,120,50,${(a * 0.7).toFixed(3)})`;

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

    const flickN = Math.max(1, Math.floor(faceW * faceH * 0.03));
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
