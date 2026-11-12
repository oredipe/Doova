import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { ProfileRing } from "@/components/ProfileBanner";
import { loadDetails, requireProfile } from "@/lib/profile";
import { completion, GENDERS, MONTHS, NG_STATES, OCCUPATIONS, PROFILE_STEPS, stepDone, type StepKey } from "@/lib/details";
import { saveProfile } from "./actions";

export const metadata: Metadata = { title: "Your profile" };

const ICON: Record<StepKey, IconName> = { phone: "phone", dob: "cake", where: "pin", email: "mail", gender: "user", work: "work" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const me = await requireProfile();
  const d = await loadDetails(me);
  const pct = completion(d);
  const thisYear = new Date().getFullYear();
  const dobText = d.date_of_birth
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(d.date_of_birth + "T00:00:00Z"))
    : null;
  const next = /^\/tasks\/[0-9a-f-]{36}$/i.test(sp.next ?? "") ? sp.next! : "";

  return (
    <>
      <Link href="/settings" className="c-small" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--c-ink)", fontWeight: 600, textDecoration: "none" }}>
        <Icon name="back" size={16} stroke={2} /> Settings
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ProfileRing pct={pct} size={64} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 className="c-title">Your profile</h1>
          <span className="c-small">{pct === 100 ? "All done. You see every task you qualify for." : "Many tasks are for certain ages or areas. A full profile shows you more of them."}</span>
        </div>
      </div>

      {sp.saved && <div className="c-note" role="status"><Icon name="check" size={18} /><span>Saved.</span></div>}
      {next && !d.date_of_birth && <div className="c-note" role="status"><Icon name="info" size={18} /><span>Add your date of birth to start tasks. Doova is for people 18 and older.</span></div>}
      {sp.error && <p className="c-error" role="alert">{sp.error}</p>}
      {!d.ready && <div className="c-note"><Icon name="info" size={18} /><span>Profile details open soon. You can still do tasks as usual.</span></div>}

      <section className="c-card" style={{ display: "flex", flexDirection: "column", padding: "4px 20px" }} aria-label="What your profile has">
        {PROFILE_STEPS.map((s, i) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 56, borderTop: i ? "1px solid var(--c-line)" : undefined }}>
            {stepDone(d, s.key) ? <span className="pf-done" aria-label="Done"><Icon name="check" size={16} stroke={2.4} /></span> : <span className="pf-todo" aria-label="Not yet" />}
            <Icon name={ICON[s.key]} size={18} />
            <span style={{ flex: 1, fontWeight: 600 }}>{s.label}</span>
            {s.key === "phone" && !d.phone && <Link href="/settings#sign-in" className="c-link">Add</Link>}
            {s.key === "email" && !d.email && <Link href="/settings#sign-in" className="c-link">Add</Link>}
            {!stepDone(d, s.key) && <span className="pf-pts">+{s.pts}%</span>}
          </div>
        ))}
      </section>

      {d.ready && (
        <form action={saveProfile} className="c-card" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <input type="hidden" name="next" value={next} />
          {dobText ? (
            <div className="c-field">
              <span className="c-label">Date of birth</span>
              <span style={{ fontSize: 16 }}>{dobText}</span>
              <span className="c-small">To correct it, email hello@getdoova.com. It must match your NIN.</span>
            </div>
          ) : (
            <fieldset className="c-field" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="c-label" style={{ padding: 0, marginBottom: 8 }}>Date of birth</legend>
              <div className="pf-dob">
                <select name="dob_d" className="c-input" aria-label="Day" defaultValue=""><option value="">Day</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
                <select name="dob_m" className="c-input" aria-label="Month" defaultValue=""><option value="">Month</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                <select name="dob_y" className="c-input" aria-label="Year" defaultValue=""><option value="">Year</option>{Array.from({ length: 90 }, (_, i) => thisYear - 16 - i).map((y) => <option key={y} value={y}>{y}</option>)}</select>
              </div>
              <span className="c-small">As on your NIN. You can set it once here.</span>
            </fieldset>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div className="c-field">
              <label className="c-label" htmlFor="pf-state">State you live in</label>
              <select id="pf-state" name="state" className="c-input" defaultValue={d.home_state ?? ""}>
                <option value="">Choose a state</option>{NG_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="c-field">
              <label className="c-label" htmlFor="pf-area">Area or town</label>
              <input id="pf-area" name="area" className="c-input" defaultValue={d.home_area ?? ""} placeholder="For example, Surulere" maxLength={80} />
            </div>
          </div>
          <div className="c-field">
            <label className="c-label" htmlFor="pf-gender">Gender</label>
            <select id="pf-gender" name="gender" className="c-input" defaultValue={d.gender ?? ""}>
              <option value="">Choose</option>{GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div className="c-field">
            <label className="c-label" htmlFor="pf-work">What you do</label>
            <select id="pf-work" name="work" className="c-input" defaultValue={d.occupation ?? ""}>
              <option value="">Choose</option>{OCCUPATIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <p className="c-small" style={{ margin: 0 }}>Creators never see your details. They only see totals for groups of 5 or more people, like &ldquo;18 to 25 in Lagos&rdquo;.</p>
          <button className="c-btn c-btn-primary c-btn-block">{next ? "Save and start the task" : "Save"}</button>
        </form>
      )}
    </>
  );
}
