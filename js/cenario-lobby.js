(() => {
  "use strict";

  const plane = document.getElementById("scenePlane");
  const image = document.getElementById("sceneImage");
  const canvas = document.getElementById("lobbySceneCanvas");
  const loading = document.getElementById("sceneLoading");
  const loadingBar = document.getElementById("sceneLoadingBar");
  const loadingText = document.getElementById("sceneLoadingText");
  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const imageRatio = 1672 / 941;

  const camera = {
    x: 0, y: 0, targetX: 0, targetY: 0,
    zoom: 1.075, targetZoom: 1.075,
    travelX: lowPower ? 13 : 25,
    travelY: lowPower ? 7 : 13
  };

  let width = 1;
  let height = 1;
  let frameId = 0;
  let previousTime = performance.now();
  let ready = false;
  let touchOrigin = null;

  const particleCount = reducedMotion ? 0 : lowPower ? 38 : 72;
  const particles = Array.from({ length: particleCount }, (_, index) => ({
    x: ((index * 79) % 101) / 101,
    y: ((index * 53) % 97) / 97,
    phase: index * 1.37,
    speed: .004 + (index % 7) * .0012,
    size: .35 + (index % 5) * .18,
    depth: .35 + ((index * 31) % 59) / 85
  }));

  function fitScene() {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    let planeWidth = width;
    let planeHeight = width / imageRatio;
    if (planeHeight < height) {
      planeHeight = height;
      planeWidth = height * imageRatio;
    }
    plane.style.width = `${planeWidth}px`;
    plane.style.height = `${planeHeight}px`;

    const dpr = Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.25);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setPointer(clientX, clientY) {
    if (reducedMotion) return;
    camera.targetX = Math.max(-1, Math.min(1, (clientX / width) * 2 - 1));
    camera.targetY = Math.max(-1, Math.min(1, (clientY / height) * 2 - 1));
  }

  function resetPointer() {
    camera.targetX = 0;
    camera.targetY = 0;
  }

  addEventListener("pointermove", event => {
    if (touchOrigin && event.pointerType !== "mouse") {
      camera.targetX = Math.max(-1, Math.min(1, (event.clientX - touchOrigin.x) / (width * .22)));
      camera.targetY = Math.max(-1, Math.min(1, (event.clientY - touchOrigin.y) / (height * .2)));
      return;
    }
    setPointer(event.clientX, event.clientY);
  }, { passive: true });

  addEventListener("pointerdown", event => {
    if (event.pointerType !== "mouse") touchOrigin = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  addEventListener("pointerup", () => { touchOrigin = null; }, { passive: true });
  addEventListener("pointercancel", () => { touchOrigin = null; resetPointer(); }, { passive: true });
  addEventListener("blur", resetPointer, { passive: true });
  document.addEventListener("mouseleave", resetPointer, { passive: true });
  addEventListener("wheel", event => {
    if (reducedMotion) return;
    camera.targetZoom = Math.max(1.06, Math.min(1.13, camera.targetZoom + Math.sign(event.deltaY) * .008));
  }, { passive: true });
  addEventListener("resize", fitScene, { passive: true });

  function drawParticles(time, dt) {
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";
    for (const particle of particles) {
      particle.y -= particle.speed * dt;
      if (particle.y < -.03) particle.y = 1.03;
      const x = particle.x * width + Math.sin(time * .00015 + particle.phase) * 7 + camera.x * particle.depth * 5;
      const y = particle.y * height + Math.cos(time * .0001 + particle.phase) * 3 + camera.y * particle.depth * 3;
      const glow = Math.max(0, 1 - Math.abs(particle.x - .24) * 3.2) * Math.max(0, 1 - Math.abs(particle.y - .34) * 2.7);
      context.fillStyle = `rgba(255,233,184,${.025 + glow * .16})`;
      context.beginPath();
      context.arc(x, y, particle.size * (.7 + particle.depth), 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
  }

  function animate(time) {
    frameId = requestAnimationFrame(animate);
    const dtMs = Math.min(45, Math.max(1, time - previousTime));
    previousTime = time;
    const easing = 1 - Math.exp(-dtMs * .0065);
    camera.x += (camera.targetX - camera.x) * easing;
    camera.y += (camera.targetY - camera.y) * easing;
    camera.zoom += (camera.targetZoom - camera.zoom) * easing;

    const x = -camera.x * camera.travelX;
    const y = -camera.y * camera.travelY;
    plane.style.transform = `translate3d(calc(-50% + ${x.toFixed(2)}px),calc(-50% + ${y.toFixed(2)}px),0) scale(${camera.zoom.toFixed(5)})`;
    if (!reducedMotion) drawParticles(time, dtMs / 1000);
  }

  async function showScene() {
    loadingBar.style.width = "58%";
    loadingText.textContent = "Abrindo a sala";
    try {
      if (!image.complete) await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      });
      if (image.decode) await image.decode().catch(() => {});
      ready = true;
      loadingBar.style.width = "100%";
      loadingText.textContent = "Sala pronta";
      plane.classList.add("ready");
      setTimeout(() => loading.classList.add("done"), 260);
    } catch (error) {
      console.error("Não foi possível carregar o cenário", error);
      loadingText.textContent = "Falha ao abrir a sala";
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else if (!document.hidden && !frameId) {
      previousTime = performance.now();
      frameId = requestAnimationFrame(animate);
    }
  });

  fitScene();
  showScene();
  frameId = requestAnimationFrame(animate);
  window._lobbyScene = { ready: () => ready, reset: resetPointer };
})();
