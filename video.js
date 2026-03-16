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
    return;
  }

  if (count <= 1) videoGridEl.classList.add("videoGrid--one");
  else if (count === 2) videoGridEl.classList.add("videoGrid--two");
  else if (count === 3) videoGridEl.classList.add("videoGrid--three");
  else if (count === 4) videoGridEl.classList.add("videoGrid--four");
  else videoGridEl.classList.add("videoGrid--five");
}

function setFocusedTile(identity) {
  const tiles = videoGridEl.querySelectorAll(".videoTile");

  if (focusedIdentity === identity) {
    focusedIdentity = null;
    tiles.forEach(tile => tile.classList.remove("videoTile--focused","videoTile--mini"));
    updateVideoGridLayout();
    return;
  }

  focusedIdentity = identity;

  tiles.forEach(tile=>{
    if(tile.dataset.identity===identity){
      tile.classList.add("videoTile--focused");
      tile.classList.remove("videoTile--mini");
    }else{
      tile.classList.remove("videoTile--focused");
      tile.classList.add("videoTile--mini");
    }
  });

  updateVideoGridLayout();
}

function createVideoTile(identity,labelText){
  const tile=document.createElement("div");
  tile.className="videoTile";
  tile.dataset.identity=identity;

  const mediaWrap=document.createElement("div");
  mediaWrap.className="videoMedia";
  tile.appendChild(mediaWrap);

  const label=document.createElement("div");
  label.className="videoLabel";
  label.innerHTML=escapeHtml(labelText);
  tile.appendChild(label);

  tile.addEventListener("click",()=>{
    setFocusedTile(identity);
  });

  return tile;
}

function getMediaWrap(tile){
  let mediaWrap=tile.querySelector(".videoMedia");
  if(!mediaWrap){
    mediaWrap=document.createElement("div");
    mediaWrap.className="videoMedia";
    tile.insertBefore(mediaWrap,tile.firstChild);
  }
  return mediaWrap;
}

function getOrCreateVideoTile(identity,labelText){
  let tile=videoGridEl.querySelector(`.videoTile[data-identity="${CSS.escape(identity)}"]`);

  if(tile){
    const label=tile.querySelector(".videoLabel");
    if(label)label.innerHTML=escapeHtml(labelText);
    return tile;
  }

  tile=createVideoTile(identity,labelText);

  if(videoEmptyEl&&videoEmptyEl.parentNode===videoGridEl){
    videoEmptyEl.remove();
  }

  videoGridEl.appendChild(tile);
  updateVideoGridLayout();
  return tile;
}

function removeVideoTile(identity){
  const tile=videoGridEl.querySelector(`.videoTile[data-identity="${CSS.escape(identity)}"]`);
  if(tile)tile.remove();

  if(focusedIdentity===identity){
    focusedIdentity=null;
  }

  if(!videoGridEl.querySelector(".videoTile")&&videoEmptyEl){
    videoGridEl.appendChild(videoEmptyEl);
  }

  updateVideoGridLayout();
}

function clearAllVideoTiles(){
  videoGridEl.querySelectorAll(".videoTile").forEach(tile=>tile.remove());
  focusedIdentity=null;

  if(videoEmptyEl&&!videoEmptyEl.parentNode){
    videoGridEl.appendChild(videoEmptyEl);
  }

  updateVideoGridLayout();
}

function appendTrackToTile(tile,track,participantIdentity){
  const mediaWrap=getMediaWrap(tile);

  const existing=mediaWrap.querySelector(`[data-track-sid="${track.sid}"]`);
  if(existing)return;

  const mediaEl=track.attach();
  mediaEl.dataset.trackSid=track.sid;

  if(track.kind==="video"){
    mediaEl.style.width="100%";
    mediaEl.style.height="100%";
    mediaEl.style.objectFit="cover";
    mediaEl.playsInline=true;
    mediaEl.autoplay=true;
  }

  if(track.kind==="audio"){
    mediaEl.autoplay=true;
  }

  mediaWrap.appendChild(mediaEl);
}

async function requestToken(){
  const response=await fetch(
    `${TOKEN_ENDPOINT}?room=${encodeURIComponent(roomCode)}&user=${encodeURIComponent(participantId)}`
  );

  if(!response.ok)throw new Error("TOKEN_REQUEST_FAILED");

  const data=await response.json();
  if(!data.token)throw new Error("TOKEN_INVALID");

  return data.token;
}

async function joinVideoCall(){
  if(lkRoom)return;

  try{
    videoStatusEl.textContent="Entrando na chamada...";
    joinVideoBtn.disabled=true;

    const token=await requestToken();

    lkRoom=new Room({
      adaptiveStream:true,
      dynacast:true
    });

    lkRoom.on(RoomEvent.TrackSubscribed,(track,publication,participant)=>{
      if(participant.identity===participantId)return;

      const tile=getOrCreateVideoTile(
        participant.identity,
        participant.name||"Jogador"
      );

      appendTrackToTile(tile,track,participant.identity);
      updateVideoGridLayout();
    });

    lkRoom.on(RoomEvent.ParticipantDisconnected,(participant)=>{
      removeVideoTile(participant.identity);
    });

    await lkRoom.connect(LIVEKIT_URL,token,{
      autoSubscribe:true
    });

    localAudioTrack=await createLocalAudioTrack();
    localVideoTrack=await createLocalVideoTrack();

    await lkRoom.localParticipant.publishTrack(localAudioTrack);
    await lkRoom.localParticipant.publishTrack(localVideoTrack);

    const myTile=getOrCreateVideoTile(
      participantId,
      `${playerName} (você)`
    );

    appendTrackToTile(myTile,localVideoTrack,participantId);

    for(const participant of lkRoom.remoteParticipants.values()){
      const tile=getOrCreateVideoTile(
        participant.identity,
        participant.name||"Jogador"
      );

      participant.trackPublications.forEach(pub=>{
        if(pub.track){
          appendTrackToTile(tile,pub.track,participant.identity);
        }
      });
    }

    toggleMicBtn.disabled=false;
    toggleCamBtn.disabled=false;
    leaveVideoBtn.disabled=false;

    toggleMicBtn.textContent="Mutar microfone";
    toggleCamBtn.textContent="Desligar câmera";

    videoStatusEl.textContent="Conectado à chamada.";
    updateVideoGridLayout();

  }catch(error){

    console.error("Erro ao entrar na chamada:",error);

    joinVideoBtn.disabled=false;
    toggleMicBtn.disabled=true;
    toggleCamBtn.disabled=true;
    leaveVideoBtn.disabled=true;

    videoStatusEl.textContent="Não foi possível entrar na chamada.";

    alert("Erro ao entrar na chamada.");
  }
}

async function leaveVideoCall(){
  try{

    if(localAudioTrack){
      localAudioTrack.stop();
      localAudioTrack.detach().forEach(el=>el.remove());
      localAudioTrack=null;
    }

    if(localVideoTrack){
      localVideoTrack.stop();
      localVideoTrack.detach().forEach(el=>el.remove());
      localVideoTrack=null;
    }

    if(lkRoom){
      lkRoom.disconnect();
      lkRoom=null;
    }

  }catch(error){
    console.error("Erro ao sair:",error);
  }

  toggleMicBtn.disabled=true;
  toggleCamBtn.disabled=true;
  leaveVideoBtn.disabled=true;
  joinVideoBtn.disabled=false;

  clearAllVideoTiles();
  videoStatusEl.textContent="Vídeo desligado.";
}

async function toggleMic(){
  if(!localAudioTrack)return;

  micEnabled=!micEnabled;

  if(micEnabled)await localAudioTrack.unmute();
  else await localAudioTrack.mute();

  toggleMicBtn.textContent=
    micEnabled?"Mutar microfone":"Ativar microfone";
}

async function toggleCam(){
  if(!localVideoTrack)return;

  camEnabled=!camEnabled;

  if(camEnabled)await localVideoTrack.unmute();
  else await localVideoTrack.mute();

  toggleCamBtn.textContent=
    camEnabled?"Desligar câmera":"Ligar câmera";
}

joinVideoBtn.addEventListener("click",()=>{
  joinVideoCall().catch(console.error);
});

toggleMicBtn.addEventListener("click",()=>{
  toggleMic().catch(console.error);
});

toggleCamBtn.addEventListener("click",()=>{
  toggleCam().catch(console.error);
});

leaveVideoBtn.addEventListener("click",()=>{
  leaveVideoCall().catch(console.error);
});

window.addEventListener("beforeunload",()=>{
  leaveVideoCall().catch(()=>{});
});
