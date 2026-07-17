"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, clearToken, getToken, setToken, TOKEN_STORAGE_KEY, type Balance, type User } from "@/lib/api";

interface AuthState {
  user: User | null;
  balance: Balance | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  setBalance: (balance: Balance) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalanceState] = useState<Balance | null>(null);
  // No token means nothing to verify, so start as "not loading" — avoids a
  // synchronous setState in the effect below for that branch.
  const [loading, setLoading] = useState(() => getToken() !== null);

  useEffect(() => {
    // Re-runs on mount and whenever another tab changes the stored token
    // (sign-in/sign-out there should be reflected here too). `token` is
    // captured per-invocation so a response that lands after the token has
    // since changed again (e.g. user signs out mid-request, or signs into a
    // different account before this resolves) is discarded instead of
    // resurrecting a stale session.
    function loadSession() {
      const token = getToken();
      if (!token) {
        setUser(null);
        setBalanceState(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      Promise.all([api.me(), api.balance()])
        .then(([meRes, balanceRes]) => {
          if (getToken() !== token) return;
          setUser(meRes);
          setBalanceState(balanceRes);
        })
        .catch((err) => {
          if (getToken() !== token) return;
          // Only an actually-invalid token should sign the user out here —
          // a network blip or a transient 5xx shouldn't silently log out
          // someone holding a perfectly valid token.
          if (err instanceof ApiError && err.status === 401) {
            clearToken();
            setUser(null);
            setBalanceState(null);
          }
        })
        .finally(() => {
          if (getToken() === token) setLoading(false);
        });
    }

    loadSession();

    function onStorage(event: StorageEvent) {
      if (event.key === TOKEN_STORAGE_KEY) loadSession();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res);
    setBalanceState(await api.balance());
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.register(username, email, password);
    setToken(res.token);
    setUser(res);
    setBalanceState(await api.balance());
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Token may already be invalid server-side; clearing client state is
      // the part that matters for the user.
    }
    clearToken();
    setUser(null);
    setBalanceState(null);
  }, []);

  const refreshBalance = useCallback(async () => {
    setBalanceState(await api.balance());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        balance,
        loading,
        login,
        register,
        logout,
        refreshBalance,
        setBalance: setBalanceState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
