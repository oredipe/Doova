// Supabase Auth errors in plain words.
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That phone number and password don’t match. Try again, or tap “Forgot password?” to choose a new one.";
  if (m.includes("token has expired") || m.includes("otp_expired") || m.includes("expired")) return "That code has expired. Ask for a new one.";
  if (m.includes("invalid") && m.includes("otp") || m.includes("token") && m.includes("invalid")) return "That code isn’t right. Check the text and try again.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Too many tries. Wait a minute, then try again.";
  if (m.includes("signups not allowed") || m.includes("user not found")) return "There’s no Doova account with that number yet. Create one instead.";
  if (m.includes("aal2") || m.includes("mfa")) return "Your account has an authenticator app, so we need its code too.";
  if (m.includes("weak") || m.includes("should contain")) return "That password is too easy to guess. Use a longer one with letters and numbers.";
  if (m.includes("password") && m.includes("characters")) return "Use at least 8 characters for your password.";
  if (m.includes("sms") || m.includes("phone provider")) return "We couldn’t send a text right now. Please try again in a few minutes.";
  return "Something went wrong. Please try again.";
}
