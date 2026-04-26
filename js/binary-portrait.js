export function binaryPortrait(canvas, src) {
  const CW = 5;   // char width  px
  const CH = 8;   // char height px
  const FPS = 10;
  const THR = 0.10; // brightness threshold

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    const H = canvas.parentElement.offsetHeight || 130;
    const W = canvas.parentElement.offsetWidth  || 1400;

    canvas.width  = W;
    canvas.height = H;

    // Face: quadrado de H×H px — canto esquerdo
    const FC = Math.round(H / CW); // colunas → FC × CW ≈ H px
    const FR = Math.round(H / CH); // linhas   → FR × CH ≈ H px

    // Amostra a imagem em FC×FR pixels
    const s = document.createElement('canvas');
    s.width = FC; s.height = FR;
    const sx = s.getContext('2d');
    sx.drawImage(img, 0, 0, FC, FR);
    const px = sx.getImageData(0, 0, FC, FR).data;

    const b = new Float32Array(FC * FR);
    for (let i = 0; i < FC * FR; i++) {
      const o = i * 4;
      b[i] = (px[o]*0.299 + px[o+1]*0.587 + px[o+2]*0.114) / 255;
    }

    // Grade de chars 0/1
    const ch = new Uint8Array(FC * FR);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() > .5 ? 1 : 0;

    // Scatter — tokens binários espalhados, somem para a direita
    const tok = ['0','1','01','10','00','11','010','101','001','1010','0101','1100','10','01'];
    const sc = [];
    const N = Math.floor(W / CW * (H / CH) * 0.025);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * W;
      const decay = Math.max(0, 1 - (x / W) * 1.6);
      const a = (Math.random() * 0.13 + 0.04) * decay;
      if (a > 0.006) sc.push({
        x, y: Math.random() * H,
        t: tok[Math.floor(Math.random() * tok.length)],
        sz: Math.floor(Math.random() * 6 + 8),
        a
      });
    }

    const ctx = canvas.getContext('2d');

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Scatter
      sc.forEach(s => {
        ctx.globalAlpha = s.a;
        ctx.font = `${s.sz}px "Courier New",monospace`;
        ctx.fillStyle = '#c8a45a';
        ctx.fillText(s.t, s.x, s.y);
      });

      // Rosto
      ctx.font = `bold ${CH - 1}px "Courier New",monospace`;
      for (let r = 0; r < FR; r++) {
        for (let c = 0; c < FC; c++) {
          const v = b[r * FC + c];
          if (v < THR) continue;
          const a = Math.pow(v, 0.42);
          ctx.globalAlpha = 1;
          ctx.fillStyle = v > .65
            ? `rgba(255,252,235,${a.toFixed(3)})`
            : v > .35
            ? `rgba(230,196,115,${a.toFixed(3)})`
            : `rgba(160,122,52,${(a*.72).toFixed(3)})`;
          ctx.fillText(ch[r * FC + c] ? '1' : '0', c * CW, r * CH);
        }
      }
      ctx.globalAlpha = 1;
    }

    draw();

    const fN = Math.max(1, Math.floor(FC * FR * 0.03));
    setInterval(() => {
      for (let i = 0; i < fN; i++) {
        const idx = Math.floor(Math.random() * FC * FR);
        if (b[idx] >= THR) ch[idx] ^= 1;
      }
      draw();
    }, 1000 / FPS);
  };

  img.src = src;
}
