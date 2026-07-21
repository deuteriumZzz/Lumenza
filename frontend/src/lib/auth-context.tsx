"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, type Balance, type User } from "@/lib/api";

// Авторизация — это httpOnly cookie, поэтому вкладки не могут отследить
// вход/выход через событие `storage`, как это было можно с токеном в
// localStorage. BroadcastChannel — это эквивалент для того же origin между
// вкладками: login/register/logout отправляют в него сообщение, каждая
// открытая вкладка AuthProvider в ответ перепроверяет сессию.
const AUTH_CHANNEL_NAME = "lumenza-auth";

function broadcastAuthChange() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
  channel.postMessage("changed");
  channel.close();
}

interface AuthState {
  user: User | null;
  balance: Balance | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  setBalance: (balance: Balance) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalanceState] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);

  // Защита от ответов, приходящих не по порядку: вызов, вытесненный более
  // новым (например, кросс-табовый broadcast срабатывает пока начальная
  // загрузка ещё выполняется, или пользователь выходит и снова заходит до
  // того, как разрешится первый вызов), отбрасывает свой результат вместо
  // того, чтобы восстанавливать устаревшее состояние — тот же паттерн, что
  // и у refreshBalance ниже, только по ссылке-счётчику вместо строки
  // токена, поскольку здесь нет токена для сравнения.
  const loadSessionSeq = useRef(0);

  useEffect(() => {
    function loadSession() {
      const seq = ++loadSessionSeq.current;
      setLoading(true);
      Promise.all([api.me(), api.balance()])
        .then(([meRes, balanceRes]) => {
          if (loadSessionSeq.current !== seq) return;
          setUser(meRes);
          setBalanceState(balanceRes);
        })
        .catch((err) => {
          if (loadSessionSeq.current !== seq) return;
          // Разлогинивать здесь должна только по-настоящему недействительная/
          // отсутствующая сессия — сетевой сбой или временная 5xx не должны
          // молча выкидывать из системы того, у кого сессия совершенно
          // валидна.
          if (err instanceof ApiError && err.status === 401) {
            setUser(null);
            setBalanceState(null);
          }
        })
        .finally(() => {
          if (loadSessionSeq.current === seq) setLoading(false);
        });
    }

    loadSession();

    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channel.onmessage = () => loadSession();
    return () => channel.close();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setUser(res);
    setBalanceState(await api.balance());
    broadcastAuthChange();
  }, []);

  const register = useCallback(async (username: string, email: string, password: string, referralCode?: string) => {
    const res = await api.register(username, email, password, referralCode);
    setUser(res);
    setBalanceState(await api.balance());
    broadcastAuthChange();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Сессия на сервере уже может быть недействительна; важная для
      // пользователя часть — это очистка состояния на клиенте.
    }
    setUser(null);
    setBalanceState(null);
    broadcastAuthChange();
  }, []);

  // Защита от ответов не по порядку: если refreshBalance вызывается снова
  // (например, эффект второй страницы триггерит его) до того, как пришёл
  // ответ на первый вызов, применяться должен только ответ на ПОСЛЕДНИЙ
  // вызов — иначе более медленный ранний ответ, пришедший после более
  // быстрого позднего, перезаписал бы свежие данные баланса устаревшими.
  const refreshBalanceSeq = useRef(0);
  const refreshBalance = useCallback(async () => {
    const seq = ++refreshBalanceSeq.current;
    const res = await api.balance();
    if (refreshBalanceSeq.current === seq) setBalanceState(res);
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
