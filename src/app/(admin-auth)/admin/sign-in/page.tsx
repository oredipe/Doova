import type { Metadata } from "next";
import { AdminSignInForm } from "./AdminSignInForm";

export const metadata: Metadata = { title: "Admin sign-in" };

export default function AdminSignInPage() {
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="c-h1">Sign in to Doova admin</h1>
        <p className="c-sub">For Doova staff only. Every action you take here is recorded with your name.</p>
      </div>
      <AdminSignInForm />
      <p className="c-small">
        New admin account? Use the email and temporary password the owner sent you; you&rsquo;ll set up an authenticator next.
        Admin linked to your Doova app account? The first time, sign in to the app with your phone, then open /admin.
        Lost your authenticator? Ask the account owner. Admin accounts can&rsquo;t use SMS codes.
      </p>
    </>
  );
}
