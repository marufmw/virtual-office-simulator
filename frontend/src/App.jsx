import { useEffect, useRef, useState } from "react";
import { createWorld } from "./game/createWorld";
import { useKeyboard } from "./hooks/useKeyboard";
import { useOfficeSocket } from "./hooks/useOfficeSocket";
import { useGameLoop } from "./hooks/useGameLoop";
import { JoinForm } from "./components/JoinForm";
import { SettingsButton } from "./components/SettingsButton";
import { ContextMenu } from "./components/ContextMenu";

function Office({ world, joinInfo, onProfileChange }) {
  const keysRef = useKeyboard();
  const joinInfoRef = useRef(joinInfo);
  joinInfoRef.current = joinInfo;
  const { sendMoveRef, sendProfileRef } = useOfficeSocket(world, joinInfoRef);
  useGameLoop(world, keysRef, sendMoveRef);

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
          world.moveTarget = world.deskStandPosition(world.myDeskId);
        }}
      />
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
