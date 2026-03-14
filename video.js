import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  createLocalVideoTrack
} from "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs";

const TOKEN_ENDPOINT = "http://localhost:3000/token";
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

function getOrCreateVideoTile(identity, labelText) {
  let tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${identity}"]`
  );

  if (tile) return tile;

  tile = document.createElement("div");
  tile.className = "videoTile";
  tile.dataset.identity = identity;

  const label = document.createElement("div");
  label.className = "videoLabel";
  label.textContent = labelText;

  tile.appendChild(label);

  if (videoEmptyEl && videoEmptyEl.parentNode === videoGridEl) {
    videoEmptyEl.remove();
  }

  videoGridEl.appendChild(tile);
  return tile;
}

function removeVideoTile(identity) {
  const tile = videoGridEl.querySelector(
    `.videoTile[data-identity="${identity}"]`
  );

  if (tile) tile.remove();

  if (!videoGridEl.querySelector(".videoTile") && videoEmptyEl) {
    videoGridEl.appendChild(videoEmptyEl);
  }
}

async function joinVideoCall() {
  if (lkRoom) return;

  try {
    videoStatusEl.textContent = "Entrando na chamada...";
    joinVideoBtn.disabled = true;

    const response = await fetch(
      `${TOKEN_ENDPOINT}?room=${encodeURIComponent(roomCode)}&user=${encodeURIComponent(participantId)}`
    );

    if (!response.ok) {
      throw new Error("TOKEN_ERROR");
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error("TOKEN_INVALID");
    }

    lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const tile = getOrCreateVideoTile(
        participant.identity,
        participant.name || "Jogador"
      );

      const mediaEl = track.attach();

      if (track.kind === "video") {
        mediaEl.style.width = "100%";
        mediaEl.style.height = "100%";
        mediaEl.style.objectFit = "cover";
      }

      tile.appendChild(mediaEl);
    });

    lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
    });

    lkRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      removeVideoTile(participant.identity);
    });

    await lkRoom.connect(LIVEKIT_URL, data.token);

    localAudioTrack = await createLocalAudioTrack();
    localVideoTrack = await createLocalVideoTrack();

    await lkRoom.localParticipant.publishTrack(localAudioTrack);
    await lkRoom.localParticipant.publishTrack(localVideoTrack);

    const myTile = getOrCreateVideoTile(
      participantId,
      `${playerName} (você)`
    );

    const myVideoEl = localVideoTrack.attach();
    myVideoEl.style.width = "100%";
    myVideoEl.style.height = "100%";
    myVideoEl.style.objectFit = "cover";
    myTile.appendChild(myVideoEl);

    for (const participant of lkRoom.remoteParticipants.values()) {
      const tile = getOrCreateVideoTile(
        participant.identity,
        participant.name || "Jogador"
      );

      participant.trackPublications.forEach((pub) => {
        if (pub.track) {
          const mediaEl = pub.track.attach();

          if (pub.track.kind === "video") {
            mediaEl.style.width = "100%";
            mediaEl.style.height = "100%";
            mediaEl.style.objectFit = "cover";
          }

          tile.appendChild(mediaEl);
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
    console.error(error);
    videoStatusEl.textContent = "Não foi possível entrar na chamada.";
    joinVideoBtn.disabled = false;
    alert("Erro ao entrar na chamada.");
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
    console.error(error);
  }

  micEnabled = true;
  camEnabled = true;

  toggleMicBtn.disabled = true;
  toggleCamBtn.disabled = true;
  leaveVideoBtn.disabled = true;
  joinVideoBtn.disabled = false;

  videoGridEl.innerHTML = "";
  if (videoEmptyEl) {
    videoGridEl.appendChild(videoEmptyEl);
  }

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
