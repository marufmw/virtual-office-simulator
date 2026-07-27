import { useEffect, useRef } from "react";
import { WS_URL } from "../config";

/**
 * Manages the WebSocket connection and applies server messages to the
 * world. Sends the join handshake (hello) once the socket opens.
 * `joinInfoRef` is read lazily so profile changes don't reconnect.
 * Returns refs with `sendMove(x, y)` and `sendProfile(profile)` functions.
 */
export function useOfficeSocket(world, joinInfoRef) {
  const sendMoveRef = useRef(() => {});
  const sendProfileRef = useRef(() => {});

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    const joinInfo = joinInfoRef.current;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "hello",
          deskId: joinInfo.deskId,
          name: joinInfo.name,
          character: joinInfo.character,
        })
      );
    };

    sendMoveRef.current = (x, y) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "move", x, y }));
      }
    };

    sendProfileRef.current = (profile) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "update_profile", ...profile }));
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "init") {
        world.myId = msg.id;
        for (const p of msg.players) {
          world.addPlayer(p.id, p.x, p.y, p.character, p.name);
          if (p.id === world.myId) {
            world.myPos = { x: p.x, y: p.y };
            localStorage.setItem("character", p.character);
          }
        }
      } else if (msg.type === "join") {
        world.addPlayer(msg.player.id, msg.player.x, msg.player.y, msg.player.character, msg.player.name);
      } else if (msg.type === "update") {
        // Someone changed their name/character/desk — rebuild their visuals
        world.updatePlayer(msg.player.id, msg.player);
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
      sendProfileRef.current = () => {};
      ws.close();
    };
  }, [world, joinInfoRef]);

  return { sendMoveRef, sendProfileRef };
}
