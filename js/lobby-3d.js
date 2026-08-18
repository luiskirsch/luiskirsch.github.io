import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js";

const viewer  = document.getElementById("lobbyViewer");
const canvas  = document.getElementById("lobbyCanvas");
if (!viewer || !canvas) throw new Error("lobby elements missing");

// ── Scene ──────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// sem background — canvas transparente deixa a imagem CSS aparecer

// ── Camera ─────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 50);
camera.position.set(0, 1.6, 3.5);

// ── Renderer (transparente) ────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled      = true;
renderer.shadowMap.type         = THREE.PCFSoftShadowMap;
renderer.toneMapping            = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure    = 1.05;
renderer.outputColorSpace       = THREE.SRGBColorSpace;

// ── Luzes (combinando com a sala: lâmpada central + janela lua + rádio verde) ──
// Ambiente escuro com leve tom frio
scene.add(new THREE.AmbientLight(0x0d1520, 4.0));

// Lâmpada suspensa acima (quente âmbar)
const lamp = new THREE.SpotLight(0xffaa40, 10.0, 10, Math.PI * 0.38, 0.55, 1.8);
lamp.position.set(0, 5.5, 0.3);
lamp.target.position.set(0, 0, 0);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024);
lamp.shadow.bias = -0.001;
scene.add(lamp);
scene.add(lamp.target);

// Luz de lua azul — janelas esquerda/direita
const moonL = new THREE.DirectionalLight(0x2845a0, 3.5);
moonL.position.set(-4, 3.5, 0.5);
scene.add(moonL);

const moonR = new THREE.DirectionalLight(0x1a2f70, 1.5);
moonR.position.set(3.5, 2.5, -0.5);
scene.add(moonR);

// Rim quente atrás — separa personagem do fundo
const rimBack = new THREE.DirectionalLight(0xb03800, 2.8);
rimBack.position.set(0, 3.5, -5);
scene.add(rimBack);

// Bounce verde do rádio (detalhes da cena)
const radio = new THREE.PointLight(0x0f3a18, 3.0, 4);
radio.position.set(-2.8, 0.9, -1.5);
scene.add(radio);

// Luz de preenchimento inferior quente (chão de madeira refletindo a lâmpada)
const floorBounce = new THREE.PointLight(0xc06018, 1.5, 3);
floorBounce.position.set(0, 0.15, 1.2);
scene.add(floorBounce);

// ── Shadow catcher invisível (personagem projeta sombra no chão da imagem) ──
const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 5),
  new THREE.ShadowMaterial({ opacity: 0.55, transparent: true })
);
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// ── Partículas: poeira fina (brancas/douradas, lentas) ─────────────
const N = 140;
const pPos = new Float32Array(N * 3);
const pVel = [];
for (let i = 0; i < N; i++) {
  const r = Math.random() * 2.6, th = Math.random() * Math.PI * 2;
  pPos[i*3]   = Math.cos(th) * r;
  pPos[i*3+1] = Math.random() * 5;
  pPos[i*3+2] = Math.sin(th) * r - 0.3;
  pVel.push({ x: (Math.random()-.5)*.001, y: .0008+Math.random()*.003, z: (Math.random()-.5)*.001 });
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0xfff0c0, size: .009, transparent: true, opacity: .55, depthWrite: false, sizeAttenuation: true });
scene.add(new THREE.Points(pGeo, pMat));

// ── Partículas: brasas maiores (âmbar, movimento errático) ──────────
const N2 = 30;
const p2Pos = new Float32Array(N2 * 3);
const p2Vel = [];
for (let i = 0; i < N2; i++) {
  const r = Math.random() * 1.5, th = Math.random() * Math.PI * 2;
  p2Pos[i*3]   = Math.cos(th) * r;
  p2Pos[i*3+1] = Math.random() * 3;
  p2Pos[i*3+2] = Math.sin(th) * r;
  p2Vel.push({ x: (Math.random()-.5)*.004, y: .003+Math.random()*.007, z: (Math.random()-.5)*.004 });
}
const p2Geo = new THREE.BufferGeometry();
p2Geo.setAttribute("position", new THREE.BufferAttribute(p2Pos, 3));
const p2Mat = new THREE.PointsMaterial({ color: 0xffaa30, size: .022, transparent: true, opacity: .35, depthWrite: false, sizeAttenuation: true });
scene.add(new THREE.Points(p2Geo, p2Mat));

// ── Controls ───────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableZoom      = false;
controls.enablePan       = false;
controls.rotateSpeed     = 0.5;
controls.minPolarAngle   = Math.PI * 0.25;
controls.maxPolarAngle   = Math.PI * 0.52;
controls.autoRotate      = true;
controls.autoRotateSpeed = 0.4;
controls.update();

let arTimer = null;
renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate=false; clearTimeout(arTimer); });
renderer.domElement.addEventListener("pointerup",   () => { arTimer=setTimeout(()=>{ controls.autoRotate=true; }, 4000); });

// ── Resize ─────────────────────────────────────────────────────────
function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
new ResizeObserver(resize).observe(viewer);
resize();

// ── Render loop (pausável) ─────────────────────────────────────────
const clock = new THREE.Clock();
let _animId = null;

function animate() {
  _animId = requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // poeira fina flutua (muito devagar, ondulação sutil)
  for (let i = 0; i < N; i++) {
    const v = pVel[i];
    pPos[i*3] += v.x + Math.sin(t * 0.3 + i) * 0.0004;
    pPos[i*3+1] += v.y;
    pPos[i*3+2] += v.z;
    if (pPos[i*3+1] > 5.2) {
      const r2=Math.random()*2.4, th2=Math.random()*Math.PI*2;
      pPos[i*3]=Math.cos(th2)*r2; pPos[i*3+1]=-0.1; pPos[i*3+2]=Math.sin(th2)*r2-0.3;
      v.x=(Math.random()-.5)*.001; v.y=.0008+Math.random()*.003; v.z=(Math.random()-.5)*.001;
    }
  }
  pGeo.attributes.position.needsUpdate = true;

  // brasas sobem com movimento errático
  for (let i = 0; i < N2; i++) {
    const v = p2Vel[i];
    p2Pos[i*3] += v.x + Math.sin(t * 1.5 + i * 0.8) * 0.0012;
    p2Pos[i*3+1] += v.y;
    p2Pos[i*3+2] += v.z;
    if (p2Pos[i*3+1] > 4.0) {
      const r2=Math.random()*1.2, th2=Math.random()*Math.PI*2;
      p2Pos[i*3]=Math.cos(th2)*r2; p2Pos[i*3+1]=0; p2Pos[i*3+2]=Math.sin(th2)*r2;
      v.x=(Math.random()-.5)*.004; v.y=.003+Math.random()*.007; v.z=(Math.random()-.5)*.004;
    }
  }
  p2Geo.attributes.position.needsUpdate = true;

  // lâmpada pisca (incandescência irregular)
  lamp.intensity = 9.5 + Math.sin(t * 1.8) * 0.7 + Math.sin(t * 4.3) * 0.3 + Math.sin(t * 11.7) * 0.15;
  // rádio verde pulsa
  radio.intensity = 2.8 + Math.sin(t * 2.1) * 0.6;

  controls.update();
  renderer.render(scene, camera);
}

function _startLoop() {
  if (_animId) return;
  clock.start();
  _animId = requestAnimationFrame(animate);
}

function _stopLoop() {
  if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
}

// Pausa quando a aba fica oculta; retoma quando volta ao foco.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) _stopLoop();
  else if (viewer.style.display !== "none") _startLoop();
});

// ── Bridge ─────────────────────────────────────────────────────────
// Só ativa lobby-mode se o ritual ainda não iniciou (evita race condition
// onde este módulo carrega do CDN depois que hideLobbyView() já removeu a classe)
if (!document.body.classList.contains("ritual-started")) {
  document.body.classList.add("lobby-mode");
  _startLoop();
} else {
  viewer.style.display = "none";
}
window._lobby3d = {
  show() {
    if (document.body.classList.contains("ritual-started")) return;
    viewer.style.display = "flex";
    document.body.classList.add("lobby-mode");
    resize();
    _startLoop();
  },
  hide() {
    viewer.style.display = "none";
    document.body.classList.remove("lobby-mode");
    _stopLoop();
  }
};
