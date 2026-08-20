import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const canvas = document.getElementById("scene");
const loader = document.getElementById("loader");
const clueList = document.getElementById("clueList");
const counter = document.getElementById("counter");
const tooltip = document.getElementById("tooltip");
const toast = document.getElementById("toast");
const modal = document.getElementById("clueModal");
const complete = document.getElementById("complete");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPower = innerWidth < 720 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const TAU = Math.PI * 2;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.2 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a0e);
scene.fog = new THREE.FogExp2(0x080b0f, 0.035);
const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 70);

const orbit = { yaw: 0.53, pitch: 0.37, distance: 13.8, target: new THREE.Vector3(0, 1.35, -0.3) };
const defaultOrbit = { yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance, target: orbit.target.clone() };
const cameraGoal = { yaw: orbit.yaw, pitch: orbit.pitch, distance: orbit.distance, target: orbit.target.clone() };

function updateCamera(force = false) {
  const speed = force ? 1 : 0.075;
  orbit.yaw += (cameraGoal.yaw - orbit.yaw) * speed;
  orbit.pitch += (cameraGoal.pitch - orbit.pitch) * speed;
  orbit.distance += (cameraGoal.distance - orbit.distance) * speed;
  orbit.target.lerp(cameraGoal.target, speed);
  const cp = Math.cos(orbit.pitch);
  camera.position.set(
    orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.distance,
    orbit.target.y + Math.sin(orbit.pitch) * orbit.distance,
    orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.distance
  );
  camera.lookAt(orbit.target);
}
updateCamera(true);

function seeded(seed) {
  let state = seed >>> 0;
  return () => ((state = Math.imul(1664525, state) + 1013904223 >>> 0) / 4294967296);
}

function canvasTexture(size, painter, repeatX = 1, repeatY = 1) {
  const surface = document.createElement("canvas");
  surface.width = surface.height = size;
  painter(surface.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

const woodTexture = canvasTexture(768, (ctx, size) => {
  const rand = seeded(302);
  ctx.fillStyle = "#4d2d19"; ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 96) {
    const shade = 43 + Math.floor(rand() * 24);
    ctx.fillStyle = `rgb(${shade + 30},${shade + 5},${Math.max(15, shade - 14)})`; ctx.fillRect(0, y, size, 92);
    ctx.strokeStyle = "rgba(18,8,3,.75)"; ctx.lineWidth = 5; ctx.strokeRect(-2, y, size + 4, 94);
    for (let n = 0; n < 25; n++) {
      ctx.strokeStyle = `rgba(220,150,79,${.018 + rand() * .045})`; ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath(); const gy = y + rand() * 88; ctx.moveTo(0, gy); ctx.bezierCurveTo(size * .25, gy + rand() * 18 - 9, size * .7, gy + rand() * 20 - 10, size, gy); ctx.stroke();
    }
  }
}, 3.5, 2.5);
const woodRoughness = canvasTexture(256, (ctx, size) => { const image = ctx.createImageData(size, size); const rand = seeded(17); for (let i = 0; i < image.data.length; i += 4) { const c = 115 + rand() * 80; image.data[i] = image.data[i + 1] = image.data[i + 2] = c; image.data[i + 3] = 255; } ctx.putImageData(image, 0, 0); }, 4, 3);
const plasterTexture = canvasTexture(512, (ctx, size) => { const rand = seeded(81); ctx.fillStyle = "#777168"; ctx.fillRect(0, 0, size, size); for (let i = 0; i < 16000; i++) { const a = rand() * .075; ctx.fillStyle = rand() > .5 ? `rgba(255,244,220,${a})` : `rgba(34,28,24,${a})`; const r = rand() * 2.2; ctx.fillRect(rand() * size, rand() * size, r, r); } }, 3, 2);
const rugTexture = canvasTexture(512, (ctx, size) => { ctx.fillStyle = "#30231d"; ctx.fillRect(0, 0, size, size); ctx.strokeStyle = "#735744"; ctx.lineWidth = 10; ctx.strokeRect(18, 18, size - 36, size - 36); ctx.strokeStyle = "rgba(185,139,91,.42)"; ctx.lineWidth = 4; for (let i = -size; i < size * 2; i += 48) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke(); } }, 1, 1);

const mat = {
  wall: new THREE.MeshStandardMaterial({ map: plasterTexture, color: 0xc2b8a8, roughness: .92 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTexture, roughnessMap: woodRoughness, color: 0xa56d42, roughness: .72, metalness: .02 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2115, roughness: .7 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x777a7b, roughness: .31, metalness: .78 }),
  blackMetal: new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: .28, metalness: .76 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x263039, roughness: .95 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xd5c9b3, roughness: .88, side: THREE.DoubleSide }),
  evidence: new THREE.MeshStandardMaterial({ color: 0xd8ad4e, roughness: .45, emissive: 0x3b2502, emissiveIntensity: .16 })
};

function mesh(geometry, material, position, rotation = null, parent = scene) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function box(size, position, material = mat.wood, rotation = null, parent = scene) { return mesh(new THREE.BoxGeometry(...size), material, position, rotation, parent); }

// Arquitetura aberta para a câmera, com materiais procedurais e sombras reais.
box([12, .16, 8], [0, -.08, 0], mat.wood);
box([12, 5.8, .16], [0, 2.82, -4], mat.wall);
box([.16, 5.8, 8], [-6, 2.82, 0], mat.wall);
box([.16, 5.8, 5.5], [6, 2.82, -1.25], mat.wall);
box([12, .16, .2], [0, 1.02, -3.88], mat.darkWood);

const rug = mesh(new THREE.PlaneGeometry(6.7, 4.3), new THREE.MeshStandardMaterial({ map: rugTexture, roughness: .94 }), [.2, .012, .45], [-Math.PI / 2, 0, -.06]); rug.receiveShadow = true;

// Janela noturna e moldura.
const night = new THREE.MeshBasicMaterial({ color: 0x193f60 });
box([3.2, 2.25, .04], [-2.6, 3.25, -3.88], night);
for (const x of [-4.25, -2.6, -.95]) box([.11, 2.55, .14], [x, 3.25, -3.78], mat.darkWood);
for (const y of [1.93, 3.25, 4.56]) box([3.5, .11, .14], [-2.6, y, -3.78], mat.darkWood);
const rainGeo = new THREE.BufferGeometry(); const rainPositions = new Float32Array(90 * 3); const randRain = seeded(12); for (let i = 0; i < 90; i++) { rainPositions[i * 3] = -4.15 + randRain() * 3.1; rainPositions[i * 3 + 1] = 2 + randRain() * 2.5; rainPositions[i * 3 + 2] = -3.7; } rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3)); scene.add(new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xa7d8ff, size: .025, transparent: true, opacity: .5 })));

// Escrivaninha, gavetas e luminária.
box([4.4, .22, 1.65], [.25, 1.45, -1.9]);
for (const x of [-1.55, 2.05]) for (const z of [-2.5, -1.3]) box([.18, 1.4, .18], [x, .72, z], mat.darkWood);
box([1.05, .72, 1.2], [1.45, 1.02, -1.9], mat.darkWood);
for (const y of [.8, 1.06, 1.32]) { const drawer = box([.95, .2, 1.22], [1.45, y, -1.88], mat.wood); box([.22, .055, .04], [1.45, y, -1.245], mat.metal); }
const lampBase = mesh(new THREE.CylinderGeometry(.28, .34, .08, 24), mat.blackMetal, [-1.2, 1.61, -2.0]);
mesh(new THREE.CylinderGeometry(.035, .035, 1.0, 12), mat.blackMetal, [-1.2, 2.1, -2.0]);
mesh(new THREE.ConeGeometry(.52, .55, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x8d704b, roughness: .65, side: THREE.DoubleSide }), [-1.2, 2.52, -2.0], [0, 0, Math.PI]);
const deskLight = new THREE.SpotLight(0xffc679, 52, 8, Math.PI * .32, .65, 1.6); deskLight.position.set(-1.2, 2.42, -1.95); deskLight.target.position.set(-.7, .2, -1.35); deskLight.castShadow = true; deskLight.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024); scene.add(deskLight, deskLight.target);

// Estante e livros.
box([2.1, 3.55, .42], [-4.75, 1.78, -3.53], mat.darkWood);
for (const y of [.35, 1.18, 2.02, 2.86, 3.5]) box([2.25, .12, .62], [-4.75, y, -3.26], mat.wood);
const bookColors = [0x5f2b25, 0x263c4e, 0x6c5934, 0x36452e, 0x4b303f];
for (let shelf = 0; shelf < 4; shelf++) for (let i = 0; i < 8; i++) { const h = .42 + ((i * 17 + shelf * 7) % 19) / 80; box([.16 + (i % 3) * .025, h, .36], [-5.62 + i * .23, .47 + shelf * .84 + h / 2, -2.91], new THREE.MeshStandardMaterial({ color: bookColors[(i + shelf) % bookColors.length], roughness: .85 })); }

// Sofá, mesa lateral e quadros.
box([3.1, .48, 1.2], [3.95, .52, -2.8], mat.fabric);
box([3.1, 1.15, .35], [3.95, 1.05, -3.38], mat.fabric, [-.12, 0, 0]);
box([.35, 1.0, 1.2], [2.25, .78, -2.8], mat.fabric); box([.35, 1.0, 1.2], [5.65, .78, -2.8], mat.fabric);
box([1.05, .12, .9], [4.8, .68, -1.35], mat.darkWood); for (const x of [4.42, 5.18]) for (const z of [-1.65, -1.05]) box([.08, .65, .08], [x, .34, z], mat.blackMetal);
function framedPicture(x, y, color) { box([1.35, 1.0, .08], [x, y, -3.85], mat.darkWood); box([1.12, .77, .04], [x, y, -3.79], new THREE.MeshStandardMaterial({ color, roughness: .9 })); }
framedPicture(.1, 3.5, 0x59483a); framedPicture(1.75, 3.28, 0x344453);

// Cadeira caída e silhueta de reconstrução no tapete.
const chair = new THREE.Group(); scene.add(chair); chair.position.set(-2.5, .35, .65); chair.rotation.set(0, .45, 1.34); box([1.0, .14, 1.0], [0, .7, 0], mat.wood, null, chair); for (const x of [-.4, .4]) for (const z of [-.4, .4]) box([.1, 1.35, .1], [x, 0, z], mat.darkWood, null, chair); box([1, 1.2, .12], [0, 1.25, -.43], mat.wood, null, chair);
const outlinePoints = [[-1.2,0],[-.75,.25],[-.25,.18],[.05,.42],[.38,.37],[.7,.02],[.45,-.2],[.2,-.08],[-.1,-.42],[-.55,-.5],[-.92,-.32],[-1.2,0]].map(([x,z]) => new THREE.Vector3(x, .035, z));
const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: 0xd7c8a5, transparent: true, opacity: .72 })); outline.position.set(.25, 0, .65); outline.scale.set(1.4, 1, 1.8); scene.add(outline);

// Iluminação cinematográfica: luar, luz ambiente e viatura do lado de fora.
scene.add(new THREE.HemisphereLight(0x9fc4df, 0x2b1810, 2.0));
scene.add(new THREE.AmbientLight(0x718093, .34));
const moon = new THREE.DirectionalLight(0xa8d2ff, 2.6); moon.position.set(-4, 7, 3); moon.castShadow = true; moon.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024); moon.shadow.camera.left = -8; moon.shadow.camera.right = 8; moon.shadow.camera.top = 8; moon.shadow.camera.bottom = -8; scene.add(moon);
const ceilingFill = new THREE.PointLight(0xffd0a0, 17, 15, 1.65); ceilingFill.position.set(2.2, 4.8, 2.5); scene.add(ceilingFill);
const redLight = new THREE.PointLight(0xe13935, 7, 12); redLight.position.set(-5, 2.2, -3.2); scene.add(redLight);
const blueLight = new THREE.PointLight(0x277ae8, 7, 12); blueLight.position.set(-1, 2.8, -3.3); scene.add(blueLight);

// Poeira ambiente em três dimensões.
const dustCount = lowPower ? 90 : 190; const dustPositions = new Float32Array(dustCount * 3); const dustVelocity = new Float32Array(dustCount); const randDust = seeded(77);
for (let i = 0; i < dustCount; i++) { dustPositions[i * 3] = -5.5 + randDust() * 11; dustPositions[i * 3 + 1] = .15 + randDust() * 5; dustPositions[i * 3 + 2] = -3.6 + randDust() * 7; dustVelocity[i] = .03 + randDust() * .055; }
const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3)); const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xffdfad, size: .025, transparent: true, opacity: .38, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(dust);

const clues = [];
function clueMaterial(material) { const clone = material.clone(); if ("emissive" in clone) { clone.emissive = new THREE.Color(0x000000); clone.emissiveIntensity = 0; } return clone; }
function addClue(id, title, description, code, group, focus, hitbox = group) {
  const markerCanvas = document.createElement("canvas"); markerCanvas.width = markerCanvas.height = 128; const markerCtx = markerCanvas.getContext("2d"); markerCtx.strokeStyle = "rgba(255,219,133,.95)"; markerCtx.lineWidth = 5; markerCtx.beginPath(); markerCtx.arc(64,64,42,0,Math.PI*2); markerCtx.stroke(); markerCtx.fillStyle = "rgba(255,235,174,.9)"; markerCtx.font = "bold 38px Georgia"; markerCtx.textAlign = "center"; markerCtx.fillText("?",64,78);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(markerCanvas), transparent: true, depthTest: false })); marker.scale.set(.55,.55,.55); marker.position.copy(focus).add(new THREE.Vector3(0,.55,0)); marker.visible = false; scene.add(marker);
  const clue = { id, title, description, code, group, hitbox, focus, marker, found:false, hover:false };
  hitbox.traverse?.(child => { child.userData.clue = clue; }); hitbox.userData.clue = clue; clues.push(clue); return clue;
}

// 1. Faca sobre a escrivaninha.
const knife = new THREE.Group(); knife.position.set(.25, 1.62, -1.72); knife.rotation.y = -.35; scene.add(knife); mesh(new THREE.BoxGeometry(1.05,.045,.2), clueMaterial(mat.metal), [.18,0,0], null, knife); mesh(new THREE.CylinderGeometry(.1,.1,.62,12), new THREE.MeshStandardMaterial({color:0x241610,roughness:.6}), [-.63,0,0], [0,0,Math.PI/2], knife); const knifeHit=box([1.55,.35,.55],[.25,1.68,-1.72],new THREE.MeshBasicMaterial({visible:false})); addClue("knife","Faca de cozinha","A lâmina foi limpa às pressas, mas ainda há material preso próximo ao cabo.","EVD-302-A1",knife,new THREE.Vector3(.25,1.65,-1.72),knifeHit);

// 2. Chave sob a cadeira.
const key = new THREE.Group(); key.position.set(-2.1,.08,.35); key.rotation.x=-Math.PI/2; key.rotation.z=.4; scene.add(key); mesh(new THREE.TorusGeometry(.15,.035,8,24),new THREE.MeshStandardMaterial({color:0xb79842,metalness:.8,roughness:.28}),[0,0,0],null,key); box([.55,.07,.07],[.37,0,0],new THREE.MeshStandardMaterial({color:0xb79842,metalness:.8,roughness:.28}),null,key); const keyHit=box([.95,.22,.65],[-2.1,.15,.35],new THREE.MeshBasicMaterial({visible:false})); addClue("key","Chave sem identificação","A chave não pertence a nenhuma fechadura do apartamento.","EVD-302-B4",key,new THREE.Vector3(-2.1,.12,.35),keyHit);

// 3. Fotografia rasgada no chão.
const photoCanvas=document.createElement("canvas");photoCanvas.width=256;photoCanvas.height=180;const pc=photoCanvas.getContext("2d");pc.fillStyle="#d9c9ad";pc.fillRect(0,0,256,180);pc.fillStyle="#463c35";pc.fillRect(14,14,228,145);pc.fillStyle="#8f8275";pc.beginPath();pc.arc(100,75,38,0,TAU);pc.fill();pc.fillStyle="#b5a79a";pc.fillRect(145,50,50,80);pc.strokeStyle="#b5332d";pc.lineWidth=5;pc.beginPath();pc.moveTo(130,0);pc.lineTo(110,180);pc.stroke();
const photo=mesh(new THREE.PlaneGeometry(.8,.56),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(photoCanvas),roughness:.9,side:THREE.DoubleSide}),[-.8,.035,1.9],[-Math.PI/2,0,.28]);const photoHit=box([1.1,.18,.85],[-.8,.12,1.9],new THREE.MeshBasicMaterial({visible:false}));addClue("photo","Fotografia rasgada","Duas pessoas aparecem na imagem. Um dos rostos foi riscado recentemente.","EVD-302-C2",photo,new THREE.Vector3(-.8,.08,1.9),photoHit);

// 4. Celular quebrado ao lado do sofá.
const phone=new THREE.Group();phone.position.set(3.15,.09,-1.12);phone.rotation.set(-Math.PI/2,0,-.45);scene.add(phone);box([.48,.82,.07],[0,0,0],new THREE.MeshStandardMaterial({color:0x111316,metalness:.5,roughness:.25}),null,phone);box([.4,.68,.075],[0,0,.02],new THREE.MeshStandardMaterial({color:0x132839,emissive:0x0a2c4a,emissiveIntensity:.4,roughness:.18}),null,phone);const phoneHit=box([.85,.2,1.1],[3.15,.14,-1.12],new THREE.MeshBasicMaterial({visible:false}));addClue("phone","Celular danificado","A última mensagem foi apagada três minutos antes da estimativa do crime.","EVD-302-D7",phone,new THREE.Vector3(3.15,.1,-1.12),phoneHit);

// 5. Caco de vidro junto à janela.
const glassGroup=new THREE.Group();glassGroup.position.set(-3.75,.05,-2.8);scene.add(glassGroup);const glassMat=new THREE.MeshPhysicalMaterial({color:0xaedaf0,transparent:true,opacity:.5,roughness:.05,metalness:0,transmission:.55,side:THREE.DoubleSide});for(let i=0;i<5;i++){const g=new THREE.BufferGeometry();const s=.18+i*.035;g.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,s,0,.04,s*.25,0,s*1.4],3));g.computeVertexNormals();const shard=new THREE.Mesh(g,glassMat);shard.position.set((i-2)*.18,0,(i%2)*.14);shard.rotation.y=i*.8;glassGroup.add(shard);}const glassHit=box([1.25,.25,.85],[-3.75,.16,-2.8],new THREE.MeshBasicMaterial({visible:false}));addClue("glass","Vidro temperado","O fragmento não pertence à janela. Há vestígios de perfume na superfície.","EVD-302-E3",glassGroup,new THREE.Vector3(-3.75,.1,-2.8),glassHit);

clues.forEach(clue => { const item=document.createElement("li");item.className="clueRow";item.dataset.id=clue.id;item.innerHTML=`<span class="tick">✓</span><span>${clue.title}</span>`;clueList.appendChild(item); });

const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let hovered=null;let pointerDown=null;let dragging=false;let scanUntil=0;let foundCount=0;
function setHover(clue){if(hovered===clue)return;if(hovered&&!hovered.found)hovered.marker.visible=performance.now()<scanUntil;hovered=clue;canvas.classList.toggle("inspecting",Boolean(clue));if(clue&&!clue.found){clue.marker.visible=true;tooltip.textContent=clue.title;tooltip.classList.add("show");}else tooltip.classList.remove("show");}
function pick(event){const rect=canvas.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(clues.filter(c=>!c.found).map(c=>c.hitbox),true);return hits[0]?.object?.userData?.clue||null;}
canvas.addEventListener("pointerdown",event=>{pointerDown={x:event.clientX,y:event.clientY,yaw:cameraGoal.yaw,pitch:cameraGoal.pitch};dragging=false;canvas.setPointerCapture(event.pointerId);canvas.classList.add("dragging")});
canvas.addEventListener("pointermove",event=>{tooltip.style.left=`${event.clientX}px`;tooltip.style.top=`${event.clientY}px`;if(pointerDown){const dx=event.clientX-pointerDown.x,dy=event.clientY-pointerDown.y;if(Math.hypot(dx,dy)>5)dragging=true;cameraGoal.yaw=pointerDown.yaw-dx*.0045;cameraGoal.pitch=THREE.MathUtils.clamp(pointerDown.pitch+dy*.0035,.12,.83);setHover(null)}else setHover(pick(event));});
canvas.addEventListener("pointerup",event=>{canvas.releasePointerCapture(event.pointerId);canvas.classList.remove("dragging");const clue=!dragging?pick(event):null;pointerDown=null;if(clue)collectClue(clue)});
canvas.addEventListener("pointerleave",()=>{pointerDown=null;canvas.classList.remove("dragging");setHover(null)});
canvas.addEventListener("wheel",event=>{event.preventDefault();cameraGoal.distance=THREE.MathUtils.clamp(cameraGoal.distance+event.deltaY*.008,7.5,17)},{passive:false});

function collectClue(clue){if(clue.found)return;clue.found=true;clue.marker.visible=false;foundCount++;counter.textContent=`${foundCount} / ${clues.length}`;document.querySelector(`.clueRow[data-id="${clue.id}"]`)?.classList.add("found");cameraGoal.target.copy(clue.focus);cameraGoal.distance=7.7;document.getElementById("evidenceTitle").textContent=clue.title;document.getElementById("evidenceText").textContent=clue.description;document.getElementById("evidenceCode").textContent=`CATÁLOGO DIGITAL · ${clue.code}`;setTimeout(()=>modal.classList.add("open"),reducedMotion?0:350);setHover(null);if(foundCount===clues.length)setTimeout(()=>complete.classList.add("show"),1600)}
function closeModal(){modal.classList.remove("open");cameraGoal.target.copy(defaultOrbit.target);cameraGoal.distance=defaultOrbit.distance}
document.getElementById("closeEvidence").addEventListener("click",closeModal);modal.addEventListener("click",event=>{if(event.target===modal)closeModal()});
document.getElementById("scanBtn").addEventListener("click",event=>{scanUntil=performance.now()+2600;event.currentTarget.classList.add("scanActive");clues.filter(c=>!c.found).forEach(c=>c.marker.visible=true);toast.textContent="Contraste forense ativado";toast.classList.add("show");setTimeout(()=>{clues.filter(c=>!c.found&&c!==hovered).forEach(c=>c.marker.visible=false);event.currentTarget.classList.remove("scanActive");toast.classList.remove("show")},2600)});
document.getElementById("resetBtn").addEventListener("click",()=>{cameraGoal.yaw=defaultOrbit.yaw;cameraGoal.pitch=defaultOrbit.pitch;cameraGoal.distance=defaultOrbit.distance;cameraGoal.target.copy(defaultOrbit.target)});
document.getElementById("playAgain").addEventListener("click",()=>location.reload());
addEventListener("keydown",event=>{if(event.key==="Escape")closeModal();if(event.key.toLowerCase()==="q")document.getElementById("scanBtn").click()});

function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}addEventListener("resize",resize,{passive:true});resize();
const clock=new THREE.Clock();let animationId=0;let elapsed=0;
function animate(){animationId=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.033);elapsed+=dt;const t=elapsed;updateCamera();redLight.intensity=4.5+Math.max(0,Math.sin(t*2.2))*7;blueLight.intensity=4.5+Math.max(0,Math.sin(t*2.2+Math.PI))*7;deskLight.intensity=51+Math.sin(t*7.3)*.55;for(let i=0;i<dustCount;i++){dustPositions[i*3+1]+=dustVelocity[i]*dt;dustPositions[i*3]+=(Math.sin(t*.3+i)*.012)*dt;if(dustPositions[i*3+1]>5.2)dustPositions[i*3+1]=.1;}dustGeometry.attributes.position.needsUpdate=true;clues.forEach((clue,index)=>{if(clue.marker.visible){const scale=.52+Math.sin(t*2.4+index)*.08;clue.marker.scale.setScalar(scale);clue.marker.material.opacity=.78+Math.sin(t*2.4+index)*.2}});renderer.render(scene,camera)}
document.addEventListener("visibilitychange",()=>{if(document.hidden&&animationId){cancelAnimationFrame(animationId);animationId=0}else if(!document.hidden&&!animationId){clock.getDelta();animate()}});
animate();requestAnimationFrame(()=>requestAnimationFrame(()=>loader.classList.add("done")));
