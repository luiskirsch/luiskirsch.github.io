// Animações visuais: giro de carta, som de flip, reações flutuantes, badges de emoji
import { S } from "../state.js";
import { EMOJI_LOTTIE, LOTTIE_BASE } from "../constants.js";

// ── Som de carta sendo virada (Web Audio API) ─────────────────────────────────
export function playCardFlip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sr  = ctx.sampleRate;
    const t0  = ctx.currentTime;

    function noiseBuf(dur, shapeFn) {
      const buf = ctx.createBuffer(1, sr * dur | 0, sr);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * shapeFn(i / d.length);
      return buf;
    }

    // 1. SNAP — estalo inicial
    const snSrc = ctx.createBufferSource(); snSrc.buffer = noiseBuf(0.012, t => Math.exp(-t * 22));
    const snHPF = ctx.createBiquadFilter(); snHPF.type = "highpass"; snHPF.frequency.value = 5500;
    const snPeak = ctx.createBiquadFilter(); snPeak.type = "peaking"; snPeak.frequency.value = 7000; snPeak.gain.value = 9; snPeak.Q.value = 2.5;
    const snG = ctx.createGain(); snG.gain.value = 0.65;
    snSrc.connect(snHPF); snHPF.connect(snPeak); snPeak.connect(snG); snG.connect(ctx.destination);
    snSrc.start(t0);

    // 2. RUSTLE — papel rasgando o ar
    const ruSrc = ctx.createBufferSource(); ruSrc.buffer = noiseBuf(0.055, t => (t < 0.06 ? t / 0.06 : 1) * Math.pow(1 - t, 2.5));
    const ruBPF = ctx.createBiquadFilter(); ruBPF.type = "bandpass"; ruBPF.frequency.value = 3500; ruBPF.Q.value = 1.2;
    const ruNotch = ctx.createBiquadFilter(); ruNotch.type = "notch"; ruNotch.frequency.value = 1200; ruNotch.Q.value = 1.0;
    const ruG = ctx.createGain(); ruG.gain.value = 0.32;
    ruSrc.connect(ruBPF); ruBPF.connect(ruNotch); ruNotch.connect(ruG); ruG.connect(ctx.destination);
    ruSrc.start(t0 + 0.004);

    // 3. LAND — batida ao pousar
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(280, t0 + 0.05); osc.frequency.exponentialRampToValueAtTime(62, t0 + 0.12);
    const ldG = ctx.createGain(); ldG.gain.setValueAtTime(0.14, t0 + 0.05); ldG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    osc.connect(ldG); ldG.connect(ctx.destination);
    osc.start(t0 + 0.05); osc.stop(t0 + 0.13);

    setTimeout(() => ctx.close(), 500);
  } catch (_) {}
}

// ── Animação de revelação de carta (flip 3D) ──────────────────────────────────
export function fireRevealAnimation(currentCard, applyCardContentFn) {
  const ritualCardWrapEl   = document.getElementById("ritualCardWrap");
  const ritualCardShadowEl = document.getElementById("ritualCardShadow");
  const revealPanelEl      = document.querySelector(".revealPanel");
  const revealGlowEl       = document.getElementById("revealGlow");
  const revealCardBtn      = document.getElementById("revealCardBtn");

  if (!ritualCardWrapEl || S.revealAnimating) {
    applyCardContentFn(currentCard);
    return;
  }

  S.revealAnimating = true;
  playCardFlip();
  if (revealCardBtn) revealCardBtn.disabled = true;

  const isFirstReveal = S.cardFaceDown;
  if (isFirstReveal) S.cardFaceDown = false;

  ritualCardWrapEl.classList.remove("ritualCardWrap--flipping", "ritualCardWrap--first-reveal", "ritualCardWrap--facedown");
  void ritualCardWrapEl.offsetWidth;

  if (ritualCardShadowEl) {
    ritualCardShadowEl.classList.remove("ritualCardShadow--animating");
    void ritualCardShadowEl.offsetWidth;
    ritualCardShadowEl.classList.add("ritualCardShadow--animating");
  }

  function shake() {
    if (!revealPanelEl) return;
    revealPanelEl.classList.remove("revealPanel--shake");
    void revealPanelEl.offsetWidth;
    revealPanelEl.classList.add("revealPanel--shake");
    setTimeout(() => revealPanelEl.classList.remove("revealPanel--shake"), 340);
  }

  function glow() {
    if (!revealGlowEl) return;
    revealGlowEl.classList.remove("revealGlow--active");
    void revealGlowEl.offsetWidth;
    revealGlowEl.classList.add("revealGlow--active");
  }

  function finalize() {
    ritualCardWrapEl.classList.remove("ritualCardWrap--flipping", "ritualCardWrap--first-reveal");
    if (ritualCardShadowEl) ritualCardShadowEl.classList.remove("ritualCardShadow--animating");
    if (revealGlowEl) revealGlowEl.classList.remove("revealGlow--active");
    S.revealAnimating = false;
    // Atualiza botões de ritual
    document.dispatchEvent(new CustomEvent("osl:updateRitualButtons"));
  }

  if (isFirstReveal) {
    ritualCardWrapEl.classList.add("ritualCardWrap--first-reveal");
    setTimeout(() => { applyCardContentFn(currentCard); shake(); }, 300);
    setTimeout(glow, 900);
    setTimeout(finalize, 1600);
  } else {
    ritualCardWrapEl.classList.add("ritualCardWrap--flipping");
    setTimeout(() => { applyCardContentFn(currentCard); shake(); }, 350);
    setTimeout(glow, 1400);
    setTimeout(finalize, 2000);
  }
}

// ── Lottie helper ─────────────────────────────────────────────────────────────
export function loadLottieInto(container, code, loop = true) {
  if (!window.lottie) { container.textContent = "…"; return null; }
  return window.lottie.loadAnimation({
    container, renderer: "svg", loop, autoplay: true,
    path: `${LOTTIE_BASE}/${code}/lottie.json`
  });
}

// ── Badge de emoji no tile de vídeo ──────────────────────────────────────────
export function showFeelingBadge(tile, emoji, pid) {
  const prev = S._feelingBadges.get(pid);
  if (prev) {
    prev._lottie?.destroy();
    clearTimeout(prev._hideTimer);
    window.removeEventListener("resize", prev._onResize);
    prev.remove();
  }

  const badge = document.createElement("div");
  badge.className = "videoTile__feeling";

  const place = () => {
    const r = tile.getBoundingClientRect();
    if (!r.width) return;
    badge.style.left = (r.right - 60) + "px";
    badge.style.top  = (r.top  +  4) + "px";
  };
  place();
  document.body.appendChild(badge);
  S._feelingBadges.set(pid, badge);

  const code = EMOJI_LOTTIE[emoji];
  if (code) {
    badge._lottie = loadLottieInto(badge, code, true);
  } else {
    badge.style.cssText += ";font-size:26px;line-height:56px;text-align:center";
    badge.textContent = emoji;
  }

  badge._onResize = place;
  window.addEventListener("resize", badge._onResize);

  badge._hideTimer = setTimeout(() => {
    badge.classList.add("videoTile__feeling--out");
    setTimeout(() => {
      badge._lottie?.destroy();
      window.removeEventListener("resize", badge._onResize);
      badge.remove();
      S._feelingBadges.delete(pid);
    }, 460);
  }, 3000);
}

// ── Reação flutuante ──────────────────────────────────────────────────────────
export function spawnReactionFloat(pid, emoji, fallbackEl) {
  const isArena  = document.documentElement.classList.contains("arenaMode");
  const grid     = document.getElementById("videoGrid");
  const selfSlot = document.getElementById("videoSelfSlot");

  const tile = (pid === S.participantId)
    ? selfSlot?.querySelector(".videoTile")
    : grid?.querySelector(`.videoTile[data-identity="${CSS.escape(pid)}"]`);

  if (isArena && tile) {
    showFeelingBadge(tile, emoji, pid);
    return;
  }

  const origin = tile || fallbackEl || document.getElementById("reactionBar");
  const rect   = origin?.getBoundingClientRect();

  if (!rect?.width && !rect?.height) {
    const float = document.createElement("span");
    float.className = "reactionFloat";
    float.textContent = emoji;
    float.style.left = (window.innerWidth * 0.5) + "px";
    float.style.top  = (window.innerHeight * 0.5) + "px";
    document.body.appendChild(float);
    setTimeout(() => float.remove(), 1800);
    return;
  }

  const floatEl = document.createElement("div");
  floatEl.className = "reactionFloat";
  floatEl.style.left = (rect.left + rect.width * (0.15 + Math.random() * 0.6)) + "px";
  floatEl.style.top  = tile ? (rect.top + rect.height * 0.3) + "px" : (rect.top - 10) + "px";
  document.body.appendChild(floatEl);

  const code = EMOJI_LOTTIE[emoji];
  let anim   = null;
  if (code) { anim = loadLottieInto(floatEl, code, true); }
  else       { floatEl.textContent = emoji; }

  setTimeout(() => { anim?.destroy(); floatEl.remove(); }, 1750);
}
