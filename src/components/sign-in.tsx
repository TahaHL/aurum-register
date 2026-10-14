import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Fingerprint,
  Layers3,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { DealerUser } from "../../shared/types";
import { api } from "../api";
import { GoldMark } from "./quote-ui";

export default function SignIn({
  demoAccounts,
  notice,
  onSignedIn,
}: {
  demoAccounts: boolean;
  notice: string;
  onSignedIn: (user: DealerUser) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(credentials: { email: string; password: string }) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: DealerUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      setPassword("");
      onSignedIn(result.user);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void signIn({ email: email.trim(), password });
  }
  return (
    <main className="sign-in-shell">
      <section className="sign-in-story" aria-label="About QuoteLedger">
        <a className="brand" href="/">
          <span className="brand-mark">
            <GoldMark />
          </span>
          <span>
            QuoteLedger<small>PRECIOUS METALS DESK</small>
          </span>
        </a>
        <div className="sign-in-intro">
          <p className="eyebrow">A CLEAR RECORD. AT EVERY STEP.</p>
          <h1>
            Know your stock.
            <br />
            Stand by your quote.
          </h1>
          <p>
            A considered workspace for the precious metals trade. From the first
            gram to the completed sale.
          </p>
          <div className="ledger-preview" aria-hidden="true">
            <div className="ledger-preview-heading">
              <span>
                <GoldMark /> GOLD INVENTORY
              </span>
              <span>AU · GBP</span>
            </div>
            <div className="ledger-preview-lot">
              <span className="preview-bar">
                <GoldMark />
              </span>
              <div>
                <strong>10g gold bar</strong>
                <small>999.9 fine · one recorded lot</small>
              </div>
              <Check size={20} />
            </div>
            <div className="preview-flow">
              <span>
                <i />
                Stock received
              </span>
              <span>
                <i />
                Price captured
              </span>
              <span>
                <i />
                Stock reserved
              </span>
            </div>
          </div>
          <div className="sign-in-proof">
            <ShieldCheck size={18} />
            <span>
              Fixed quote prices. Timed stock holds. A history you can follow.
            </span>
          </div>
        </div>
        <p className="sign-in-story-footer">
          Built around the details that matter.
        </p>
      </section>
      <section className="sign-in-form-side" aria-labelledby="sign-in-heading">
        <div className="sign-in-card">
          <span className="sign-in-icon">
            <Fingerprint size={27} />
          </span>
          <p className="eyebrow">YOUR DEALER WORKSPACE</p>
          <h2 id="sign-in-heading">Welcome to the desk.</h2>
          <p className="sign-in-description">
            Sign in to manage inventory, issue quotes and keep every movement on
            record.
          </p>
          {notice && (
            <p className="session-notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <form className="desk-form" onSubmit={submit}>
            <label>
              Email address
              <input
                autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourdealership.co.uk"
                required
                maxLength={254}
                disabled={busy}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={128}
                disabled={busy}
              />
            </label>
            <button className="button primary wide" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          {demoAccounts && (
            <div className="demo-access">
              <div className="demo-access-heading">
                <Layers3 size={16} />
                <strong>Explore the fictional demo</strong>
              </div>
              <p>
                Try either role. The same sample inventory, with different
                responsibilities.
              </p>
              <div className="demo-account-options">
                <button
                  disabled={busy}
                  onClick={() =>
                    void signIn({
                      email: "owner@quoteledger.demo",
                      password: "Demo-owner-2026!",
                    })
                  }
                >
                  <span>
                    Enter as owner
                    <ArrowRight size={15} />
                  </span>
                  <small>Quote, manage stock and complete sales</small>
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void signIn({
                      email: "staff@quoteledger.demo",
                      password: "Demo-staff-2026!",
                    })
                  }
                >
                  <span>
                    Enter as staff
                    <ArrowRight size={15} />
                  </span>
                  <small>Quote and receive stock</small>
                </button>
              </div>
              <p className="demo-disclosure">
                Sample accounts and fictional inventory. No payments or real
                trades.
              </p>
            </div>
          )}
          <div className="sign-in-bottom">
            <span className="tiny-dot" />
            Gold · GBP · A clear record.
          </div>
        </div>
      </section>
    </main>
  );
}
