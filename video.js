import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack
} from "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs";

const TOKEN_ENDPOINT = "https://osl-video-server.onrender.com/token";
const LIVEKIT_URL = "wss://osextolugar-eqa7q1iz.livekit.cloud";

const joinVideoBtn = document.getElementById("joinVideoBtn");
const leaveVideoBtn = document.getElementById("leaveVideoBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const videoGridEl = document.getElementById("videoGrid");
const videoEmptyEl = document.getElementById("videoEmpty");
const videoStatusEl = document.getElementById("videoStatus");
const videoFocusBarEl = document.getElementById("videoFocusBar");
const exitFocusBtn = document.getElementById("exitFocusBtn");

const params = new URLSearchParams(window.location.search);

const roomCode =
  params.get("sala") ||
  localStorage.getItem("osl_sala") ||
  "SL-0001";

const playerName =
  params.get("nome") ||
  localStorage.getItem("osl_nome") ||
  "Visitante";

let participantId = sessionStorage.getItem("osl_video_participant_id");
if (!participantId) {
  participantId = "p_" + Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem("osl_video_participant_id", participantId);
}

let lkRoom = null;
let localAudioTrack = null;
let localVideoTrack = null;
let micEnabled = true;
let camEnabled = true;
let focusedIdentity = null;

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateFocusBar() {
  if (!videoFocusBarEl) return;
  videoFocusBarEl.hidden = !focusedIdentity;
}

function updateVideoGridLayout() {
  const count = videoGridEl.querySelectorAll(".videoTile").length;

  videoGridEl.classList.remove(
    "videoGrid--one",
    "videoGrid--two",
    "videoGrid--three",
    "videoGrid--four",
    "videoGrid--five",
    "videoGrid--focus"
  );

  if (focusedIdentity) {
    videoGridEl.classList.add("videoGrid--focus");
    updateFocusBar();
    return;
  }

  if (count <= 1) {
    videoGridEl.classList.add("videoGrid--one");
  } else if (count === 2) {
    videoGridEl.classList.add("videoGrid--two");
  } else if (count === 3) {
    videoGridEl.classList.add("videoGrid--three");
  } else if (count === 4) {
    videoGridEl.classList.add("videoGrid--four");
  } else {
    videoGridEl.classList.add("videoGrid--five");
  }

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
  text.textContent = "Câmera desligada";

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
    camBadge.textContent = camMuted ? "📷✖" : "📷";
    camBadge.title = camMuted ? "Câmera desligada" : "Câmera ligada";
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

  if (videoEmptyEl && videoEmptyEl.parentNode === videoGridEl) {
    videoEmptyEl.remove();
  }

  videoGridEl.appendChild(tile);
  updateTileLabel(identity, labelText);
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

  if (!videoGridEl.querySelector(".videoTile") && videoEmptyEl) {
    videoGridEl.appendChild(videoEmptyEl);
  }

  updateVideoGridLayout();
}

function clearAllVideoTiles() {
  videoGridEl.querySelectorAll(".videoTile").forEach((tile) => tile.remove());
  clearFocusState();

  if (videoEmptyEl && !videoEmptyEl.parentNode) {
    videoGridEl.appendChild(videoEmptyEl);
  }

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
    mediaEl.playsInline = true;
    mediaEl.autoplay = true;
    mediaEl.muted = participantIdentity === participantId;
  }

  if (track.kind === "audio") {
    mediaEl.autoplay = true;
  }

  mediaWrap.appendChild(mediaEl);
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
  const hostSuffix = participant?.isHost ? " [anfitrião]" : "";
  return isSelf ? `${baseName} (você)${hostSuffix}` : `${baseName}${hostSuffix}`;
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

async function requestToken() {
  const response = await fetch(
    `${TOKEN_ENDPOINT}?room=${encodeURIComponent(roomCode)}&user=${encodeURIComponent(participantId)}`
  );

  if (!response.ok) throw new Error("TOKEN_REQUEST_FAILED");

  const data = await response.json();
  if (!data.token) throw new Error("TOKEN_INVALID");

  return data.token;
}

function renderExistingParticipantTracks(participant) {
  const tile = getOrCreateVideoTile(
    participant.identity,
    buildParticipantLabel(participant, false)
  );

  participant.trackPublications.forEach((pub) => {
    if (pub.track) {
      appendTrackToTile(tile, pub.track, participant.identity);
    }
  });

  refreshParticipantVisualState(participant);
}

async function joinVideoCall() {
  if (lkRoom) return;

  try {
    videoStatusEl.textContent = "Entrando na chamada...";
    joinVideoBtn.disabled = true;

    const token = await requestToken();

    lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    lkRoom.on(RoomEvent.ParticipantConnected, (participant) => {
      getOrCreateVideoTile(
        participant.identity,
        buildParticipantLabel(participant, false)
      );
      refreshParticipantVisualState(participant);
      updateVideoGridLayout();
    });

    lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (participant.identity === participantId) return;

      const tile = getOrCreateVideoTile(
        participant.identity,
        buildParticipantLabel(participant, false)
      );

      appendTrackToTile(tile, track, participant.identity);
      refreshParticipantVisualState(participant);
      updateVideoGridLayout();
    });

    lkRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (participant) {
        removeTrackFromParticipant(participant.identity, track.sid);
        refreshParticipantVisualState(participant);
      }
    });

    lkRoom.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (participant) refreshParticipantVisualState(participant);
    });

    lkRoom.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (participant) refreshParticipantVisualState(participant);
    });

    lkRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      removeVideoTile(participant.identity);
    });

    lkRoom.on(RoomEvent.Disconnected, () => {
      videoStatusEl.textContent = "Desconectado da chamada.";
    });

    await lkRoom.connect(LIVEKIT_URL, token, {
      autoSubscribe: true
    });

    localAudioTrack = await createLocalAudioTrack();
    localVideoTrack = await createLocalVideoTrack();

    await lkRoom.localParticipant.publishTrack(localAudioTrack);
    await lkRoom.localParticipant.publishTrack(localVideoTrack);

    const myTile = getOrCreateVideoTile(
      participantId,
      `${playerName} (você)`
    );

    appendTrackToTile(myTile, localVideoTrack, participantId);

    micEnabled = true;
    camEnabled = true;
    refreshLocalVisualState();

    for (const participant of lkRoom.remoteParticipants.values()) {
      renderExistingParticipantTracks(participant);
    }

    toggleMicBtn.disabled = false;
    toggleCamBtn.disabled = false;
    leaveVideoBtn.disabled = false;
    joinVideoBtn.disabled = true;

    toggleMicBtn.textContent = "Mutar microfone";
    toggleCamBtn.textContent = "Desligar câmera";
    videoStatusEl.textContent = "Conectado à chamada.";
    updateVideoGridLayout();
  } catch (error) {
    console.error("Erro ao entrar na chamada:", error);

    joinVideoBtn.disabled = false;
    toggleMicBtn.disabled = true;
    toggleCamBtn.disabled = true;
    leaveVideoBtn.disabled = true;
    videoStatusEl.textContent = "Não foi possível entrar na chamada.";

    let msg = "Erro ao entrar na chamada.";
    if (error.message === "TOKEN_REQUEST_FAILED") {
      msg = "Falha ao pedir token ao servidor.";
    } else if (error.message === "TOKEN_INVALID") {
      msg = "O servidor retornou um token inválido.";
    }

    alert(msg);
  }
}

async function leaveVideoCall() {
  try {
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.detach().forEach((el) => el.remove());
      localAudioTrack = null;
    }

    if (localVideoTrack) {
      localVideoTrack.stop();
      localVideoTrack.detach().forEach((el) => el.remove());
      localVideoTrack = null;
    }

    if (lkRoom) {
      lkRoom.disconnect();
      lkRoom = null;
    }
  } catch (error) {
    console.error("Erro ao sair:", error);
  }

  micEnabled = true;
  camEnabled = true;

  toggleMicBtn.disabled = true;
  toggleCamBtn.disabled = true;
  leaveVideoBtn.disabled = true;
  joinVideoBtn.disabled = false;

  toggleMicBtn.textContent = "Mutar microfone";
  toggleCamBtn.textContent = "Desligar câmera";

  clearAllVideoTiles();
  videoStatusEl.textContent = "Vídeo desligado.";
}

async function toggleMic() {
  if (!localAudioTrack) return;

  micEnabled = !micEnabled;

  if (micEnabled) await localAudioTrack.unmute();
  else await localAudioTrack.mute();

  toggleMicBtn.textContent =
    micEnabled ? "Mutar microfone" : "Ativar microfone";

  refreshLocalVisualState();
}

async function toggleCam() {
  if (!localVideoTrack) return;

  camEnabled = !camEnabled;

  if (camEnabled) await localVideoTrack.unmute();
  else await localVideoTrack.mute();

  toggleCamBtn.textContent =
    camEnabled ? "Desligar câmera" : "Ligar câmera";

  refreshLocalVisualState();
}

joinVideoBtn.addEventListener("click", () => {
  joinVideoCall().catch(console.error);
});

toggleMicBtn.addEventListener("click", () => {
  toggleMic().catch(console.error);
});

toggleCamBtn.addEventListener("click", () => {
  toggleCam().catch(console.error);
});

leaveVideoBtn.addEventListener("click", () => {
  leaveVideoCall().catch(console.error);
});

if (exitFocusBtn) {
  exitFocusBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearFocusState();
  });
}

window.addEventListener("beforeunload", () => {
  leaveVideoCall().catch(() => {});
});
