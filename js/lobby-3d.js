(() => {
  "use strict";

  const viewer = document.getElementById("lobbyViewer");
  const picture = viewer?.querySelector(".lobbyViewer__picture");
  const image = document.getElementById("lobbyBgImg");
  const fxCanvas = document.getElementById("lobbyCanvas");

  if (!viewer || !picture || !image || !fxCanvas) {
    console.warn("Lobby exclusivo indisponível: elementos visuais não encontrados.");
    return;
  }

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const fx = fxCanvas.getContext("2d", { alpha: true, desynchronized: true });
  const camera = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    travelX: lowPower ? 10 : 20,
    travelY: lowPower ? 5 : 9,
    scale: lowPower ? 1.055 : 1.075
  };

  let animationId = 0;
  let previousTime = performance.now();
  let visible = !document.hidden;
  let intersecting = true;
  let fxWidth = 1;
  let fxHeight = 1;

  viewer.classList.remove("lobbyViewer--pbr", "lobbyViewer--physics");
  viewer.classList.add("lobbyViewer--rigid");
  viewer.dataset.effect = "exclusive-rigid-2.5d";
  viewer.dataset.motion = reducedMotion ? "fixed" : "rigid";
  delete viewer.dataset.depth;
  document.body.classList.add("lobby-mode", "lobby-video-ready");

  const particleCount = reducedMotion ? 22 : lowPower ? 44 : 76;
  const particles = Array.from({ length: particleCount }, (_, index) => ({
    x: (index * 73 % 103) / 103,
    y: (index * 47 % 97) / 97,
    depth: .25 + (index * 31 % 71) / 94,
    phase: index * 1.73,
    speed: .000012 + (index % 6) * .000004,
    size: .35 + (index % 5) * .18
  }));

  function resizeFx() {
    if (!fx) return;
    const bounds = viewer.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.25);
    fxWidth = Math.max(1, bounds.width);
    fxHeight = Math.max(1, bounds.height);
    fxCanvas.width = Math.max(1, Math.round(fxWidth * ratio));
    fxCanvas.height = Math.max(1, Math.round(fxHeight * ratio));
    fxCanvas.style.width = `${fxWidth}px`;
    fxCanvas.style.height = `${fxHeight}px`;
    fx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function applyCamera() {
    if (reducedMotion) {
      picture.style.transform = `translate3d(0,0,0) scale(${camera.scale})`;
      return;
    }

    // Uma única transformação afim move o quadro inteiro. Nenhum pixel ou
    // objeto recebe deslocamento individual, portanto nada pode esticar.
    const x = -camera.x * camera.travelX;
    const y = -camera.y * camera.travelY;
    picture.style.transform = `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) scale(${camera.scale})`;
  }

  function drawFx(time) {
    if (!fx) return;
    fx.clearRect(0, 0, fxWidth, fxHeight);
    fx.globalCompositeOperation = "lighter";

    for (const particle of particles) {
      particle.y -= particle.speed;
      if (particle.y < -.03) particle.y = 1.03;
      const depthShiftX = camera.x * particle.depth * 11;
      const depthShiftY = camera.y * particle.depth * 6;
      const x = particle.x * fxWidth + Math.sin(time * .00012 + particle.phase) * 8 + depthShiftX;
      const y = particle.y * fxHeight + Math.cos(time * .00008 + particle.phase) * 3 + depthShiftY;
      const fireLight = Math.max(0, 1 - Math.abs(particle.x - .5) * 3.2) * Math.max(0, 1 - Math.abs(particle.y - .42) * 2.2);
      const radius = particle.size * (.75 + particle.depth);
      fx.fillStyle = `rgba(255,211,145,${.04 + fireLight * .18})`;
      fx.beginPath();
      fx.arc(x, y, radius, 0, Math.PI * 2);
      fx.fill();
    }

    fx.globalCompositeOperation = "source-over";
  }

  function shouldRun() {
    return visible && intersecting && viewer.style.display !== "none" && !document.body.classList.contains("ritual-started");
  }

  function frame(time) {
    animationId = requestAnimationFrame(frame);
    const delta = Math.min(50, Math.max(0, time - previousTime));
    previousTime = time;
    const easing = 1 - Math.exp(-delta * .0072);
    camera.x += (camera.targetX - camera.x) * easing;
    camera.y += (camera.targetY - camera.y) * easing;
    applyCamera();
    if (!reducedMotion) drawFx(time);
  }

  function start() {
    if (!animationId && shouldRun()) {
      previousTime = performance.now();
      animationId = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (!animationId) return;
    cancelAnimationFrame(animationId);
    animationId = 0;
  }

  function resetCamera() {
    camera.targetX = 0;
    camera.targetY = 0;
  }

  function updateCamera(clientX, clientY) {
    if (reducedMotion) return;
    const bounds = viewer.getBoundingClientRect();
    if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) {
      resetCamera();
      return;
    }
    camera.targetX = Math.max(-1, Math.min(1, ((clientX - bounds.left) / bounds.width) * 2 - 1));
    camera.targetY = Math.max(-1, Math.min(1, ((clientY - bounds.top) / bounds.height) * 2 - 1));
  }

  addEventListener("pointermove", event => updateCamera(event.clientX, event.clientY), { passive: true });
  addEventListener("blur", resetCamera, { passive: true });
  document.addEventListener("mouseleave", resetCamera, { passive: true });

  function resize() {
    resizeFx();
    applyCamera();
    if (reducedMotion) drawFx(performance.now());
  }

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(viewer);
  else addEventListener("resize", resize, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting !== false;
      if (shouldRun()) start();
      else stop();
    }, { threshold: .01 }).observe(viewer);
  }

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (shouldRun()) start();
    else stop();
  });

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

  resize();
  applyCamera();
  start();
})();
