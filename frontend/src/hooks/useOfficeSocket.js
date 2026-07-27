import { useEffect, useRef } from "react";
import { WS_URL } from "../config";

/**
 * Manages the WebSocket connection and applies server messages to the
 * world. Sends the join handshake (hello) once the socket opens.
 * `joinInfoRef` is read lazily so profile changes don't reconnect.
 * `chatRef` holds `{ onMessage, onHistory }` callbacks, also read lazily.
 * Returns refs with `sendMove`, `sendProfile`, `sendDm` and `requestHistory`.
 */
export function useOfficeSocket(world, joinInfoRef, chatRef) {
  const sendMoveRef = useRef(() => {});
  const sendProfileRef = useRef(() => {});
  const sendDmRef = useRef(() => {});
  const requestHistoryRef = useRef(() => {});

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

    sendDmRef.current = (to, text) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "dm", to, text }));
      }
    };

    requestHistoryRef.current = (withId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "dm_history", with: withId }));
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "init") {
        world.myId = msg.id;
        for (const d of msg.desks ?? []) {
          world.addDesk(d.id, d.x, d.y);
        }
        for (const p of msg.players) {
          world.addPlayer(p.id, p.x, p.y, p.character, p.name);
          if (p.id === world.myId) {
            world.myPos = { x: p.x, y: p.y };
            world.myDeskId = p.deskId;
            localStorage.setItem("character", p.character);
          }
        }
      } else if (msg.type === "join") {
        world.addPlayer(msg.player.id, msg.player.x, msg.player.y, msg.player.character, msg.player.name);
      } else if (msg.type === "update") {
        // Someone changed their name/character/desk — rebuild their visuals
        world.updatePlayer(msg.player.id, msg.player);
        // Keep our own desk in sync so "Go to desk" targets the new one
        if (msg.player.id === world.myId) world.myDeskId = msg.player.deskId;
      } else if (msg.type === "move") {
        world.movePlayer(msg.id, msg.x, msg.y);
      } else if (msg.type === "position") {
        // Server rejected our move — snap back to the authoritative position
        world.myPos = { x: msg.x, y: msg.y };
        world.movePlayer(world.myId, msg.x, msg.y);
      } else if (msg.type === "error" && msg.reason === "invalid_desk") {
        // Stored desk no longer exists — force the user back to the join form
        localStorage.removeItem("deskId");
        window.location.reload();
      } else if (msg.type === "dm") {
        // Both the sender's echo and the recipient's copy land here
        const peerId = msg.from === world.myId ? msg.to : msg.from;
        chatRef.current?.onMessage?.(peerId, {
          mine: msg.from === world.myId,
          body: msg.body,
          createdAt: msg.createdAt,
        });
      } else if (msg.type === "dm_history") {
        const myDesk = world.myDeskId;
        chatRef.current?.onHistory?.(
          msg.with,
          msg.messages.map((m) => ({
            mine: m.fromDesk === myDesk,
            body: m.body,
            createdAt: m.createdAt,
          }))
        );
      } else if (msg.type === "leave") {
        world.removePlayer(msg.id);
      }
    };

    return () => {
      sendMoveRef.current = () => {};
      sendProfileRef.current = () => {};
      sendDmRef.current = () => {};
      requestHistoryRef.current = () => {};
      ws.close();
    };
  }, [world, joinInfoRef, chatRef]);

  return { sendMoveRef, sendProfileRef, sendDmRef, requestHistoryRef };
}
