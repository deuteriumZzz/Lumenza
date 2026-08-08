"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { TelegramAuthSection } from "@/components/telegram-auth-section";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type ReferralStats, type Subscription } from "@/lib/api";

const PRESETS = ["50", "100", "500"];
const RUB_PRESETS = ["100", "300", "1000"];

const creditsFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeCreditsFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});
const subscriptionDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

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

  const presetClass = (selected: boolean) =>
    `min-w-16 rounded-lg border px-3 py-2 font-mono text-sm tabular-nums transition-[border-color,background-color,color,transform] duration-200 active:translate-y-px ${
      selected
        ? "border-primary/60 bg-primary/12 text-ink"
        : "border-border/80 bg-bg/30 text-muted hover:border-primary/35 hover:text-ink"
    }`;

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <header
        data-testid="workspace-page-header"
        className="flex flex-col gap-6 border-b border-border/70 pb-8 md:flex-row md:items-end md:justify-between"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Аккаунт и план</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">Оплата</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Управляйте планом, пополняйте общий баланс и следите за тем, как кредиты
            работают во всём пространстве Lumenza.
          </p>
        </div>
        <p className="max-w-56 text-xs leading-5 text-muted md:text-right">
          Итоговая стоимость всегда отображается рядом с результатом.
        </p>
      </header>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-label="Подписка Pro"
            className="relative overflow-hidden rounded-2xl border border-primary/25 bg-surface/70 p-6 sm:p-8"
          >
            <div aria-hidden="true" className="absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative grid gap-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="max-w-xl">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">План Lumenza</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Подписка Pro</h2>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Premium-модели, приоритетные маршруты и полный набор возможностей.
                  990₽ в месяц, отменить можно в любой момент.
                </p>
              </div>
              <div className="min-w-48 md:text-right">
                <p className="font-mono text-2xl tabular-nums text-ink">990 ₽</p>
                <p className="mt-1 text-xs text-muted">за месяц</p>
              </div>
            </div>

            <div className="relative mt-7 border-t border-border/60 pt-5">
              {subscription === undefined ? (
                <p role="status" className="text-xs text-muted">Загрузка статуса…</p>
              ) : subscription && (subscription.status === "active" || subscription.status === "non_renewing") ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-ink">
                    {subscription.status === "active"
                      ? `Активна — продлится ${subscriptionDateFormatter.format(new Date(subscription.current_period_end))}`
                      : `Активна до ${subscriptionDateFormatter.format(new Date(subscription.current_period_end))} — автопродление отключено`}
                  </p>
                  <button type="button" onClick={() => void cancel()} disabled={subActionPending} className="btn-secondary shrink-0">
                    {subActionPending ? "Отменяем…" : "Отменить подписку"}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void subscribe()} disabled={subActionPending} className="btn-primary">
                  {subActionPending ? "Переходим…" : "Оформить Pro"}
                </button>
              )}
              {subNotice && (
                <p role="status" className={`mt-3 text-sm ${subNotice.kind === "unavailable" ? "text-muted" : "text-danger"}`}>
                  {subNotice.message}
                </p>
              )}
            </div>
          </section>

          <section aria-label="Способы пополнения" className="overflow-hidden rounded-2xl border border-border/70 bg-surface/60">
            <div className="border-b border-border/70 px-5 py-5 sm:px-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Баланс</p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">Способы пополнения</h2>
            </div>

            <div className="grid divide-y divide-border/60 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-5 sm:p-6">
                <h3 className="text-sm font-medium text-ink">Тестовые кредиты</h3>
                <p className="mt-2 text-xs leading-5 text-muted">Для проверки продукта без реального платежа.</p>
                <div role="group" aria-label="Сумма пополнения" className="mt-5 flex flex-wrap items-center gap-2">
                  {PRESETS.map((preset) => (
                    <button key={preset} type="button" aria-pressed={amount === preset} onClick={() => setAmount(preset)} className={presetClass(amount === preset)}>
                      +{preset}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void topUp()} disabled={submitting} className="btn-primary mt-5 w-full sm:w-auto">
                  {submitting ? "Начисляем…" : `Начислить ${amount} кредитов`}
                </button>
                {notice && (
                  <p role="status" className={`mt-3 text-sm ${notice.kind === "success" ? "text-success" : notice.kind === "unavailable" ? "text-muted" : "text-danger"}`}>
                    {notice.message}
                  </p>
                )}
              </div>

              <div className="p-5 sm:p-6">
                <h3 className="text-sm font-medium text-ink">Оплата картой</h3>
                <p className="mt-2 text-xs leading-5 text-muted">Безопасный переход на страницу оплаты ЮKassa.</p>
                <div role="group" aria-label="Сумма пополнения (₽)" className="mt-5 flex flex-wrap items-center gap-2">
                  {RUB_PRESETS.map((preset) => (
                    <button key={preset} type="button" aria-pressed={rubAmount === preset} onClick={() => setRubAmount(preset)} className={presetClass(rubAmount === preset)}>
                      {preset}₽
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void payWithCard()} disabled={payingWithCard} className="btn-primary mt-5 w-full sm:w-auto">
                  {payingWithCard ? "Переходим…" : `Оплатить ${rubAmount}₽`}
                </button>
                {cardNotice && (
                  <p role="status" className={`mt-3 text-sm ${cardNotice.kind === "unavailable" ? "text-muted" : "text-danger"}`}>
                    {cardNotice.message}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-label="Обзор баланса" className="rounded-2xl border border-primary/30 bg-primary/[0.065] p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Доступно сейчас</p>
            <p className="mt-4 font-mono text-4xl tabular-nums tracking-tight text-ink">
              {balance ? creditsFormatter.format(Number(balance.balance)) : "—"}
            </p>
            <p className="mt-1 text-sm text-muted">кредитов</p>
            <div className="mt-6 h-px bg-gradient-to-r from-primary/50 to-transparent" />
            <p className="mt-5 text-xs leading-5 text-muted">
              Один баланс для чата, агентов, поиска, изображений, голоса и документов.
            </p>
          </section>

          <section aria-label="Аккаунт Telegram" className="rounded-2xl border border-border/70 bg-surface/60 p-6">
            <h2 className="text-sm font-medium text-ink">Аккаунт Telegram</h2>
            {user?.telegram_linked ? (
              <p className="mt-3 text-sm leading-6 text-success">Привязан — баланс и история общие с ботом.</p>
            ) : (
              <>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Привяжите Telegram, чтобы использовать тот же баланс и историю в боте.
                </p>
                <div className="mt-4"><TelegramAuthSection label="Привязать Telegram" /></div>
              </>
            )}
          </section>

          {referralStats && (
            <section aria-label="Пригласить друзей" className="rounded-2xl border border-border/70 bg-surface/60 p-6">
              <h2 className="text-sm font-medium text-ink">Пригласить друзей</h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                Вы оба получите {wholeCreditsFormatter.format(Number(referralStats.reward_credits))} кредитов после первого запроса друга.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={referralStats.referral_link} aria-label="Реферальная ссылка" className="input min-w-0 flex-1 text-xs" onFocus={(event) => event.target.select()} />
                <button type="button" onClick={() => void copyReferralLink()} className="btn-secondary shrink-0">
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
              <p className="mt-4 font-mono text-xs tabular-nums text-muted">
                Приглашено {referralStats.referred_count} · Награждено {referralStats.rewarded_count}
              </p>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
