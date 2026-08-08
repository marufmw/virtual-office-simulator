import { useEffect, useRef } from "react";
import { WS_URL } from "../config";
import { getToken } from "../api/client";

/**
 * The connection to one office, and everything that arrives over it applied
 * to the world.
 *
 * The handshake is a session token and an office id: the server decides
 * who this is and whether they have a desk there. `chatRef` and `boardRef`
 * hold callbacks and are read lazily, so a re-render never reconnects.
 */
export function useOfficeSocket(world, officeId, { chatRef, boardRef, onSeat, onRefused }) {
  const sendMoveRef = useRef(() => {});
  const sendCharacterRef = useRef(() => {});
  const sendDmRef = useRef(() => {});
  const sendHuddleRef = useRef(() => {});
  const requestHistoryRef = useRef(() => {});
  const claimSeatRef = useRef(() => {});
  const sendBoardRef = useRef(() => {});
  const sendPointerRef = useRef(() => {});
  const requestBoardRef = useRef(() => {});

  const onSeatRef = useRef(onSeat);
  onSeatRef.current = onSeat;
  const onRefusedRef = useRef(onRefused);
  onRefusedRef.current = onRefused;

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "hello", token: getToken(), officeId }));
    };

    const sender = (build) => (...args) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(build(...args)));
    };

    // `phasing` tells the server to skip its collision check, for someone
    // walking out of a desk that was placed on top of them
    sendMoveRef.current = sender((x, y, phasing = false) => ({ type: "move", x, y, phasing }));
    sendCharacterRef.current = sender((character) => ({ type: "set_character", character }));
    sendDmRef.current = sender((to, text) => ({ type: "dm", to, text }));
    sendHuddleRef.current = sender((text) => ({ type: "huddle_msg", text }));
    sendBoardRef.current = sender((elements) => ({ type: "board_update", elements }));
    sendPointerRef.current = sender((payload) => ({ type: "board_pointer", ...payload }));
    // The scene we were greeted with on walking up is only good for that
    // moment, so opening the board asks for it again
    requestBoardRef.current = sender(() => ({ type: "board_sync" }));
    claimSeatRef.current = sender(() => ({ type: "claim_seat" }));
    requestHistoryRef.current = sender((withId) => ({ type: "dm_history", with: withId }));

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "init") {
        world.myId = msg.id;
        world.myEmail = msg.me.email;
        world.myDeskId = msg.me.deskId;
        world.setRoom(msg.room);
        for (const desk of msg.desks ?? []) {
          world.addDesk(desk.id, desk.x, desk.y, desk.code);
        }
        for (const p of msg.players) {
          world.addPlayer(p.id, p.x, p.y, p.character, p.name);
          if (p.id === world.myId) world.myPos = { x: p.x, y: p.y };
        }
        onSeatRef.current?.({ type: "ready", me: msg.me, office: msg.office });
      } else if (msg.type === "join") {
        const p = msg.player;
        world.addPlayer(p.id, p.x, p.y, p.character, p.name);
      } else if (msg.type === "update") {
        // Somebody changed their character — rebuild their visuals
        world.updatePlayer(msg.player.id, msg.player);
      } else if (msg.type === "move") {
        world.movePlayer(msg.id, msg.x, msg.y);
      } else if (msg.type === "position") {
        // Server rejected our move — snap back to the authoritative position
        world.myPos = { x: msg.x, y: msg.y };
        world.movePlayer(world.myId, msg.x, msg.y);
      } else if (msg.type === "leave") {
        world.removePlayer(msg.id);
      } else if (msg.type === "error" || msg.type === "evicted") {
        // No session, no membership, or no desk any more. Nothing here is
        // recoverable from inside the room, so it goes back to the picker.
        onRefusedRef.current?.(msg.reason);
      } else if (msg.type === "dm") {
        // Both the sender's echo and the recipient's copy land here
        const peerId = msg.from === world.myId ? msg.to : msg.from;
        chatRef.current?.onMessage?.(peerId, {
          mine: msg.from === world.myId,
          body: msg.body,
          createdAt: msg.createdAt,
        });
      } else if (msg.type === "dm_history") {
        chatRef.current?.onHistory?.(
          msg.with,
          msg.messages.map((m) => ({
            mine: m.fromEmail === world.myEmail,
            body: m.body,
            createdAt: m.createdAt,
          }))
        );
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
      } else if (msg.type === "room_resized") {
        world.setRoom(msg.room);
      } else if (msg.type === "desk_added") {
        world.addDesk(msg.desk.id, msg.desk.x, msg.desk.y, msg.desk.code);
      } else if (msg.type === "desk_renamed") {
        // The code is baked into the label above the desk, so the desk is
        // rebuilt where it stands rather than edited in place
        const desk = world.deskList().find((d) => d.id === msg.id);
        if (desk) {
          world.removeDesk(msg.id);
          world.addDesk(msg.id, desk.x, desk.y, msg.code);
        }
      } else if (msg.type === "desk_moved") {
        world.moveDesk(msg.id, msg.x, msg.y);
      } else if (msg.type === "desk_removed") {
        world.removeDesk(msg.id);
      } else if (msg.type === "board") {
        // Standing at the board, or no longer standing at it. Arriving
        // brings the scene as it currently stands along with it.
        boardRef?.current?.onBoard?.(msg);
      } else if (msg.type === "board_update") {
        boardRef?.current?.applyRemote?.(msg.elements);
      } else if (msg.type === "board_pointer") {
        boardRef?.current?.applyPointer?.(msg);
      } else if (msg.type === "seat") {
        // Either "you are driving this character, and N other tabs are
        // asking" or "another tab has it". The overlay is the UI for both.
        onSeatRef.current?.(msg);
      }
    };

    return () => {
      for (const ref of [
        sendMoveRef,
        sendCharacterRef,
        sendDmRef,
        sendHuddleRef,
        requestHistoryRef,
        claimSeatRef,
        sendBoardRef,
        sendPointerRef,
        requestBoardRef,
      ]) {
        ref.current = () => {};
      }
      ws.close();
    };
  }, [world, officeId, chatRef, boardRef]);

  return {
    sendMoveRef,
    sendCharacterRef,
    sendDmRef,
    sendHuddleRef,
    requestHistoryRef,
    claimSeatRef,
    sendBoardRef,
    sendPointerRef,
    requestBoardRef,
  };
}
