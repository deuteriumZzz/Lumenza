"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { TelegramAuthSection } from "@/components/telegram-auth-section";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type ReferralStats, type Subscription } from "@/lib/api";

const PRESETS = ["50", "100", "500"];
const RUB_PRESETS = ["100", "300", "1000"];

export default function PricingPage() {
  return (
    <RequireAuth>
      <Pricing />
    </RequireAuth>
  );
}

function Pricing() {
  const { user, balance, setBalance } = useAuth();
  const [amount, setAmount] = useState(PRESETS[1]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "unavailable" | "error"; message: string } | null>(
    null
  );

  const [rubAmount, setRubAmount] = useState(RUB_PRESETS[1]);
  const [payingWithCard, setPayingWithCard] = useState(false);
  const [cardNotice, setCardNotice] = useState<{ kind: "unavailable" | "error"; message: string } | null>(
    null
  );

  const [subscription, setSubscription] = useState<Subscription | null | undefined>(undefined);
  const [subActionPending, setSubActionPending] = useState(false);
  const [subNotice, setSubNotice] = useState<{ kind: "unavailable" | "error"; message: string } | null>(null);

  useEffect(() => {
    api.subscriptionStatus().then(setSubscription, () => setSubscription(null));
  }, []);

  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.referralStats().then(setReferralStats).catch(() => {});
  }, []);

  async function copyReferralLink() {
    if (!referralStats) return;
    await navigator.clipboard.writeText(referralStats.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function subscribe() {
    setSubActionPending(true);
    setSubNotice(null);
    try {
      const payment = await api.subscribe();
      // Тот же поток редиректа в YooKassa и возврата на /billing, что и у
      // разового пополнения — вебхук активирует подписку после успешной
      // оплаты, так что при возврате эта страница покажет новый статус.
      window.location.href = payment.confirmation_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setSubNotice({ kind: "unavailable", message: "Подписки не настроены в этом окружении." });
      } else {
        setSubNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Не удалось оформить подписку." });
      }
      setSubActionPending(false);
    }
  }

  async function cancel() {
    setSubActionPending(true);
    setSubNotice(null);
    try {
      await api.unsubscribe();
      setSubscription((prev) => (prev ? { ...prev, status: "canceled" } : prev));
    } catch (err) {
      setSubNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Не удалось отменить подписку." });
    } finally {
      setSubActionPending(false);
    }
  }

  async function topUp() {
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await api.sandboxTopup(amount);
      setBalance(res);
      setNotice({ kind: "success", message: `Начислено ${amount} кредитов.` });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotice({
          kind: "unavailable",
          message: "Реальные платежи ещё не подключены в этом окружении — тестовое пополнение отключено.",
        });
      } else {
        setNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Пополнение не удалось." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function payWithCard() {
    setPayingWithCard(true);
    setCardNotice(null);
    try {
      const payment = await api.topup(rubAmount);
      // Страница подтверждения YooKassa находится на их домене —
      // пользователь платит там и по завершении отправляется обратно на
      // PUBLIC_BASE_URL/billing (эту страницу), к этому моменту вебхук уже
      // зачислил (или вот-вот зачислит) средства на счёт.
      window.location.href = payment.confirmation_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setCardNotice({ kind: "unavailable", message: "Оплата картой не настроена в этом окружении." });
      } else {
        setCardNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Не удалось начать оплату." });
      }
      setPayingWithCard(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Оплата</h1>
      <p className="mt-1 text-sm text-muted">Текущий баланс и пополнение.</p>

      <div className="mt-8 rounded-md border border-border bg-surface p-6">
        <div className="text-xs uppercase tracking-wide text-muted">Баланс</div>
        <div className="mt-1 font-mono text-3xl tabular-nums text-ink">
          {balance ? Number(balance.balance).toFixed(2) : "—"}
          <span className="ml-2 text-base font-sans text-muted">кредитов</span>
        </div>
        <p className="mt-3 text-xs text-muted">
          Кредиты работают во всём пространстве: чат, поиск, изображения, голос и документы.
          Итоговая стоимость видна рядом с каждым результатом.
        </p>
      </div>

      <div className="mt-8 rounded-md border border-border bg-surface p-6">
        <div className="text-sm font-medium text-ink">Подписка Pro</div>
        <p className="mt-1 text-xs text-muted">
          Все возможности доступны сразу. Pro открывает premium-модели и
          приоритетные маршруты. 990₽/месяц, отмена в любой момент.
        </p>

        {subscription === undefined ? (
          <p className="mt-4 text-xs text-muted">Загрузка…</p>
        ) : subscription && (subscription.status === "active" || subscription.status === "non_renewing") ? (
          <div className="mt-4">
            <p className="text-sm text-ink">
              {subscription.status === "active"
                ? `Активна — продлится ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : `Активна до ${new Date(subscription.current_period_end).toLocaleDateString()} — автопродление отключено`}
            </p>
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={subActionPending}
              className="btn-secondary mt-3"
            >
              {subActionPending ? "Отменяем…" : "Отменить подписку"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void subscribe()}
            disabled={subActionPending}
            className="btn-primary mt-4 w-full"
          >
            {subActionPending ? "Переходим…" : "Оформить Pro"}
          </button>
        )}

        {subNotice && (
          <p role="status" className={`mt-3 text-sm ${subNotice.kind === "unavailable" ? "text-muted" : "text-danger"}`}>
            {subNotice.message}
          </p>
        )}
      </div>

      <div className="mt-8 rounded-md border border-border bg-surface p-6">
        <div className="text-sm font-medium text-ink">Аккаунт Telegram</div>
        {user?.telegram_linked ? (
          <p className="mt-3 text-sm text-success">✓ Привязан — баланс и история общие с ботом.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              Привяжите Telegram, чтобы использовать тот же баланс и историю в боте, что и на сайте.
            </p>
            <div className="mt-4">
              <TelegramAuthSection label="Привязать Telegram" />
            </div>
          </>
        )}
      </div>

      {referralStats && (
        <div className="mt-8 rounded-md border border-border bg-surface p-6">
          <div className="text-sm font-medium text-ink">Пригласить друзей</div>
          <p className="mt-1 text-xs text-muted">
            Вы оба получите {Number(referralStats.reward_credits).toFixed(0)} кредитов, как только они попробуют Lumenza.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              readOnly
              value={referralStats.referral_link}
              aria-label="Реферальная ссылка"
              className="input flex-1 text-xs"
              onFocus={(event) => event.target.select()}
            />
            <button type="button" onClick={() => void copyReferralLink()} className="btn-secondary">
              {copied ? "Скопировано!" : "Копировать"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Приглашено: {referralStats.referred_count} · Награждено: {referralStats.rewarded_count}
          </p>
        </div>
      )}

      <div className="mt-8">
        <div className="text-sm font-medium text-ink">Пополнение (тест)</div>
        <p className="mt-1 text-xs text-muted">Тестовое пополнение для проверки — без реального платежа.</p>

        <div role="group" aria-label="Сумма пополнения" className="mt-4 flex items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={amount === preset}
              onClick={() => setAmount(preset)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors duration-150 ${
                amount === preset
                  ? "border-primary bg-primary/10 text-ink"
                  : "border-border bg-surface text-muted hover:text-ink"
              }`}
            >
              +{preset}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void topUp()}
          disabled={submitting}
          className="btn-primary mt-4 w-full"
        >
          {submitting ? "Начисляем…" : `Начислить ${amount} кредитов (тест)`}
        </button>

        {notice && (
          <p
            role="status"
            className={`mt-3 text-sm ${
              notice.kind === "success"
                ? "text-success"
                : notice.kind === "unavailable"
                  ? "text-muted"
                  : "text-danger"
            }`}
          >
            {notice.message}
          </p>
        )}
      </div>

      <div className="mt-8 border-t border-border pt-8">
        <div className="text-sm font-medium text-ink">Оплата картой</div>
        <p className="mt-1 text-xs text-muted">Реальный платёж через ЮKassa — переход на их страницу оплаты.</p>

        <div role="group" aria-label="Сумма пополнения (₽)" className="mt-4 flex items-center gap-2">
          {RUB_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={rubAmount === preset}
              onClick={() => setRubAmount(preset)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors duration-150 ${
                rubAmount === preset
                  ? "border-primary bg-primary/10 text-ink"
                  : "border-border bg-surface text-muted hover:text-ink"
              }`}
            >
              {preset}₽
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void payWithCard()}
          disabled={payingWithCard}
          className="btn-primary mt-4 w-full"
        >
          {payingWithCard ? "Переходим…" : `Оплатить ${rubAmount}₽`}
        </button>

        {cardNotice && (
          <p
            role="status"
            className={`mt-3 text-sm ${cardNotice.kind === "unavailable" ? "text-muted" : "text-danger"}`}
          >
            {cardNotice.message}
          </p>
        )}
      </div>
    </div>
  );
}
