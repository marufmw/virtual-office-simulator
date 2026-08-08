import { useCallback, useEffect, useRef, useState } from "react";
import { createWorld } from "./game/createWorld";
import { useKeyboard } from "./hooks/useKeyboard";
import { useOfficeSocket } from "./hooks/useOfficeSocket";
import { useGameLoop } from "./hooks/useGameLoop";
import { useInteraction } from "./hooks/useInteraction";
import { useIsTouch } from "./hooks/useIsTouch";
import { useTapToWalk } from "./hooks/useTapToWalk";
import { JoinForm } from "./components/JoinForm";
import { SettingsButton } from "./components/SettingsButton";
import { ContextMenu } from "./components/ContextMenu";
import { ChatPanel } from "./components/ChatPanel";
import { TouchControls } from "./components/TouchControls";
import { TopControls } from "./components/TopControls";
import { OfficeMap } from "./components/OfficeMap";
import { Whiteboard } from "./components/Whiteboard";
import { BoardPrompt } from "./components/BoardPrompt";
import { SeatClaim, SeatContested } from "./components/SeatClaim";
import { ProfileForm } from "./components/ProfileForm";

function Office({ world, joinInfo, onProfileChange }) {
  const keysRef = useKeyboard();
  const isTouch = useIsTouch();
  const stickRef = useRef({ x: 0, y: 0 });
  const joinInfoRef = useRef(joinInfo);
  joinInfoRef.current = joinInfo;

  const [chatPeerId, setChatPeerId] = useState(null);
  const [conversations, setConversations] = useState({}); // peer session id -> messages
  // The proximity group I'm currently standing in, if any: { id, members, messages }
  const [huddle, setHuddle] = useState(null);
  const [huddleOpen, setHuddleOpen] = useState(false);
  // Who is driving this character: null until the server says otherwise,
  // then { deskId, active, holder, waiting }
  const [seat, setSeat] = useState(null);
  const [pickingDesk, setPickingDesk] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Standing at the whiteboard: { near, members, elements }
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
      // Only the message that greets you at the board carries the scene;
      // the ones that follow are membership changes and say nothing about
      // what's drawn. Keeping what we already hold is the difference
      // between walking up to the board and finding it blank.
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

  const {
    sendMoveRef,
    sendProfileRef,
    sendDmRef,
    sendHuddleRef,
    requestHistoryRef,
    claimSeatRef,
    sendBoardRef,
    sendPointerRef,
    requestBoardRef,
  } = useOfficeSocket(world, joinInfoRef, chatRef, setSeat, boardRef);
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
    stickRef.current = { x: 0, y: 0 }; // don't resume mid-stride
    return () => {
      world.paused = false;
    };
  }, [world, mapOpen, boardOpen]);

  // M for map, the way most games spell it
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

  // Somebody else has this character. Nothing in the office is usable from
  // here, so the claim screen takes over the whole surface.
  if (seat && !seat.active) {
    if (pickingDesk) {
      return (
        <ProfileForm
          title="Take a desk"
          initial={{}}
          submitLabel="Walk in"
          onSubmit={onProfileChange}
          onClose={() => setPickingDesk(false)}
        />
      );
    }
    return (
      <SeatClaim
        deskId={seat.deskId}
        holder={seat.holder}
        onClaim={() => claimSeatRef.current()}
        onPickAnother={() => setPickingDesk(true)}
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
        <SettingsButton
          joinInfo={joinInfo}
          onSave={(profile) => {
            sendProfileRef.current(profile);
            onProfileChange(profile);
          }}
        />
      </TopControls>
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

function App() {
  const mountRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [joinInfo, setJoinInfo] = useState(() => {
    const deskId = localStorage.getItem("deskId");
    const name = localStorage.getItem("name");
    return deskId ? { deskId, name, character: localStorage.getItem("character") } : null;
  });

  useEffect(() => {
    const w = createWorld(mountRef.current);
    setWorld(w);
    return () => w.dispose();
  }, []);

  function handleProfileChange(profile) {
    localStorage.setItem("deskId", profile.deskId);
    localStorage.setItem("name", profile.name);
    localStorage.setItem("character", profile.character);
    setJoinInfo((prev) => ({ ...prev, ...profile }));
  }

  return (
    <>
      <div ref={mountRef} />
      {world && joinInfo && (
        <Office world={world} joinInfo={joinInfo} onProfileChange={handleProfileChange} />
      )}
      {world && !joinInfo && <JoinForm onJoin={handleProfileChange} />}
    </>
  );
}

export default App;
