const scene = document.getElementById("scene");
const plane = document.getElementById("scenePlane");
const image = document.getElementById("sceneImage");
const depthCanvas = document.getElementById("depthCanvas");
const fxCanvas = document.getElementById("fxCanvas");
const hotspotLayer = document.getElementById("hotspots");
const navLayer = document.getElementById("navPoints");
const loader = document.getElementById("loader");
const loadStatus = document.getElementById("loadStatus");
const locationLabel = document.getElementById("locationLabel");
const clueList = document.getElementById("clueList");
const counter = document.getElementById("counter");
const tooltip = document.getElementById("tooltip");
const toast = document.getElementById("toast");
const modal = document.getElementById("clueModal");
const complete = document.getElementById("complete");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPower = innerWidth < 720 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const sourceSize = { width: 1672, height: 941 };
const assetRoot = "../assets/demo-investigacao/scene";

const nodes = {
  entry: {
    label: "23:47 · Entrada do escritório",
    zoom: 1, focus: { x:.5, y:.5 },
    avif: `${assetRoot}/arquivo-302-ultrareal.avif`,
    webp: `${assetRoot}/arquivo-302-ultrareal.webp`,
    depth: `${assetRoot}/arquivo-302-depth.webp`,
    lqip: `${assetRoot}/arquivo-302-lqip.webp`,
    alt: "Visão panorâmica da entrada do escritório",
    exits: [
      { to: "desk", x: 39, y: 67, icon: "↑", label: "Ir à escrivaninha" },
      { to: "sofa", x: 76, y: 67, icon: "↗", label: "Ir até o sofá" }
    ]
  },
  desk: {
    label: "23:48 · Examinando a bancada",
    zoom: 1.86, focus: { x:.36, y:.48 },
    avif: `${assetRoot}/arquivo-302-ultrareal.avif`,
    webp: `${assetRoot}/arquivo-302-ultrareal.webp`,
    depth: `${assetRoot}/arquivo-302-depth.webp`,
    lqip: `${assetRoot}/arquivo-302-lqip.webp`,
    alt: "Aproximação contínua da bancada da escrivaninha",
    exits: [
      { to: "entry", x: 47, y: 60, icon: "↓", label: "Recuar até a entrada" }
    ]
  },
  sofa: {
    label: "23:49 · Ao lado do sofá",
    zoom: 1.58, focus: { x:.72, y:.54 },
    avif: `${assetRoot}/arquivo-302-ultrareal.avif`,
    webp: `${assetRoot}/arquivo-302-ultrareal.webp`,
    depth: `${assetRoot}/arquivo-302-depth.webp`,
    lqip: `${assetRoot}/arquivo-302-lqip.webp`,
    alt: "Aproximação contínua do sofá e das evidências no tapete",
    exits: [
      { to: "entry", x: 60, y: 70, icon: "↓", label: "Recuar até a entrada" }
    ]
  }
};

const clues = [
  { id:"knife", node:"desk", title:"Faca de escritório", x:50.2, y:54.8, description:"A lâmina foi limpa às pressas. Fibras escuras permanecem junto ao cabo.", code:"EVD-302-A1" },
  { id:"key", node:"entry", title:"Chave sem identificação", x:58.2, y:92.7, description:"A pequena chave de latão não pertence a nenhuma fechadura do escritório.", code:"EVD-302-B4" },
  { id:"photo", node:"desk", title:"Documentos marcados", x:35.2, y:46.7, description:"Os documentos sobre a bancada ligam a vítima ao cais. Uma página foi retirada recentemente.", code:"EVD-302-C2" },
  { id:"camera", node:"sofa", title:"Câmera danificada", x:72.3, y:62.7, description:"O cartão de memória desapareceu, mas a lente ainda conserva uma impressão parcial.", code:"EVD-302-D7" },
  { id:"glass", node:"sofa", title:"Vidro temperado", x:78.2, y:69.3, description:"Os fragmentos não pertencem à janela. Há vestígios de perfume na superfície.", code:"EVD-302-E3" }
];

let currentNode = "entry";
let foundCount = 0;
let scanTimer = 0;
let moving = false;
let zoom = 1;
let panX = 0;
let dragState = null;
let dragMoved = false;
let pointerTarget = { x: .5, y: .5 };
let pointerCurrent = { x: .5, y: .5 };
let depthRenderer = null;
let depthAvailable = !reducedMotion;

function updatePlaneTransform() {
  const camera = nodes[currentNode];
  const cameraZoom = innerWidth < 720 ? Math.min(camera.zoom, 1.34) : camera.zoom;
  const scale = 1.018 * cameraZoom * zoom;
  const baseX = (.5 - camera.focus.x) * plane.clientWidth * scale;
  const baseY = (.5 - camera.focus.y) * plane.clientHeight * scale;
  const limitX = Math.max(0, (plane.clientWidth * scale - innerWidth) / 2);
  const limitY = Math.max(0, (plane.clientHeight * scale - innerHeight) / 2);
  const finalX = Math.max(-limitX, Math.min(limitX, baseX + panX));
  const finalY = Math.max(-limitY, Math.min(limitY, baseY));
  plane.style.left = `calc(50% + ${finalX}px)`;
  plane.style.top = `calc(50% + ${finalY}px)`;
  plane.style.transform = `translate(-50%,-50%) scale(${scale})`;
}
function fitPlane() {
  const scale = Math.max(innerWidth / sourceSize.width, innerHeight / sourceSize.height);
  plane.style.width = `${Math.ceil(sourceSize.width * scale)}px`;
  plane.style.height = `${Math.ceil(sourceSize.height * scale)}px`;
  updatePlaneTransform();
}

function moveTooltip(event) { tooltip.style.left = `${event.clientX}px`; tooltip.style.top = `${event.clientY}px`; }
function hideTooltip() { tooltip.classList.remove("show"); }

function buildClueList() {
  clues.forEach(clue => {
    const row = document.createElement("li");
    row.className = "clueRow";
    row.dataset.id = clue.id;
    row.innerHTML = `<span class="tick">✓</span><span>${clue.title}</span>`;
    clueList.appendChild(row);
  });
}

function renderNodeControls() {
  hotspotLayer.replaceChildren();
  navLayer.replaceChildren();
  locationLabel.textContent = nodes[currentNode].label;

  clues.filter(clue => clue.node === currentNode && !clue.found).forEach(clue => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hotspot";
    button.style.left = `${clue.x}%`;
    button.style.top = `${clue.y}%`;
    button.setAttribute("aria-label", `Investigar ${clue.title}`);
    button.addEventListener("pointerenter", event => { tooltip.textContent = clue.title; moveTooltip(event); tooltip.classList.add("show"); });
    button.addEventListener("pointermove", moveTooltip);
    button.addEventListener("pointerleave", hideTooltip);
    button.addEventListener("click", () => collectClue(clue, button));
    hotspotLayer.appendChild(button);
  });

  nodes[currentNode].exits.forEach(exit => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "navPoint";
    button.style.left = `${exit.x}%`;
    button.style.top = `${exit.y}%`;
    button.setAttribute("aria-label", exit.label);
    button.innerHTML = `${exit.icon}<span>${exit.label}</span>`;
    button.addEventListener("click", () => switchNode(exit.to));
    navLayer.appendChild(button);
  });
}

function collectClue(clue, button) {
  if (clue.found) return;
  clue.found = true;
  button.classList.add("found");
  document.querySelector(`.clueRow[data-id="${clue.id}"]`)?.classList.add("found");
  foundCount += 1;
  counter.textContent = `${foundCount} / ${clues.length}`;
  document.getElementById("evidenceTitle").textContent = clue.title;
  document.getElementById("evidenceText").textContent = clue.description;
  document.getElementById("evidenceCode").textContent = `CATÁLOGO DIGITAL · ${clue.code}`;
  modal.classList.add("open");
  hideTooltip();
  if (foundCount === clues.length) setTimeout(() => complete.classList.add("show"), 1450);
}

function closeModal() { modal.classList.remove("open"); }
document.getElementById("closeEvidence").addEventListener("click", closeModal);
modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
document.getElementById("playAgain").addEventListener("click", () => location.reload());
document.getElementById("resetBtn").addEventListener("click", () => { pointerTarget = { x:.5, y:.5 }; zoom = 1; panX = 0; updatePlaneTransform(); });
document.getElementById("scanBtn").addEventListener("click", event => {
  clearTimeout(scanTimer);
  scene.classList.add("scanMode");
  event.currentTarget.classList.add("scanActive");
  toast.textContent = "Profundidade forense ativada";
  toast.classList.add("show");
  scanTimer = setTimeout(() => { scene.classList.remove("scanMode"); event.currentTarget.classList.remove("scanActive"); toast.classList.remove("show"); }, 2500);
});

scene.addEventListener("pointerdown", event => {
  if (event.pointerType !== "touch") return;
  dragState = { startX:event.clientX, panX };
  dragMoved = false;
  scene.setPointerCapture(event.pointerId);
});
scene.addEventListener("pointermove", event => {
  if (!reducedMotion) { pointerTarget.x = event.clientX / innerWidth; pointerTarget.y = 1 - event.clientY / innerHeight; }
  if (dragState) { const delta = event.clientX - dragState.startX; dragMoved = Math.abs(delta) > 7; panX = dragState.panX + delta; updatePlaneTransform(); }
});
scene.addEventListener("pointerup", event => { if (dragState) scene.releasePointerCapture(event.pointerId); dragState = null; });
scene.addEventListener("pointercancel", () => { dragState = null; });
scene.addEventListener("pointerleave", () => { if (!dragState) pointerTarget = { x:.5, y:.5 }; });
scene.addEventListener("click", event => { if (dragMoved) { event.preventDefault(); event.stopPropagation(); dragMoved = false; } }, true);
scene.addEventListener("wheel", event => { event.preventDefault(); zoom = Math.max(1, Math.min(1.1, zoom - event.deltaY * .00018)); updatePlaneTransform(); }, { passive:false });

addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
  if (event.key.toLowerCase() === "q") document.getElementById("scanBtn").click();
  if (moving || modal.classList.contains("open")) return;
  const key = event.key.toLowerCase();
  if (key === "arrowdown" || key === "s") switchNode("entry");
  if ((key === "arrowleft" || key === "a") && currentNode !== "desk") switchNode("desk");
  if ((key === "arrowright" || key === "d") && currentNode !== "sofa") switchNode("sofa");
  if ((key === "arrowup" || key === "w") && currentNode === "entry") switchNode("desk");
});

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const asset = new Image();
    asset.decoding = "async";
    asset.onload = () => resolve(asset);
    asset.onerror = reject;
    asset.src = url;
  });
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function createDepthRenderer(colorImage, depthImage) {
  const gl = depthCanvas.getContext("webgl", { alpha:false, antialias:false, powerPreference:lowPower ? "low-power" : "high-performance" });
  if (!gl || reducedMotion) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}");
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, "precision mediump float;varying vec2 uv;uniform sampler2D colorMap;uniform sampler2D depthMap;uniform vec2 pointer;void main(){float d=texture2D(depthMap,uv).r;vec2 shift=(pointer-vec2(.5))*(d-.24)*.026;vec2 sampleUv=clamp(uv-shift,vec2(.008),vec2(.992));gl_FragColor=texture2D(colorMap,sampleUv);}");
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const textures = [gl.createTexture(), gl.createTexture()];
  const pointerUniform = gl.getUniformLocation(program, "pointer");

  function upload(unit, source, uniform) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(gl.getUniformLocation(program, uniform), unit);
  }
  function setImages(color, depth) { upload(0, color, "colorMap"); upload(1, depth, "depthMap"); }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.35);
    const width = Math.min(Math.round(plane.clientWidth * ratio), lowPower ? 1280 : 1920);
    const height = Math.round(width * sourceSize.height / sourceSize.width);
    if (depthCanvas.width !== width || depthCanvas.height !== height) { depthCanvas.width = width; depthCanvas.height = height; gl.viewport(0, 0, width, height); }
  }
  function render() {
    resize();
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * .055;
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * .055;
    gl.uniform2f(pointerUniform, pointerCurrent.x, pointerCurrent.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  setImages(colorImage, depthImage);
  return { render, setImages };
}

async function switchNode(nodeId) {
  if (moving || nodeId === currentNode || !nodes[nodeId]) return;
  moving = true;
  scene.classList.add("moving");
  hideTooltip();
  toast.textContent = nodeId === "desk" ? "Aproximando a câmera da bancada" : "Deslocando a câmera pelo escritório";
  toast.classList.add("show");
  currentNode = nodeId;
  panX = 0; zoom = 1; pointerTarget = { x:.5, y:.5 }; pointerCurrent = { x:.5, y:.5 };
  updatePlaneTransform();
  renderNodeControls();
  await new Promise(resolve => setTimeout(resolve, reducedMotion ? 0 : 1180));
  scene.classList.remove("moving");
  setTimeout(() => toast.classList.remove("show"), 420);
  moving = false;
}

const fx = fxCanvas.getContext("2d", { alpha:true });
const particles = Array.from({ length:lowPower ? 28 : 62 }, (_, index) => ({ x:(index * 97 % 101) / 101, y:(index * 53 % 89) / 89, speed:.000025 + (index % 7) * .000009, size:.45 + (index % 4) * .3, phase:index * 1.71 }));
function resizeFx() { const ratio = Math.min(devicePixelRatio || 1, 1.25); fxCanvas.width = Math.round(innerWidth * ratio); fxCanvas.height = Math.round(innerHeight * ratio); fx.setTransform(ratio, 0, 0, ratio, 0, 0); }
function drawFx(time) { fx.clearRect(0, 0, innerWidth, innerHeight); for (const p of particles) { p.y -= p.speed * 16; if (p.y < -.02) p.y = 1.02; const x = p.x * innerWidth + Math.sin(time * .00018 + p.phase) * 12; const y = p.y * innerHeight; fx.fillStyle = `rgba(255,222,168,${.08 + p.size * .035})`; fx.beginPath(); fx.arc(x, y, p.size, 0, Math.PI * 2); fx.fill(); } }
function frame(time) { if (depthRenderer) depthRenderer.render(); if (!reducedMotion) drawFx(time); requestAnimationFrame(frame); }

async function start() {
  buildClueList(); renderNodeControls(); fitPlane(); resizeFx();
  try {
    await image.decode();
    loadStatus.textContent = "Aplicando profundidade dinâmica";
    const initialAssets = await Promise.all([loadImage(image.currentSrc || image.src), depthAvailable ? loadImage(nodes.entry.depth) : Promise.resolve(null)]).then(([color, depth]) => ({ color, depth }));
    if (initialAssets.depth) depthRenderer = createDepthRenderer(initialAssets.color, initialAssets.depth);
    if (depthRenderer) { depthRenderer.render(); depthCanvas.classList.add("ready"); }
    else depthAvailable = false;
    loadStatus.textContent = depthRenderer ? "Cena explorável pronta" : "Cena otimizada pronta";
  } catch (error) {
    console.warn("Depth parallax indisponível; usando imagem otimizada.", error);
    depthAvailable = false;
    loadStatus.textContent = "Cena otimizada pronta";
  }
  const requestedNode = new URLSearchParams(location.search).get("view");
  if (requestedNode && requestedNode !== "entry" && nodes[requestedNode]) await switchNode(requestedNode);
  loader.classList.add("done");
  requestAnimationFrame(frame);
  if (innerWidth < 720) {
    setTimeout(() => { toast.textContent = "Arraste a cena para explorar o ambiente"; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2400); }, 380);
  }
}

addEventListener("resize", () => { fitPlane(); resizeFx(); }, { passive:true });
start();
