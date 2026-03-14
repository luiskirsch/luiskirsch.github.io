import {
  connect,
  createLocalTracks
} from "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs";

const LIVEKIT_URL = "wss://osextolugar-eqa7qliz.livekit.cloud";
const TOKEN_URL = "http://localhost:3000/token";

const joinBtn = document.getElementById("joinVideoBtn");
const videoGrid = document.getElementById("videoGrid");

joinBtn.addEventListener("click", async () => {

  const roomName = "sala1";
  const user = "Jogador";

  const res = await fetch(`${TOKEN_URL}?room=${roomName}&user=${user}`);
  const data = await res.json();

  const room = await connect(LIVEKIT_URL, data.token);

  const tracks = await createLocalTracks({
    audio: true,
    video: true
  });

  tracks.forEach(track => {
    room.localParticipant.publishTrack(track);
    const el = track.attach();
    videoGrid.appendChild(el);
  });

  room.on("trackSubscribed", (track) => {
    const el = track.attach();
    videoGrid.appendChild(el);
  });

});

  return tile;
}

function removeVideoTile(identity){
  const tile = videoGridEl.querySelector(`.videoTile[data-identity="${CSS.escape(identity)}"]`);
  if(tile) tile.remove();

  if(!videoGridEl.querySelector(".videoTile") && videoEmptyEl){
    videoGridEl.appendChild(videoEmptyEl);
  }
}

async function joinVideoCall(){
  if(lkRoom) return;

  try{
    videoStatusEl.textContent = "Entrando na chamada...";
    joinVideoBtn.disabled = true;

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        room_name: roomCode,
        participant_identity: participantId,
        participant_name: playerName
      })
    });

    if(!response.ok){
      throw new Error("TOKEN_ERROR");
    }

    const data = await response.json();
    if(!data.server_url || !data.participant_token){
      throw new Error("TOKEN_INVALID");
    }

    lkRoom = new Room({
      adaptiveStream: true,
      dynacast: true
    });

    lkRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const tile = getOrCreateVideoTile(participant.identity, participant.name || "Jogador");
      const mediaEl = track.attach();
      tile.appendChild(mediaEl);
    });

    lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(el => el.remove());
    });

    lkRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      removeVideoTile(participant.identity);
    });

    await lkRoom.connect(data.server_url, data.participant_token);

    localAudioTrack = await createLocalAudioTrack();
    localVideoTrack = await createLocalVideoTrack();

    await lkRoom.localParticipant.publishTrack(localAudioTrack);
    await lkRoom.localParticipant.publishTrack(localVideoTrack);

    const myTile = getOrCreateVideoTile(participantId, `${playerName} (você)`);
    myTile.appendChild(localVideoTrack.attach());

    for(const participant of lkRoom.remoteParticipants.values()){
      const tile = getOrCreateVideoTile(participant.identity, participant.name || "Jogador");

      participant.trackPublications.forEach(pub => {
        if(pub.track){
          tile.appendChild(pub.track.attach());
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
  }catch(error){
    console.error(error);
    videoStatusEl.textContent = "Não foi possível entrar na chamada.";
    joinVideoBtn.disabled = false;
  }
}

async function leaveVideoCall(){
  try{
    if(localAudioTrack){
      localAudioTrack.stop();
      localAudioTrack = null;
    }

    if(localVideoTrack){
      localVideoTrack.stop();
      localVideoTrack = null;
    }

    if(lkRoom){
      await lkRoom.disconnect();
      lkRoom = null;
    }
  }catch(error){
    console.error(error);
  }

  micEnabled = true;
  camEnabled = true;

  toggleMicBtn.disabled = true;
  toggleCamBtn.disabled = true;
  leaveVideoBtn.disabled = true;
  joinVideoBtn.disabled = false;

  videoGridEl.innerHTML = "";
  if(videoEmptyEl){
    videoGridEl.appendChild(videoEmptyEl);
  }

  videoStatusEl.textContent = "Vídeo desligado.";
}

async function toggleMic(){
  if(!localAudioTrack) return;

  micEnabled = !micEnabled;

  if(micEnabled){
    await localAudioTrack.unmute();
  }else{
    await localAudioTrack.mute();
  }

  toggleMicBtn.textContent = micEnabled ? "Mutar microfone" : "Ativar microfone";
}

async function toggleCam(){
  if(!localVideoTrack) return;

  camEnabled = !camEnabled;

  if(camEnabled){
    await localVideoTrack.unmute();
  }else{
    await localVideoTrack.mute();
  }

  toggleCamBtn.textContent = camEnabled ? "Desligar câmera" : "Ligar câmera";
}

if(joinVideoBtn){
  joinVideoBtn.addEventListener("click", () => {
    joinVideoCall().catch(console.error);
  });
}

if(toggleMicBtn){
  toggleMicBtn.addEventListener("click", () => {
    toggleMic().catch(console.error);
  });
}

if(toggleCamBtn){
  toggleCamBtn.addEventListener("click", () => {
    toggleCam().catch(console.error);
  });
}

if(leaveVideoBtn){
  leaveVideoBtn.addEventListener("click", () => {
    leaveVideoCall().catch(console.error);
  });
}

window.addEventListener("beforeunload", () => {
  leaveVideoCall().catch(() => {});
});
