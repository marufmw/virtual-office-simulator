const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3001;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (data) => {
    // Placeholder: character position updates will be handled here
    // In the future, WebRTC signaling for video calls will also live here
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}`);
