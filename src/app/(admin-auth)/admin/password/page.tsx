import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStaffRow } from "@/lib/staff";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Choose a password" };

export default async function AdminPasswordPage({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const [row, sp] = await Promise.all([getStaffRow(), searchParams]);
  if (!row) redirect("/admin/sign-in");
  if (!row.staff) notFound();
  if (row.user.aal !== "aal2") redirect("/admin/verify");
  if (!row.staff.mustChangePassword && !sp.change) redirect("/admin");
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-h1">{row.staff.mustChangePassword ? "Choose your own password" : "Change your password"}</h1>
        <p className="c-sub">{row.staff.mustChangePassword
          ? "You signed in with a temporary password. Pick one only you know before going on."
          : row.staff.adminOnly ? "For your admin sign-in." : "This is also the password for your Doova app account."}</p>
      </div>
      <PasswordForm />
    </>
  );
}
