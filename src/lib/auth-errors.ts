// Supabase Auth errors in plain words. `via` says whether the person used a phone number or an email.
export function friendlyAuthError(message: string | undefined, via: "phone" | "email" = "phone"): string {
  const m = (message ?? "").toLowerCase();
  const what = via === "email" ? "email" : "phone number";
  if (m.includes("invalid login credentials")) return `That ${what} and password don’t match. Try again, or tap “Forgot password?” to choose a new one.`;
  if (m.includes("token has expired") || m.includes("otp_expired") || m.includes("expired")) return "That code has expired. Ask for a new one.";
  if (m.includes("invalid") && m.includes("otp") || m.includes("token") && m.includes("invalid")) return `That code isn’t right. Check the ${via === "email" ? "email" : "text"} and try again.`;
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Too many tries. Wait a minute, then try again.";
  if (m.includes("signups not allowed") || m.includes("user not found")) return `There’s no Doova account with that ${what} yet. Create one instead.`;
  if (m.includes("aal2") || m.includes("mfa")) return "Your account has an authenticator app, so we need its code too.";
  if (m.includes("weak") || m.includes("should contain")) return "That password is too easy to guess. Use a longer one with letters and numbers.";
  if (m.includes("password") && m.includes("characters")) return "Use at least 8 characters for your password.";
  if (m.includes("already") && (m.includes("registered") || m.includes("exists") || m.includes("in use"))) return `That ${what} is already on another Doova account.`;
  if (m.includes("email") && (m.includes("invalid") || m.includes("format"))) return "That email doesn’t look right. Check it and try again.";
  if (m.includes("sending") && m.includes("email") || m.includes("smtp")) return "We couldn’t send the email right now. Please try again in a few minutes.";
  if (m.includes("sms") || m.includes("phone provider")) return "We couldn’t send a text right now. Please try again in a few minutes.";
  return "Something went wrong. Please try again.";
}

/** Did Supabase fail to send the text (no provider, provider down, hook refused)? */
export function smsFailed(message: string | undefined): boolean {
  return /sms|phone provider|hook|unsupported phone/i.test(message ?? "");
}

/** Shown when a text code can't be sent while texts are switched off. */
export const TEXTS_PAUSED = "We can’t send text codes right now. Enter your email instead if your account has one, or use your password.";
