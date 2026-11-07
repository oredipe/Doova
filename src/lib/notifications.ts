// How each notification reads, in the bell list and as a phone push. Kept in one place.
export type Note = {
  id: string; kind: string; title: string; body: string | null; link: string;
  amount_kobo: number | null; count: number; created_at: string; read_at: string | null;
};

const n = (k: number | null) => "₦" + Math.round((k ?? 0) / 100).toLocaleString("en-NG");

export function describe(x: Pick<Note, "kind" | "title" | "body" | "amount_kobo" | "count">): { heading: string; detail: string; tone: "money" | "bad" | "info" } {
  switch (x.kind) {
    case "paid": return { heading: `You've been paid ${n(x.amount_kobo)}`, detail: x.body ? `${x.title}. ${x.body}` : x.title, tone: "money" };
    case "rejected": return { heading: "Your work wasn't approved", detail: x.body ? `${x.title}: “${x.body}” You can appeal.` : `${x.title}. You can appeal.`, tone: "bad" };
    case "appeal_kept": return { heading: "Doova kept the rejection", detail: x.body ? `${x.title}: “${x.body}”` : x.title, tone: "bad" };
    case "review_waiting": return { heading: x.count > 1 ? `${x.count} responses to review` : "A response to review", detail: x.title, tone: "info" };
    case "task_live": return { heading: "Your task is live", detail: `${x.title}. Doers can see it now.`, tone: "info" };
    case "task_turned_down": return { heading: "Doova didn't approve your task", detail: x.body ? `${x.title}: “${x.body}” Your money is back in Creator funds.` : `${x.title}. Your money is back in Creator funds.`, tone: "bad" };
    case "funds_added": return { heading: `${n(x.amount_kobo)} added to your Creator funds`, detail: "Ready to fund a task.", tone: "money" };
    case "payout_sent": return { heading: `${n(x.amount_kobo)} sent to your bank`, detail: "It usually arrives within minutes.", tone: "money" };
    case "payout_failed": return { heading: "Your withdrawal didn't go through", detail: `${n(x.amount_kobo)} is back in your balance.${x.body ? ` Bank said: ${x.body}` : ""}`, tone: "bad" };
    case "new_task": return x.count > 1
      ? { heading: `${x.count} new tasks for you`, detail: `Latest: ${x.title}, ${n(x.amount_kobo)}`, tone: "info" }
      : { heading: `New task: ${n(x.amount_kobo)}`, detail: x.title, tone: "info" };
    default: return { heading: x.title, detail: x.body ?? "", tone: "info" };
  }
}
