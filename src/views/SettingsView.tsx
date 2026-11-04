import Link from "next/link";
import { Icon } from "@/components/Icon";
import { requireProfile } from "@/lib/profile";
import { TIER_NAMES } from "@/lib/tasks";
import { signOut } from "@/app/(auth)/actions";

/** Settings, shared by Earn and Create. Creators also see their tier. */
export async function SettingsView({ mode }: { mode: "earn" | "create" }) {
  const me = await requireProfile();
  const local = me.phone.replace(/^\+234/, "0");
  return (
    <>
      <h1 className="c-title">Settings</h1>
      <div className="c-group">
        <div className="c-row">
          <span className="c-ico"><Icon name="user" size={18} /></span>
          <span className="c-row-main">
            <span className="c-row-title">{me.full_name}</span>
            <span className="c-small">{local}</span>
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
        <Link href={mode === "create" ? "/tasks" : "/create"} className="c-row" style={{ textDecoration: "none" }}>
          <span className="c-ico"><Icon name="users" size={18} /></span>
          <span className="c-row-main">
            <span className="c-row-title">{mode === "create" ? "Switch to Earn" : "Switch to Create"}</span>
            <span className="c-small">{mode === "create" ? "Do tasks and get paid, on the same account." : "Post tasks and get answers from real people, on the same account."}</span>
          </span>
          <Icon name="chev" size={16} />
        </Link>
      </div>
      <form action={signOut}>
        <button className="c-btn c-btn-quiet c-btn-block"><Icon name="out" size={18} /> Sign out</button>
      </form>
    </>
  );
}
