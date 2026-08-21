(() => {
  "use strict";

  const viewer = document.getElementById("lobbyViewer");
  const frame = viewer?.querySelector(".lobbyViewer__picture");
  const video = document.getElementById("lobbyBgVideo");

  if (!viewer || !frame || !video) {
    console.warn("Lobby animado indisponível: elementos visuais não encontrados.");
    return;
  }

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowPower = innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const camera = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    travelX: lowPower ? 8 : 16,
    travelY: lowPower ? 4 : 8,
    scale: lowPower ? 1.045 : 1.06
  };

  let animationId = 0;
  let previousTime = performance.now();
  let visible = !document.hidden;
  let intersecting = true;

  viewer.classList.remove("lobbyViewer--pbr", "lobbyViewer--physics");
  viewer.classList.add("lobbyViewer--rigid", "lobbyViewer--animated");
  viewer.dataset.effect = "animated-video-rigid";
  viewer.dataset.motion = reducedMotion ? "fixed" : "rigid";
  delete viewer.dataset.depth;
  document.body.classList.add("lobby-mode");

  function applyCamera() {
    const x = reducedMotion ? 0 : -camera.x * camera.travelX;
    const y = reducedMotion ? 0 : -camera.y * camera.travelY;
    frame.style.transform = `translate3d(${x.toFixed(3)}px,${y.toFixed(3)}px,0) scale(${camera.scale})`;
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

  function shouldRun() {
    return visible && intersecting && viewer.style.display !== "none" && !document.body.classList.contains("ritual-started");
  }

  function syncPlayback() {
    if (shouldRun()) video.play().catch(() => {});
    else video.pause();
  }

  function animate(time) {
    animationId = requestAnimationFrame(animate);
    const delta = Math.min(50, Math.max(0, time - previousTime));
    previousTime = time;
    const easing = 1 - Math.exp(-delta * .0068);
    camera.x += (camera.targetX - camera.x) * easing;
    camera.y += (camera.targetY - camera.y) * easing;
    applyCamera();
  }

  function start() {
    syncPlayback();
    if (!animationId && shouldRun() && !reducedMotion) {
      previousTime = performance.now();
      animationId = requestAnimationFrame(animate);
    }
  }

  function stop() {
    video.pause();
    if (!animationId) return;
    cancelAnimationFrame(animationId);
    animationId = 0;
  }

  addEventListener("pointermove", event => updateCamera(event.clientX, event.clientY), { passive: true });
  addEventListener("blur", resetCamera, { passive: true });
  document.addEventListener("mouseleave", resetCamera, { passive: true });

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
      applyCamera();
      start();
    },
    hide() {
      viewer.style.display = "none";
      document.body.classList.remove("lobby-mode");
      stop();
    }
  };

  applyCamera();
  start();
})();
