// Nigerian phone numbers. People type them many ways: 0803 123 4567, 803-123-4567,
// +234 803 123 4567, 2348031234567. We store E.164: +2348031234567.

const MOBILE = /^[789][01]\d{8}$/; // 070x, 080x, 081x, 090x, 091x …

export function normaliseNigerianPhone(input: string): string | null {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("234")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!MOBILE.test(digits)) return null;
  return "+234" + digits;
}

/** +2348031234567 → +234 803 ••• 4567, for "We sent a code to …". */
export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+234/, "");
  return `+234 ${local.slice(0, 3)} ••• ${local.slice(-4)}`;
}
