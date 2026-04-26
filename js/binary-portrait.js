export function binaryPortrait(canvas, src) {
  const CW  = 4;    // char width px
  const CH  = 7;    // char height px
  const THR = 0.40; // threshold após normalização + sigmoid

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    const H = canvas.parentElement.offsetHeight || 130;
    const W = canvas.parentElement.offsetWidth  || 1400;
    canvas.width  = W;
    canvas.height = H;

    // Grade do rosto — quadrado em pixels
    const FC = Math.round(H / CW);
    const FR = Math.round(H / CH);

    // Amostra a imagem
    const s = document.createElement('canvas');
    s.width = FC; s.height = FR;
    const sx = s.getContext('2d');
    sx.drawImage(img, 0, 0, FC, FR);
    const px = sx.getImageData(0, 0, FC, FR).data;

    const b = new Float32Array(FC * FR);
    for (let i = 0; i < FC * FR; i++) {
      const o = i * 4;
      b[i] = (px[o] * .299 + px[o+1] * .587 + px[o+2] * .114) / 255;
    }

    // Normaliza contraste
    let lo = 1, hi = 0;
    for (let i = 0; i < b.length; i++) { if (b[i] < lo) lo = b[i]; if (b[i] > hi) hi = b[i]; }
    const range = hi - lo || 1;
    for (let i = 0; i < b.length; i++) b[i] = (b[i] - lo) / range;

    // Sigmoid — separa rosto do fundo
    const K = 9;
    for (let i = 0; i < b.length; i++) b[i] = 1 / (1 + Math.exp(-K * (b[i] - 0.5)));

    // Chars fixos
    const ch = new Uint8Array(FC * FR);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() > .5 ? 1 : 0;

    // Scatter — cobre o banner inteiro em degradê
    const tok = ['0','1','01','10','00','11','010','101','001','1010','0101','10','01'];
    const sc  = [];
    for (let gy = 0; gy < Math.ceil(H / 14); gy++) {
      for (let gx = 0; gx < Math.ceil(W / 22); gx++) {
        const x = gx * 22 + Math.random() * 22;
        const y = gy * 14 + Math.random() * 14;
        const decay = Math.max(0, 1 - (x / W) * 1.35);
        const a = (Math.random() * 0.11 + 0.03) * decay;
        if (a > 0.005) sc.push({ x, y, t: tok[Math.floor(Math.random() * tok.length)], sz: Math.floor(Math.random() * 3 + 7), a });
      }
    }

    const ctx = canvas.getContext('2d');
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
        const a = 0.65 + v * 0.35;
        ctx.globalAlpha = 1;
        ctx.fillStyle = v > .72 ? `rgba(255,254,240,${a.toFixed(3)})`
                      : v > .50 ? `rgba(238,205,128,${a.toFixed(3)})`
                      :           `rgba(195,152,72,${a.toFixed(3)})`;
        ctx.fillText(ch[r * FC + c] ? '1' : '0', c * CW, r * CH);
      }
    }
    ctx.globalAlpha = 1;
  };

  img.src = src;
}
