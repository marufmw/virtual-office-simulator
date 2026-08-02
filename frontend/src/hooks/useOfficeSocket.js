import { useEffect, useRef } from "react";
import { WS_URL } from "../config";

/**
 * Manages the WebSocket connection and applies server messages to the
 * world. Sends the join handshake (hello) once the socket opens.
 * `joinInfoRef` is read lazily so profile changes don't reconnect.
 * `chatRef` holds `{ onMessage, onHistory, onHuddle, onHuddleMessage }`
 * callbacks, also read lazily. `onSeat` is called whenever the server
 * reports who is driving this character. Returns refs with `sendMove`,
 * `sendProfile`, `sendDm`, `sendHuddle`, `requestHistory` and `claimSeat`.
 */
export function useOfficeSocket(world, joinInfoRef, chatRef, onSeat, boardRef) {
  const sendMoveRef = useRef(() => {});
  const sendProfileRef = useRef(() => {});
  const sendDmRef = useRef(() => {});
  const sendHuddleRef = useRef(() => {});
  const requestHistoryRef = useRef(() => {});
  const claimSeatRef = useRef(() => {});
  const sendBoardRef = useRef(() => {});
  const sendPointerRef = useRef(() => {});
  const onSeatRef = useRef(onSeat);
  onSeatRef.current = onSeat;

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

    sendMoveRef.current = (x, y, phasing = false) => {
      if (ws.readyState === WebSocket.OPEN) {
        // `phasing` tells the server to skip its collision check, for
        // someone walking out of a desk that was placed on top of them
        ws.send(JSON.stringify({ type: "move", x, y, phasing }));
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

    sendHuddleRef.current = (text) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "huddle_msg", text }));
      }
    };

    sendBoardRef.current = (elements) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "board_update", elements }));
      }
    };

    sendPointerRef.current = (payload) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "board_pointer", ...payload }));
      }
    };

    claimSeatRef.current = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "claim_seat" }));
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
        world.setRoom(msg.room);
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
      } else if (msg.type === "room_resized") {
        world.setRoom(msg.room);
      } else if (msg.type === "desk_added") {
        world.addDesk(msg.desk.id, msg.desk.x, msg.desk.y);
      } else if (msg.type === "desk_moved") {
        world.moveDesk(msg.id, msg.x, msg.y);
      } else if (msg.type === "desk_removed") {
        world.removeDesk(msg.id);
      } else if (msg.type === "layout_reset") {
        // The whole office was rebuilt — start from a clean slate
        window.location.reload();
      } else if (msg.type === "huddle") {
        // Membership changed: joined a huddle, left one, or people moved
        chatRef.current?.onHuddle?.(
          msg.huddleId === null
            ? null
            : {
                id: msg.huddleId,
                members: msg.members,
                messages: msg.messages.map((m) => ({
                  mine: m.fromId === world.myId,
                  from: m.fromName,
                  body: m.body,
                  createdAt: m.createdAt,
                })),
              }
        );
      } else if (msg.type === "huddle_msg") {
        chatRef.current?.onHuddleMessage?.(msg.huddleId, {
          mine: msg.fromId === world.myId,
          from: msg.fromName,
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
      } else if (msg.type === "board") {
        // Standing at the board, or no longer standing at it. Arriving
        // brings the scene as it currently stands along with it.
        boardRef?.current?.onBoard?.(msg);
      } else if (msg.type === "board_update") {
        boardRef?.current?.applyRemote?.(msg.elements);
      } else if (msg.type === "board_pointer") {
        boardRef?.current?.applyPointer?.(msg);
      } else if (msg.type === "seat") {
        // Either "you are driving this character, and N others are asking"
        // or "somebody else has it". The overlay is the UI for both.
        onSeatRef.current?.(msg);
      } else if (msg.type === "leave") {
        world.removePlayer(msg.id);
      }
    };

    return () => {
      sendMoveRef.current = () => {};
      sendProfileRef.current = () => {};
      sendDmRef.current = () => {};
      sendHuddleRef.current = () => {};
      requestHistoryRef.current = () => {};
      claimSeatRef.current = () => {};
      sendBoardRef.current = () => {};
      sendPointerRef.current = () => {};
      ws.close();
    };
  }, [world, joinInfoRef, chatRef, boardRef]);

  return {
    sendMoveRef,
    sendProfileRef,
    sendDmRef,
    sendHuddleRef,
    requestHistoryRef,
    claimSeatRef,
    sendBoardRef,
    sendPointerRef,
  };
}
