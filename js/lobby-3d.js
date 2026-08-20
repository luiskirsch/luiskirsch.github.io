const viewer = document.getElementById("lobbyViewer");
const image = document.getElementById("lobbyBgImg");
const depthCanvas = document.getElementById("lobbyDepthCanvas");
const fxCanvas = document.getElementById("lobbyCanvas");

if (!viewer || !image || !depthCanvas || !fxCanvas) throw new Error("lobby 3D elements missing");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPower = innerWidth < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const sourceSize = { width: 1672, height: 941 };
const depthUrl = "/assets/lobby-room-3d-v3-depth.webp?v=1";
const fx = fxCanvas.getContext("2d", { alpha:true, desynchronized:true });
let renderer = null;
let animationId = 0;
let visible = !document.hidden;
let intersecting = true;
let pointerTarget = { x:.5, y:.5 };
let pointerCurrent = { x:.5, y:.5 };
let fxWidth = 1;
let fxHeight = 1;

viewer.classList.add("lobbyViewer--physics");
document.body.classList.add("lobby-mode");

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
  const vertex = compileShader(gl, gl.VERTEX_SHADER, "attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}");
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `precision highp float;varying vec2 uv;uniform sampler2D colorMap;uniform sampler2D depthMap;uniform vec2 pointer;uniform vec2 viewport;void main(){float sourceAspect=${sourceSize.width.toFixed(1)}/${sourceSize.height.toFixed(1)};float viewAspect=viewport.x/viewport.y;vec2 cover=vec2(1.);if(viewAspect>sourceAspect)cover.y=sourceAspect/viewAspect;else cover.x=viewAspect/sourceAspect;vec2 sourceUv=(uv-.5)*cover/1.045+.5;float depth=texture2D(depthMap,sourceUv).r;vec2 motion=(pointer-.5)*vec2(.042,.026);vec2 displaced=clamp(sourceUv-motion*(depth-.18),vec2(.006),vec2(.994));vec3 color=texture2D(colorMap,displaced).rgb;float vignette=1.-smoothstep(.36,.78,length(uv-.5))*.23;color*=vignette;color=pow(color,vec3(.96));gl_FragColor=vec4(color,1.);}`);
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const pointerUniform = gl.getUniformLocation(program, "pointer");
  const viewportUniform = gl.getUniformLocation(program, "viewport");

  function upload(unit, source, name) {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(gl.getUniformLocation(program, name), unit);
  }
  upload(0, colorImage, "colorMap"); upload(1, depthImage, "depthMap");

  function resize() {
    const bounds = viewer.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.4);
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (depthCanvas.width === width && depthCanvas.height === height) return;
    depthCanvas.width = width; depthCanvas.height = height; gl.viewport(0, 0, width, height);
  }
  function render() {
    resize();
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * .065;
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * .065;
    gl.uniform2f(pointerUniform, pointerCurrent.x, pointerCurrent.y);
    gl.uniform2f(viewportUniform, depthCanvas.width, depthCanvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  return { render, resize };
}

const particles = Array.from({ length:reducedMotion ? 34 : lowPower ? 58 : 96 }, (_, index) => ({ x:(index*71%101)/101, y:(index*47%97)/97, z:(index*37%89)/89, phase:index*1.67, speed:.000018+(index%7)*.000006, size:.45+(index%5)*.24 }));

function resizeFx() {
  const bounds = viewer.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, lowPower ? 1 : 1.25);
  fxWidth = bounds.width; fxHeight = bounds.height;
  fxCanvas.width = Math.max(1, Math.round(fxWidth * ratio)); fxCanvas.height = Math.max(1, Math.round(fxHeight * ratio));
  fxCanvas.style.width = `${fxWidth}px`; fxCanvas.style.height = `${fxHeight}px`;
  fx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawFx(time) {
  fx.clearRect(0, 0, fxWidth, fxHeight); fx.globalCompositeOperation = "lighter";
  for (const particle of particles) {
    particle.y -= particle.speed; if (particle.y < -.03) particle.y = 1.03;
    const x = particle.x*fxWidth + Math.sin(time*.00015+particle.phase)*11 + (pointerCurrent.x-.5)*particle.z*16;
    const y = particle.y*fxHeight + (pointerCurrent.y-.5)*particle.z*9;
    const light = Math.max(0,1-Math.abs(particle.x-.53)*2.7)*Math.max(0,1-Math.abs(particle.y-.42)*2.2);
    const radius = particle.size*(.7+particle.z*1.25);
    fx.fillStyle = `rgba(255,220,160,${.07+light*.31})`; fx.beginPath(); fx.arc(x,y,radius,0,Math.PI*2); fx.fill();
  }
  fx.globalCompositeOperation = "source-over";
}

function shouldRun() { return visible && intersecting && viewer.style.display !== "none" && !document.body.classList.contains("ritual-started"); }
function frame(time) { animationId=requestAnimationFrame(frame); renderer?.render(); if(!reducedMotion) drawFx(time); }
function start() { if(!animationId && shouldRun()) animationId=requestAnimationFrame(frame); }
function stop() { if(animationId){cancelAnimationFrame(animationId);animationId=0;} }
function resize() { renderer?.resize(); resizeFx(); renderer?.render(); if(reducedMotion) drawFx(performance.now()); }

viewer.addEventListener("pointermove", event => {
  if(reducedMotion) return;
  const bounds=viewer.getBoundingClientRect();
  pointerTarget.x=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));
  pointerTarget.y=Math.max(0,Math.min(1,1-(event.clientY-bounds.top)/bounds.height));
}, { passive:true });
viewer.addEventListener("pointerleave", () => { pointerTarget={x:.5,y:.5}; }, { passive:true });

async function initialize() {
  resizeFx();
  try {
    await image.decode();
    const depth=await loadImage(depthUrl);
    renderer=createDepthRenderer(image,depth);
    if(renderer){renderer.render();depthCanvas.classList.add("ready");viewer.dataset.depth="ready";}
  } catch(error) { viewer.dataset.depth="fallback";viewer.dataset.depthError=error?.message||"unknown";console.warn("Lobby depth parallax indisponível; usando render estático.",error); }
  document.body.classList.add("lobby-video-ready"); start();
}

if("ResizeObserver" in window) new ResizeObserver(resize).observe(viewer); else addEventListener("resize",resize,{passive:true});
if("IntersectionObserver" in window) new IntersectionObserver(entries=>{intersecting=entries[0]?.isIntersecting!==false;if(shouldRun())start();else stop();},{threshold:.01}).observe(viewer);
document.addEventListener("visibilitychange",()=>{visible=!document.hidden;if(shouldRun())start();else stop();});

window._lobby3d={show(){if(document.body.classList.contains("ritual-started"))return;viewer.style.display="flex";document.body.classList.add("lobby-mode");resize();start();},hide(){viewer.style.display="none";document.body.classList.remove("lobby-mode");stop();}};
initialize();
