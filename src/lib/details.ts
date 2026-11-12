// Profile details beyond name and phone (12 Nov 2026): date of birth (18+), where you live, gender, what you do.
// Shared by sign-up, "Your profile", the profile banner and creator Insights. No server-only imports here.

export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
  "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

export const GENDERS: { value: string; label: string }[] = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "other", label: "Another way" },
  { value: "prefer_not", label: "Prefer not to say" },
];

export const OCCUPATIONS = [
  "Student", "Employed", "Self-employed or business owner", "Trader", "Artisan or skilled worker",
  "Civil servant", "Looking for work", "Retired", "Something else",
] as const;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Details = {
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;   // YYYY-MM-DD
  home_state: string | null;
  home_area: string | null;
  gender: string | null;
  occupation: string | null;
};

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole years between a date of birth and today (Lagos). */
export function ageFrom(dob: string, today: string = lagosToday()): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** Day, month (1–12) and year from a form → a checked YYYY-MM-DD, or an error message. */
export function readDob(day: string, month: string, year: string): { dob?: string; error?: string } {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y) return { error: "Choose the day, month and year you were born." };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 1900) {
    return { error: "That date doesn’t exist. Check the day and month." };
  }
  const dob = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (dob > lagosToday()) return { error: "That date is in the future." };
  if (ageFrom(dob) < 18) return { error: "You need to be 18 or older to use Doova. You can come back on your 18th birthday." };
  return { dob };
}

/** Age groups creators can compare by in Insights. */
export const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "18 to 25", min: 18, max: 25 },
  { label: "26 to 40", min: 26, max: 40 },
  { label: "Over 40", min: 41, max: 200 },
];
export function ageBand(dob: string | null, today?: string): string | null {
  if (!dob) return null;
  const a = ageFrom(dob, today);
  return AGE_BANDS.find((b) => a >= b.min && a <= b.max)?.label ?? null;
}

/** The parts of "Your profile" and what each is worth (adds up to 100). */
export const PROFILE_STEPS = [
  { key: "phone", label: "Phone number", pts: 20 },
  { key: "dob", label: "Date of birth", pts: 20 },
  { key: "where", label: "Where you live", pts: 25 },
  { key: "email", label: "Email", pts: 15 },
  { key: "gender", label: "Gender", pts: 10 },
  { key: "work", label: "What you do", pts: 10 },
] as const;
export type StepKey = (typeof PROFILE_STEPS)[number]["key"];

export function stepDone(d: Details, key: StepKey): boolean {
  switch (key) {
    case "phone": return !!d.phone;
    case "dob": return !!d.date_of_birth;
    case "where": return !!d.home_state && !!d.home_area;
    case "email": return !!d.email;
    case "gender": return !!d.gender;
    case "work": return !!d.occupation;
  }
}

export function completion(d: Details): number {
  return PROFILE_STEPS.reduce((s, x) => s + (stepDone(d, x.key) ? x.pts : 0), 0);
}
