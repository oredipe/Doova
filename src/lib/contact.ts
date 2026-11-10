import { normaliseNigerianPhone } from "@/lib/phone";

// What someone typed in a "Phone number or email" box.
export type Contact = { kind: "phone"; value: string } | { kind: "email"; value: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

export function readContact(input: string): Contact | null {
  const t = input.trim();
  if (t.includes("@")) return EMAIL.test(t) ? { kind: "email", value: t.toLowerCase() } : null;
  const p = normaliseNigerianPhone(t);
  return p ? { kind: "phone", value: p } : null;
}

export function isEmail(input: string): boolean {
  return EMAIL.test(input.trim());
}

/** ada.obi@gmail.com → a•••i@gmail.com, for "We sent a code to …". */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const shown = name.length <= 2 ? name[0] + "•••" : `${name[0]}•••${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}
