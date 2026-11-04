// The current time, for server components (keeps render functions free of direct Date.now calls).
export function nowMs(): number {
  return Date.now();
}
