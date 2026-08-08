import { useCallback, useEffect, useRef, useState } from "react";
import { createWorld } from "./game/createWorld";
import { useSession } from "./hooks/useSession";
import { SignIn } from "./components/SignIn";
import { OfficePicker } from "./components/OfficePicker";
import { OfficeAdmin } from "./components/OfficeAdmin";
import { Office } from "./components/Office";

/**
 * Three screens, in order: sign in, pick an office, walk into it. Which one
 * you see is decided entirely by what the server says — a stored session
 * that has expired lands back on the first.
 */
function App() {
  const mountRef = useRef(null);
  const [world, setWorld] = useState(null);
  const { status, user, config, signIn, signOut } = useSession();

  // The office being entered, and whether we're editing it rather than
  // standing in it. Where Done goes depends on where Manage was opened
  // from: the picker, or the office floor itself.
  const [office, setOffice] = useState(null);
  const [managing, setManaging] = useState(null); // null | "picker" | "office"
  // Why we were put back on the picker, when it wasn't our idea
  const [notice, setNotice] = useState(null);

  // The 3D office is only built while somebody is in one: it holds a WebGL
  // context and an animation loop, neither of which the picker needs
  useEffect(() => {
    if (!office || managing) return;
    const built = createWorld(mountRef.current);
    setWorld(built);
    return () => {
      built.dispose();
      setWorld(null);
    };
  }, [office, managing]);

  const leave = useCallback((why = null) => {
    setOffice(null);
    setManaging(null);
    setNotice(typeof why === "string" ? why : null);
  }, []);

  const enter = useCallback((chosen) => {
    setNotice(null);
    setManaging(null);
    setOffice(chosen);
  }, []);

  const manage = useCallback((chosen) => {
    setNotice(null);
    setOffice(chosen);
    setManaging("picker");
  }, []);

  return (
    <>
      <div ref={mountRef} />

      {status === "loading" && <Splash />}

      {status === "out" && (
        <SignIn config={config} onSignedIn={(token, signedIn) => signIn(token, signedIn)} />
      )}

      {status === "in" && !office && (
        <OfficePicker
          user={user}
          notice={notice}
          onEnter={enter}
          onManage={manage}
          onSignOut={() => {
            leave();
            signOut();
          }}
        />
      )}

      {status === "in" && office && managing && (
        <OfficeAdmin
          officeId={office.id}
          me={user.email}
          // Manage opened from the floor goes back to it; from the picker,
          // back to the picker — where the seat you just gave yourself is
          // read afresh
          onClose={() => (managing === "office" ? setManaging(null) : leave())}
        />
      )}

      {status === "in" && office && !managing && world && (
        <Office
          world={world}
          office={office}
          user={user}
          onManage={() => setManaging("office")}
          onLeave={leave}
        />
      )}
    </>
  );
}

function Splash() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink">
      <p className="code text-xs text-muted">unlocking the door…</p>
    </div>
  );
}

export default App;
