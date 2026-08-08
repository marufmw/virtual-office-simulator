import { useCallback, useEffect, useRef, useState } from "react";
import { DoorOpen, Settings2, Shirt } from "lucide-react";
import { useKeyboard } from "../hooks/useKeyboard";
import { useOfficeSocket } from "../hooks/useOfficeSocket";
import { useGameLoop } from "../hooks/useGameLoop";
import { useInteraction } from "../hooks/useInteraction";
import { useIsTouch } from "../hooks/useIsTouch";
import { useTapToWalk } from "../hooks/useTapToWalk";
import { ContextMenu } from "./ContextMenu";
import { ChatPanel } from "./ChatPanel";
import { TouchControls } from "./TouchControls";
import { TopControls, TopButton } from "./TopControls";
import { OfficeMap } from "./OfficeMap";
import { Whiteboard } from "./Whiteboard";
import { BoardPrompt } from "./BoardPrompt";
import { SeatClaim, SeatContested } from "./SeatClaim";
import { CharacterPicker } from "./CharacterPicker";
import { SoundButton } from "./SoundButton";
import { duckMusic } from "../audio/audioBus";
import { startMusic, stopMusic } from "../audio/music";
import { sfx } from "../audio/sfx";

/** Why we were shown the door, in words for the person it happened to. */
const REFUSALS = {
  no_seat: "Nobody has given you a desk in that office yet.",
  seat_removed: "Your desk was removed, so there was nowhere to stand.",
  seat_reassigned: "Your desk was given to somebody else.",
  seat_moved: "You were moved to another desk — walk back in to take it.",
  removed: "You were taken off that office's member list.",
  office_closed: "That office was closed.",
  not_a_member: "You're not a member of that office.",
  signed_out: "Your session has expired. Sign in again.",
};

/**
 * Being in an office: walking around it, talking to whoever is nearby, and
 * drawing on the whiteboard. Everything here runs over the one socket the
 * office is entered on.
 */
export function Office({ world, office, user, onManage, onLeave }) {
  const keysRef = useKeyboard();
  const isTouch = useIsTouch();
  const stickRef = useRef({ x: 0, y: 0 });

  const [me, setMe] = useState(null); // who the server says we are, once in
  const [chatPeerId, setChatPeerId] = useState(null);
  const [conversations, setConversations] = useState({}); // peer session id -> messages
  // The proximity group I'm standing in, if any: { id, members, messages }
  const [huddle, setHuddle] = useState(null);
  const [huddleOpen, setHuddleOpen] = useState(false);
  // Whether this window is the one driving the character: { deskId, active, waiting }
  const [seat, setSeat] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [dressing, setDressing] = useState(false);
  // Standing at the whiteboard: { members, elements }
  const [board, setBoard] = useState(null);
  const [boardOpen, setBoardOpen] = useState(false);

  const appendMessage = useCallback((peerId, message) => {
    setConversations((prev) => ({ ...prev, [peerId]: [...(prev[peerId] ?? []), message] }));
    // An incoming message from someone we're not chatting with yet opens the chat
    if (!message.mine) setChatPeerId((current) => current ?? peerId);
  }, []);

  // The server recomputed proximity groups: I joined one, left one, or the
  // people around me changed. A huddle takes over from any open one-on-one.
  const onHuddle = useCallback((next) => {
    setHuddle(next);
    if (!next) {
      setHuddleOpen(false);
      return;
    }
    setChatPeerId((peerId) => {
      if (peerId !== null) setHuddleOpen(true);
      return null;
    });
  }, []);

  const onHuddleMessage = useCallback((huddleId, message) => {
    setHuddle((current) =>
      current && current.id === huddleId
        ? { ...current, messages: [...current.messages, message] }
        : current
    );
    if (!message.mine) setHuddleOpen(true);
  }, []);

  // The open whiteboard registers its own handlers here; `onBoard` is ours
  const boardHandlersRef = useRef(null);
  const boardRef = useRef(null);
  boardRef.current = {
    onBoard: (msg) => {
      // Only the messages that carry a scene replace what we hold; the
      // others are membership changes and say nothing about what's drawn
      setBoard((current) =>
        msg.near
          ? { members: msg.members, elements: msg.elements ?? current?.elements ?? [] }
          : null
      );
      if (!msg.near) setBoardOpen(false);
    },
    applyRemote: (elements) => boardHandlersRef.current?.applyRemote?.(elements),
    applyPointer: (payload) => boardHandlersRef.current?.applyPointer?.(payload),
  };

  const chatRef = useRef(null);
  chatRef.current = {
    onMessage: appendMessage,
    onHistory: (peerId, messages) =>
      setConversations((prev) => ({ ...prev, [peerId]: messages })),
    onHuddle,
    onHuddleMessage,
  };

  const onSeat = useCallback((msg) => {
    if (msg.type === "ready") {
      setMe(msg.me);
      return;
    }
    setSeat(msg);
  }, []);

  const onRefused = useCallback(
    (reason) => onLeave(REFUSALS[reason] ?? "That office is no longer open to you."),
    [onLeave]
  );

  const {
    sendMoveRef,
    sendCharacterRef,
    sendDmRef,
    sendHuddleRef,
    requestHistoryRef,
    claimSeatRef,
    sendBoardRef,
    sendPointerRef,
    requestBoardRef,
  } = useOfficeSocket(world, office.id, { chatRef, boardRef, onSeat, onRefused });

  useGameLoop(world, keysRef, sendMoveRef, stickRef);

  // Opening the board pulls the scene fresh. What we were handed on walking
  // up has been sitting in state ever since — through everything drawn on it
  // since, our own strokes included — so reopening it would otherwise put
  // the board back as it was when we arrived.
  const openBoard = useCallback(() => {
    requestBoardRef.current();
    setBoardOpen(true);
  }, [requestBoardRef]);

  const atBoardRef = useRef(false);
  useTapToWalk(world, () => {
    if (!atBoardRef.current) return false; // too far: walk over instead
    openBoard();
    return true;
  });

  // Interacting opens the huddle when I'm standing in a group, since that's
  // the conversation everyone around me is already having
  const openChat = useCallback(
    (peerId) => {
      if (huddle) {
        setHuddleOpen(true);
        return;
      }
      setChatPeerId(peerId);
      requestHistoryRef.current(peerId); // pull the stored history for this pair
    },
    [huddle, requestHistoryRef]
  );
  const nearbyId = useInteraction(world, openChat);
  const goToDesk = useCallback(() => {
    world.walkTo(world.deskStandPosition(world.myDeskId));
  }, [world]);

  // The map and the whiteboard cover the office completely. Rendering it
  // underneath them costs a full WebGL frame every tick and buys nothing —
  // and on the whiteboard it is exactly what makes drawing feel sticky.
  useEffect(() => {
    world.paused = mapOpen || boardOpen;
    return () => {
      world.paused = false;
    };
  }, [world, mapOpen, boardOpen]);

  // The office has a backing track while you're standing in it, and not a
  // moment longer — the picker and the editor stay quiet
  useEffect(() => {
    startMusic();
    return stopMusic;
  }, []);

  // Nobody wants a soundtrack while they're drawing, but cutting it dead is
  // worse than turning it down
  useEffect(() => {
    duckMusic(boardOpen);
    return () => duckMusic(false);
  }, [boardOpen]);

  // Someone walked close enough to talk to
  useEffect(() => {
    if (nearbyId !== null) sfx.nearby();
  }, [nearbyId]);

  // Panels opening and closing, so the UI answers back
  useEffect(() => {
    if (mapOpen || boardOpen || dressing) sfx.open();
  }, [mapOpen, boardOpen, dressing]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "m") return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
      setMapOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chatIsOpen = huddleOpen || chatPeerId !== null;
  // Walking off mid-stroke closes the board, which is the honest thing:
  // you can't draw on something you're no longer standing at
  const atBoard = board !== null;
  atBoardRef.current = atBoard;

  // Another window of ours has the character. Nothing in the office is
  // usable from here, so this takes over the whole surface.
  if (seat && !seat.active) {
    return (
      <SeatClaim
        deskCode={me?.deskCode ?? "Your desk"}
        onClaim={() => claimSeatRef.current()}
        onLeave={() => onLeave()}
      />
    );
  }

  return (
    <>
      {seat?.active && seat.waiting > 0 && <SeatContested waiting={seat.waiting} />}

      <TopControls
        onOpenMap={() => setMapOpen(true)}
        onGoToDesk={goToDesk}
        showGoToDesk={isTouch}
      >
        <SoundButton />
        <TopButton onClick={() => setDressing(true)} label="Change character">
          <Shirt size={20} />
        </TopButton>
        {me?.role === "admin" && (
          <TopButton onClick={onManage} label="Layout and members">
            <Settings2 size={20} />
          </TopButton>
        )}
        <TopButton onClick={() => onLeave()} label="Leave the office">
          <DoorOpen size={20} />
        </TopButton>
      </TopControls>

      {/* Who and where you are, quietly, in the corner the buttons aren't in */}
      <div
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        className="pointer-events-none absolute left-3 z-10 sm:left-4"
      >
        <p className="font-display text-sm font-bold leading-tight text-paper/90">{office.name}</p>
        <p className="code text-[10px] uppercase tracking-wider text-muted">
          {user.name} · {me?.deskCode ?? "…"}
        </p>
      </div>

      {dressing && (
        <CharacterPicker
          current={world.players.get(world.myId)?.character}
          onPick={(character) => {
            sendCharacterRef.current(character);
            setDressing(false);
          }}
          onClose={() => setDressing(false)}
        />
      )}

      {mapOpen && (
        <OfficeMap
          world={world}
          onWalkTo={(goal) => world.walkTo(goal)}
          onClose={() => setMapOpen(false)}
        />
      )}

      {atBoard && boardOpen && (
        <Whiteboard
          initialElements={board.elements}
          members={board.members}
          handlersRef={boardHandlersRef}
          onBroadcast={(elements) => sendBoardRef.current(elements)}
          onPointer={(payload) => sendPointerRef.current(payload)}
          onClose={() => setBoardOpen(false)}
        />
      )}

      {/* Standing at the board but not drawing on it yet. The prompt rides
          on the board itself; the board is clickable too. */}
      {atBoard && !boardOpen && !chatIsOpen && (
        <BoardPrompt world={world} count={board.members.length} onOpen={openBoard} />
      )}

      {/* A long press would fire this at an arbitrary spot; on touch the
          same action is a button in the thumb cluster instead */}
      {!isTouch && <ContextMenu onGoToDesk={goToDesk} />}
      {isTouch && (
        <TouchControls
          stickRef={stickRef}
          canInteract={nearbyId !== null && !chatIsOpen}
          interactLabel={huddle ? "Join the huddle" : "Chat"}
          onInteract={() => nearbyId !== null && openChat(nearbyId)}
        />
      )}

      {/* On a phone the prompt sits above the thumb controls, and there is
          no E to press — the bubble and the chat button are the way in */}
      {nearbyId !== null && !chatIsOpen && !isTouch && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-2 text-sm text-slate-200 shadow-lg">
          Press <kbd className="font-semibold text-sky-400">E</kbd> or click the bubble to{" "}
          {huddle ? `join the huddle · ${huddle.members.length} people` : "chat"}
        </p>
      )}
      {nearbyId !== null && !chatIsOpen && isTouch && huddle && (
        <p className="pointer-events-none absolute bottom-44 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-2 text-xs text-slate-200 shadow-lg">
          Huddle · {huddle.members.length} people
        </p>
      )}

      {huddle && huddleOpen ? (
        <ChatPanel
          title={`Huddle · ${huddle.members.length} people`}
          subtitle={huddle.members.map((m) => m.name).join(", ")}
          emptyHint="Everyone standing here can read this."
          messages={huddle.messages}
          onSend={(text) => sendHuddleRef.current(text)}
          onClose={() => setHuddleOpen(false)}
          isTouch={isTouch}
        />
      ) : (
        chatPeerId !== null && (
          <ChatPanel
            title={world.players.get(chatPeerId)?.name ?? "Someone"}
            emptyHint={`Say hello to ${world.players.get(chatPeerId)?.name ?? "them"}.`}
            messages={conversations[chatPeerId] ?? []}
            disabled={nearbyId !== chatPeerId}
            onSend={(text) => sendDmRef.current(chatPeerId, text)}
            onClose={() => setChatPeerId(null)}
            isTouch={isTouch}
          />
        )
      )}
    </>
  );
}
