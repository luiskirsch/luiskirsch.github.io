import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack
} from "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs";

/*
  Enquanto estiver testando no seu notebook:
  deixe localhost.
  Quando subir o servidor para Render/Railway, troque por:
  https://seu-servidor.onrender.com/token
*/
const TOKEN_ENDPOINT = "http://localhost:3000/token";

/*
  URL do seu projeto LiveKit
*/
const LIVEKIT_URL = "wss://osextolugar-eqa7qliz.livekit.cloud";

const joinVideoBtn = document.getElementById("joinVideoBtn");
const leaveVideoBtn = document.getElementById("leaveVideoBtn");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const videoGridEl = document.getElementById("videoGrid");
const videoEmptyEl = document.getElementById("videoEmpty");
const videoStatusEl = document.getElementById("videoStatus");

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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateVideoGridLayout() {
  const count = videoGridEl.querySelectorAll(".videoTile").length;

  videoGridEl.classList.remove(
    "videoGrid--one",
    "videoGrid--two",
    "videoGrid--three",
    "videoGrid--four",
    "videoGrid--five"
  );

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
}

function createVideoTile(identity, labelText) {
  const tile = document.createElement("div");
  tile.className = "videoTile";
  tile.dataset.identity = identity;

  const label = document.createElement("div");
  label.className = "videoLabel";
  label.innerHTML = escapeHtml(labelText);

  tile.appendChild(label);
  return tile;
}

function getOrCreateVideoTile(identity, labelText) {
  let tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );

  if (tile) {
    const label = tile.querySelector(".videoLabel");
    if (label) label.innerHTML = escapeHtml(labelText);
    return tile;
  }

  tile = createVideoTile(identity, labelText);

  if (videoEmptyEl && videoEmptyEl.parentNode === videoGridEl) {
    videoEmptyEl.remove();
  }

  videoGridEl.appendChild(tile);
  updateVideoGridLayout();
  return tile;
}

function removeVideoTile(identity) {
  const tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${CSS.escape(identity)}"]`
  );

  if (tile) tile.remove();

  if (!videoGridEl.querySelector(".videoTile") && videoEmptyEl) {
    videoGridEl.appendChild(videoEmptyEl);
  }

  updateVideoGridLayout();
}

function clearAllVideoTiles() {
  videoGridEl.querySelectorAll(".videoTile").forEach((tile) => tile.remove());

  if (videoEmptyEl && !videoEmptyEl.parentNode) {
    videoGridEl.appendChild(videoEmptyEl);
  }

  updateVideoGridLayout();
}

function appendTrackToTile(tile, track) {
  const mediaEl = track.attach();

  if (track.kind === "video") {
    mediaEl.style.width = "100%";
    mediaEl.style.height = "100%";
    mediaEl.style.objectFit = "cover";
    mediaEl.playsInline = true;
    mediaEl.autoplay = true;
  }

  if (track.kind === "audio") {
    mediaEl.autoplay = true;
  }

  tile.appendChild(mediaEl);
}

async function requestToken() {
  const response = await fetch(
    `${TOKEN_ENDPOINT}?room=${encodeURIComponent(roomCode)}&user=${encodeURIComponent(participantId)}`
  );

  if (!response.ok) {
    throw new Error("TOKEN_REQUEST_FAILED");
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("TOKEN_INVALID");
  }

  return data.token;
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

    lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (participant.identity === participantId) return;

      const tile = getOrCreateVideoTile(
        participant.identity,
        participant.name || "Jogador"
      );

      appendTrackToTile(tile, track);
    });

    lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
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

    appendTrackToTile(myTile, localVideoTrack);

    for (const participant of lkRoom.remoteParticipants.values()) {
      const tile = getOrCreateVideoTile(
        participant.identity,
        participant.name || "Jogador"
      );

      participant.trackPublications.forEach((pub) => {
        if (pub.track) {
          appendTrackToTile(tile, pub.track);
        }
      });
    }

    micEnabled = true;
    camEnabled = true;

    toggleMicBtn.disabled = false;
    toggleCamBtn.disabled = false;
    leaveVideoBtn.disabled = false;
    joinVideoBtn.disabled = true;

    toggleMicBtn.textContent = "Mutar microfone";
    toggleCamBtn.textContent = "Desligar câmera";
    videoStatusEl.textContent = "Conectado à chamada.";
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
    console.error("Erro ao sair da chamada:", error);
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

  if (micEnabled) {
    await localAudioTrack.unmute();
  } else {
    await localAudioTrack.mute();
  }

  toggleMicBtn.textContent = micEnabled
    ? "Mutar microfone"
    : "Ativar microfone";
}

async function toggleCam() {
  if (!localVideoTrack) return;

  camEnabled = !camEnabled;

  if (camEnabled) {
    await localVideoTrack.unmute();
  } else {
    await localVideoTrack.mute();
  }

  toggleCamBtn.textContent = camEnabled
    ? "Desligar câmera"
    : "Ligar câmera";
}

if (joinVideoBtn) {
  joinVideoBtn.addEventListener("click", () => {
    joinVideoCall().catch(console.error);
  });
}

if (toggleMicBtn) {
  toggleMicBtn.addEventListener("click", () => {
    toggleMic().catch(console.error);
  });
}

if (toggleCamBtn) {
  toggleCamBtn.addEventListener("click", () => {
    toggleCam().catch(console.error);
  });
}

if (leaveVideoBtn) {
  leaveVideoBtn.addEventListener("click", () => {
    leaveVideoCall().catch(console.error);
  });
}

window.addEventListener("beforeunload", () => {
  leaveVideoCall().catch(() => {});
});
