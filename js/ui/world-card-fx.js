// Render cinematográfico WebGL das influências persistentes do Mundo.
// Não depende de bibliotecas externas e falha silenciosamente sem WebGL.
import { S } from "../state.js";
import { resolveWorldCardMeta } from "./world-card-meta.js?v=world-v3";

let canvas, gl, program, raf = 0, startedAt = 0, activeCard = null, activeMeta = null;
let timeLoc, accentLoc, pointerLoc;
const pointer = { x: .5, y: .5, tx: .5, ty: .5 };

function hexRgb(hex) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : "d4af37";
  return [0, 2, 4].map(i => parseInt(safe.slice(i, i + 2), 16) / 255);
}

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function ensureRenderer() {
  if (program) return true;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const card = document.querySelector(".ritualVisualCard");
  if (!card) return false;

  canvas = document.createElement("canvas");
  canvas.className = "worldCardWebGL";
  canvas.setAttribute("aria-hidden", "true");
  card.prepend(canvas);
  gl = canvas.getContext("webgl", {
    alpha: true, antialias: false, depth: false, powerPreference: "high-performance",
  });
  if (!gl) {
    canvas.remove(); canvas = null;
    return false;
  }

  try {
    const vertex = compile(gl.VERTEX_SHADER,
      "attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}");
    const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float;
      varying vec2 uv;uniform float t;uniform vec3 accent;uniform vec2 pointer;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 q=uv-.5;
        float d=length(q);
        vec2 grid=floor((uv+pointer*.018)*vec2(34.,52.));
        float h=hash(grid);
        float stars=step(.965,h)*pow(max(0.,sin(t*(.7+h)+h*20.)),8.);
        float ring=exp(-55.*abs(d-(.22+.018*sin(t*.8))));
        float rays=.5+.5*sin(atan(q.y,q.x)*8.-t*1.2);
        float aura=ring*(.16+.12*rays)+stars*.55;
        float vignette=smoothstep(.75,.12,d);
        gl_FragColor=vec4(accent*(aura+.025*vignette),min(.72,aura));
      }`);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    timeLoc = gl.getUniformLocation(program, "t");
    accentLoc = gl.getUniformLocation(program, "accent");
    pointerLoc = gl.getUniformLocation(program, "pointer");
    return true;
  } catch (_) {
    canvas.remove(); canvas = gl = program = null;
    return false;
  }
}

function resize() {
  if (!canvas || !gl) return;
  const rect = canvas.getBoundingClientRect();
  const density = Math.min(devicePixelRatio || 1, 1.6);
  const width = Math.max(1, rect.width * density | 0);
  const height = Math.max(1, rect.height * density | 0);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width; canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

function frame(now) {
  if (!activeCard || !activeMeta || !gl) { raf = 0; return; }
  resize();
  pointer.x += (pointer.tx - pointer.x) * .06;
  pointer.y += (pointer.ty - pointer.y) * .06;
  gl.useProgram(program);
  gl.uniform1f(timeLoc, (now - startedAt) / 1000);
  gl.uniform3fv(accentLoc, hexRgb(activeMeta.palette[0]));
  gl.uniform2f(pointerLoc, pointer.x, pointer.y);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  raf = requestAnimationFrame(frame);
}

function playTerritoryChord(meta, signature) {
  if (!S.audioReady || !S.audioCtx) return;
  try {
    const ctx = S.audioCtx;
    const start = ctx.currentTime;
    const base = { limiar: 82, entrelinhas: 110, camara: 65, sexto_lugar: 138 }[meta.territoryId] || 92;
    const ratios = signature ? [1, 1.5, 2] : [1];
    ratios.forEach((ratio, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(base * ratio, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(signature ? (index === 0 ? .09 : .025) : .025, start + .08 + index * .04);
      gain.gain.exponentialRampToValueAtTime(.001, start + (signature ? 1.25 : .65) + index * .2);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(start); oscillator.stop(start + (signature ? 1.6 : .8));
    });
  } catch (_) {}
}

function cinematic(card) {
  const meta = resolveWorldCardMeta(card);
  if (!meta) return;
  const signature = meta.resonance !== "ambient";

  let layer = document.getElementById("worldCardCinematic");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "worldCardCinematic";
    layer.className = "worldCardCinematic";
    layer.innerHTML = '<div class="worldCardCinematic__line"></div><div class="worldCardCinematic__sigil"></div><div class="worldCardCinematic__copy"><small></small><strong></strong><span></span></div><div class="worldCardCinematic__line"></div>';
    document.body.appendChild(layer);
  }
  layer.style.setProperty("--world-accent", meta.palette[0]);
  layer.dataset.worldResonance = meta.resonance;
  layer.querySelector(".worldCardCinematic__sigil").textContent = meta.sigil;
  layer.querySelector("small").textContent = meta.kind === "fragment"
    ? "FRAGMENTO DO MUNDO"
    : (signature ? "RESSONÂNCIA TERRITORIAL" : "INFLUÊNCIA DO MUNDO");
  layer.querySelector("strong").textContent = meta.name;
  layer.querySelector("span").textContent = meta.kind === "fragment"
    ? `${meta.rarity} · ${meta.fragmentId || "vestígio sem código"}`
    : meta.effect;
  layer.classList.remove("is-on");
  void layer.offsetWidth;
  layer.classList.add("is-on");
  clearTimeout(layer._timer);
  layer._timer = setTimeout(() => layer.classList.remove("is-on"), signature ? 2700 : 1450);
  playTerritoryChord(meta, signature);
}

function tilt(event) {
  const wrap = document.getElementById("ritualCardWrap");
  if (!activeCard || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  pointer.tx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  pointer.ty = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  wrap.style.setProperty("--world-rx", `${(pointer.ty - .5) * -7}deg`);
  wrap.style.setProperty("--world-ry", `${(pointer.tx - .5) * 9}deg`);
}

function untilt() {
  pointer.tx = pointer.ty = .5;
  const wrap = document.getElementById("ritualCardWrap");
  if (wrap) {
    wrap.style.setProperty("--world-rx", "0deg");
    wrap.style.setProperty("--world-ry", "0deg");
  }
}

export function setWorldCardFX(card) {
  activeMeta = resolveWorldCardMeta(card);
  activeCard = activeMeta ? card : null;
  const wrap = document.getElementById("ritualCardWrap");
  if (wrap) {
    wrap.classList.toggle("world-card-active", !!activeCard);
    if (!wrap._worldFxBound) {
      wrap.addEventListener("pointermove", tilt);
      wrap.addEventListener("pointerleave", untilt);
      wrap._worldFxBound = true;
    }
  }
  if (!activeCard) {
    if (canvas) canvas.hidden = true;
    untilt();
    return;
  }
  if (ensureRenderer()) {
    canvas.hidden = false;
    startedAt = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
  }
}

export function revealWorldCardFX(card) {
  setWorldCardFX(card);
  cinematic(card);
}
