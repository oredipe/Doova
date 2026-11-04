import type { Metadata } from "next";
import { signOut } from "../actions";

export const metadata: Metadata = { title: "Account paused" };

export default function PausedPage() {
  return (
    <main className="auth-main">
      <h1 className="c-h1">Your account is paused</h1>
      <p className="c-sub">
        Doova staff paused this account, usually because something needs checking. Your money is still yours: anything in your
        Earnings or Creator funds stays there. Contact Doova support and we&rsquo;ll explain what happens next.
      </p>
      <form action={signOut}><button className="c-btn c-btn-quiet c-btn-block">Sign out</button></form>
    </main>
  );
}
