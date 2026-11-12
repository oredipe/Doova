import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { requireProfile } from "@/lib/profile";
import { signOut } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "More" };

const ITEMS: { href: string; icon: IconName; label: string; text: string }[] = [
  { href: "/create/insights", icon: "data", label: "Insights", text: "Answers, groups and trends for each task" },
  { href: "/create/wallet", icon: "wallet", label: "Funds", text: "Add money, see what's locked, withdraw" },
  { href: "/notifications?as=create", icon: "bell", label: "Notifications", text: "Responses, payments and task updates" },
  { href: "/create/help", icon: "help", label: "Help", text: "Common questions and how to reach us" },
  { href: "/create/settings", icon: "settings", label: "Settings", text: "Your details, business and sign-in" },
];

/** Phones: everything that doesn't fit in the four bottom tabs. */
export default async function CreatorMore() {
  await requireProfile();
  return (
    <>
      <h1 className="c-title">More</h1>
      <div className="c-group">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className="c-row">
            <span className="c-ico"><Icon name={i.icon} size={20} /></span>
            <span className="c-row-main"><span className="c-row-title">{i.label}</span><span className="c-small">{i.text}</span></span>
            <Icon name="chev" size={16} />
          </Link>
        ))}
      </div>
      <Link href="/tasks" className="c-btn c-btn-quiet c-btn-block"><Icon name="wallet" size={18} /> Switch to Earn</Link>
      <form action={signOut}><button className="c-btn c-btn-quiet c-btn-block">Sign out</button></form>
    </>
  );
}
