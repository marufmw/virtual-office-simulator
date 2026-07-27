import { useEffect, useRef, useState } from "react";
import { createWorld } from "./game/createWorld";
import { useKeyboard } from "./hooks/useKeyboard";
import { useOfficeSocket } from "./hooks/useOfficeSocket";
import { useGameLoop } from "./hooks/useGameLoop";
import { JoinForm } from "./components/JoinForm";

function Office({ world, joinInfo }) {
  const keysRef = useKeyboard();
  const sendMoveRef = useOfficeSocket(world, joinInfo);
  useGameLoop(world, keysRef, sendMoveRef);
  return null;
}

function App() {
  const mountRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [joinInfo, setJoinInfo] = useState(() => {
    const deskId = localStorage.getItem("deskId");
    const name = localStorage.getItem("name");
    return deskId ? { deskId, name } : null;
  });

  useEffect(() => {
    const w = createWorld(mountRef.current);
    setWorld(w);
    return () => w.dispose();
  }, []);

  function handleJoin(info) {
    localStorage.setItem("deskId", info.deskId);
    localStorage.setItem("name", info.name);
    setJoinInfo(info);
  }

  return (
    <>
      <div ref={mountRef} />
      {world && joinInfo && <Office world={world} joinInfo={joinInfo} />}
      {world && !joinInfo && <JoinForm onJoin={handleJoin} />}
    </>
  );
}

export default App;
