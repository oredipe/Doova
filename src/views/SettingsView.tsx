import Link from "next/link";
import { Icon } from "@/components/Icon";
import { loadDetails, requireProfile } from "@/lib/profile";
import { completion } from "@/lib/details";
import { TIER_NAMES } from "@/lib/tasks";
import { signOut } from "@/app/(auth)/actions";
import { setNewTaskAlerts } from "@/app/notificationActions";
import { PushToggle } from "@/components/PushToggle";
import { createAdminClient } from "@/lib/supabase/admin";
import { vapidKeys } from "@/lib/push";
import { getAuthUser } from "@/lib/supabase/server";
import { smsCodesOn } from "@/lib/authChannels";
import { ConfirmContact } from "@/components/ConfirmContact";

/** Settings, shared by Earn and Create. Creators also see their tier. */
export async function SettingsView({ mode }: { mode: "earn" | "create" }) {
  const me = await requireProfile();
  const local = me.phone ? me.phone.replace(/^\+234/, "0") : null;
  const [keys, { data: prefs }, auth, smsOn] = await Promise.all([
    vapidKeys().catch(() => null),
    createAdminClient().from("users").select("notify_new_tasks").eq("id", me.id).maybeSingle(),
    getAuthUser(),
    smsCodesOn(),
  ]);
  const details = await loadDetails(me);
  const signInEmail = auth?.email ?? null;   // checked by Supabase; me.email may only be for receipts
  const alerts = prefs?.notify_new_tasks !== false;
  return (
    <>
      <h1 className="c-title">Settings</h1>
      <div className="c-group">
        <div className="c-row">
          <span className="c-ico"><Icon name="user" size={18} /></span>
          <span className="c-row-main">
            <span className="c-row-title">{me.full_name}</span>
            <span className="c-small" style={{ overflowWrap: "anywhere" }}>{local ?? signInEmail ?? me.email}</span>
          </span>
          <span className={me.kyc_tier >= 1 ? "c-pill c-pill-paid" : "c-pill c-pill-quiet"}>
            {me.kyc_tier >= 1 ? "NIN verified" : "NIN not checked yet"}
          </span>
        </div>
        {mode === "create" ? (
          <div className="c-row">
            <span className="c-ico"><Icon name="spark" size={18} /></span>
            <span className="c-row-main">
              <span className="c-row-title">Creator tier: {TIER_NAMES[me.creator_tier]}</span>
              <span className="c-small">
                {me.creator_tier === 1 ? "New creators can post up to 200 slots a task. A NIN check and one completed task make you Verified (up to 1,000)." : "Your tier rises with fair, quick reviews and good ratings. Spending never changes it."}
              </span>
            </span>
          </div>
        ) : (
          <div className="c-row">
            <span className="c-ico"><Icon name="info" size={18} /></span>
            <span className="c-row-main">
              <span className="c-row-title">NIN check</span>
              <span className="c-small">Done once, at your first withdrawal. Covered by the ₦100 withdrawal fee.</span>
            </span>
          </div>
        )}
        {mode === "earn" && details.ready && (
          <Link href="/profile" className="c-row" style={{ textDecoration: "none" }}>
            <span className="c-ico"><Icon name="user" size={18} /></span>
            <span className="c-row-main">
              <span className="c-row-title">Your profile</span>
              <span className="c-small">{completion(details)}% complete · age, where you live, what you do</span>
            </span>
            <Icon name="chev" size={16} />
          </Link>
        )}
        <Link href={mode === "create" ? "/tasks" : "/create"} className="c-row" style={{ textDecoration: "none" }}>
          <span className="c-ico"><Icon name="users" size={18} /></span>
          <span className="c-row-main">
            <span className="c-row-title">{mode === "create" ? "Switch to Earn" : "Switch to Create"}</span>
            <span className="c-small">{mode === "create" ? "Do tasks and get paid, on the same account." : "Post tasks and get answers from real people, on the same account."}</span>
          </span>
          <Icon name="chev" size={16} />
        </Link>
      </div>
      <h2 className="c-sec" id="sign-in">Sign-in details</h2>
      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <strong style={{ fontSize: 15 }}>Phone number</strong>
              <span className="c-small">{local ?? "Not added yet. You need one to do tasks and to withdraw."}</span>
            </span>
            {local && <span className="c-pill c-pill-paid">Checked</span>}
          </span>
          {!local && <details><summary className="c-link" style={{ cursor: "pointer" }}>Add my phone number</summary><div style={{ paddingTop: 12 }}>{!smsOn && <p className="c-small" style={{ margin: "0 0 10px" }}>Text codes aren&rsquo;t switched on yet, so this may not work until they are.</p>}<ConfirmContact kind="phone" /></div></details>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--c-line)", paddingTop: 16 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 15 }}>Email</strong>
              <span className="c-small" style={{ overflowWrap: "anywhere" }}>{signInEmail ?? "Add one to sign in and reset your password by email, without a text."}</span>
            </span>
            {signInEmail && <span className="c-pill c-pill-paid">Checked</span>}
          </span>
          {!signInEmail && <details><summary className="c-link" style={{ cursor: "pointer" }}>Add my email</summary><div style={{ paddingTop: 12 }}><ConfirmContact kind="email" suggested={me.email ?? undefined} /></div></details>}
        </div>
        <span className="c-small">You can sign in with either, using the same password.</span>
      </section>
      <h2 className="c-sec">Notifications</h2>
      <section className="c-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {keys && <PushToggle publicKey={keys.publicKey} />}
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap", borderTop: keys ? "1px solid var(--c-line)" : undefined, paddingTop: keys ? 16 : 0 }}>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 220px" }}>
            <strong style={{ fontSize: 15 }}>New task alerts: {alerts ? "on" : "off"}</strong>
            <span className="c-small">A heads-up when a task you can do goes live. Several close together come as one.</span>
          </span>
          <form action={setNewTaskAlerts.bind(null, !alerts)}><button className="c-btn c-btn-quiet" style={{ minHeight: 40 }}>{alerts ? "Turn off" : "Turn on"}</button></form>
        </div>
        <span className="c-small">Payments, reviews and anything about your money always show in the bell.</span>
      </section>
      <form action={signOut}>
        <button className="c-btn c-btn-quiet c-btn-block"><Icon name="out" size={18} /> Sign out</button>
      </form>
    </>
  );
}
