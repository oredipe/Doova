import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { requireProfile } from "@/lib/profile";
import { signOut } from "../../(auth)/actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
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
        <div className="c-row">
          <span className="c-ico"><Icon name="info" size={18} /></span>
          <span className="c-row-main">
            <span className="c-row-title">NIN check</span>
            <span className="c-small">Done once, at your first withdrawal. Covered by the ₦100 withdrawal fee.</span>
          </span>
        </div>
      </div>
      <form action={signOut}>
        <button className="c-btn c-btn-quiet c-btn-block"><Icon name="out" size={18} /> Sign out</button>
      </form>
    </>
  );
}
