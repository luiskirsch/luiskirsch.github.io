const viewer = document.getElementById("lobbyViewer");
const canvas = document.getElementById("lobbyCanvas");

if (!viewer || !canvas) throw new Error("lobby elements missing");

const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
if (!context) throw new Error("2D canvas unavailable");
const lightCanvas = document.createElement("canvas");
const lightContext = lightCanvas.getContext("2d", { alpha: true });
if (!lightContext) throw new Error("Light canvas unavailable");

const daylight = Boolean(document.getElementById("lobbyBgImg"));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPower = innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const particleCount = reducedMotion ? 60 : lowPower ? 110 : 220;
const targetFrameTime = lowPower ? 1000 / 30 : 0;
const TAU = Math.PI * 2;

let width = 1;
let height = 1;
let pixelRatio = 1;
let animationId = 0;
let lastFrame = performance.now();
let lastPaint = 0;
let visible = !document.hidden;
let intersecting = true;

canvas.style.pointerEvents = "none";
canvas.setAttribute("aria-hidden", "true");
canvas.dataset.physics = "active";
viewer.classList.add("lobbyViewer--physics");
const hint = viewer.querySelector(".lobbyViewer__hint");
if (hint) hint.hidden = true;

// Os feixes acompanham as duas janelas da arte. As coordenadas são normalizadas
// para continuarem corretas em qualquer resolução do lobby.
const beams = daylight ? [
  { sourceX: 0.285, sourceY: 0.095, bottomX: 0.455, topWidth: 0.045, bottomWidth: 0.22, strength: 1.0 },
  { sourceX: 0.805, sourceY: 0.105, bottomX: 0.605, topWidth: 0.050, bottomWidth: 0.24, strength: 0.92 }
] : [];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resetParticle(particle, anywhere = false) {
  particle.y = anywhere ? Math.random() : randomBetween(-0.08, 0.02);
  if (daylight && beams.length && Math.random() < 0.62) {
    const beam = beams[Math.floor(Math.random() * beams.length)];
    const progress = Math.max(0, Math.min(1, (particle.y - beam.sourceY) / (1 - beam.sourceY)));
    const center = beam.sourceX + (beam.bottomX - beam.sourceX) * progress;
    const halfWidth = beam.topWidth + (beam.bottomWidth - beam.topWidth) * progress;
    particle.x = center + randomBetween(-0.88, 0.88) * halfWidth;
  } else {
    particle.x = Math.random();
  }
  particle.z = Math.random();
  particle.radius = randomBetween(0.35, 1.45);
  particle.vx = randomBetween(-0.002, 0.002);
  particle.vy = randomBetween(0.001, 0.006);
  particle.seed = Math.random() * 100;
  particle.phase = Math.random() * TAU;
  // A velocidade terminal cresce com o quadrado do raio (regime de Stokes).
  particle.settling = 0.0015 + particle.radius * particle.radius * 0.0032;
}

const particles = Array.from({ length: particleCount }, () => {
  const particle = {};
  resetParticle(particle, true);
  return particle;
});

function smoothStep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function beamIntensity(x, y) {
  let light = daylight ? 0.08 : 0.025;
  for (const beam of beams) {
    const progress = Math.max(0, Math.min(1, (y - beam.sourceY) / (1 - beam.sourceY)));
    const center = beam.sourceX + (beam.bottomX - beam.sourceX) * progress;
    const halfWidth = beam.topWidth + (beam.bottomWidth - beam.topWidth) * progress;
    const lateral = 1 - Math.abs(x - center) / halfWidth;
    const vertical = smoothStep(progress / 0.12) * smoothStep((1 - progress) / 0.12);
    light += smoothStep(lateral) * vertical * beam.strength;
  }
  return Math.min(1.25, light);
}

function drawBeam(targetContext, beam) {
  const sourceX = beam.sourceX * width;
  const sourceY = beam.sourceY * height;
  const bottomX = beam.bottomX * width;

  // Camadas concêntricas evitam bordas artificiais e aproximam espalhamento
  // volumétrico em um ambiente com poeira suspensa.
  for (let layer = 10; layer >= 0; layer -= 1) {
    const spread = (layer + 1) / 11;
    const topHalf = beam.topWidth * width * spread;
    const bottomHalf = beam.bottomWidth * width * spread;
    const gradient = targetContext.createLinearGradient(sourceX, sourceY, bottomX, height);
    const alpha = (0.012 + (1 - spread) * 0.007) * beam.strength;
    gradient.addColorStop(0, "rgba(255,249,218,0)");
    gradient.addColorStop(0.12, `rgba(255,244,196,${alpha * 1.5})`);
    gradient.addColorStop(0.58, `rgba(255,224,155,${alpha})`);
    gradient.addColorStop(1, "rgba(255,207,116,0)");

    targetContext.beginPath();
    targetContext.moveTo(sourceX - topHalf, sourceY);
    targetContext.lineTo(sourceX + topHalf, sourceY);
    targetContext.lineTo(bottomX + bottomHalf, height);
    targetContext.lineTo(bottomX - bottomHalf, height);
    targetContext.closePath();
    targetContext.fillStyle = gradient;
    targetContext.fill();
  }
}

function rebuildLightLayer() {
  lightCanvas.width = canvas.width;
  lightCanvas.height = canvas.height;
  lightContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  lightContext.clearRect(0, 0, width, height);
  lightContext.globalCompositeOperation = "lighter";
  for (const beam of beams) drawBeam(lightContext, beam);
  lightContext.globalCompositeOperation = "source-over";
}

const dustSprites = [];
function createDustSprite(index) {
  const sprite = document.createElement("canvas");
  const size = 32;
  sprite.width = size;
  sprite.height = size;
  const spriteContext = sprite.getContext("2d");
  const glow = spriteContext.createRadialGradient(16, 16, 0, 16, 16, 16);
  const core = 0.92 - index * 0.08;
  glow.addColorStop(0, `rgba(255,252,225,${core})`);
  glow.addColorStop(0.12, `rgba(255,240,190,${core * 0.72})`);
  glow.addColorStop(0.38, `rgba(255,221,145,${core * 0.24})`);
  glow.addColorStop(1, "rgba(255,205,110,0)");
  spriteContext.fillStyle = glow;
  spriteContext.fillRect(0, 0, size, size);
  return sprite;
}

for (let index = 0; index < 4; index += 1) dustSprites.push(createDustSprite(index));

function updateParticles(delta, time) {
  const rootDelta = Math.sqrt(delta);
  for (const particle of particles) {
    // Campo de velocidade divergente: convecção solar + redemoinhos lentos.
    const curlX = Math.sin(particle.y * 10.5 + time * 0.24 + particle.seed) * 0.0065 +
      Math.cos(particle.z * 7.0 - time * 0.13 + particle.seed) * 0.0035;
    const curlY = Math.cos(particle.x * 9.0 - time * 0.19 + particle.seed) * 0.0045;
    const solarLift = beamIntensity(particle.x, particle.y) * 0.006;
    const targetVx = 0.0025 + curlX;
    const targetVy = particle.settling + curlY - solarLift;
    const drag = 1 - Math.exp(-delta * (1.8 + (1 - particle.z) * 1.4));

    particle.vx += (targetVx - particle.vx) * drag;
    particle.vy += (targetVy - particle.vy) * drag;
    // Movimento browniano é mais perceptível nos grãos menores.
    const brownian = (1.8 - particle.radius) * 0.0018 * rootDelta;
    particle.vx += randomBetween(-brownian, brownian);
    particle.vy += randomBetween(-brownian, brownian);
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;

    if (particle.x > 1.04) particle.x = -0.04;
    if (particle.x < -0.04) particle.x = 1.04;
    if (particle.y > 1.06 || particle.y < -0.12) resetParticle(particle, false);
  }
}

function drawParticles(time) {
  for (const particle of particles) {
    const illumination = beamIntensity(particle.x, particle.y);
    const twinkle = 0.78 + Math.sin(time * 0.8 + particle.phase) * 0.22;
    const depthScale = 0.55 + particle.z * 1.85;
    const diameter = Math.max(1.9, particle.radius * depthScale * (lowPower ? 3.6 : 4.4));
    const alpha = Math.min(0.94, (0.055 + illumination * 0.58) * twinkle * (0.68 + particle.z * 0.48));
    if (alpha < 0.025) continue;

    const spriteIndex = Math.min(3, Math.floor(particle.z * 4));
    context.globalAlpha = alpha;
    context.drawImage(
      dustSprites[spriteIndex],
      particle.x * width - diameter * 2,
      particle.y * height - diameter * 2,
      diameter * 4,
      diameter * 4
    );
  }
  context.globalAlpha = 1;
}

function render(time) {
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 0.95 + Math.sin(time * 0.17) * 0.025 + Math.sin(time * 0.043) * 0.018;
  context.drawImage(lightCanvas, 0, 0, width, height);
  context.globalAlpha = 1;
  drawParticles(time);
  context.globalCompositeOperation = "source-over";
}

function frame(now) {
  animationId = requestAnimationFrame(frame);
  if (targetFrameTime && now - lastPaint < targetFrameTime) return;

  const delta = Math.min(0.04, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  lastPaint = now;
  const time = now / 1000;
  updateParticles(delta, time);
  render(time);
}

function shouldRun() {
  return visible && intersecting && viewer.style.display !== "none" && !document.body.classList.contains("ritual-started");
}

function start() {
  if (animationId || !shouldRun()) return;
  lastFrame = performance.now();
  if (reducedMotion) {
    render(lastFrame / 1000);
    return;
  }
  animationId = requestAnimationFrame(frame);
}

function stop() {
  if (!animationId) return;
  cancelAnimationFrame(animationId);
  animationId = 0;
}

function resize() {
  const bounds = viewer.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  width = bounds.width;
  height = bounds.height;
  pixelRatio = Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.35);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  rebuildLightLayer();
  render(performance.now() / 1000);
}

// Um movimento rápido próximo da tela desloca o ar e perturba as partículas.
let previousPointer = null;
viewer.addEventListener("pointermove", event => {
  if (reducedMotion) return;
  const bounds = viewer.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width;
  const y = (event.clientY - bounds.top) / bounds.height;
  if (previousPointer) {
    const movementX = x - previousPointer.x;
    const movementY = y - previousPointer.y;
    for (const particle of particles) {
      const dx = particle.x - x;
      const dy = particle.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 0.16) continue;
      const impulse = smoothStep(1 - distance / 0.16) * (0.45 + particle.z * 0.55);
      particle.vx += movementX * impulse * 1.8 + dx * impulse * 0.018;
      particle.vy += movementY * impulse * 1.8 + dy * impulse * 0.018;
    }
  }
  previousPointer = { x, y };
}, { passive: true });
viewer.addEventListener("pointerleave", () => { previousPointer = null; }, { passive: true });

if ("ResizeObserver" in window) {
  new ResizeObserver(resize).observe(viewer);
} else {
  window.addEventListener("resize", resize, { passive: true });
}
if ("IntersectionObserver" in window) {
  new IntersectionObserver(entries => {
    intersecting = entries[0]?.isIntersecting !== false;
    if (shouldRun()) start(); else stop();
  }, { threshold: 0.01 }).observe(viewer);
}

document.addEventListener("visibilitychange", () => {
  visible = !document.hidden;
  if (shouldRun()) start(); else stop();
});

resize();
if (!document.body.classList.contains("ritual-started")) {
  document.body.classList.add("lobby-mode");
  start();
} else {
  viewer.style.display = "none";
}

window._lobby3d = {
  show() {
    if (document.body.classList.contains("ritual-started")) return;
    viewer.style.display = "flex";
    document.body.classList.add("lobby-mode");
    resize();
    start();
  },
  hide() {
    viewer.style.display = "none";
    document.body.classList.remove("lobby-mode");
    stop();
  }
};
