// Missões secretas: atribuição, detecção por chat/voz/reação, conclusão
import { S } from "../state.js";
import { setDoc, doc } from "../firebase.js";
import { escapeHtml, normalize } from "../utils.js";
import { SECRET_MISSIONS } from "../constants.js";
import { OSL_XP, OSL_ACHIEVEMENTS } from "./effects.js";

// ── Atribuição de missões pelo host ───────────────────────────────────────────
export async function assignSecretMissions(players) {
  if (!S.isHost || players.length < 1) return;
  const shuffled = [...SECRET_MISSIONS].sort(() => Math.random() - .5);
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    let text = shuffled[i % shuffled.length];
    if (text.includes("{nome}")) {
      const others = players.filter(p => p.id !== player.id);
      const target = others.length ? others[Math.floor(Math.random() * others.length)] : players[(i + 1) % players.length];
      text = text.replace("{nome}", target.name);
    }
    try {
      await setDoc(doc(S.db, "salas", S.roomCode, "players", player.id), { secretMission: { text, assignedAt: Date.now() } }, { merge: true });
    } catch (_) {}
  }
}

// ── Listener de missão do próprio jogador ─────────────────────────────────────
export function bindMyMission(onSnapshotFn) {
  onSnapshotFn(S.playerRef, (snap) => {
    if (!snap.exists()) return;
    const mission = snap.data()?.secretMission;
    if (!mission?.text || !mission?.assignedAt) return;
    if (mission.assignedAt === S.missionShownTs) return;
    S.missionShownTs   = mission.assignedAt;
    S.currentSecretMission = mission.text;
    S.missionCompleted = false;
    S.missionNameMentionCount = 0;
    stopMissionVoiceDetection();
    showSecretMissionModal(mission.text);
    updateMissionBadge(mission.text);
    startMissionVoiceDetection();
  });
}

// ── Detecção por tipo ─────────────────────────────────────────────────────────
export function getMissionDetectionType() {
  if (!S.currentSecretMission) return null;
  const m = normalize(S.currentSecretMission);
  if (getMissionKeyword()) return "keyword";
  if ((m.includes("rir") || m.includes("gargalh")) && getMissionTargetPlayer()) return "laugh_target";
  if (m.includes("rir") || m.includes("gargalh")) return "laugh";
  if ((m.includes("nome") || m.includes("diga")) && m.includes("vez") && getMissionTargetPlayer()) return "name_count";
  if ((m.includes("elogie") || m.includes("elogio")) && getMissionTargetPlayer()) return "heart_target";
  return "self_report";
}

export function getMissionTargetPlayer() {
  if (!S.currentSecretMission) return null;
  return S.currentPlayers.find(p => p.id !== S.participantId && S.currentSecretMission.includes(p.name)) || null;
}

export function getMissionKeyword() {
  if (!S.currentSecretMission) return null;
  const m = S.currentSecretMission.match(/'([^']+)'/);
  return m ? m[1] : null;
}

// ── Verificação de missão por reação ─────────────────────────────────────────
export function checkMissionFromReaction(fromPid, emoji) {
  if (S.missionCompleted) return;
  const type   = getMissionDetectionType();
  if (!type || type === "keyword" || type === "self_report" || type === "name_count") return;
  if (type === "laugh" && emoji === "😂") { completeMission(); return; }
  const target = getMissionTargetPlayer();
  if (type === "laugh_target" && emoji === "😂" && target?.id === fromPid) { completeMission(); return; }
  if (type === "heart_target" && emoji === "❤️" && target?.id === fromPid) { completeMission(); return; }
}

// ── Verificação de missão por chat ────────────────────────────────────────────
export function checkMissionChatCompletion(text) {
  if (!S.currentSecretMission || S.missionCompleted) return;
  const type = getMissionDetectionType();
  if (type === "keyword") {
    const keyword = getMissionKeyword();
    if (keyword && normalize(text).includes(normalize(keyword))) completeMission();
  } else if (type === "name_count") {
    const target = getMissionTargetPlayer();
    if (target) {
      const matches = normalize(text).match(new RegExp(normalize(target.name), "g"));
      if (matches) {
        S.missionNameMentionCount += matches.length;
        if (S.missionNameMentionCount >= 3) completeMission();
      }
    }
  }
}

// ── Avaliação de resposta no chat via AI (backend) ────────────────────────────
export async function evaluateChatResponse(text) {
  if (!S.currentActiveEffect || S.currentActiveEffect.type !== "force_player") return;
  if (S.participantId !== S.currentActiveEffect.params?.targetId) return;
  if (!text || text.trim().length < 4) return;
  const { writeAIDetection } = await import("./effects.js");
  await writeAIDetection("chat", S.playerName, text);
}

// ── Detecção de voz (Web Speech API) ─────────────────────────────────────────
export function startMissionVoiceDetection() {
  const keyword = getMissionKeyword();
  if (!keyword || S.missionCompleted) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  stopMissionVoiceDetection();
  const rec = new SR();
  rec.lang = "pt-BR"; rec.continuous = true; rec.interimResults = true;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (normalize(t).includes(normalize(keyword))) { completeMission(); stopMissionVoiceDetection(); return; }
    }
  };
  rec.onerror = () => {};
  rec.onend   = () => { if (!S.missionCompleted && getMissionKeyword()) try { rec.start(); } catch (_) {} };
  try { rec.start(); S.missionSpeechRec = rec; } catch (_) {}
}

export function stopMissionVoiceDetection() {
  if (S.missionSpeechRec) {
    try { S.missionSpeechRec.onend = null; S.missionSpeechRec.stop(); } catch (_) {}
    S.missionSpeechRec = null;
  }
}

// ── Conclusão de missão ───────────────────────────────────────────────────────
export function completeMission() {
  if (S.missionCompleted) return;
  S.missionCompleted = true;
  stopMissionVoiceDetection();

  const badge = document.getElementById("missionBadge");
  if (badge) {
    badge.classList.add("topMeta__mission--done");
    badge.querySelector(".topMeta__mission__btn")?.remove();
    const icon = badge.querySelector(".topMeta__mission__icon");
    if (icon) icon.textContent = "✅";
    const txt = document.getElementById("missionBadgeText");
    if (txt) txt.textContent = "Missão cumprida!";
  }

  const toast = document.createElement("div");
  toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(10px);z-index:9999;background:rgba(20,50,20,.95);border:1px solid rgba(80,200,80,.45);border-radius:10px;padding:10px 18px;color:#80d080;font-size:13px;font-weight:700;letter-spacing:.04em;white-space:nowrap;opacity:0;transition:opacity .25s ease,transform .25s ease;";
  toast.textContent = "✅ Missão secreta cumprida!";
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; }));
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3500);

  if (S.userRef) OSL_XP.award(S.userRef, "MISSION_COMPLETE");
  OSL_ACHIEVEMENTS.onMissionComplete();
}

// ── Modais de missão ──────────────────────────────────────────────────────────
export function showSecretMissionModal(text) {
  document.querySelector(".missionModal")?.remove();
  const modal = document.createElement("div");
  modal.className = "missionModal";
  modal.innerHTML = `
    <div class="missionCard">
      <div class="missionCard__label">Missão Secreta</div>
      <div class="missionCard__icon">🎯</div>
      <div class="missionCard__text">${escapeHtml(text)}</div>
      <div class="missionCard__sub">Apenas você pode ver isso</div>
      <button class="missionCard__btn" id="missionCloseBtn">ENTENDIDO</button>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("missionCloseBtn").addEventListener("click", () => {
    modal.classList.add("closing");
    setTimeout(() => modal.remove(), 250);
  });
}

export function updateMissionBadge(text) {
  const badge = document.getElementById("missionBadge");
  const sep   = document.getElementById("missionSep");
  const txt   = document.getElementById("missionBadgeText");
  if (!badge || !txt) return;

  txt.textContent = text;
  badge.classList.remove("topMeta__mission--done");
  badge.classList.add("topMeta__mission--visible");
  if (sep) sep.style.display = "";

  badge.onclick = (e) => {
    if (e.target.closest(".topMeta__mission__btn")) return;
    if (S.currentSecretMission) showSecretMissionModal(S.currentSecretMission);
  };

  const existing = badge.querySelector(".topMeta__mission__btn");
  if (existing) existing.remove();
  if (getMissionDetectionType() === "self_report") {
    const btn = document.createElement("button");
    btn.className = "topMeta__mission__btn";
    btn.textContent = "✓ Cumpri";
    btn.onclick = (e) => { e.stopPropagation(); completeMission(); };
    badge.appendChild(btn);
  }
}
