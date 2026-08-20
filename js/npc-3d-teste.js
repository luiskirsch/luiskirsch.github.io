import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/meshopt_decoder.module.js";

const canvas = document.getElementById("modelCanvas");
const stage = document.getElementById("modelStage");
const loadingPanel = document.getElementById("loadingPanel");
const loadingBar = document.getElementById("loadingBar");
const loadingValue = document.getElementById("loadingValue");
const renderStatus = document.getElementById("renderStatus");
const playButton = document.getElementById("playButton");
const playIcon = document.getElementById("playIcon");
const playLabel = document.getElementById("playLabel");
const speedSelect = document.getElementById("speedSelect");
const resetButton = document.getElementById("resetButton");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
let camera;
let controls;
let mixer;
let action;
let model;
let playing = !reducedMotion;
let baseView = null;
let frame = 0;
const clock = new THREE.Clock();

function setStatus(text, state = "") {
  renderStatus.className = `renderStatus ${state}`.trim();
  renderStatus.lastChild.textContent = ` ${text}`;
}

function fail(message) {
  setStatus("FALHA NO WEBGL", "error");
  loadingValue.textContent = "Erro";
  loadingPanel.querySelector("small").textContent = message;
  console.error(message);
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (error) {
  fail("Este navegador não conseguiu iniciar a renderização 3D.");
  throw error;
}

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.2 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe5dc, 4.5, 9);

camera = new THREE.PerspectiveCamera(34, 1, .01, 50);
camera.position.set(1.45, 1.05, 3.4);

controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.enablePan = false;
controls.minPolarAngle = Math.PI * .25;
controls.maxPolarAngle = Math.PI * .66;
controls.minDistance = 1.15;
controls.maxDistance = 5.8;
controls.target.set(0, .96, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
pmrem.dispose();

const hemi = new THREE.HemisphereLight(0xf4f2df, 0x5a695b, 2.15);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff3d8, 4.7);
key.position.set(-2.6, 4.5, 3.1);
key.castShadow = true;
key.shadow.mapSize.set(innerWidth < 760 ? 1024 : 2048, innerWidth < 760 ? 1024 : 2048);
key.shadow.camera.left = -2.2;
key.shadow.camera.right = 2.2;
key.shadow.camera.top = 3.2;
key.shadow.camera.bottom = -1;
key.shadow.bias = -.00025;
scene.add(key);

const rim = new THREE.SpotLight(0x9fc6bb, 18, 8, Math.PI * .22, .75, 1.4);
rim.position.set(2.8, 3.1, -2.4);
rim.target.position.set(0, 1, 0);
scene.add(rim, rim.target);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(3.6, 96),
  new THREE.MeshStandardMaterial({ color: 0xc8d0c5, roughness: .72, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.position.y = -.008;
scene.add(floor);

function updateProgress(event) {
  const ratio = event.total ? event.loaded / event.total : Math.min(.92, event.loaded / 4361684);
  const value = Math.max(1, Math.min(99, Math.round(ratio * 100)));
  loadingValue.textContent = `${value}%`;
  loadingBar.style.width = `${value}%`;
}

function setModelView(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= box.min.y;
  object.position.z -= center.z;
  object.updateMatrixWorld(true);

  const height = Math.max(size.y, .8);
  const narrow = stage.clientWidth / stage.clientHeight < .72;
  const target = new THREE.Vector3(0, height * .49, 0);
  const position = new THREE.Vector3(height * (narrow ? .42 : .56), height * .53, height * (narrow ? 2.05 : 1.72));
  controls.target.copy(target);
  camera.position.copy(position);
  camera.near = Math.max(.01, height / 100);
  camera.far = height * 18;
  camera.updateProjectionMatrix();
  controls.minDistance = height * .62;
  controls.maxDistance = height * 3.2;
  controls.update();
  baseView = { target: target.clone(), position: position.clone() };
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load(
  "/assets/npc/humanoide-3d-web.glb?v=1",
  gltf => {
    model = gltf.scene;
    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (!material) return;
        material.envMapIntensity = .78;
        material.needsUpdate = true;
      });
    });
    scene.add(model);
    setModelView(model);

    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      action = mixer.clipAction(gltf.animations[0]);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
      if (reducedMotion) {
        action.paused = true;
        playing = false;
      }
    }

    playButton.disabled = !action;
    speedSelect.disabled = !action;
    resetButton.disabled = false;
    playIcon.textContent = playing ? "Ⅱ" : "▶";
    playLabel.textContent = playing ? "Pausar" : "Reproduzir";
    loadingValue.textContent = "100%";
    loadingBar.style.width = "100%";
    setStatus(action ? "3D E ANIMAÇÃO ATIVOS" : "3D ATIVO · SEM ANIMAÇÃO", "ready");
    requestAnimationFrame(() => loadingPanel.classList.add("done"));
  },
  updateProgress,
  error => fail(`Não foi possível carregar o GLB: ${error.message || error}`)
);

playButton.addEventListener("click", () => {
  if (!action) return;
  playing = !playing;
  action.paused = !playing;
  playIcon.textContent = playing ? "Ⅱ" : "▶";
  playLabel.textContent = playing ? "Pausar" : "Reproduzir";
});

speedSelect.addEventListener("change", () => {
  if (mixer) mixer.timeScale = Number(speedSelect.value) || 1;
});

resetButton.addEventListener("click", () => {
  if (!baseView) return;
  camera.position.copy(baseView.position);
  controls.target.copy(baseView.target);
  controls.update();
});

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  const delta = Math.min(clock.getDelta(), .05);
  if (mixer && playing) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
  frame = requestAnimationFrame(animate);
}

addEventListener("resize", resize, { passive: true });
addEventListener("pagehide", () => cancelAnimationFrame(frame), { once: true });
resize();
animate();
