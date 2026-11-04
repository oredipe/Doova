import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffRow } from "@/lib/staff";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Admin check" };

export default async function AdminVerifyPage() {
  const row = await getStaffRow();
  if (!row) redirect("/admin/sign-in");
  if (!row.staff) notFound();
  if (row.user.aal === "aal2") redirect("/admin");

  // Link the staff email to this sign-in, so next time email + password works.
  let emailNote: string | null = null;
  if (row.user.email !== row.staff.email) {
    const { error } = await createAdminClient().auth.admin.updateUserById(row.staff.id, { email: row.staff.email, email_confirm: true });
    emailNote = error ? `Couldn't link ${row.staff.email} to your account (${error.message}). You can still finish here.` : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const hasAuthenticator = (data?.totp?.length ?? 0) > 0;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-h1">{hasAuthenticator ? "Enter your code" : "Set up your authenticator"}</h1>
        <p className="c-sub">
          {hasAuthenticator
            ? `Hi ${row.staff.name.split(" ")[0]}. Admin needs the 6-digit code from your authenticator app.`
            : `Hi ${row.staff.name.split(" ")[0]}. Admin needs a second step: a 6-digit code from an authenticator app such as Google Authenticator or Microsoft Authenticator. It takes a minute, once.`}
        </p>
      </div>
      {emailNote && <p className="c-error">{emailNote}</p>}
      <VerifyForm hasAuthenticator={hasAuthenticator} email={row.staff.email} />
    </>
  );
}
