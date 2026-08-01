"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, type Balance, type TelegramWidgetPayload, type User } from "@/lib/api";
import { useTelegramWebApp } from "@/components/telegram-webapp-provider";

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

// Внутри Telegram Mini App нет формы логина — Telegram сам передаёт
// подписанные данные пользователя через WebApp.initData. Если это
// значение есть, обмениваем его на сессию ДО обычной проверки me()/
// balance() — иначе оба запроса стартуют параллельно и me() может
// успеть 401-нуться и разлогинить раньше, чем обмен initData успеет
// поднять cookie (гонка, а не просто медленный первый рендер).
export function getTelegramWebAppInitData(): string | null {
  if (typeof window === "undefined") return null;
  const telegram = (
    window as unknown as { Telegram?: { WebApp?: { initData?: string } } }
  ).Telegram;
  return telegram?.WebApp?.initData || null;
}

interface AuthState {
  user: User | null;
  balance: Balance | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, referralCode?: string) => Promise<void>;
  // Один и тот же вызов backend'а обслуживает и вход/регистрацию анонима
  // через Telegram, и привязку Telegram к уже залогиненной сессии — см.
  // accounts.views.telegram_auth. Здесь достаточно одного метода: он
  // просто перечитывает пользователя/баланс после ответа в обоих случаях.
  authenticateWithTelegram: (
    source: "widget" | "webapp",
    payload: TelegramWidgetPayload | string
  ) => Promise<void>;
  // True right after Telegram WebApp auto-login created a BRAND NEW
  // account (not an existing telegram_id it recognized) — the signal the
  // Mini App uses to offer "sign in to link an existing site account"
  // instead of silently stranding the user on a fresh, empty one.
  telegramJustCreated: boolean;
  dismissTelegramJustCreated: () => void;
  linkTelegramToExistingAccount: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  setBalance: (balance: Balance) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const telegram = useTelegramWebApp();
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalanceState] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramJustCreated, setTelegramJustCreated] = useState(false);

  // Защита от ответов, приходящих не по порядку: вызов, вытесненный более
  // новым (например, кросс-табовый broadcast срабатывает пока начальная
  // загрузка ещё выполняется, или пользователь выходит и снова заходит до
  // того, как разрешится первый вызов), отбрасывает свой результат вместо
  // того, чтобы восстанавливать устаревшее состояние — тот же паттерн, что
  // и у refreshBalance ниже, только по ссылке-счётчику вместо строки
  // токена, поскольку здесь нет токена для сравнения.
  const loadSessionSeq = useRef(0);

  useEffect(() => {
    if (!telegram.ready) return;

    function loadSession() {
      const seq = ++loadSessionSeq.current;
      setLoading(true);
      const initData = telegram.initData;
      const bootstrap = initData
        ? api.telegramAuth("webapp", initData).then(
            (res) => {
              if (loadSessionSeq.current === seq) setTelegramJustCreated(res.created);
            },
            () => undefined
          )
        : Promise.resolve(undefined);

      bootstrap
        .then(() => Promise.all([api.me(), api.balance()]))
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
          } else if (process.env.NODE_ENV === "development") {
            console.error("[auth] session bootstrap failed", err);
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
  }, [telegram.ready, telegram.initData]);

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

  const authenticateWithTelegram = useCallback(
    async (source: "widget" | "webapp", payload: TelegramWidgetPayload | string) => {
      const res = await api.telegramAuth(source, payload);
      setUser(res);
      setBalanceState(await api.balance());
      broadcastAuthChange();
    },
    []
  );

  const dismissTelegramJustCreated = useCallback(() => {
    setTelegramJustCreated(false);
  }, []);

  const linkTelegramToExistingAccount = useCallback(
    async (username: string, password: string) => {
      // Сначала обычный логин в существующий аккаунт — это меняет
      // текущую сессию на него. Затем повторно шлём тот же initData:
      // backend видит уже аутентифицированный запрос и привязывает
      // telegram_id к ЭТОМУ (сайтовому) аккаунту, а не создаёт ещё один
      // (см. accounts.views.telegram_auth — ветка is_authenticated).
      await login(username, password);
      const initData = telegram.initData;
      if (initData) {
        await api.telegramAuth("webapp", initData);
      }
      setTelegramJustCreated(false);
    },
    [login, telegram.initData]
  );

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
        authenticateWithTelegram,
        telegramJustCreated,
        dismissTelegramJustCreated,
        linkTelegramToExistingAccount,
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
