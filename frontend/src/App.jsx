import { useEffect, useRef, useState } from "react";
import { createWorld } from "./game/createWorld";
import { useKeyboard } from "./hooks/useKeyboard";
import { useOfficeSocket } from "./hooks/useOfficeSocket";
import { useGameLoop } from "./hooks/useGameLoop";

function Office({ world }) {
  const keysRef = useKeyboard();
  const sendMoveRef = useOfficeSocket(world);
  useGameLoop(world, keysRef, sendMoveRef);
  return null;
}

function App() {
  const mountRef = useRef(null);
  const [world, setWorld] = useState(null);

  useEffect(() => {
    const w = createWorld(mountRef.current);
    setWorld(w);
    return () => w.dispose();
  }, []);

  return (
    <>
      <div ref={mountRef} />
      {world && <Office world={world} />}
    </>
  );
}

export default App;
