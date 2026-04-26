export function binaryPortrait(canvas, src) {
  const CW = 4;   // char width  px — menor = mais nitidez na silhueta
  const CH = 7;   // char height px
  const FPS = 10;
  const THR = 0.36;

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

    // Normaliza contraste — estica o range para usar o máximo de 0→1
    let lo = 1, hi = 0;
    for (let i = 0; i < b.length; i++) { if (b[i] < lo) lo = b[i]; if (b[i] > hi) hi = b[i]; }
    const range = hi - lo || 1;
    for (let i = 0; i < b.length; i++) b[i] = (b[i] - lo) / range;

    // Grade de chars 0/1
    const ch = new Uint8Array(FC * FR);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() > .5 ? 1 : 0;

    // Scatter — cobre o banner inteiro, vai sumindo suavemente para a direita
    const tok = ['0','1','01','10','00','11','010','101','001','1010','0101','1100','10','01','1','0'];
    const sc = [];
    // Grade uniforme + posição aleatória dentro de cada célula
    const SCW = 22, SCH = 14; // espaçamento da grade do scatter
    for (let gy = 0; gy < Math.ceil(H / SCH); gy++) {
      for (let gx = 0; gx < Math.ceil(W / SCW); gx++) {
        const x = gx * SCW + Math.random() * SCW;
        const y = gy * SCH + Math.random() * SCH;
        // Fade: começa a sumir a partir do rosto, chega a 0 em ~75% do banner
        const xFrac = Math.max(0, x / W);
        const decay = Math.max(0, 1 - xFrac * 1.35);
        const a = (Math.random() * 0.11 + 0.03) * decay;
        if (a > 0.005) sc.push({
          x, y,
          t: tok[Math.floor(Math.random() * tok.length)],
          sz: Math.floor(Math.random() * 3 + 7), // 7–9px — pequenos
          a
        });
      }
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
          // Opaco e nítido — sem variar muito
          const a = Math.min(0.72 + v * 0.28, 1);
          ctx.globalAlpha = 1;
          ctx.fillStyle = v > .70
            ? `rgba(255,254,240,${a.toFixed(3)})`
            : v > .48
            ? `rgba(238,205,128,${a.toFixed(3)})`
            : `rgba(195,152,72,${a.toFixed(3)})`;
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
