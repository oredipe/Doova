// The company behind Doova, shown in the website footer. Partners (Termii, Paystack, banks) look for the
// registered name, RC number and a physical address on the site.
// The details stay hidden until CAC approves the registration: set `rc` to the RC number from the
// Certificate of Incorporation (or COMPANY_RC_NUMBER in Vercel to preview) and they appear on every page.
export const COMPANY = {
  legalName: "Doova Labs Limited",
  rc: process.env.COMPANY_RC_NUMBER ?? "", // e.g. "9123456" once CAC approves (application submitted 10 Nov 2026)
  address: "2 Shoretire Street, Orile Agege, Lagos, Nigeria",
  email: "hello@getdoova.com",
  year: 2026, // the copyright year shown in the footer
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The footer's bottom line with the company details, once the company is registered. */
export function withCompanyFooter(html: string): string {
  const rc = COMPANY.rc.replace(/^RC\s*/i, "").trim();
  if (!rc) return html;
  const line =
    `<span class="stack" style="gap:6px;">` +
    `<span>© ${COMPANY.year} ${esc(COMPANY.legalName)} · RC ${esc(rc)}</span>` +
    `<span>Doova is a product of ${esc(COMPANY.legalName)}, registered in Nigeria. ${esc(COMPANY.address)} · ` +
    `<a href="mailto:${esc(COMPANY.email)}" style="color:inherit;font-size:inherit;">${esc(COMPANY.email)}</a></span></span>`;
  return html.replace(/<span>© \d{4} Doova\. getdoova\.com<\/span>/, line);
}
