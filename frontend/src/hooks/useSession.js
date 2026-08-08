import { useCallback, useEffect, useState } from "react";
import { api, setToken } from "../api/client";

/**
 * Who is signed in, and how signing in works here.
 *
 * `status` is "loading" until the stored token has been checked with the
 * server — a token that has expired or been signed out elsewhere looks
 * exactly like a valid one until it is used.
 */
export function useSession() {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null); // { googleClientId, devSignIn }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [session, authConfig] = await Promise.all([api.session(), api.authConfig()]);
      if (cancelled) return;

      if (authConfig.ok) setConfig(authConfig.data);
      if (session.ok) {
        setUser(session.data.user);
        setStatus("in");
      } else {
        setToken(null); // whatever we were holding is no good
        setStatus("out");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((token, signedIn) => {
    setToken(token);
    setUser(signedIn);
    setStatus("in");
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus("out");
  }, []);

  return { status, user, config, signIn, signOut };
}
