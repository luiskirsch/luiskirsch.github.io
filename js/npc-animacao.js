(() => {
  "use strict";

  const stage = document.getElementById("motionStage");
  const hit = document.getElementById("characterHit");
  const reactButton = document.getElementById("reactButton");
  const bubble = document.getElementById("speechBubble");
  const status = document.getElementById("motionStatus");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const parts = {
    head: document.getElementById("head"),
    torso: document.getElementById("torso"),
    hem: document.getElementById("waistcoatHem"),
    lower: document.getElementById("lowerBody"),
    leftArm: document.getElementById("leftArm"),
    rightUpper: document.getElementById("rightUpperArm"),
    rightFore: document.getElementById("rightForearm")
  };

  const pointer = { x: 0, y: 0, inside: false };
  const springs = {};
  let reactionStarted = -Infinity;
  let bubbleTimer = 0;
  let lastTime = performance.now();

  function spring(name, target, stiffness, damping, dt) {
    const state = springs[name] || (springs[name] = { value: target, velocity: 0 });
    state.velocity += (target - state.value) * stiffness * dt;
    state.velocity *= Math.exp(-damping * dt);
    state.value += state.velocity * dt;
    return state.value;
  }

  function setPointer(clientX, clientY) {
    const bounds = stage.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((clientX - bounds.left) / bounds.width) * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, ((clientY - bounds.top) / bounds.height) * 2 - 1));
    pointer.inside = clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
    if (!pointer.inside) {
      pointer.x = 0;
      pointer.y = 0;
    }
  }

  addEventListener("pointermove", event => {
    if (!reducedMotion) setPointer(event.clientX, event.clientY);
    stage.classList.toggle("active", pointer.inside);
    status.textContent = pointer.inside ? "ACOMPANHANDO" : "MOVA O CURSOR";
  }, { passive: true });

  addEventListener("blur", () => {
    pointer.x = 0;
    pointer.y = 0;
    pointer.inside = false;
  }, { passive: true });

  function react() {
    if (reducedMotion) {
      bubble.classList.add("show");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("show"), 1800);
      return;
    }
    reactionStarted = performance.now();
    status.textContent = "REAÇÃO ATIVA";
    bubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove("show"), 2100);
  }

  hit.addEventListener("click", react);
  reactButton.addEventListener("click", react);

  function animate(time) {
    const dt = Math.min(.04, Math.max(.001, (time - lastTime) / 1000));
    lastTime = time;
    const idle = time * .001;
    const reactionAge = (time - reactionStarted) / 1000;
    const reacting = reactionAge >= 0 && reactionAge < 1.65;
    const reactionEnvelope = reacting ? Math.sin(Math.min(1, reactionAge / 1.65) * Math.PI) : 0;
    const wave = reacting ? Math.sin(reactionAge * 12.5) * reactionEnvelope : 0;

    const breath = reducedMotion ? 0 : Math.sin(idle * 1.42);
    const gazeX = reducedMotion ? 0 : pointer.x;
    const gazeY = reducedMotion ? 0 : pointer.y;

    const torsoAngle = spring("torsoAngle", gazeX * .7 - reactionEnvelope * 1.1, 28, 9, dt);
    const torsoX = spring("torsoX", gazeX * 4.2, 24, 8.5, dt);
    const torsoY = spring("torsoY", breath * 1.7 - reactionEnvelope * 3.2, 22, 8, dt);
    const headAngle = spring("headAngle", gazeX * 3.2 + gazeY * .35 + reactionEnvelope * 1.9, 34, 10, dt);
    const headX = spring("headX", gazeX * 4.8, 30, 9.5, dt);
    const headY = spring("headY", gazeY * 2.4 - breath * .6, 30, 9.5, dt);
    const hemAngle = spring("hemAngle", -torsoAngle * .42 + gazeX * .18, 12, 5.2, dt);
    const lowerAngle = spring("lowerAngle", gazeX * .16 - reactionEnvelope * .2, 9, 4.5, dt);
    const leftArmAngle = spring("leftArm", -gazeX * .75 + breath * .22, 15, 6, dt);
    const rightUpperAngle = spring("rightUpper", gazeX * .34 - reactionEnvelope * .75, 18, 6.4, dt);
    const rightForeAngle = spring("rightFore", reactionEnvelope * -1.15 + wave * .25, 23, 6.8, dt);
    const breatheScale = 1 + breath * .0035;

    parts.lower.setAttribute("transform", `translate(${(-torsoX * .12).toFixed(2)} 0) rotate(${lowerAngle.toFixed(3)} 520 620)`);
    parts.torso.setAttribute("transform", `translate(${torsoX.toFixed(2)} ${torsoY.toFixed(2)}) rotate(${torsoAngle.toFixed(3)} 512 620) scale(1 ${breatheScale.toFixed(5)})`);
    parts.hem.setAttribute("transform", `translate(${(torsoX * .72).toFixed(2)} ${(torsoY * .82).toFixed(2)}) rotate(${hemAngle.toFixed(3)} 512 570)`);
    parts.head.setAttribute("transform", `translate(${headX.toFixed(2)} ${headY.toFixed(2)}) rotate(${headAngle.toFixed(3)} 512 310)`);
    parts.leftArm.setAttribute("transform", `translate(${(torsoX * .7).toFixed(2)} ${(torsoY * .45).toFixed(2)}) rotate(${leftArmAngle.toFixed(3)} 350 360)`);
    parts.rightUpper.setAttribute("transform", `translate(${(torsoX * .68).toFixed(2)} ${(torsoY * .42).toFixed(2)}) rotate(${rightUpperAngle.toFixed(3)} 670 365)`);
    parts.rightFore.setAttribute("transform", `rotate(${rightForeAngle.toFixed(3)} 704 585)`);

    if (!reacting && time - reactionStarted < 2300) status.textContent = pointer.inside ? "ACOMPANHANDO" : "MOVA O CURSOR";
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
