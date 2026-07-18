"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api";

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
  const { balance, setBalance } = useAuth();
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
      // YooKassa's confirmation page lives on their domain — the user pays
      // there and is bounced back to PUBLIC_BASE_URL/billing (this page)
      // once done, at which point the webhook has (or will shortly have)
      // credited the account.
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
      </div>

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
