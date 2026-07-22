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
        setSubNotice({ kind: "unavailable", message: "Subscriptions aren't configured in this environment." });
      } else {
        setSubNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't start subscription." });
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
      setSubNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Couldn't cancel subscription." });
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
      setNotice({ kind: "success", message: `Added ${amount} credits.` });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotice({
          kind: "unavailable",
          message: "Real payments aren't live yet in this environment — sandbox top-up is disabled.",
        });
      } else {
        setNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Top-up failed." });
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
        setCardNotice({ kind: "unavailable", message: "Card payments aren't configured in this environment." });
      } else {
        setCardNotice({ kind: "error", message: err instanceof ApiError ? err.message : "Payment failed to start." });
      }
      setPayingWithCard(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Billing</h1>
      <p className="mt-1 text-sm text-muted">Current balance and top-up.</p>

      <div className="mt-8 rounded-md border border-border bg-surface p-6">
        <div className="text-xs uppercase tracking-wide text-muted">Balance</div>
        <div className="mt-1 font-mono text-3xl tabular-nums text-ink">
          {balance ? Number(balance.balance).toFixed(2) : "—"}
          <span className="ml-2 text-base font-sans text-muted">credits</span>
        </div>
        <p className="mt-3 text-xs text-muted">
          Credits cover posts, captions, and visuals — the exact cost of each shows right after you send it.
        </p>
      </div>

      <div className="mt-8 rounded-md border border-border bg-surface p-6">
        <div className="text-sm font-medium text-ink">Pro subscription</div>
        <p className="mt-1 text-xs text-muted">
          Instant access to every model — no gradual unlocking. 990₽/month, cancel anytime.
        </p>

        {subscription === undefined ? (
          <p className="mt-4 text-xs text-muted">Loading…</p>
        ) : subscription && (subscription.status === "active" || subscription.status === "non_renewing") ? (
          <div className="mt-4">
            <p className="text-sm text-ink">
              {subscription.status === "active"
                ? `Active — renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : `Active until ${new Date(subscription.current_period_end).toLocaleDateString()} — won't renew automatically`}
            </p>
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={subActionPending}
              className="btn-secondary mt-3"
            >
              {subActionPending ? "Canceling…" : "Cancel subscription"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void subscribe()}
            disabled={subActionPending}
            className="btn-primary mt-4 w-full"
          >
            {subActionPending ? "Redirecting…" : "Subscribe to Pro"}
          </button>
        )}

        {subNotice && (
          <p role="status" className={`mt-3 text-sm ${subNotice.kind === "unavailable" ? "text-muted" : "text-danger"}`}>
            {subNotice.message}
          </p>
        )}
      </div>

      <div className="mt-8 rounded-md border border-border bg-surface p-6">
        <div className="text-sm font-medium text-ink">Telegram account</div>
        {user?.telegram_linked ? (
          <p className="mt-3 text-sm text-success">✓ Connected — your balance and history are shared with the bot.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              Connect Telegram to use the same balance and history in the bot as here on the site.
            </p>
            <div className="mt-4">
              <TelegramAuthSection label="Connect Telegram" />
            </div>
          </>
        )}
      </div>

      {referralStats && (
        <div className="mt-8 rounded-md border border-border bg-surface p-6">
          <div className="text-sm font-medium text-ink">Invite friends</div>
          <p className="mt-1 text-xs text-muted">
            You both get {Number(referralStats.reward_credits).toFixed(0)} credits once they try Lumenza.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              readOnly
              value={referralStats.referral_link}
              aria-label="Referral link"
              className="input flex-1 text-xs"
              onFocus={(event) => event.target.select()}
            />
            <button type="button" onClick={() => void copyReferralLink()} className="btn-secondary">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            {referralStats.referred_count} invited · {referralStats.rewarded_count} rewarded
          </p>
        </div>
      )}

      <div className="mt-8">
        <div className="text-sm font-medium text-ink">Top up (sandbox)</div>
        <p className="mt-1 text-xs text-muted">Sandbox top-up for testing — no real payment.</p>

        <div role="group" aria-label="Top-up amount" className="mt-4 flex items-center gap-2">
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
          {submitting ? "Adding…" : `Add ${amount} credits (sandbox)`}
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
        <div className="text-sm font-medium text-ink">Pay with card</div>
        <p className="mt-1 text-xs text-muted">Real payment via YooKassa — redirects to their checkout.</p>

        <div role="group" aria-label="Top-up amount (RUB)" className="mt-4 flex items-center gap-2">
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
          {payingWithCard ? "Redirecting…" : `Pay ${rubAmount}₽`}
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
