import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/environments/RoomEnvironment.js";

const viewer = document.getElementById("lobbyViewer");
const fallbackImage = document.getElementById("lobbyBgImg");
const canvas = document.getElementById("lobbyDepthCanvas");
const legacyFxCanvas = document.getElementById("lobbyCanvas");

if (!viewer || !fallbackImage || !canvas) {
  console.warn("Lobby 3D PBR indisponível: elementos do viewer não encontrados.");
} else {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = matchMedia("(pointer: coarse)").matches;
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const mobile = innerWidth < 760 || coarsePointer || lowMemory;
  const tier = mobile ? "mobile" : "desktop";
  const modelSuffix = mobile ? "-mobile" : "";
  const clock = new THREE.Clock();
  const pointerTarget = new THREE.Vector2();
  const pointerCurrent = new THREE.Vector2();
  const cameraBase = new THREE.Vector3(0, 2.34, 6.25);
  const lookBase = new THREE.Vector3(0, 1.16, -0.9);
  const lookCurrent = lookBase.clone();
  const lookTarget = lookBase.clone();

  let renderer;
  let scene;
  let camera;
  let dust;
  let warmLight;
  let radioLight;
  let animationId = 0;
  let visible = !document.hidden;
  let intersecting = true;
  let initialized = false;
  let contextLost = false;
  let touchDragging = false;
  let lastTouch = null;

  THREE.Cache.enabled = true;
  viewer.classList.add("lobbyViewer--pbr");
  document.body.classList.add("lobby-mode");
  if (legacyFxCanvas) legacyFxCanvas.hidden = true;

  const textureLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  const textureUrl = (material, channel) =>
    `/assets/lobby-pbr/materials/${tier}/${material}_${channel}.webp?v=1`;
  const modelUrl = name => {
    const suffix = name === "table" ? (mobile ? "-mobile" : "-desktop") : modelSuffix;
    return `/assets/lobby-pbr/models/${name}${suffix}.glb?v=1`;
  };

  function loadTexture(url, color = false) {
    return new Promise((resolve, reject) => {
      textureLoader.load(url, texture => {
        if (color) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      }, undefined, reject);
    });
  }

  function loadModel(url) {
    return new Promise((resolve, reject) => {
      gltfLoader.load(url, gltf => resolve(gltf.scene), undefined, reject);
    });
  }

  function configureTexture(texture, repeatX, repeatY) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
    return texture;
  }

  async function loadPbrMaterial(name, repeatX, repeatY, options = {}) {
    const [color, normal, arm] = await Promise.all([
      loadTexture(textureUrl(name, "diff"), true),
      loadTexture(textureUrl(name, "nor_gl")),
      loadTexture(textureUrl(name, "arm"))
    ]);
    configureTexture(color, repeatX, repeatY);
    configureTexture(normal, repeatX, repeatY);
    configureTexture(arm, repeatX, repeatY);
    arm.channel = 0;
    return new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      aoMap: arm,
      roughnessMap: arm,
      metalnessMap: arm,
      color: options.color || 0xffffff,
      roughness: options.roughness ?? 0.9,
      metalness: options.metalness ?? 0.02,
      normalScale: new THREE.Vector2(options.normalScale ?? 0.75, options.normalScale ?? 0.75)
    });
  }

  function mesh(geometry, material, position, rotation = null) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    scene.add(object);
    return object;
  }

  function addBox(size, position, material, rotation = null) {
    return mesh(new THREE.BoxGeometry(...size), material, position, rotation);
  }

  function markModel(object, castShadow = true) {
    object.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = castShadow;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        material.envMapIntensity = mobile ? 0.42 : 0.58;
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
          if (material[key]) material[key].anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        }
      }
    });
    return object;
  }

  function addWindow(x, wood, forestTexture) {
    const width = 2.48;
    const height = 2.48;
    const windowY = 2.56;
    const exteriorTexture = forestTexture.clone();
    exteriorTexture.needsUpdate = true;
    exteriorTexture.repeat.set(0.52, 0.8);
    exteriorTexture.offset.set(x < 0 ? 0 : 0.48, 0.12);
    const exteriorMaterial = new THREE.MeshBasicMaterial({ map: exteriorTexture, toneMapped: false });
    const exterior = mesh(new THREE.PlaneGeometry(width, height), exteriorMaterial, [x, windowY, -5.12]);
    exterior.castShadow = false;
    exterior.receiveShadow = false;

    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x718ca2,
      transparent: true,
      opacity: mobile ? 0.13 : 0.2,
      roughness: 0.18,
      metalness: 0,
      transmission: mobile ? 0 : 0.38,
      thickness: 0.035,
      depthWrite: false
    });
    const glassPane = mesh(new THREE.PlaneGeometry(width, height), glass, [x, windowY, -4.965]);
    glassPane.castShadow = false;
    glassPane.receiveShadow = false;

    const z = -4.91;
    const edge = 0.11;
    addBox([width + 0.26, edge, 0.13], [x, windowY + height / 2 + 0.07, z], wood);
    addBox([width + 0.26, edge, 0.13], [x, windowY - height / 2 - 0.07, z], wood);
    addBox([edge, height + 0.26, 0.13], [x - width / 2 - 0.07, windowY, z], wood);
    addBox([edge, height + 0.26, 0.13], [x + width / 2 + 0.07, windowY, z], wood);
    addBox([edge * 0.72, height, 0.12], [x, windowY, z + 0.01], wood);
    addBox([width, edge * 0.72, 0.12], [x, windowY, z + 0.01], wood);
  }

  function makeTitleTexture() {
    const titleCanvas = document.createElement("canvas");
    titleCanvas.width = mobile ? 1024 : 2048;
    titleCanvas.height = mobile ? 192 : 384;
    const ctx = titleCanvas.getContext("2d");
    ctx.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${mobile ? 116 : 232}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = "rgba(20,8,3,.96)";
    ctx.shadowColor = "rgba(255,205,125,.18)";
    ctx.shadowBlur = mobile ? 3 : 7;
    ctx.shadowOffsetY = mobile ? 1 : 2;
    ctx.fillText("SEXTO LUGAR", titleCanvas.width / 2, titleCanvas.height / 2, titleCanvas.width * 0.88);
    const texture = new THREE.CanvasTexture(titleCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function addTableTitle() {
    const texture = makeTitleTexture();
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: -0.006,
      transparent: true,
      roughness: 0.94,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const title = mesh(new THREE.PlaneGeometry(3.28, 0.92), material, [0, 0.826, -0.82], [-Math.PI / 2, 0, 0]);
    title.castShadow = false;
    title.renderOrder = 3;
  }

  function addDust() {
    const count = reducedMotion ? 38 : mobile ? 58 : 150;
    const positions = new Float32Array(count * 3);
    let seed = 9137;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * 11.5;
      positions[i * 3 + 1] = 0.35 + random() * 4.05;
      positions[i * 3 + 2] = -4.6 + random() * 10.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffdfaa,
      size: mobile ? 0.018 : 0.024,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    });
    dust = new THREE.Points(geometry, material);
    dust.frustumCulled = false;
    scene.add(dust);
  }

  async function buildRoom() {
    const [floor, plaster, carpet, forest] = await Promise.all([
      loadPbrMaterial("old_wooden_floor_02", 5.2, 5.8, { roughness: 0.82, normalScale: 0.82 }),
      loadPbrMaterial("plastered_wall_04", 3.2, 2.2, { roughness: 0.96, normalScale: 0.62, color: 0x7f776d }),
      loadPbrMaterial("dirty_carpet", 1.35, 1.15, { roughness: 0.98, normalScale: 0.48, color: 0x4d4742 }),
      loadTexture(`/assets/lobby-pbr/environment/moonlit-forest${mobile ? "-mobile" : ""}.webp?v=1`, true)
    ]);
    forest.wrapS = forest.wrapT = THREE.ClampToEdgeWrapping;

    mesh(new THREE.PlaneGeometry(13.2, 14), floor, [0, 0, 1.25], [-Math.PI / 2, 0, 0]);
    mesh(new THREE.PlaneGeometry(5.9, 4.35), carpet, [0, 0.014, -0.52], [-Math.PI / 2, 0, 0]);
    const ceiling = plaster.clone();
    ceiling.color.set(0x343331);
    mesh(new THREE.PlaneGeometry(13.2, 14), ceiling, [0, 5.05, 1.25], [Math.PI / 2, 0, 0]);

    addBox([13.1, 1.32, 0.14], [0, 0.66, -5], plaster);
    addBox([13.1, 1.18, 0.14], [0, 4.46, -5], plaster);
    addBox([1.72, 2.55, 0.14], [-5.64, 2.57, -5], plaster);
    addBox([4.62, 2.55, 0.14], [0, 2.57, -5], plaster);
    addBox([1.72, 2.55, 0.14], [5.64, 2.57, -5], plaster);
    addBox([0.14, 5.05, 14], [-6.55, 2.52, 1.25], plaster);
    addBox([0.14, 5.05, 14], [6.55, 2.52, 1.25], plaster);

    const wood = floor.clone();
    wood.roughness = 0.76;
    wood.color.set(0x5f3b27);
    addBox([13.05, 1.12, 0.08], [0, 0.57, -4.89], wood);
    addBox([0.08, 1.12, 13.8], [-6.46, 0.57, 1.25], wood);
    addBox([0.08, 1.12, 13.8], [6.46, 0.57, 1.25], wood);
    addBox([13.1, 0.12, 0.12], [0, 1.14, -4.82], wood);
    addBox([0.12, 0.12, 13.8], [-6.39, 1.14, 1.25], wood);
    addBox([0.12, 0.12, 13.8], [6.39, 1.14, 1.25], wood);

    addWindow(-3.58, wood, forest);
    addWindow(3.58, wood, forest);

    const pictureTexture = forest.clone();
    pictureTexture.repeat.set(0.42, 0.5);
    pictureTexture.offset.set(0.29, 0.23);
    pictureTexture.needsUpdate = true;
    addBox([2.28, 1.45, 0.08], [0, 3.03, -4.88], wood);
    mesh(new THREE.PlaneGeometry(1.98, 1.15), new THREE.MeshStandardMaterial({ map: pictureTexture, roughness: 0.68 }), [0, 3.03, -4.825]);

    addBox([1.5, 0.1, 0.48], [-5.35, 1.08, -4.42], wood);
    addBox([0.1, 0.72, 0.1], [-5.93, 0.72, -4.45], wood);
    addBox([0.1, 0.72, 0.1], [-4.77, 0.72, -4.45], wood);

    const table = markModel(await loadModel(modelUrl("table")));
    table.scale.set(3.58, 1.03, 2.58);
    table.position.set(0, 0, -0.82);
    scene.add(table);
    addTableTitle();

    const chairSource = markModel(await loadModel(modelUrl("chair")));
    const chairBounds = new THREE.Box3().setFromObject(chairSource);
    const chairHeight = chairBounds.getSize(new THREE.Vector3()).y || 1;
    chairSource.scale.setScalar(1.16 / chairHeight);
    const chairs = [
      [-2.05, 0, -2.35, 0], [0, 0, -2.48, 0], [2.05, 0, -2.35, 0],
      [-2.05, 0, 0.72, Math.PI], [0, 0, 0.86, Math.PI], [2.05, 0, 0.72, Math.PI]
    ];
    chairs.forEach(([x, y, z, rotation]) => {
      const chair = chairSource.clone(true);
      chair.position.set(x, y, z);
      chair.rotation.y = rotation;
      scene.add(chair);
    });

    addDust();
  }

  async function addHeroProps() {
    const [lampResult, radioResult] = await Promise.allSettled([
      loadModel(modelUrl("pendant-lamp")),
      loadModel(modelUrl("radio"))
    ]);

    if (lampResult.status === "fulfilled") {
      const lamp = markModel(lampResult.value);
      lamp.traverse(child => {
        const materials = child.isMesh ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
        materials.forEach(material => {
          if (material?.emissive) material.emissiveIntensity = Math.min(material.emissiveIntensity || 1, 0.72);
        });
      });
      lamp.scale.setScalar(0.94);
      lamp.position.set(0, 4.87, -0.86);
      scene.add(lamp);
    }

    if (radioResult.status === "fulfilled") {
      const radio = markModel(radioResult.value);
      radio.scale.setScalar(1.45);
      radio.position.set(-5.35, 1.13, -4.38);
      radio.rotation.y = 0.04;
      scene.add(radio);
    }

    if (lampResult.status === "rejected" || radioResult.status === "rejected") {
      console.warn("Alguns objetos PBR opcionais do lobby não foram carregados.", lampResult, radioResult);
    }
    renderOnce();
  }

  function setupRenderer() {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !mobile,
      alpha: false,
      powerPreference: mobile ? "low-power" : "high-performance",
      failIfMajorPerformanceCaveat: true
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mobile ? 0.9 : 0.88;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.1 : 1.5));
    renderer.domElement.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      contextLost = true;
      canvas.classList.remove("ready");
      viewer.dataset.pbr = "context-lost";
      stop();
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      contextLost = false;
      resize();
      renderOnce();
      canvas.classList.add("ready");
      viewer.dataset.pbr = "ready";
      start();
    });
  }

  function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.FogExp2(0x07090d, 0.022);

    camera = new THREE.PerspectiveCamera(42, 1, 0.08, 42);
    camera.position.copy(cameraBase);
    camera.lookAt(lookBase);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    scene.environment = pmrem.fromScene(roomEnvironment, 0.03).texture;
    scene.environmentIntensity = mobile ? 0.17 : 0.22;
    roomEnvironment.dispose();
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0x5f7f9f, 0x1d0e07, mobile ? 0.32 : 0.4));
    const moon = new THREE.DirectionalLight(0x91c9ee, mobile ? 0.9 : 1.05);
    moon.position.set(-4.5, 5.2, -2.2);
    moon.target.position.set(0, 0.6, 0.5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(mobile ? 512 : 2048, mobile ? 512 : 2048);
    moon.shadow.camera.left = -7;
    moon.shadow.camera.right = 7;
    moon.shadow.camera.top = 6;
    moon.shadow.camera.bottom = -3;
    moon.shadow.camera.near = 0.5;
    moon.shadow.camera.far = 20;
    moon.shadow.bias = -0.00025;
    scene.add(moon, moon.target);

    warmLight = new THREE.SpotLight(0xffbd70, mobile ? 14 : 18, 10, Math.PI * 0.31, 0.66, 1.35);
    warmLight.position.set(0, 3.62, -0.84);
    warmLight.target.position.set(0, 0.3, -0.72);
    warmLight.castShadow = !mobile;
    warmLight.shadow.mapSize.set(1024, 1024);
    warmLight.shadow.bias = -0.00035;
    scene.add(warmLight, warmLight.target);

    const warmBeam = mesh(
      new THREE.ConeGeometry(2.2, 3.25, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffbf78, transparent: true, opacity: mobile ? 0.018 : 0.027, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      [0, 2.0, -0.84]
    );
    warmBeam.castShadow = false;
    warmBeam.receiveShadow = false;
    warmBeam.renderOrder = 2;

    radioLight = new THREE.PointLight(0x36ff8a, mobile ? 1.7 : 2.7, 3.4, 2);
    radioLight.position.set(-5.05, 1.55, -3.96);
    scene.add(radioLight);

    const rim = new THREE.PointLight(0x2d5d82, mobile ? 3 : 4.8, 9, 2);
    rim.position.set(4.9, 2.1, -3.2);
    scene.add(rim);

    const cameraFill = new THREE.PointLight(0x9a6845, mobile ? 5 : 8, 15, 2);
    cameraFill.position.set(0, 2.6, 5.4);
    scene.add(cameraFill);
  }

  function resize() {
    if (!renderer || !camera) return;
    const bounds = viewer.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderOnce();
  }

  function updateCamera(delta) {
    if (reducedMotion) return;
    const smoothing = 1 - Math.exp(-delta / 0.18);
    pointerCurrent.lerp(pointerTarget, smoothing);
    camera.position.set(
      cameraBase.x + pointerCurrent.x * 0.22,
      cameraBase.y + pointerCurrent.y * 0.1,
      cameraBase.z
    );
    lookTarget.set(
      lookBase.x - pointerCurrent.x * 0.17,
      lookBase.y - pointerCurrent.y * 0.08,
      lookBase.z
    );
    lookCurrent.lerp(lookTarget, smoothing);
    camera.lookAt(lookCurrent);
  }

  function renderOnce() {
    if (!renderer || !scene || !camera || contextLost) return;
    renderer.render(scene, camera);
  }

  function shouldRun() {
    return !reducedMotion && initialized && visible && intersecting && !contextLost && viewer.style.display !== "none" && !document.body.classList.contains("ritual-started");
  }

  function frame() {
    animationId = requestAnimationFrame(frame);
    const delta = Math.min(clock.getDelta(), 0.05);
    updateCamera(delta);
    if (!reducedMotion) {
      const time = performance.now() * 0.001;
      if (dust) {
        dust.rotation.y = Math.sin(time * 0.08) * 0.025;
        dust.position.y = Math.sin(time * 0.16) * 0.025;
      }
      if (warmLight) warmLight.intensity = (mobile ? 14 : 18) * (0.975 + Math.sin(time * 2.1) * 0.014 + Math.sin(time * 7.7) * 0.008);
      if (radioLight) radioLight.intensity = (mobile ? 1.7 : 2.7) * (0.94 + Math.sin(time * 1.7) * 0.06);
    }
    renderOnce();
  }

  function start() {
    if (animationId || !shouldRun()) return;
    clock.start();
    animationId = requestAnimationFrame(frame);
  }

  function stop() {
    if (!animationId) return;
    cancelAnimationFrame(animationId);
    animationId = 0;
    clock.stop();
  }

  function setMousePointer(event) {
    if (reducedMotion || event.pointerType === "touch") return;
    const bounds = viewer.getBoundingClientRect();
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    if (!inside) {
      pointerTarget.set(0, 0);
      return;
    }
    pointerTarget.set(
      THREE.MathUtils.clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(1 - ((event.clientY - bounds.top) / bounds.height) * 2, -1, 1)
    );
  }

  addEventListener("pointermove", setMousePointer, { passive: true });
  addEventListener("blur", () => pointerTarget.set(0, 0), { passive: true });

  viewer.addEventListener("pointerdown", event => {
    if (reducedMotion || event.pointerType === "mouse") return;
    touchDragging = true;
    lastTouch = { x: event.clientX, y: event.clientY };
    viewer.setPointerCapture?.(event.pointerId);
  }, { passive: true });

  viewer.addEventListener("pointermove", event => {
    if (!touchDragging || !lastTouch || event.pointerType === "mouse") return;
    const bounds = viewer.getBoundingClientRect();
    pointerTarget.x = THREE.MathUtils.clamp(pointerTarget.x + (event.clientX - lastTouch.x) / Math.max(180, bounds.width * 0.48), -1, 1);
    pointerTarget.y = THREE.MathUtils.clamp(pointerTarget.y - (event.clientY - lastTouch.y) / Math.max(180, bounds.height * 0.48), -1, 1);
    lastTouch = { x: event.clientX, y: event.clientY };
  }, { passive: true });

  const endTouch = () => {
    touchDragging = false;
    lastTouch = null;
  };
  viewer.addEventListener("pointerup", endTouch, { passive: true });
  viewer.addEventListener("pointercancel", endTouch, { passive: true });

  async function initialize() {
    try {
      setupRenderer();
      setupScene();
      resize();
      await buildRoom();
      resize();
      renderOnce();
      initialized = true;
      canvas.classList.add("ready");
      viewer.dataset.pbr = "ready";
      document.body.classList.add("lobby-video-ready");
      start();

      const defer = window.requestIdleCallback || (callback => setTimeout(callback, 180));
      defer(() => addHeroProps().catch(error => console.warn("Props PBR opcionais indisponíveis.", error)), { timeout: 1200 });
    } catch (error) {
      canvas.classList.remove("ready");
      viewer.dataset.pbr = "fallback";
      viewer.dataset.pbrError = error?.message || "unknown";
      document.body.classList.add("lobby-video-ready");
      console.warn("Lobby 3D PBR indisponível; mantendo o preview estático.", error);
    }
  }

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(viewer);
  else addEventListener("resize", resize, { passive: true });

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

  new MutationObserver(() => {
    if (shouldRun()) start(); else stop();
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

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

  initialize();
}
