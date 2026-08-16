import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";

const MODEL_URL = new URL("../assets/models/reward-chest.glb?v=4", import.meta.url).href;
const LID_NODE_NAME = "tripo_part_11";
const DISPLAY_ROTATION_Y = Math.PI - .48;
const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

const queue = [];
let active = null;
let ui = null;
let renderer = null;
let scene = null;
let camera = null;
let displayRoot = null;
let displayScale = 1;
let lidPivot = null;
let lidAxis = "z";
let lidOpenAngle = Math.PI * .46;
let modelPromise = null;
let modelReady = false;
let modelFailed = false;
let frameId = 0;
let openedAt = 0;
let openProgress = 0;
let previousFocus = null;

const TYPE_META = {
  fragment:    { eyebrow: "Fragmento desbloqueado", icon: "✦", accent: "#e9c34d" },
  card:        { eyebrow: "Nova carta",             icon: "◇", accent: "#f3d879" },
  achievement: { eyebrow: "Conquista desbloqueada", icon: "◆", accent: "#d99a45" },
  mission:     { eyebrow: "Missão concluída",        icon: "◎", accent: "#79d29a" },
  level:       { eyebrow: "Novo nível",              icon: "▲", accent: "#e2b75c" },
  daily:       { eyebrow: "Presente diário",         icon: "☾", accent: "#8bb7e8" },
  coins:       { eyebrow: "Recompensa recebida",     icon: "◉", accent: "#f1c84b" },
  gift:        { eyebrow: "Presente recebido",       icon: "✧", accent: "#d4af37" },
};

function injectStyles() {
  if (document.getElementById("oslRewardChestStyles")) return;
  const style = document.createElement("style");
  style.id = "oslRewardChestStyles";
  style.textContent = `
    .rewardChestOverlay{--reward-accent:#d4af37;position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at 50% 45%,rgba(22,31,42,.38),rgba(1,3,6,.92) 66%);opacity:0;visibility:hidden;transition:opacity .28s ease,visibility .28s ease;font-family:Inter,system-ui,sans-serif}
    .rewardChestOverlay.is-visible{opacity:1;visibility:visible}
    .rewardChestOverlay[hidden]{display:none!important}
    .rewardChestPanel{position:relative;width:min(760px,calc(100vw - 28px));min-height:min(650px,calc(100dvh - 36px));display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;border:1px solid color-mix(in srgb,var(--reward-accent) 33%,transparent);background:radial-gradient(ellipse at 50% 38%,color-mix(in srgb,var(--reward-accent) 10%,transparent),transparent 48%),linear-gradient(180deg,rgba(5,9,15,.98),rgba(2,4,8,.985));box-shadow:0 34px 120px rgba(0,0,0,.86),inset 0 1px rgba(255,255,255,.04)}
    .rewardChestPanel::before{content:"";position:absolute;inset:10px;border:1px solid rgba(255,255,255,.035);pointer-events:none}
    .rewardChestClose{position:absolute;z-index:8;top:16px;right:16px;width:38px;height:38px;border:1px solid rgba(255,255,255,.09);background:rgba(3,6,10,.7);color:rgba(255,255,255,.55);font:300 24px/1 system-ui;cursor:pointer}
    .rewardChestClose:hover,.rewardChestClose:focus-visible{color:#fff;border-color:color-mix(in srgb,var(--reward-accent) 52%,transparent);outline:none}
    .rewardChestHeader{position:relative;z-index:4;text-align:center;min-height:86px;padding:28px 54px 0}
    .rewardChestEyebrow{color:var(--reward-accent);font-size:10px;font-weight:800;letter-spacing:.34em;text-transform:uppercase}
    .rewardChestMystery{margin-top:10px;color:#f6f1e5;font:700 clamp(22px,4vw,34px)/1.15 Cinzel,Georgia,serif;letter-spacing:.05em;text-shadow:0 4px 24px rgba(0,0,0,.8)}
    .rewardChestStage{position:relative;z-index:2;width:min(620px,96%);height:350px;margin:-4px auto 0;cursor:pointer;outline:none}
    .rewardChestStage:focus-visible{box-shadow:inset 0 0 0 1px var(--reward-accent)}
    .rewardChestCanvas{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .35s ease}
    .rewardChestOverlay.model-ready .rewardChestCanvas{opacity:1}
    .rewardChestFallback{position:absolute;left:50%;top:54%;width:210px;height:118px;transform:translate(-50%,-50%);transition:opacity .3s ease,transform .8s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 24px 25px rgba(0,0,0,.7))}
    .rewardChestOverlay.model-ready .rewardChestFallback{opacity:0}
    .rewardChestFallback__base{position:absolute;inset:38px 8px 0;border:2px solid #ad7d2e;border-radius:6px 6px 18px 18px;background:linear-gradient(110deg,#281305,#7a4213 40%,#351b08 70%,#160b04);box-shadow:inset 0 0 0 7px #2a1608,inset 0 0 0 9px #9c702e}
    .rewardChestFallback__lid{position:absolute;left:4px;right:4px;top:0;height:62px;border:2px solid #b98835;border-radius:80px 80px 8px 8px;background:linear-gradient(110deg,#2b1608,#89501a 42%,#351b08 74%,#170b04);transform-origin:50% 100%;transition:transform .9s cubic-bezier(.18,.8,.2,1)}
    .rewardChestFallback__lock{position:absolute;z-index:2;left:50%;top:56px;width:34px;height:40px;transform:translateX(-50%);border:2px solid #e3b956;border-radius:4px 4px 9px 9px;background:#241307;box-shadow:0 0 18px rgba(227,185,86,.28)}
    .rewardChestOverlay.is-open .rewardChestFallback__lid{transform:perspective(300px) rotateX(-112deg)}
    .rewardChestAura{position:absolute;left:50%;top:59%;width:55%;height:34%;transform:translate(-50%,-50%) scale(.4);border-radius:50%;opacity:0;background:radial-gradient(ellipse,color-mix(in srgb,var(--reward-accent) 55%,white),color-mix(in srgb,var(--reward-accent) 18%,transparent) 35%,transparent 70%);filter:blur(12px);transition:opacity .45s ease,transform .7s ease;pointer-events:none}
    .rewardChestOverlay.is-open .rewardChestAura{opacity:0;transform:translate(-50%,-50%) scale(1.25)}
    .rewardChestStatus{position:absolute;left:0;right:0;bottom:12px;text-align:center;color:rgba(255,255,255,.42);font-size:9px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
    .rewardChestReveal{position:relative;z-index:5;width:min(560px,calc(100% - 44px));min-height:118px;margin:-32px auto 0;padding:16px 20px 18px;text-align:center;opacity:0;transform:translateY(16px);pointer-events:none;transition:opacity .42s ease .25s,transform .52s cubic-bezier(.2,.8,.2,1) .25s}
    .rewardChestOverlay.is-open .rewardChestReveal{opacity:1;transform:none}
    .rewardChestIcon{width:42px;height:42px;margin:0 auto 8px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--reward-accent) 55%,transparent);border-radius:50%;color:var(--reward-accent);background:rgba(2,5,9,.78);font:700 20px/1 Cinzel,serif;box-shadow:0 0 28px color-mix(in srgb,var(--reward-accent) 18%,transparent)}
    .rewardChestTitle{color:#fff;font:700 clamp(21px,4vw,31px)/1.16 Cinzel,Georgia,serif}
    .rewardChestValue{margin-top:5px;color:var(--reward-accent);font-size:14px;font-weight:800;letter-spacing:.12em}
    .rewardChestDescription{max-width:470px;margin:7px auto 0;color:rgba(255,255,255,.58);font-size:12px;line-height:1.55}
    .rewardChestAction{position:relative;z-index:6;min-width:230px;min-height:50px;margin:7px auto 28px;padding:0 30px;border:1px solid color-mix(in srgb,var(--reward-accent) 65%,transparent);background:linear-gradient(90deg,color-mix(in srgb,var(--reward-accent) 68%,#5b3812),color-mix(in srgb,var(--reward-accent) 90%,#fff2a1),color-mix(in srgb,var(--reward-accent) 68%,#5b3812));color:#090704;font-size:11px;font-weight:900;letter-spacing:.24em;text-transform:uppercase;cursor:pointer;box-shadow:0 12px 42px color-mix(in srgb,var(--reward-accent) 18%,transparent)}
    .rewardChestAction:hover,.rewardChestAction:focus-visible{filter:brightness(1.09);outline:1px solid color-mix(in srgb,var(--reward-accent) 50%,transparent);outline-offset:3px}
    .rewardChestAction:disabled{cursor:wait;filter:saturate(.35);opacity:.68}
    .rewardChestSpark{position:absolute;z-index:3;left:50%;top:55%;width:4px;height:4px;border-radius:50%;background:var(--reward-accent);box-shadow:0 0 9px var(--reward-accent);pointer-events:none;animation:rewardSpark 1.15s cubic-bezier(.15,.7,.2,1) forwards}
    @keyframes rewardSpark{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}20%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--sx)),calc(-50% + var(--sy))) scale(1.6)}}
    @media(max-width:600px){.rewardChestOverlay{padding:8px}.rewardChestPanel{width:100%;min-height:min(620px,calc(100dvh - 16px))}.rewardChestHeader{padding-top:24px}.rewardChestStage{height:300px}.rewardChestReveal{margin-top:-28px}.rewardChestAction{margin-bottom:20px}.rewardChestDescription{font-size:11px}}
    @media(max-height:650px){.rewardChestPanel{min-height:calc(100dvh - 12px)}.rewardChestHeader{min-height:64px;padding-top:16px}.rewardChestStage{height:260px}.rewardChestReveal{min-height:94px;margin-top:-28px;padding-top:8px}.rewardChestIcon{width:34px;height:34px}.rewardChestAction{min-height:42px;margin-bottom:12px}}
    @media(prefers-reduced-motion:reduce){.rewardChestOverlay,.rewardChestCanvas,.rewardChestReveal,.rewardChestAura,.rewardChestFallback__lid{transition:none!important}.rewardChestSpark{display:none!important}}
  `;
  document.head.appendChild(style);
}

function buildUi() {
  if (ui) return ui;
  injectStyles();
  const overlay = document.createElement("div");
  overlay.className = "rewardChestOverlay";
  overlay.id = "rewardChestOverlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "rewardChestTitle");
  overlay.innerHTML = `
    <section class="rewardChestPanel">
      <button class="rewardChestClose" type="button" aria-label="Fechar recompensa">×</button>
      <header class="rewardChestHeader">
        <div class="rewardChestEyebrow">Uma recompensa espera</div>
        <div class="rewardChestMystery">O baú reconheceu você.</div>
      </header>
      <div class="rewardChestStage" role="button" tabindex="0" aria-label="Abrir baú">
        <canvas class="rewardChestCanvas" aria-hidden="true"></canvas>
        <div class="rewardChestFallback" aria-hidden="true"><span class="rewardChestFallback__lid"></span><span class="rewardChestFallback__base"></span><span class="rewardChestFallback__lock"></span></div>
        <div class="rewardChestAura" aria-hidden="true"></div>
        <div class="rewardChestStatus" aria-live="polite">Preparando o baú…</div>
      </div>
      <div class="rewardChestReveal" aria-live="polite">
        <div class="rewardChestIcon" aria-hidden="true">✧</div>
        <h2 class="rewardChestTitle" id="rewardChestTitle">Presente recebido</h2>
        <div class="rewardChestValue"></div>
        <p class="rewardChestDescription"></p>
      </div>
      <button class="rewardChestAction" type="button">Abrir baú</button>
    </section>`;
  document.body.appendChild(overlay);
  const panel = overlay.querySelector(".rewardChestPanel");
  const stage = overlay.querySelector(".rewardChestStage");
  const action = overlay.querySelector(".rewardChestAction");
  const close = overlay.querySelector(".rewardChestClose");
  ui = {
    overlay, panel, stage, action, close,
    canvas: overlay.querySelector(".rewardChestCanvas"),
    eyebrow: overlay.querySelector(".rewardChestEyebrow"),
    mystery: overlay.querySelector(".rewardChestMystery"),
    status: overlay.querySelector(".rewardChestStatus"),
    icon: overlay.querySelector(".rewardChestIcon"),
    title: overlay.querySelector(".rewardChestTitle"),
    value: overlay.querySelector(".rewardChestValue"),
    description: overlay.querySelector(".rewardChestDescription"),
  };
  action.addEventListener("click", () => openProgress >= 1 ? finishActive(true) : openChest());
  stage.addEventListener("click", () => { if (openProgress < 1) openChest(); });
  stage.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && openProgress < 1) { event.preventDefault(); openChest(); }
  });
  close.addEventListener("click", () => finishActive(false));
  overlay.addEventListener("keydown", trapKeys);
  return ui;
}

function trapKeys(event) {
  if (event.key === "Escape") { event.preventDefault(); finishActive(false); return; }
  if (event.key !== "Tab") return;
  const focusable = [...ui.overlay.querySelectorAll("button:not([disabled]),[tabindex='0']")].filter(el => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function setupRenderer() {
  if (renderer) return;
  const host = buildUi();
  renderer = new THREE.WebGLRenderer({ canvas: host.canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, .01, 30);
  camera.position.set(3.1, 1.85, 3.45);
  camera.lookAt(0, .72, 0);
  scene.add(new THREE.HemisphereLight(0x7189b8, 0x160b03, 2.25));
  const key = new THREE.SpotLight(0xffc45d, 16, 12, Math.PI * .28, .58, 1.35);
  key.position.set(2.2, 4.8, 2.4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
  const rim = new THREE.DirectionalLight(0x3e76b8, 4.6); rim.position.set(-3, 2.5, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.ShadowMaterial({ color: 0x000000, opacity: .55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.02; floor.receiveShadow = true; scene.add(floor);
  resizeRenderer();
  new ResizeObserver(resizeRenderer).observe(host.stage);
}

function resizeRenderer() {
  if (!renderer || !ui) return;
  const rect = ui.stage.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function findLid(root) {
  const named = root.getObjectByName(LID_NODE_NAME);
  if (named) return named;
  const candidates = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const box = new THREE.Box3().setFromObject(object);
    candidates.push({ object, top: box.max.y, volume: box.getSize(new THREE.Vector3()).lengthSq() });
  });
  candidates.sort((a, b) => b.top - a.top || b.volume - a.volume);
  return candidates[0]?.object || null;
}

function installModel(gltf) {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const lid = findLid(model);
  if (!lid) throw new Error("Tampa do baú não encontrada");
  const lidBox = new THREE.Box3().setFromObject(lid);
  const baseBox = new THREE.Box3();
  model.traverse(object => {
    if (object.isMesh && object !== lid) baseBox.expandByObject(object, true);
  });
  const size = lidBox.getSize(new THREE.Vector3());
  const center = lidBox.getCenter(new THREE.Vector3());
  const hingeWorld = center.clone();
  hingeWorld.y = Math.min(baseBox.max.y, lidBox.max.y - size.y * .18);
  if (size.z >= size.x) {
    lidAxis = "z";
    hingeWorld.x = lidBox.min.x;
    lidOpenAngle = Math.PI * .46;
  } else {
    lidAxis = "x";
    // A frente deste modelo aponta para -Z. A dobradiça fica na borda
    // traseira (+Z), abrindo para longe da câmera e expondo o interior.
    hingeWorld.z = lidBox.max.z;
    lidOpenAngle = Math.PI * .46;
  }
  lidPivot = new THREE.Group();
  lidPivot.name = "reward_chest_lid_hinge";
  lidPivot.position.copy(hingeWorld);
  model.add(lidPivot);
  lidPivot.attach(lid);

  model.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!material) return;
      material.envMapIntensity = 1.25;
      material.needsUpdate = true;
    });
  });

  const wholeBox = new THREE.Box3().setFromObject(model);
  const wholeSize = wholeBox.getSize(new THREE.Vector3());
  const wholeCenter = wholeBox.getCenter(new THREE.Vector3());
  model.position.set(-wholeCenter.x, -wholeBox.min.y, -wholeCenter.z);
  displayRoot = new THREE.Group();
  displayScale = 2.35 / Math.max(wholeSize.x, wholeSize.z, wholeSize.y * 1.15);
  displayRoot.scale.setScalar(displayScale);
  displayRoot.rotation.y = DISPLAY_ROTATION_Y;
  displayRoot.add(model);
  scene.add(displayRoot);
  modelReady = true;
  if (openProgress >= 1 && lidPivot) lidPivot.rotation[lidAxis] = lidOpenAngle;
  ui.overlay.classList.add("model-ready");
  ui.status.textContent = openProgress >= 1 ? "Recompensa revelada" : "Toque para abrir";
  resizeRenderer();
}

function ensureModel() {
  if (modelPromise) return modelPromise;
  try { setupRenderer(); }
  catch (error) {
    modelFailed = true;
    modelPromise = Promise.reject(error);
    modelPromise.catch(() => {});
    return modelPromise;
  }
  modelPromise = new Promise((resolve, reject) => {
    new GLTFLoader().load(MODEL_URL, gltf => {
      try { installModel(gltf); resolve(gltf); }
      catch (error) { modelFailed = true; reject(error); }
    }, progress => {
      if (!ui || !active || !progress.total) return;
      const pct = Math.min(99, Math.round(progress.loaded / progress.total * 100));
      ui.status.textContent = `Preparando o baú · ${pct}%`;
    }, error => { modelFailed = true; reject(error); });
  });
  modelPromise.catch(error => console.warn("[reward-chest] Modelo 3D indisponível; usando fallback:", error));
  return modelPromise;
}

function startRenderLoop() {
  cancelAnimationFrame(frameId);
  const loop = now => {
    if (!ui || ui.overlay.hidden) return;
    if (displayRoot) {
      const elapsed = now * .001;
      displayRoot.rotation.y = DISPLAY_ROTATION_Y + Math.sin(elapsed * .7) * .025;
      displayRoot.position.y = Math.sin(elapsed * 1.25) * .018;
      if (openedAt) {
        const raw = prefersReducedMotion ? 1 : Math.min(1, (now - openedAt) / 980);
        const eased = 1 - Math.pow(1 - raw, 4);
        openProgress = eased;
        if (lidPivot) lidPivot.rotation[lidAxis] = lidOpenAngle * eased;
        // A tampa aumenta bastante a altura visual. Recuar o conjunto durante a
        // abertura mantém base e tampa inteiras dentro do palco.
        displayRoot.scale.setScalar(displayScale * (1 - eased * .22));
        displayRoot.position.y = Math.sin(elapsed * 1.25) * .018 - eased * .08;
        displayRoot.rotation.x = Math.sin(raw * Math.PI) * -.035;
        if (raw >= 1) completeOpen();
      }
    } else if (openedAt && openProgress < 1) {
      openProgress = prefersReducedMotion ? 1 : Math.min(1, (now - openedAt) / 850);
      if (openProgress >= 1) completeOpen();
    }
    renderer?.render(scene, camera);
    frameId = requestAnimationFrame(loop);
  };
  frameId = requestAnimationFrame(loop);
}

function spawnSparks() {
  if (prefersReducedMotion || !ui) return;
  for (let i = 0; i < 24; i++) {
    const spark = document.createElement("i");
    spark.className = "rewardChestSpark";
    const angle = Math.random() * Math.PI * 2;
    const distance = 70 + Math.random() * 150;
    spark.style.setProperty("--sx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--sy", `${Math.sin(angle) * distance * .65 - 35}px`);
    spark.style.animationDelay = `${Math.random() * 160}ms`;
    ui.stage.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

async function openChest() {
  if (!active || openedAt || openProgress >= 1) return;
  ui.action.disabled = true;
  ui.action.textContent = "Invocando…";
  ui.status.textContent = modelFailed ? "Abrindo recompensa" : "Preparando o baú…";
  // O modelo é grande e pode ainda estar baixando. Não bloqueie a recompensa:
  // após uma espera curta, a animação CSS assume e o 3D entra quando ficar pronto.
  try {
    await Promise.race([
      ensureModel(),
      new Promise(resolve => window.setTimeout(resolve, prefersReducedMotion ? 0 : 650)),
    ]);
  } catch (_) {}
  if (!active || openedAt) return;
  openedAt = performance.now();
  ui.overlay.classList.add("is-open");
  ui.status.textContent = "O selo foi rompido";
  spawnSparks();
  if (prefersReducedMotion) { openProgress = 1; if (lidPivot) lidPivot.rotation[lidAxis] = lidOpenAngle; completeOpen(); }
}

function completeOpen() {
  if (!active || openProgress >= 1 && ui.action.dataset.opened === "1") return;
  openProgress = 1;
  ui.action.dataset.opened = "1";
  ui.action.disabled = false;
  ui.action.textContent = active.detail.actionLabel || "Continuar";
  ui.stage.removeAttribute("role");
  ui.stage.removeAttribute("tabindex");
  ui.stage.setAttribute("aria-label", "Baú aberto");
  ui.status.textContent = "Recompensa revelada";
  if (active.detail.id) {
    try { sessionStorage.setItem(`osl_reward_chest:${active.detail.id}`, "1"); } catch (_) {}
  }
  try { active.detail.onOpen?.(active.detail); }
  catch (error) { console.warn("[reward-chest] Falha ao aplicar recompensa:", error); }
  ui.action.focus({ preventScroll: true });
}

function normalizeDetail(input = {}) {
  const type = TYPE_META[input.type] ? input.type : "gift";
  const meta = TYPE_META[type];
  return {
    id: input.id ? String(input.id).slice(0, 180) : "",
    type,
    eyebrow: String(input.eyebrow || meta.eyebrow).slice(0, 80),
    icon: String(input.icon || meta.icon).slice(0, 4),
    accent: String(input.accent || meta.accent),
    title: String(input.title || "Presente recebido").slice(0, 120),
    value: String(input.value || "").slice(0, 80),
    description: String(input.description || "Uma nova parte da sua jornada foi desbloqueada.").slice(0, 280),
    actionLabel: String(input.actionLabel || "Continuar").slice(0, 30),
    once: input.once === true,
    onOpen: typeof input.onOpen === "function" ? input.onOpen : null,
    onClose: typeof input.onClose === "function" ? input.onClose : null,
  };
}

function renderDetail(detail) {
  const meta = TYPE_META[detail.type] || TYPE_META.gift;
  ui.overlay.style.setProperty("--reward-accent", detail.accent || meta.accent);
  ui.eyebrow.textContent = detail.eyebrow;
  ui.mystery.textContent = "O baú reconheceu você.";
  ui.icon.textContent = detail.icon;
  ui.title.textContent = detail.title;
  ui.value.textContent = detail.value;
  ui.value.hidden = !detail.value;
  ui.description.textContent = detail.description;
  ui.action.textContent = "Abrir baú";
  ui.action.disabled = false;
  delete ui.action.dataset.opened;
  ui.status.textContent = modelReady ? "Toque para abrir" : "Preparando o baú…";
  ui.stage.setAttribute("role", "button");
  ui.stage.setAttribute("tabindex", "0");
  ui.stage.setAttribute("aria-label", "Abrir baú");
}

function pumpQueue() {
  if (active || !queue.length) return;
  buildUi();
  active = queue.shift();
  previousFocus = document.activeElement;
  openedAt = 0; openProgress = 0;
  if (lidPivot) lidPivot.rotation[lidAxis] = 0;
  if (displayRoot) {
    displayRoot.rotation.x = 0;
    displayRoot.position.y = 0;
    displayRoot.scale.setScalar(displayScale);
  }
  renderDetail(active.detail);
  ui.overlay.classList.remove("is-open");
  ui.overlay.hidden = false;
  requestAnimationFrame(() => {
    ui.overlay.classList.add("is-visible");
    ui.action.focus({ preventScroll: true });
    resizeRenderer();
  });
  startRenderLoop();
  ensureModel().catch(() => { if (active) ui.status.textContent = "Toque para abrir"; });
  active.autoTimer = window.setTimeout(openChest, prefersReducedMotion ? 250 : 1450);
}

function finishActive(opened) {
  if (!active || !ui) return;
  clearTimeout(active.autoTimer);
  const completed = active;
  active = null;
  try { completed.detail.onClose?.({ opened, detail: completed.detail }); }
  catch (error) { console.warn("[reward-chest] Falha ao finalizar recompensa:", error); }
  completed.resolve({ opened, detail: completed.detail });
  ui.overlay.classList.remove("is-visible");
  cancelAnimationFrame(frameId);
  window.setTimeout(() => {
    if (active) return;
    ui.overlay.hidden = true;
    ui.overlay.classList.remove("is-open");
    previousFocus?.focus?.({ preventScroll: true });
    pumpQueue();
  }, prefersReducedMotion ? 0 : 300);
}

function show(input) {
  const detail = normalizeDetail(input);
  if (detail.once && detail.id) {
    try {
      if (sessionStorage.getItem(`osl_reward_chest:${detail.id}`) === "1") {
        return Promise.resolve({ opened: false, skipped: true, detail });
      }
    } catch (_) {}
  }
  return new Promise(resolve => { queue.push({ detail, resolve, autoTimer: 0 }); pumpQueue(); });
}

function preload() {
  buildUi();
  return ensureModel();
}

const api = Object.freeze({ show, present: show, preload });
window.OSLRewardChest = api;
window.addEventListener("osl:reward", event => { if (event.detail) show(event.detail); });

const pending = Array.isArray(window.__oslRewardQueue) ? window.__oslRewardQueue.splice(0) : [];
pending.forEach(detail => show(detail));
window.__oslRewardQueue = { push: detail => show(detail) };

export { show as showRewardChest, preload as preloadRewardChest };
