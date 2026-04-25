/**
 * Binary Portrait — converte imagem em arte binária animada (0s e 1s)
 * Uso: binaryPortrait(canvasEl, imageSrc, options)
 */
export function binaryPortrait(canvas, src, opts = {}) {
  const COLS      = opts.cols      || 130;
  const CHAR_W    = opts.charW     || 7;
  const CHAR_H    = opts.charH     || 13;
  const FPS       = opts.fps       || 12;
  const FLICKER   = opts.flicker   || 0.04; // fração de chars que muda por frame
  const THRESHOLD = opts.threshold || 0.07; // brilho mínimo para renderizar

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    // Resolve proporção corrigida pelo aspecto do char (chars não são quadrados)
    const aspect = (img.height / img.width) * (CHAR_W / CHAR_H);
    const ROWS = Math.round(COLS * aspect);

    // Canvas oculto para amostrar pixels da imagem
    const sampler = document.createElement('canvas');
    sampler.width  = COLS;
    sampler.height = ROWS;
    const sc = sampler.getContext('2d');
    sc.drawImage(img, 0, 0, COLS, ROWS);
    const px = sc.getImageData(0, 0, COLS, ROWS).data;

    // Monta grade de brilho
    const bright = new Float32Array(COLS * ROWS);
    for (let i = 0; i < COLS * ROWS; i++) {
      const o = i * 4;
      bright[i] = (px[o] * 0.299 + px[o+1] * 0.587 + px[o+2] * 0.114) / 255;
    }

    // Grade de caracteres (aleatória inicial)
    const chars = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < chars.length; i++) chars[i] = Math.random() > 0.5 ? 1 : 0;

    // Dimensiona o canvas visível
    canvas.width  = COLS * CHAR_W;
    canvas.height = ROWS * CHAR_H;

    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${CHAR_H - 1}px "Courier New", Courier, monospace`;
    ctx.textBaseline = 'top';

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const b = bright[row * COLS + col];
          if (b < THRESHOLD) continue;

          const alpha = Math.pow(b, 0.65); // curva de gamma para contraste

          // Paleta: branco-quente nos altos brilhos, dourado nos médios, âmbar nos escuros
          let r, g, bl;
          if (b > 0.72) { r = 255; g = 252; bl = 240; }        // quase branco
          else if (b > 0.45) { r = 230; g = 200; bl = 130; }   // dourado claro
          else { r = 180; g = 145; bl = 75; }                   // âmbar escuro

          ctx.globalAlpha = Math.min(alpha, 1);
          ctx.fillStyle = `rgb(${r},${g},${bl})`;
          ctx.fillText(
            chars[row * COLS + col] ? '1' : '0',
            col * CHAR_W,
            row * CHAR_H
          );
        }
      }
      ctx.globalAlpha = 1;
    }

    render();

    // Animação: troca aleatória de chars a cada frame
    const flickerCount = Math.floor(COLS * ROWS * FLICKER);
    setInterval(() => {
      for (let i = 0; i < flickerCount; i++) {
        const idx = Math.floor(Math.random() * COLS * ROWS);
        if (bright[idx] > THRESHOLD) chars[idx] ^= 1; // toggle 0↔1
      }
      render();
    }, 1000 / FPS);
  };

  img.onerror = () => console.warn('[binaryPortrait] imagem não encontrada:', src);
  img.src = src;
}
