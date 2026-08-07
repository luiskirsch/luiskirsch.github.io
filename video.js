import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack
} from "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs";

const TOKEN_ENDPOINT = "https://osl-video-server-production.up.railway.app/token";
const VERIFY_ACCESS_ENDPOINT = "https://osl-video-server-production.up.railway.app/verificar-acesso";
const LIVEKIT_URL = "wss://osextolugar-eqa7q1iz.livekit.cloud";
const SALES_PAGE_URL = "./vendas.html";

const joinVideoBtn = document.getElementById("joinVideoBtn");
const joinAudioBtn = document.getElementById("joinAudioBtn");
const leaveVideoBtn = document.getElementById("leaveVideoBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const videoGridEl = document.getElementById("videoGrid");       // outer gameTableGrid wrapper
const videoColLeftEl = document.getElementById("videoColLeft");
const videoColRightEl = document.getElementById("videoColRight");
const videoSelfSlotEl = document.getElementById("videoSelfSlot");
const videoEmptyEl = document.getElementById("videoEmpty");
const videoStatusEl = document.getElementById("videoStatus");
const videoFocusBarEl = document.getElementById("videoFocusBar");
const exitFocusBtn = document.getElementById("exitFocusBtn");

// Placeholder elements inside the columns
const placeholders = {
  L1: document.getElementById("videoPlaceholderL1"),
  L2: document.getElementById("videoPlaceholderL2"),
  R1: document.getElementById("videoPlaceholderR1"),
  R2: document.getElementById("videoPlaceholderR2"),
};

const params = new URLSearchParams(window.location.search);

const roomCode =
  params.get("sala") ||
  localStorage.getItem("osl_sala") ||
  "SL-0001";

const playerName =
  params.get("nome") ||
  localStorage.getItem("osl_nome") ||
  "Visitante";

/*
  MUITO IMPORTANTE:
  usamos o MESMO participantId da sala.
  Assim o painel não conta jogador duplicado.
*/
let participantId =
  sessionStorage.getItem("osl_participant_id") ||
  localStorage.getItem("osl_player_id");

if (!participantId) {
  participantId = "p_" + Math.random().toString(36).slice(2, 11);
  sessionStorage.setItem("osl_participant_id", participantId);
  localStorage.setItem("osl_player_id", participantId);
} else {
  sessionStorage.setItem("osl_participant_id", participantId);
  localStorage.setItem("osl_player_id", participantId);
}

let lkRoom = null;
let localAudioTrack = null;
let localVideoTrack = null;
let micEnabled = true;
let camEnabled = true;
let audioOnlyMode = false;
let focusedIdentity = null;
let panelVideoActive = false;

// true = conectado ao LiveKit mas sem publicar câmera/mic (só assistindo)
let isInPreview = false;

const PanelBridge = window.PanelBridge || {
  baseUrl: window.PANEL_SERVER_BASE || "http://localhost:3000",

  async video(roomId, active) {
    try {
      const res = await fetch(this.baseUrl + "/game/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: String(roomId || "").trim(),
          active: !!active
        })
      });
      return await res.json().catch(() => ({ ok: res.ok }));
    } catch (error) {
      console.error("Erro PanelBridge.video:", error);
      return { ok: false };
    }
  },

  async playerLeave(roomId, playerId) {
    try {
      const res = await fetch(this.baseUrl + "/game/player/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: String(roomId || "").trim(),
          playerId: String(playerId || "").trim()
        })
      });
      return await res.json().catch(() => ({ ok: res.ok }));
    } catch (error) {
      console.error("Erro PanelBridge.playerLeave:", error);
      return { ok: false };
    }
  }
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


async function markPanelVideo(active) {
  try {
    panelVideoActive = !!active;
    await PanelBridge.video(roomCode, !!active);
  } catch (error) {
    console.error("Erro ao marcar vídeo no painel:", error);
  }
}

function sendBeaconVideoOff() {
  try {
    const url = (PanelBridge.baseUrl || "http://localhost:3000") + "/game/video";
    const payload = JSON.stringify({
      roomId: roomCode,
      active: false
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        url,
        new Blob([payload], { type: "application/json" })
      );
    }
  } catch (error) {
    console.error("Erro no beacon de vídeo:", error);
  }
}

function updateFocusBar() {
  if (!videoFocusBarEl) return;
  videoFocusBarEl.hidden = !focusedIdentity;
}

/**
 * Distribui tiles de amigos entre coluna esquerda e direita.
 * Slots 1-2 → esquerda, slots 3-4 → direita.
 * Atualiza a visibilidade dos placeholders.
 */
function assignSlots() {
  const nonSelfTiles = Array.from(
    videoGridEl.querySelectorAll(".videoTile:not(.videoTile--self)")
  );

  // Move tiles sem remover do DOM primeiro — remover <video> do DOM
  // causa o browser pausar/resetar o stream, gerando tela preta.
  nonSelfTiles.slice(0, 2).forEach((t) => {
    if (t.parentElement !== videoColLeftEl) videoColLeftEl.appendChild(t);
  });
  nonSelfTiles.slice(2, 4).forEach((t) => {
    if (t.parentElement !== videoColRightEl) videoColRightEl.appendChild(t);
  });
  // Slots além do 4º ficam ocultos (limite de layout)
  nonSelfTiles.slice(4).forEach((t) => t.remove());

  // Mostra/esconde placeholders conforme quantidade de tiles em cada coluna
  const lc = videoColLeftEl.querySelectorAll(".videoTile").length;
  const rc = videoColRightEl.querySelectorAll(".videoTile").length;
  if (placeholders.L1) placeholders.L1.style.display = lc >= 1 ? "none" : "";
  if (placeholders.L2) placeholders.L2.style.display = lc >= 2 ? "none" : "";
  if (placeholders.R1) placeholders.R1.style.display = rc >= 1 ? "none" : "";
  if (placeholders.R2) placeholders.R2.style.display = rc >= 2 ? "none" : "";
}

function updateVideoGridLayout() {
  updateFocusBar();
}

function clearFocusState() {
  focusedIdentity = null;
  videoGridEl.querySelectorAll(".videoTile").forEach((tile) => {
    tile.classList.remove("videoTile--focused", "videoTile--mini");
  });
  updateVideoGridLayout();
}

function setFocusedTile(identity) {
  const tiles = videoGridEl.querySelectorAll(".videoTile");

  if (focusedIdentity === identity) {
    clearFocusState();
    return;
  }

  focusedIdentity = identity;

  tiles.forEach((tile) => {
    if (tile.dataset.identity === identity) {
      tile.classList.add("videoTile--focused");
      tile.classList.remove("videoTile--mini");
    } else {
      tile.classList.remove("videoTile--focused");
      tile.classList.add("videoTile--mini");
    }
  });

  updateVideoGridLayout();
}

function createStatusBadge(kind, text) {
  const badge = document.createElement("div");
  badge.className = "videoBadge";
  badge.dataset.kind = kind;
  badge.textContent = text;
  return badge;
}

function createCameraOffPlaceholder() {
  const wrap = document.createElement("div");
  wrap.className = "videoCameraOff hidden";

  const icon = document.createElement("div");
  icon.className = "videoCameraOffIcon";
  icon.textContent = "📷";

  const text = document.createElement("div");
  text.className = "videoCameraOffText";
  text.textContent = oslTr("sala:videoTile.cameraOff", "Câmera desligada");

  wrap.appendChild(icon);
  wrap.appendChild(text);

  return wrap;
}

function createVideoTile(identity, labelText) {
  const tile = document.createElement("div");
  tile.className = "videoTile";
  tile.dataset.identity = identity;

  const mediaWrap = document.createElement("div");
  mediaWrap.className = "videoMedia";
  tile.appendChild(mediaWrap);

  const cameraOff = createCameraOffPlaceholder();
  tile.appendChild(cameraOff);

  const overlay = document.createElement("div");
  overlay.className = "videoOverlay";

  const label = document.createElement("div");
  label.className = "videoLabel";

  const nameSpan = document.createElement("span");
  nameSpan.className = "videoNameText";
  nameSpan.innerHTML = escapeHtml(labelText);

  label.appendChild(nameSpan);

  const badgeRow = document.createElement("div");
  badgeRow.className = "videoBadgeRow";

  const micBadge = createStatusBadge("mic", "🎤");
  const camBadge = createStatusBadge("cam", "📷");

  badgeRow.appendChild(micBadge);
  badgeRow.appendChild(camBadge);

  overlay.appendChild(label);
  overlay.appendChild(badgeRow);

  tile.appendChild(overlay);

  tile.addEventListener("click", () => {
    setFocusedTile(identity);
  });

  return tile;
}

function getMediaWrap(tile) {
  let mediaWrap = tile.querySelector(".videoMedia");
  if (!mediaWrap) {
    mediaWrap = document.createElement("div");
    mediaWrap.className = "videoMedia";
    tile.insertBefore(mediaWrap, tile.firstChild);
  }
  return mediaWrap;
}

function updateTileLabel(identity, labelText) {
  const tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );
  if (!tile) return;

  const label = tile.querySelector(".videoLabel");
  if (!label) return;

  const hostTag = label.querySelector(".videoHostTag");
  const nameText = label.querySelector(".videoNameText");

  const isHost = /anfitrião/i.test(labelText);
  const cleanLabel = labelText.replace(/\s*\[anfitrião\]\s*/i, "").trim();

  if (nameText) {
    nameText.innerHTML = escapeHtml(cleanLabel);
  }

  if (isHost && !hostTag) {
    const tag = document.createElement("span");
    tag.className = "videoHostTag";
    tag.textContent = "HOST";
    label.insertBefore(tag, label.firstChild);
  }

  if (!isHost && hostTag) {
    hostTag.remove();
  }
}

function setTileStatus(identity, { micMuted = false, camMuted = false } = {}) {
  const tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );
  if (!tile) return;

  const micBadge = tile.querySelector('.videoBadge[data-kind="mic"]');
  const camBadge = tile.querySelector('.videoBadge[data-kind="cam"]');
  const camOff = tile.querySelector(".videoCameraOff");

  if (micBadge) {
    micBadge.classList.toggle("is-off", micMuted);
    micBadge.textContent = micMuted ? "🔇" : "🎤";
    micBadge.title = micMuted ? "Microfone desligado" : "Microfone ligado";
  }

  if (camBadge) {
    camBadge.classList.toggle("is-off", camMuted);
    camBadge.textContent = "📷";
    camBadge.title = camMuted ? oslTr("sala:videoTile.cameraOff", "Câmera desligada") : oslTr("sala:videoTile.cameraOn", "Câmera ligada");
  }

  tile.classList.toggle("videoTile--hasNoCamera", camMuted);
  if (camOff) {
    camOff.classList.toggle("hidden", !camMuted);
  }
}

function getOrCreateVideoTile(identity, labelText) {
  let tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );

  if (tile) {
    updateTileLabel(identity, labelText);
    return tile;
  }

  tile = createVideoTile(identity, labelText);

  if (identity === participantId) {
    tile.classList.add("videoTile--self");
    videoSelfSlotEl.appendChild(tile);
  } else {
    // Coluna esquerda provisória; assignSlots vai redistribuir
    videoColLeftEl.appendChild(tile);
  }

  updateTileLabel(identity, labelText);
  assignSlots();
  updateVideoGridLayout();
  return tile;
}

function removeVideoTile(identity) {
  const tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );

  if (tile) tile.remove();

  if (focusedIdentity === identity) {
    clearFocusState();
  }

  assignSlots();
  updateVideoGridLayout();
}

function clearAllVideoTiles() {
  videoGridEl.querySelectorAll(".videoTile").forEach((tile) => tile.remove());
  clearFocusState();
  assignSlots();
  updateVideoGridLayout();
}

function appendTrackToTile(tile, track, participantIdentity) {
  const mediaWrap = getMediaWrap(tile);
  const existing = mediaWrap.querySelector(`[data-track-sid="${track.sid}"]`);
  if (existing) return;

  const mediaEl = track.attach();
  mediaEl.dataset.trackSid = track.sid;
  mediaEl.dataset.participantIdentity = participantIdentity || "";

  if (track.kind === "video") {
    mediaEl.style.width = "100%";
    mediaEl.style.height = "100%";
    mediaEl.style.objectFit = "cover";
    mediaEl.style.display = "block";
    // iOS Safari requires these as attributes, not just properties
    mediaEl.setAttribute("playsinline", "");
    mediaEl.setAttribute("webkit-playsinline", "");
    mediaEl.setAttribute("autoplay", "");
    mediaEl.playsInline = true;
    mediaEl.autoplay = true;
    const isSelf = participantIdentity === participantId;
    mediaEl.muted = isSelf;
    // Mirror local camera so it looks like a real mirror
    if (isSelf) {
      mediaEl.style.transform = "scaleX(-1)";
    }
  }

  if (track.kind === "audio") {
    mediaEl.setAttribute("autoplay", "");
    mediaEl.autoplay = true;
  }

  mediaWrap.appendChild(mediaEl);

  // Kick autoplay explicitly — needed in some browsers even with autoplay attr
  if (track.kind === "video" || track.kind === "audio") {
    mediaEl.play().catch(() => {
      // Autoplay blocked — user interaction will resume it
    });
  }
}

function removeTrackFromParticipant(identity, trackSid) {
  const tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );
  if (!tile) return;

  const mediaWrap = getMediaWrap(tile);
  const mediaEl = mediaWrap.querySelector(`[data-track-sid="${trackSid}"]`);
  if (mediaEl) mediaEl.remove();
}

function buildParticipantLabel(participant, isSelf = false) {
  const baseName = participant?.name || "Jogador";
  const hostSuffix = participant?.isHost ? oslTr("sala:videoTile.hostSuffix", " [anfitrião]") : "";
  return isSelf ? `${oslTr("sala:videoTile.youNameTpl", "{{name}} (você)", { name: baseName })}${hostSuffix}` : `${baseName}${hostSuffix}`;
}

function refreshParticipantVisualState(participant) {
  if (!participant) return;

  let micMuted = true;
  let camMuted = true;

  participant.trackPublications.forEach((pub) => {
    if (pub.kind === "audio") micMuted = pub.isMuted;
    if (pub.kind === "video") camMuted = pub.isMuted;
  });

  setTileStatus(participant.identity, { micMuted, camMuted });
}

function refreshLocalVisualState() {
  setTileStatus(participantId, {
    micMuted: !micEnabled,
    camMuted: !camEnabled
  });
}

// Atualiza o texto de status do bar de vídeo quando em modo preview
function updatePreviewStatus() {
  if (!isInPreview || !lkRoom || !videoStatusEl) return;
  const count = lkRoom.remoteParticipants.size;
  if (count === 0) {
    videoStatusEl.textContent = oslTr("sala:videoEmpty.noOneInCall", "Ninguém em chamada.");
  } else if (count === 1) {
    videoStatusEl.textContent = oslTr("sala:videoEmpty.onePersonInCall", "1 pessoa em chamada · Clique para participar");
  } else {
    videoStatusEl.textContent = oslTr("sala:videoEmpty.manyPeopleInCall", "{{count}} pessoas em chamada · Clique para participar", { count });
  }
}

// Registra todos os listeners de eventos do room (preview e ativo compartilham)
function setupRoomListeners(room) {
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    if (participant.identity.startsWith("spec_")) return;
    getOrCreateVideoTile(
      participant.identity,
      buildParticipantLabel(participant, false)
    );
    refreshParticipantVisualState(participant);
    updateVideoGridLayout();
    if (isInPreview) updatePreviewStatus();
  });

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (participant.identity === participantId) return;
    if (participant.identity.startsWith("spec_")) return;

    const tile = getOrCreateVideoTile(
      participant.identity,
      buildParticipantLabel(participant, false)
    );

    appendTrackToTile(tile, track, participant.identity);
    refreshParticipantVisualState(participant);
    updateVideoGridLayout();
  });

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    if (participant) {
      removeTrackFromParticipant(participant.identity, track.sid);
      refreshParticipantVisualState(participant);
    }
  });

  room.on(RoomEvent.TrackMuted, (publication, participant) => {
    if (participant) refreshParticipantVisualState(participant);
  });

  room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
    if (participant) refreshParticipantVisualState(participant);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    removeVideoTile(participant.identity);
    if (isInPreview) updatePreviewStatus();
  });

  room.on(RoomEvent.Disconnected, async () => {
    lkRoom = null;
    isInPreview = false;
    if (videoStatusEl) videoStatusEl.textContent = "Desconectado da chamada.";
    await markPanelVideo(false);
  });
}

window.isInVideoCall = () => !!lkRoom;

// Registra callback chamado com (isSpeaking: boolean) quando o participante local fala/para de falar.
// Retorna função para cancelar o listener.
window.watchLocalSpeaking = (cb) => {
  if (!lkRoom) return () => {};
  const handler = (speakers) => {
    const speaking = speakers.some(p => p.identity === participantId);
    cb(speaking);
  };
  lkRoom.on(RoomEvent.ActiveSpeakersChanged, handler);
  return () => lkRoom.off(RoomEvent.ActiveSpeakersChanged, handler);
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestToken() {
  const firebaseIdToken = await (window._osl?.getFirebaseIdToken?.() || Promise.resolve(null));
  const url = `${TOKEN_ENDPOINT}?room=${encodeURIComponent(roomCode)}&user=${encodeURIComponent(participantId)}`;
  const opts = { headers: firebaseIdToken ? { Authorization: `Bearer ${firebaseIdToken}` } : {} };

  const MAX_TENTATIVAS = 3;
  let lastErr;

  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    if (i > 0 && videoStatusEl) {
      videoStatusEl.textContent = `Servidor iniciando, aguardando... (${i}/${MAX_TENTATIVAS - 1})`;
      await new Promise(r => setTimeout(r, 3000));
    }

    let response;
    try {
      response = await fetchWithTimeout(url, opts, 25000);
    } catch (err) {
      lastErr = err.name === "AbortError" ? new Error("TOKEN_TIMEOUT") : new Error("TOKEN_REQUEST_FAILED");
      continue; // tenta de novo
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Erro ao obter token:", data);

      if (response.status === 401) {
        lastErr = new Error("TOKEN_UNAUTHORIZED");
        continue;
      }

      lastErr = new Error("TOKEN_REQUEST_FAILED");
      continue;
    }

    if (!data.token) throw new Error("TOKEN_INVALID");

    return data.token;
  }

  throw lastErr || new Error("TOKEN_REQUEST_FAILED");
}

function renderExistingParticipantTracks(participant) {
  const tile = getOrCreateVideoTile(
    participant.identity,
    buildParticipantLabel(participant, false)
  );

  participant.trackPublications.forEach((pub) => {
    if (pub.track) {
      // Track já disponível — anexa direto
      appendTrackToTile(tile, pub.track, participant.identity);
    } else if (pub.isSubscribed === false || !pub.isSubscribed) {
      // Track ainda não subscrita — força subscrição explícita
      // O evento TrackSubscribed vai disparar quando chegar
      try { pub.setSubscribed(true); } catch (_) {}
    }
  });

  refreshParticipantVisualState(participant);
}

/**
 * Conecta ao LiveKit silenciosamente — sem câmera nem microfone.
 * O usuário pode assistir a chamada antes de participar.
 * Falha silenciosamente para não incomodar quem não vai usar vídeo.
 */
async function startPreview() {
  if (lkRoom) return; // já conectado (preview ou ativo)

  try {
    const token = await requestToken();

    lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    setupRoomListeners(lkRoom);

    await lkRoom.connect(LIVEKIT_URL, token, {
      autoSubscribe: true
    });

    isInPreview = true;

    // Renderiza participantes que já estão na chamada
    for (const participant of lkRoom.remoteParticipants.values()) {
      renderExistingParticipantTracks(participant);
    }

    updatePreviewStatus();

  } catch (_err) {
    // Falha silenciosa — preview é best-effort
    lkRoom = null;
    isInPreview = false;
  }
}

async function joinVideoCall() {
  // Já está na chamada como participante ativo
  if (lkRoom && !isInPreview) return;

  try {
    joinVideoBtn.disabled = true;
    if (joinAudioBtn) joinAudioBtn.disabled = true;

    if (!lkRoom) {
      // Nem preview existe — conecta do zero
      videoStatusEl.textContent = "Entrando na chamada...";
      const token = await requestToken();

      lkRoom = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      setupRoomListeners(lkRoom);

      await lkRoom.connect(LIVEKIT_URL, token, {
        autoSubscribe: true
      });

      // Renderiza quem já estava antes de entrar
      for (const participant of lkRoom.remoteParticipants.values()) {
        renderExistingParticipantTracks(participant);
      }
    } else {
      // Já estava em preview — só ativa câmera/mic
      videoStatusEl.textContent = oslTr("sala:videoTile.activatingCamMic", "Ativando câmera e microfone...");
    }

    localAudioTrack = await createLocalAudioTrack();
    localVideoTrack = await createLocalVideoTrack();

    await lkRoom.localParticipant.publishTrack(localAudioTrack);
    await lkRoom.localParticipant.publishTrack(localVideoTrack);

    isInPreview = false;

    // Expõe para o mobile usar diretamente (evita clonar de display:none)
    window._oslLocalVideoTrack = localVideoTrack;

    const myTile = getOrCreateVideoTile(
      participantId,
      oslTr("sala:videoTile.youNameTpl", "{{name}} (você)", { name: playerName })
    );

    appendTrackToTile(myTile, localVideoTrack, participantId);

    micEnabled = true;
    camEnabled = true;
    audioOnlyMode = false;
    refreshLocalVisualState();

    toggleMicBtn.disabled = false;
    toggleCamBtn.disabled = false;
    leaveVideoBtn.disabled = false;
    joinVideoBtn.disabled = true;
    if (joinAudioBtn) joinAudioBtn.disabled = true;

    toggleMicBtn.textContent = "🎤 Mutar";
    toggleCamBtn.textContent = "📷 Off";
    videoStatusEl.textContent = "Conectado.";
    updateVideoGridLayout();

    await markPanelVideo(true);
  } catch (error) {
    console.error("Erro ao entrar na chamada:", error);

    // Se estava em preview, volta para o estado de preview
    isInPreview = !!lkRoom;
    joinVideoBtn.disabled = false;
    if (joinAudioBtn) joinAudioBtn.disabled = false;
    toggleMicBtn.disabled = true;
    toggleCamBtn.disabled = true;
    leaveVideoBtn.disabled = true;

    if (isInPreview) {
      updatePreviewStatus();
    } else {
      videoStatusEl.textContent = oslTr("sala:videoTile.errorJoinCall", "Não foi possível entrar na chamada.");
    }

    if (
      error.message !== "TOKEN_UNAUTHORIZED" &&
      error.message !== "NO_ACCESS_TOKEN" &&
      error.message !== "ACCESS_INVALID" &&
      error.message !== "ACCESS_CHECK_FAILED"
    ) {
      let msg = oslTr("sala:videoTile.errorJoinGeneric", "Erro ao entrar na chamada. Tente novamente.");
      if (error.message === "TOKEN_TIMEOUT") {
        msg = oslTr("sala:videoTile.errorTokenTimeout", "Servidor demorou para responder. Clique em Entrar novamente.");
      } else if (error.message === "TOKEN_REQUEST_FAILED") {
        msg = oslTr("sala:videoTile.errorTokenFail", "Servidor indisponível. Aguarde 10s e clique em Entrar novamente.");
      } else if (error.message === "TOKEN_INVALID") {
        msg = oslTr("sala:videoTile.errorTokenInvalid", "Servidor retornou token inválido. Tente novamente.");
      }

      if (videoStatusEl) videoStatusEl.textContent = msg;
    }
  }
}

async function joinAudioOnlyCall() {
  if (lkRoom && !isInPreview) return;

  try {
    joinVideoBtn.disabled = true;
    if (joinAudioBtn) joinAudioBtn.disabled = true;

    if (!lkRoom) {
      videoStatusEl.textContent = "Conectando microfone...";
      const token = await requestToken();

      lkRoom = new Room({ adaptiveStream: true, dynacast: true });
      setupRoomListeners(lkRoom);

      await lkRoom.connect(LIVEKIT_URL, token, { autoSubscribe: true });

      for (const participant of lkRoom.remoteParticipants.values()) {
        renderExistingParticipantTracks(participant);
      }
    } else {
      videoStatusEl.textContent = "Ativando microfone...";
    }

    localAudioTrack = await createLocalAudioTrack();
    await lkRoom.localParticipant.publishTrack(localAudioTrack);

    localVideoTrack = null;
    isInPreview = false;
    audioOnlyMode = true;
    micEnabled = true;
    camEnabled = false;

    // Cria tile com avatar (sem vídeo)
    getOrCreateVideoTile(participantId, oslTr("sala:videoTile.youNameTpl", "{{name}} (você)", { name: playerName }));

    refreshLocalVisualState();

    toggleMicBtn.disabled = false;
    toggleCamBtn.disabled = false;
    leaveVideoBtn.disabled = false;
    joinVideoBtn.disabled = true;
    if (joinAudioBtn) joinAudioBtn.disabled = true;

    toggleMicBtn.textContent = "🎤 Mutar";
    toggleCamBtn.textContent = "📷 Ligar cam";
    videoStatusEl.textContent = "Microfone ativo.";
    updateVideoGridLayout();

    await markPanelVideo(true);
  } catch (error) {
    console.error("Erro ao entrar com áudio:", error);

    isInPreview = !!lkRoom;
    joinVideoBtn.disabled = false;
    if (joinAudioBtn) joinAudioBtn.disabled = false;
    toggleMicBtn.disabled = true;
    toggleCamBtn.disabled = true;
    leaveVideoBtn.disabled = true;
    audioOnlyMode = false;

    if (isInPreview) {
      updatePreviewStatus();
    } else {
      videoStatusEl.textContent = oslTr("sala:videoTile.errorMic", "Não foi possível ativar microfone.");
    }
  }
}

async function leaveVideoCall() {
  try {
    // Unpublica e para as tracks locais, mas mantém a conexão com o room
    if (localAudioTrack) {
      try { await lkRoom?.localParticipant.unpublishTrack(localAudioTrack); } catch (_) {}
      localAudioTrack.stop();
      localAudioTrack.detach().forEach((el) => el.remove());
      localAudioTrack = null;
    }

    if (localVideoTrack) {
      try { await lkRoom?.localParticipant.unpublishTrack(localVideoTrack); } catch (_) {}
      localVideoTrack.stop();
      localVideoTrack.detach().forEach((el) => el.remove());
      localVideoTrack = null;
      window._oslLocalVideoTrack = null;
    }
  } catch (error) {
    console.error("Erro ao sair:", error);
  }

  // Remove apenas o tile próprio — os dos outros ficam visíveis
  removeVideoTile(participantId);

  micEnabled = true;
  camEnabled = true;
  audioOnlyMode = false;

  toggleMicBtn.disabled = true;
  toggleCamBtn.disabled = true;
  leaveVideoBtn.disabled = true;
  joinVideoBtn.disabled = false;
  if (joinAudioBtn) joinAudioBtn.disabled = false;

  toggleMicBtn.textContent = "🎤 Mutar";
  toggleCamBtn.textContent = oslTr("sala:videoTile.camLabel", "📷 Câmera");

  // Volta ao modo preview se ainda conectado, ou desconecta se room sumiu
  if (lkRoom) {
    isInPreview = true;
    updatePreviewStatus();
  } else {
    videoStatusEl.textContent = oslTr("sala:videoTile.videoOff", "Vídeo desligado.");
  }

  await markPanelVideo(false);
}

async function toggleMic() {
  if (!localAudioTrack) return;

  micEnabled = !micEnabled;

  if (micEnabled) await localAudioTrack.unmute();
  else await localAudioTrack.mute();

  toggleMicBtn.textContent =
    micEnabled ? "🎤 Mutar" : "🎤 Ativar";

  refreshLocalVisualState();
}

async function toggleCam() {
  // Em modo só-áudio, primeiro clique liga a câmera
  if (audioOnlyMode && !localVideoTrack) {
    try {
      toggleCamBtn.disabled = true;
      localVideoTrack = await createLocalVideoTrack();
      await lkRoom.localParticipant.publishTrack(localVideoTrack);
      window._oslLocalVideoTrack = localVideoTrack;

      const myTile = getOrCreateVideoTile(participantId, oslTr("sala:videoTile.youNameTpl", "{{name}} (você)", { name: playerName }));
      appendTrackToTile(myTile, localVideoTrack, participantId);

      camEnabled = true;
      audioOnlyMode = false;
      toggleCamBtn.textContent = "📷 Off";
      videoStatusEl.textContent = "Conectado.";
      refreshLocalVisualState();
    } catch (err) {
      console.error("Erro ao ligar câmera:", err);
      videoStatusEl.textContent = oslTr("sala:videoTile.errorCamera", "Não foi possível ligar a câmera.");
    } finally {
      toggleCamBtn.disabled = false;
    }
    return;
  }

  if (!localVideoTrack) return;

  camEnabled = !camEnabled;

  if (camEnabled) await localVideoTrack.unmute();
  else await localVideoTrack.mute();

  toggleCamBtn.textContent =
    camEnabled ? "📷 Off" : "📷 On";

  refreshLocalVisualState();
}

joinVideoBtn?.addEventListener("click", () => {
  joinVideoCall().catch(console.error);
});

joinAudioBtn?.addEventListener("click", () => {
  joinAudioOnlyCall().catch(console.error);
});

toggleMicBtn?.addEventListener("click", () => {
  toggleMic().catch(console.error);
});

toggleCamBtn?.addEventListener("click", () => {
  toggleCam().catch(console.error);
});

leaveVideoBtn?.addEventListener("click", () => {
  leaveVideoCall().catch(console.error);
});

if (exitFocusBtn) {
  exitFocusBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearFocusState();
  });
}

window.addEventListener("pagehide", () => {
  if (panelVideoActive) {
    sendBeaconVideoOff();
  }
  // Desconecta o room ao sair da página (preview ou ativo)
  if (lkRoom) {
    try { lkRoom.disconnect(); } catch (_) {}
  }
});

window.addEventListener("beforeunload", () => {
  if (panelVideoActive) {
    sendBeaconVideoOff();
  }
});

// Cria ou retorna tile de vídeo para um participante — usado por sala.html para
// mostrar placeholder do perfil antes do LiveKit publicar tracks.
window._oslGetOrCreateVideoTile = function(identity, labelText) {
  return getOrCreateVideoTile(identity, labelText);
};

// Retorna o track de vídeo ativo de um participante remoto pelo identity.
// Usado pelo mobile para attach direto em elementos visíveis (display:none quebra iOS).
window._oslGetRemoteVideoTrack = function(identity) {
  if (!lkRoom) return null;
  const p = lkRoom.remoteParticipants.get(identity);
  if (!p) return null;
  for (const pub of p.trackPublications.values()) {
    if (pub.kind === "video" && pub.track && !pub.isMuted) return pub.track;
  }
  return null;
};

// Expõe controles para scripts não-módulo (mobile overlay, etc.)
window.oslVideoControls = {
  joinVideo:  () => joinVideoCall().catch(console.error),
  joinAudio:  () => joinAudioOnlyCall().catch(console.error),
  toggleMic:  () => toggleMic().catch(console.error),
  toggleCam:  () => toggleCam().catch(console.error),
  leaveVideo: () => leaveVideoCall().catch(console.error),
  isInCall:   () => !!lkRoom,
};

// Conecta silenciosamente ao entrar na sala — permite ver quem já está em vídeo
startPreview().catch(() => {});
