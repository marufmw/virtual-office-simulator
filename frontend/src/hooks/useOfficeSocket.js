import { useEffect, useRef } from "react";
import { WS_URL } from "../config";

/**
 * Manages the WebSocket connection and applies server messages to the
 * world. Returns a ref with a `sendMove(x, y)` function.
 */
export function useOfficeSocket(world) {
  const sendMoveRef = useRef(() => {});

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    sendMoveRef.current = (x, y) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "move", x, y }));
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "init") {
        world.myId = msg.id;
        for (const p of msg.players) {
          world.addPlayer(p.id, p.x, p.y, p.color);
          if (p.id === world.myId) world.myPos = { x: p.x, y: p.y };
        }
      } else if (msg.type === "join") {
        world.addPlayer(msg.player.id, msg.player.x, msg.player.y, msg.player.color);
      } else if (msg.type === "move") {
        world.movePlayer(msg.id, msg.x, msg.y);
      } else if (msg.type === "position") {
        // Server rejected our move — snap back to the authoritative position
        world.myPos = { x: msg.x, y: msg.y };
        world.movePlayer(world.myId, msg.x, msg.y);
      } else if (msg.type === "leave") {
        world.removePlayer(msg.id);
      }
    };

    return () => {
      sendMoveRef.current = () => {};
      ws.close();
    };
  }, [world]);

  return sendMoveRef;
}
