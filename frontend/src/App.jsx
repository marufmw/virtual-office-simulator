import { useCallback, useEffect, useRef, useState } from "react";
import { createWorld } from "./game/createWorld";
import { useKeyboard } from "./hooks/useKeyboard";
import { useOfficeSocket } from "./hooks/useOfficeSocket";
import { useGameLoop } from "./hooks/useGameLoop";
import { useInteraction } from "./hooks/useInteraction";
import { JoinForm } from "./components/JoinForm";
import { SettingsButton } from "./components/SettingsButton";
import { ContextMenu } from "./components/ContextMenu";
import { ChatPanel } from "./components/ChatPanel";

function Office({ world, joinInfo, onProfileChange }) {
  const keysRef = useKeyboard();
  const joinInfoRef = useRef(joinInfo);
  joinInfoRef.current = joinInfo;

  const [chatPeerId, setChatPeerId] = useState(null);
  const [conversations, setConversations] = useState({}); // peer session id -> messages

  const appendMessage = useCallback((peerId, message) => {
    setConversations((prev) => ({ ...prev, [peerId]: [...(prev[peerId] ?? []), message] }));
    // An incoming message from someone we're not chatting with yet opens the chat
    if (!message.mine) setChatPeerId((current) => current ?? peerId);
  }, []);

  const chatRef = useRef(null);
  chatRef.current = {
    onMessage: appendMessage,
    onHistory: (peerId, messages) =>
      setConversations((prev) => ({ ...prev, [peerId]: messages })),
  };

  const { sendMoveRef, sendProfileRef, sendDmRef, requestHistoryRef } = useOfficeSocket(
    world,
    joinInfoRef,
    chatRef
  );
  useGameLoop(world, keysRef, sendMoveRef);

  const openChat = useCallback(
    (peerId) => {
      setChatPeerId(peerId);
      requestHistoryRef.current(peerId); // pull the stored history for this pair
    },
    [requestHistoryRef]
  );
  const nearbyId = useInteraction(world, openChat);

  return (
    <>
      <SettingsButton
        joinInfo={joinInfo}
        onSave={(profile) => {
          sendProfileRef.current(profile);
          onProfileChange(profile);
        }}
      />
      <ContextMenu
        onGoToDesk={() => {
          world.walkTo(world.deskStandPosition(world.myDeskId));
        }}
      />
      {nearbyId !== null && chatPeerId === null && (
        <p className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-2 text-sm text-slate-200 shadow-lg">
          Press <kbd className="font-semibold text-sky-400">E</kbd> or click the bubble to chat
        </p>
      )}
      {chatPeerId !== null && (
        <ChatPanel
          peerName={world.players.get(chatPeerId)?.name ?? "Someone"}
          messages={conversations[chatPeerId] ?? []}
          disabled={nearbyId !== chatPeerId}
          onSend={(text) => sendDmRef.current(chatPeerId, text)}
          onClose={() => setChatPeerId(null)}
        />
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
