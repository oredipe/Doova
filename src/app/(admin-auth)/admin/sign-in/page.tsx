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
        First time? Sign in to the Doova app with your phone, then open doova.ng/admin to set up your authenticator.
        Lost your authenticator? Ask the account owner. Admin accounts can&rsquo;t use SMS codes.
      </p>
    </>
  );
}
