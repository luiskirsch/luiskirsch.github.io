// Missões secretas: atribuição, detecção por chat/voz/reação, conclusão
import { S } from "../state.js";
import { setDoc, getDoc, doc, runTransaction } from "../firebase.js";
import { escapeHtml, normalize } from "../utils.js";
import { SECRET_MISSIONS } from "../constants.js";
import { OSL_XP, OSL_ACHIEVEMENTS } from "./effects.js";
import { subscribe } from "./engine.js";
import { logEvent } from "./session.js";

const MISSION_SCHEMA_VERSION = 2;

let _assignmentPromise = null;
let _missionUnsubs = [];
let _canonicalMissionResolved = false;
let _canonicalMissionPresent = false;
let _lastLegacyMission = null;
let _activeMissionDoc = null;
let _activeMissionKey = null;
let _completionInFlight = false;

function timestampMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.seconds === "number") {
    return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function deterministicMissionId(participantId, mission) {
  if (mission?.missionId) return mission.missionId;
  const assignmentKey = mission?.sessionId
    || timestampMillis(mission?.assignedAt)
    || `legacy:${mission?.index ?? "x"}:${mission?.target || ""}:${mission?.text || ""}`;
  return `mission_${stableHash(`${S.roomCode}|${assignmentKey}|${participantId}`)}`;
}

function normalizeMissionDoc(raw, participantId = S.participantId) {
  if (!raw || typeof raw !== "object") return null;
  const hasIndex = Number.isInteger(raw.index);
  const hasText = typeof raw.text === "string" && raw.text.trim().length > 0;
  if (!hasIndex && !hasText) return null;

  const completedAt = timestampMillis(raw.completedAt);
  const status = raw.status === "completed" || completedAt ? "completed" : "assigned";
  return {
    ...raw,
    version: MISSION_SCHEMA_VERSION,
    schemaVersion: MISSION_SCHEMA_VERSION,
    missionId: deterministicMissionId(participantId, raw),
    index: hasIndex ? raw.index : null,
    target: raw.target || "",
    text: raw.text || "",
    status,
    assignedAt: timestampMillis(raw.assignedAt),
    assignedBy: raw.assignedBy || null,
    completedAt: status === "completed" ? completedAt : null,
    completedBy: status === "completed" ? (raw.completedBy || null) : null
  };
}

function isSameMission(left, right) {
  if (!left || !right) return false;
  if (left.missionId && right.missionId) return left.missionId === right.missionId;
  return left.index === right.index
    && (left.target || "") === (right.target || "")
    && timestampMillis(left.assignedAt) === timestampMillis(right.assignedAt);
}

function buildAssignedMission(player, missionIndex, assignedAt, players, sessionId) {
  let text = SECRET_MISSIONS[missionIndex];
  let targetName = "";
  if (text.includes("{nome}")) {
    const others = players.filter(candidate => candidate.id !== player.id);
    const target = others.length
      ? others[Math.floor(Math.random() * others.length)]
      : players[0];
    targetName = target?.name || "";
    text = text.replace("{nome}", targetName);
  }

  const mission = {
    version: MISSION_SCHEMA_VERSION,
    schemaVersion: MISSION_SCHEMA_VERSION,
    sessionId: sessionId || null,
    index: missionIndex,
    target: targetName,
    text,
    status: "assigned",
    assignedAt,
    assignedBy: S.participantId,
    completedAt: null,
    completedBy: null
  };
  mission.missionId = deterministicMissionId(player.id, mission);
  return mission;
}

// ── Atribuição de missões pelo host ───────────────────────────────────────────
// /missions/{participantId} é a fonte canônica. players.secretMission permanece
// apenas como espelho temporário para clientes de versões anteriores.
export async function assignSecretMissions(players, engineSessionId = null) {
  if (!S.isHost || !Array.isArray(players) || players.length < 1) return;
  if (_assignmentPromise) return _assignmentPromise;

  _assignmentPromise = (async () => {
    // SYNC_FROM_FIRESTORE publica o snapshot antes de copiar sessionId para S.
    // Um microtask evita atribuir uma missão nova sem o identificador da sessão.
    await Promise.resolve();
    const assignedAt = Date.now();
    const sessionId = engineSessionId || S.sessionId || null;
    const indices = SECRET_MISSIONS.map((_, idx) => idx).sort(() => Math.random() - .5);

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (!player?.id) continue;
      const canonicalRef = doc(S.db, "salas", S.roomCode, "missions", player.id);
      const legacyPlayerRef = doc(S.db, "salas", S.roomCode, "players", player.id);

      let existing = null;
      try {
        const existingSnap = await getDoc(canonicalRef);
        existing = existingSnap.exists()
          ? normalizeMissionDoc(existingSnap.data(), player.id)
          : null;
      } catch (readError) {
        console.warn("[missions] Não foi possível verificar missão existente:", readError);
      }
      const belongsToCurrentSession = existing && (
        (sessionId && existing.sessionId === sessionId)
        || (!sessionId && !existing.sessionId)
      );
      const mission = belongsToCurrentSession
        ? {
            ...existing,
            version: MISSION_SCHEMA_VERSION,
            schemaVersion: MISSION_SCHEMA_VERSION,
            missionId: deterministicMissionId(player.id, existing),
            assignedBy: existing.assignedBy || S.participantId
          }
        : buildAssignedMission(player, indices[i % indices.length], assignedAt, players, sessionId);

      let canonicalWritten = false;
      try {
        await setDoc(canonicalRef, mission, { merge: true });
        canonicalWritten = true;
      } catch (error) {
        console.warn("[missions] Fonte canônica indisponível; usando fallback legado:", error);
      }
      try {
        // Se a coleção privada estiver disponível, apaga o plaintext antigo do
        // documento público de presença. O espelho só existe como fallback para
        // instalações cujas regras Firestore ainda não autorizam /missions.
        await setDoc(legacyPlayerRef, { secretMission: canonicalWritten ? null : mission }, { merge: true });
      } catch (legacyError) {
        console.warn("[missions] Falha ao atualizar fallback legado:", legacyError);
      }
    }
  })();

  try {
    await _assignmentPromise;
  } finally {
    _assignmentPromise = null;
  }
}

// Helper: resolve texto da missão baseado no doc Firestore (i18n-aware com fallback)
function resolveMissionText(mission) {
  if (!mission) return "";
  // Se índice presente: traduzir via i18n com {{nome}}
  if (typeof mission.index === "number" && window.OSL_I18N?.t) {
    const key = `missions:list.${mission.index + 1}`;
    const vars = mission.target ? { nome: mission.target } : {};
    const val = window.OSL_I18N.t(key, vars);
    if (val && val !== key) return val;
  }
  // Fallback: texto persistido (PT)
  return mission.text || "";
}

function missionDisplayKey(mission) {
  return mission?.missionId
    || timestampMillis(mission?.assignedAt)
    || `legacy:${mission?.index ?? "x"}:${mission?.target || ""}:${mission?.text || ""}`;
}

function applyMissionState(rawMission) {
  const mission = normalizeMissionDoc(rawMission);
  if (!mission) return;
  const text = resolveMissionText(mission);
  if (!text) return;

  const nextKey = missionDisplayKey(mission);
  const assignmentChanged = nextKey !== _activeMissionKey;
  _activeMissionDoc = mission;
  _activeMissionKey = nextKey;
  S.currentSecretMission = text;

  if (mission.status === "completed") {
    S.missionCompleted = true;
    S.missionShownTs = nextKey;
    stopMissionVoiceDetection();
    renderMissionCompleted(text);
    return;
  }

  S.missionCompleted = false;
  if (assignmentChanged) S.missionNameMentionCount = 0;
  stopMissionVoiceDetection();
  updateMissionBadge(text);
  if (assignmentChanged && S.missionShownTs !== nextKey) showSecretMissionModal(text);
  S.missionShownTs = nextKey;
  startMissionVoiceDetection();
}

// ── Listener de missão do próprio jogador ─────────────────────────────────────
export function bindMyMission(onSnapshotFn) {
  _missionUnsubs.forEach(unsub => {
    try { unsub?.(); } catch (_) {}
  });
  _missionUnsubs = [];
  _canonicalMissionResolved = false;
  _canonicalMissionPresent = false;
  _lastLegacyMission = null;

  const myMissionRef = doc(S.db, "salas", S.roomCode, "missions", S.participantId);
  const myPlayerRef = S.playerRef || doc(S.db, "salas", S.roomCode, "players", S.participantId);

  const canonicalUnsub = onSnapshotFn(myMissionRef, (snap) => {
    _canonicalMissionResolved = true;
    _canonicalMissionPresent = snap.exists();
    if (_canonicalMissionPresent) {
      applyMissionState(snap.data());
    } else if (_lastLegacyMission) {
      applyMissionState(_lastLegacyMission);
    }
  }, (error) => {
    _canonicalMissionResolved = true;
    _canonicalMissionPresent = false;
    if (_lastLegacyMission) applyMissionState(_lastLegacyMission);
    console.warn("[missions] Listener canônico indisponível; usando compatibilidade legada:", error);
  });
  if (typeof canonicalUnsub === "function") _missionUnsubs.push(canonicalUnsub);

  // Compatibilidade de leitura: versões antigas gravavam somente no player.
  const legacyUnsub = onSnapshotFn(myPlayerRef, (snap) => {
    _lastLegacyMission = snap.exists() ? (snap.data()?.secretMission || null) : null;
    if (_canonicalMissionResolved && !_canonicalMissionPresent && _lastLegacyMission) {
      applyMissionState(_lastLegacyMission);
    }
  });
  if (typeof legacyUnsub === "function") _missionUnsubs.push(legacyUnsub);
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

function renderMissionCompleted(text = S.currentSecretMission) {
  const _t = (k, fb) => (window.OSL_I18N?.t(k)) || fb;
  if (text) updateMissionBadge(text);
  const badge = document.getElementById("missionBadge");
  if (badge) {
    badge.classList.add("topMeta__mission--done");
    badge.querySelector(".topMeta__mission__btn")?.remove();
    const icon = badge.querySelector(".topMeta__mission__icon");
    if (icon) icon.textContent = "✅";
    const txt = document.getElementById("missionBadgeText");
    if (txt) txt.textContent = _t('missions:ui.completed', "Missão cumprida!");
  }
}

function showMissionCompletedToast() {
  const _t = (k, fb) => (window.OSL_I18N?.t(k)) || fb;
  const toast = document.createElement("div");
  toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(10px);z-index:9999;background:rgba(20,50,20,.95);border:1px solid rgba(80,200,80,.45);border-radius:10px;padding:10px 18px;color:#80d080;font-size:13px;font-weight:700;letter-spacing:.04em;white-space:nowrap;opacity:0;transition:opacity .25s ease,transform .25s ease;";
  toast.textContent = _t('missions:ui.toastDone', "✅ Missão secreta cumprida!");
  document.body.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; }));
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── Conclusão de missão ───────────────────────────────────────────────────────
export async function completeMission() {
  if (S.missionCompleted || _completionInFlight || !_activeMissionDoc) {
    return { ok: false, reason: S.missionCompleted ? "already-completed" : "not-ready" };
  }

  _completionInFlight = true;
  S.missionCompleted = true;
  stopMissionVoiceDetection();

  const activeMission = { ..._activeMissionDoc };
  const canonicalRef = doc(S.db, "salas", S.roomCode, "missions", S.participantId);

  try {
    const completeAtRef = (reference, legacy = false) => runTransaction(S.db, async transaction => {
      const currentSnap = await transaction.get(reference);
      const rawMission = currentSnap.exists()
        ? (legacy ? currentSnap.data()?.secretMission : currentSnap.data())
        : null;
      const currentMission = rawMission
        ? normalizeMissionDoc(rawMission)
        : null;

      if (currentMission?.status === "completed" && isSameMission(currentMission, activeMission)) {
        return { status: "already-completed", mission: currentMission };
      }
      if (currentMission && !isSameMission(currentMission, activeMission)) {
        return { status: "mission-changed", mission: currentMission };
      }

      const sourceMission = currentMission || activeMission;
      const completedMission = {
        ...sourceMission,
        version: MISSION_SCHEMA_VERSION,
        schemaVersion: MISSION_SCHEMA_VERSION,
        index: sourceMission.index,
        target: sourceMission.target || "",
        text: sourceMission.text || S.currentSecretMission || "",
        status: "completed",
        assignedAt: timestampMillis(sourceMission.assignedAt) || Date.now(),
        assignedBy: sourceMission.assignedBy || S.participantId,
        completedAt: Date.now(),
        completedBy: S.participantId
      };
      completedMission.missionId = deterministicMissionId(S.participantId, completedMission);
      transaction.set(
        reference,
        legacy ? { secretMission: completedMission } : completedMission,
        { merge: true },
      );
      return { status: "completed", mission: completedMission };
    });

    let canonicalCompleted = true;
    let outcome;
    try {
      outcome = await completeAtRef(canonicalRef);
    } catch (canonicalError) {
      if (!S.playerRef) throw canonicalError;
      canonicalCompleted = false;
      console.warn("[missions] Conclusão canônica indisponível; usando fallback legado:", canonicalError);
      outcome = await completeAtRef(S.playerRef, true);
    }

    if (outcome.status !== "completed") {
      applyMissionState(outcome.mission);
      return { ok: false, reason: outcome.status };
    }

    const completedMission = outcome.mission;
    _activeMissionDoc = completedMission;
    _activeMissionKey = missionDisplayKey(completedMission);

    // Remove eventual plaintext legado quando a fonte privada foi confirmada.
    if (canonicalCompleted && S.playerRef) {
      try {
        await setDoc(S.playerRef, { secretMission: null }, { merge: true });
      } catch (legacyError) {
        console.warn("[missions] Falha ao limpar missão legada:", legacyError);
      }
    }

    renderMissionCompleted(completedMission.text);
    showMissionCompletedToast();

    if (S.userRef) OSL_XP.award(S.userRef, "MISSION_COMPLETE");
    OSL_ACHIEVEMENTS.onMissionComplete();
    logEvent("MISSION_COMPLETED", {
      nickname: S.playerName,
      missionId: completedMission.missionId
    }).catch(() => {});
    return { ok: true, missionId: completedMission.missionId };
  } catch (error) {
    S.missionCompleted = false;
    updateMissionBadge(S.currentSecretMission);
    startMissionVoiceDetection();
    console.warn("[missions] Não foi possível persistir a conclusão:", error);
    return { ok: false, reason: "persist-failed", error };
  } finally {
    _completionInFlight = false;
  }
}

// ── Modais de missão ──────────────────────────────────────────────────────────
export function showSecretMissionModal(text) {
  const _t = (k, fb) => (window.OSL_I18N?.t(k)) || fb;
  document.querySelector(".missionModal")?.remove();
  const modal = document.createElement("div");
  modal.className = "missionModal";
  modal.innerHTML = `
    <div class="missionCard">
      <div class="missionCard__label">${escapeHtml(_t('missions:ui.modalLabel', 'Missão Secreta'))}</div>
      <div class="missionCard__icon">🎯</div>
      <div class="missionCard__text">${escapeHtml(text)}</div>
      <div class="missionCard__sub">${escapeHtml(_t('missions:ui.modalSub', 'Apenas você pode ver isso'))}</div>
      <button class="missionCard__btn" id="missionCloseBtn">${escapeHtml(_t('missions:ui.modalConfirm', 'ENTENDIDO'))}</button>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById("missionCloseBtn").addEventListener("click", () => {
    modal.classList.add("closing");
    setTimeout(() => modal.remove(), 250);
  });
}

// ── Auto-trigger de missões via engine ────────────────────────────────────────
// Dispara assignSecretMissions exatamente uma vez quando missionsAssigned
// transiciona de false → true (na 2ª carta revelada), apenas no host.

let _msnPrevAssigned = false;
subscribe(snap => {
  if (snap.missionsAssigned && !_msnPrevAssigned && S.isHost) {
    const players = snap.players.length ? snap.players : S.currentPlayers;
    assignSecretMissions(players).catch(() => {});
  }
  _msnPrevAssigned = snap.missionsAssigned;
});

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
  badge.onkeydown = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (S.currentSecretMission) showSecretMissionModal(S.currentSecretMission);
  };

  const existing = badge.querySelector(".topMeta__mission__btn");
  if (existing) existing.remove();
  if (getMissionDetectionType() === "self_report") {
    const btn = document.createElement("button");
    btn.className = "topMeta__mission__btn";
    btn.textContent = (window.OSL_I18N?.t('missions:ui.selfReportBtn')) || "✓ Cumpri";
    btn.onclick = (e) => { e.stopPropagation(); completeMission(); };
    badge.appendChild(btn);
  }
}
