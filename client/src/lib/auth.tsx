import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/api/appsScript";
import type { AuthSession } from "@/types/domain";

const STORAGE_KEY = "dmc.session.v2";

interface AuthContextValue {
  user: AuthSession | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: (credential: string) => Promise<AuthSession>;
  loginWithPin: (site: string, pin: string) => Promise<AuthSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readPersistedSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function writePersistedSession(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthSession | null>(() => readPersistedSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-synchronise localStorage à chaque changement
  useEffect(() => {
    writePersistedSession(user);
  }, [user]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await api.auth.googleLogin(credential);
      setUser(session);
      return session;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithPin = useCallback(async (site: string, pin: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await api.auth.pinLogin(site, pin);
      setUser(session);
      return session;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setError(null);
    // Désinscrit l'auto-select Google Sign-In si actif
    window.google?.accounts.id.disableAutoSelect();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, loginWithGoogle, loginWithPin, logout }),
    [user, loading, error, loginWithGoogle, loginWithPin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
