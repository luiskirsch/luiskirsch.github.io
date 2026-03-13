import { connect } from "https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.esm.mjs"

const LIVEKIT_URL = "COLOQUE_SEU_URL_LIVEKIT"

export async function startVideo(roomName, user){

 const res = await fetch(`http://localhost:3000/token?room=${roomName}&user=${user}`)
 const data = await res.json()

 const room = await connect(LIVEKIT_URL, data.token)

 const videoGrid = document.getElementById("videoGrid")

 const tracks = await Livekit.createLocalTracks({
   video:true,
   audio:true
 })

 tracks.forEach(track => {

   room.localParticipant.publishTrack(track)

   const el = track.attach()
   videoGrid.appendChild(el)

 })

 room.on("trackSubscribed",(track)=>{

   const el = track.attach()
   videoGrid.appendChild(el)

 })
}
