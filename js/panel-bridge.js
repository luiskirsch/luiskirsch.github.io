window.PANEL_SERVER_BASE = window.PANEL_SERVER_BASE || "https://osl-video-server.onrender.com";

const PanelBridge = (() => {
  const SERVER_BASE =
    window.PANEL_SERVER_BASE ||
    localStorage.getItem("PANEL_SERVER_BASE") ||
    "http://localhost:3000";

  async function post(path, data = {}) {
    try {
      const res = await fetch(SERVER_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("PanelBridge erro:", path, json || res.status);
        return { ok: false, error: json || res.status };
      }

      return json || { ok: true };
    } catch (error) {
      console.error("PanelBridge falha:", path, error);
      return { ok: false, error: error.message || String(error) };
    }
  }

  function normalizeRoomId(roomId) {
    return String(roomId || "").trim();
  }

  function normalizePlayerId(playerId) {
    return String(playerId || "").trim();
  }

  function normalizePlayerName(playerName) {
    return String(playerName || "").trim();
  }

  return {
    baseUrl: SERVER_BASE,

    async roomCreate(roomId, name = "", host = "") {
      return post("/game/room/create", {
        roomId: normalizeRoomId(roomId),
        name: String(name || "").trim(),
        host: String(host || "").trim()
      });
    },

    async playerJoin(roomId, playerId, playerName = "") {
      return post("/game/player/join", {
        roomId: normalizeRoomId(roomId),
        playerId: normalizePlayerId(playerId),
        playerName: normalizePlayerName(playerName)
      });
    },

    async playerLeave(roomId, playerId) {
      return post("/game/player/leave", {
        roomId: normalizeRoomId(roomId),
        playerId: normalizePlayerId(playerId)
      });
    }
  };
})();

window.PanelBridge = PanelBridge;
