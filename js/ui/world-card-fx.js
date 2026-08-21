// Render cinematográfico WebGL das influências persistentes do Mundo.
// Não depende de bibliotecas externas e falha silenciosamente em hardware sem WebGL.
import { S } from "../state.js";
let canvas, gl, program, raf = 0, startedAt = 0, activeCard = null;
let timeLoc, accentLoc, pointerLoc;
const pointer = { x: .5, y: .5, tx: .5, ty: .5 };

function hexRgb(hex) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : "d4af37";
  return [0, 2, 4].map(i => parseInt(safe.slice(i, i + 2), 16) / 255);
}

function compile(type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function ensureRenderer() {
  if (program) return true;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const card = document.querySelector(".ritualVisualCard"); if (!card) return false;
  canvas = document.createElement("canvas"); canvas.className = "worldCardWebGL"; canvas.setAttribute("aria-hidden", "true"); card.prepend(canvas);
  gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, powerPreference: "high-performance" });
  if (!gl) { canvas.remove(); canvas = null; return false; }
  try {
    const vs = compile(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}");
    const fs = compile(gl.FRAGMENT_SHADER, `precision mediump float;varying vec2 uv;uniform float t;uniform vec3 accent;uniform vec2 pointer;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 q=uv-.5;float d=length(q);vec2 grid=floor((uv+pointer*.018)*vec2(34.,52.));float h=hash(grid);float stars=step(.965,h)*pow(max(0.,sin(t*(.7+h)+h*20.)),8.);float ring=exp(-55.*abs(d-(.22+.018*sin(t*.8))));float rays=.5+.5*sin(atan(q.y,q.x)*8.-t*1.2);float aura=ring*(.16+.12*rays)+stars*.55;float vignette=smoothstep(.75,.12,d);gl_FragColor=vec4(accent*(aura+.025*vignette),min(.72,aura));}`);
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program,"p"); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    timeLoc=gl.getUniformLocation(program,"t");accentLoc=gl.getUniformLocation(program,"accent");pointerLoc=gl.getUniformLocation(program,"pointer");
    return true;
  } catch (_) { canvas.remove(); canvas = gl = program = null; return false; }
}

function resize() {
  if (!canvas || !gl) return; const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.6),w=Math.max(1,r.width*d|0),h=Math.max(1,r.height*d|0);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
}

function frame(now) {
  if (!activeCard || !gl) { raf=0; return; } resize(); pointer.x+=(pointer.tx-pointer.x)*.06;pointer.y+=(pointer.ty-pointer.y)*.06;
  gl.useProgram(program);gl.uniform1f(timeLoc,(now-startedAt)/1000);gl.uniform3fv(accentLoc,hexRgb((activeCard.worldInfluence||activeCard).palette?.[0]));gl.uniform2f(pointerLoc,pointer.x,pointer.y);gl.drawArrays(gl.TRIANGLES,0,6);raf=requestAnimationFrame(frame);
}

function cinematic(card) {
  const influence=card?.worldInfluence||(card?.type==="fragmento"?card:null);if(!influence)return;
  let layer=document.getElementById("worldCardCinematic");if(!layer){layer=document.createElement("div");layer.id="worldCardCinematic";layer.className="worldCardCinematic";layer.innerHTML='<div class="worldCardCinematic__line"></div><div class="worldCardCinematic__sigil"></div><div class="worldCardCinematic__copy"><small>INFLUÊNCIA DO MUNDO</small><strong></strong><span></span></div><div class="worldCardCinematic__line"></div>';document.body.appendChild(layer);}
  layer.style.setProperty("--world-accent",influence.palette?.[0]||"#d4af37");layer.querySelector(".worldCardCinematic__sigil").textContent=influence.sigil||"◇";layer.querySelector("strong").textContent=influence.name||influence.territoryId||"Fragmento";layer.querySelector("span").textContent=card.type==="fragmento"?`${card.rarity||"comum"} · ${card.fragmentId||"vestígio sem código"}`:(influence.effect||"");layer.classList.remove("is-on");void layer.offsetWidth;layer.classList.add("is-on");clearTimeout(layer._timer);layer._timer=setTimeout(()=>layer.classList.remove("is-on"),2200);
  if(S.audioReady&&S.audioCtx){try{const ctx=S.audioCtx,t=ctx.currentTime,base={limiar:82,entrelinhas:110,camara:65,sexto_lugar:138}[influence.territoryId]||92;[1,1.5,2].forEach((ratio,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=i===0?'sine':'triangle';osc.frequency.setValueAtTime(base*ratio,t);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(i===0?.09:.025,t+.08+i*.04);gain.gain.exponentialRampToValueAtTime(.001,t+1.25+i*.2);osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+1.6);});}catch(_){}}
}

function tilt(e) { const wrap=document.getElementById("ritualCardWrap");if(!activeCard||!wrap)return;const r=wrap.getBoundingClientRect();pointer.tx=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));pointer.ty=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));wrap.style.setProperty("--world-rx",`${(pointer.ty-.5)*-7}deg`);wrap.style.setProperty("--world-ry",`${(pointer.tx-.5)*9}deg`); }
function untilt(){pointer.tx=pointer.ty=.5;const wrap=document.getElementById("ritualCardWrap");if(wrap){wrap.style.setProperty("--world-rx","0deg");wrap.style.setProperty("--world-ry","0deg");}}

export function setWorldCardFX(card) {
  activeCard=(card?.worldInfluence||card?.type==="fragmento")?card:null;const wrap=document.getElementById("ritualCardWrap");
  if(wrap){wrap.classList.toggle("world-card-active",!!activeCard);if(!wrap._worldFxBound){wrap.addEventListener("pointermove",tilt);wrap.addEventListener("pointerleave",untilt);wrap._worldFxBound=true;}}
  if(!activeCard){if(canvas)canvas.hidden=true;untilt();return;}if(ensureRenderer()){canvas.hidden=false;startedAt=performance.now();if(!raf)raf=requestAnimationFrame(frame);}
}

export function revealWorldCardFX(card) { setWorldCardFX(card); cinematic(card); }
