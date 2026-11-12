// Doova's Terms of use, Privacy policy and Community rules, as shown on getdoova.com/legal/*.
// Source: the "Doova legal drafts" doc (updated 12 Nov 2026), without the notes for the lawyer.
// These are pilot drafts under legal review: change the doc first, then this file.

export type Block =
  | { p: string }
  | { list: string[] }                       // numbered, with an optional bold lead-in before the first ". "
  | { table: { head: string[]; rows: string[][] } };
export type Section = { heading: string; blocks: Block[] };
export type LegalDoc = { slug: string; title: string; intro: string; sections: Section[] };

export const LEGAL_UPDATED = "12 November 2026";
export const COMPANY = "Doova Labs Limited";
export const RC = "10002402";
export const EMAIL = "hello@getdoova.com";

const terms: LegalDoc = {
  slug: "terms",
  title: "Terms of use",
  intro: `These terms are an agreement between you and ${COMPANY}, a company registered in Nigeria with RC number ${RC} ("Doova", "we"). By creating an account or using getdoova.com you agree to them. If you do not agree, do not use Doova.`,
  sections: [
    { heading: "1. What Doova does", blocks: [{ list: [
      "Doova is a marketplace. Creators post paid tasks; doers do them. Doova is not the employer of doers and is not a party to the work agreed between a creator and a doer, except where these terms say so.",
      "Payments are collected and paid out by licensed payment partners, currently Paystack. Doova is not a bank.",
    ] }] },
    { heading: "2. Who can use Doova", blocks: [{ list: [
      "You must be 18 or older and live in Nigeria to be a doer. Creators may be individuals aged 18 or older or registered businesses.",
      "When you sign up you give your date of birth and confirm that you are 18 or older; that confirmation is how you accept these terms and our Privacy policy. We check your date of birth against your NIN before your first withdrawal. If we find an account belongs to someone under 18, or the date of birth is false, we close it and deal with any balance as the law requires.",
      "One person, one account. You may not create, buy, sell or share accounts, or use someone else's NIN, phone number or bank account.",
      "You must give true information, including your full name as it appears on your NIN.",
      "A business account must give its registered name and RC or BN number, which we check with the Corporate Affairs Commission. Only the business owner on Doova can add money or withdraw.",
    ] }] },
    { heading: "3. Your account and security", blocks: [{ list: [
      "You sign in with your phone number or email and a password, or with a one-time code we send by text or email. Keep them secret. Doova will never ask for your password, PIN or code by phone, WhatsApp or email.",
      `You are responsible for what happens on your account. Tell us at once at ${EMAIL} if you think someone else has used it.`,
      "If you use a shared or café computer, choose that option when signing in, and sign out when you finish.",
    ] }] },
    { heading: "4. For creators", blocks: [{ list: [
      "Funding. A task goes live only after you pay the full reward for every slot, plus Doova's fee. The reward money is held for the task and cannot be used for anything else. If you add money by bank transfer, our payment partner's fee (currently 1%, at most ₦300) is taken from the amount you send.",
      "Fee. Doova charges 15% of the rewards, added on top. The fee is not refunded for unfilled slots or for work you reject, but it is refunded in full if Doova turns your task down before it goes live.",
      "Limits. Rewards are ₦500 to ₦500,000 per person; tasks have 5 to 5,000 slots. Your creator tier may set a lower limit on slots and which kinds of task you can post.",
      "Approval. Every task is checked by Doova before it goes live. We may refuse or remove a task that breaks these terms or the Community rules.",
      "Reviewing work. You can let Doova approve work automatically when it passes checks, or review each response yourself within the time you choose, up to 72 hours. Work you have not reviewed by then is approved automatically and paid.",
      "Rejecting work. You may reject work only with a written reason. The doer may appeal; if Doova decides for the doer, the work is paid from the task's money.",
      "Unused money. Rewards for unfilled slots and finally rejected work return to your Doova wallet when the task closes.",
      "Card payments. Card payments are not offered yet. Once they are, if a card payment is reversed (a chargeback), we will deduct the amount and a processing charge from your wallet, which may go below zero, and may suspend your account.",
      "Your data and the doers' answers. You may use the answers you pay for in your business. You must not try to identify, contact or sell the personal data of doers, and you must follow the Privacy policy and data protection law. Insights show answers grouped by age group, state and doer level only; any group of fewer than 5 people is hidden.",
      "Receipts and tax. We issue a receipt for each payment, in your name or your business name. You are responsible for your own taxes.",
    ] }] },
    { heading: "5. For doers", blocks: [{ list: [
      "Taking a task. When you start a task, your slot is held for the time shown. If you do not submit in time, the slot is released. You need a phone number and your date of birth on your account before your first task.",
      "Doing the work. Do the task yourself, honestly and carefully, following its instructions. One attempt per person per task. Do not use bots, scripts or answers copied from others.",
      "Getting paid. When your work is approved, the reward is credited to your Doova wallet at once. Many surveys are approved automatically when they pass checks.",
      "Rejection and appeal. If a creator rejects your work, they must give a reason. You can appeal within 48 hours; a Doova reviewer decides, usually within 24 hours, and the decision is final on Doova.",
      "Levels. Your level decides which tasks and rewards you can see. Levels are worked out daily from your XP, approval rate and ratings, as explained in the app. XP has no cash value.",
      "Confidential tasks. Some tasks need you to sign a digital non-disclosure agreement first. Breaking it may lead to your account being closed and legal action by the creator.",
      "You are independent. You choose whether and when to do tasks. Doing tasks does not make you an employee of Doova or of any creator. You are responsible for any tax on your earnings.",
    ] }] },
    { heading: "6. Wallets and withdrawals", blocks: [{ list: [
      "Your wallet shows money you have earned or added, held for you through our payment partners. It does not earn interest.",
      "You can withdraw any amount from ₦1,500 to your whole balance, at any time, to a bank account or wallet in your own name. Doova charges a flat ₦100 per withdrawal, taken from the amount. Withdrawals of ₦10,000 or more also carry ₦50 stamp duty, which we pass on. Creators can withdraw unused Creator funds on the same terms.",
      "Before your first withdrawal we check your NIN. Each NIN can be used on only one account, and your bank account name must match it.",
      "If a transfer fails, the full amount, including the ₦100 fee, returns to your wallet.",
      "When you close your account, we pay out your whole balance with no minimum and no fee.",
      "We may pause withdrawals while we investigate suspected fraud, or if our daily check of the money we hold finds a difference. We will tell you why where the law allows.",
    ] }] },
    { heading: "7. Ratings", blocks: [{ p: "After approved work, the doer and creator may rate each other from 1 to 5 stars within 7 days. Ratings of 1 or 2 stars need a reason. Ratings stay hidden until both sides have rated or 72 hours pass. We may hide ratings that are abusive." }] },
    { heading: "8. What you must not do", blocks: [{ p: "You must follow the Community rules. In particular, do not post or do tasks that are illegal, deceptive or harmful; create fake reviews, likes, followers or engagement; or try to cheat, hack or overload Doova." }] },
    { heading: "9. Suspension and closing accounts", blocks: [{ list: [
      "You can close your account at any time in Settings.",
      "We may limit, suspend or close an account that breaks these terms, the law or the Community rules, or to prevent fraud. Where we can, we will tell you why and how to appeal. Money that is lawfully yours will be paid to you, less any amounts you owe Doova or a creator because of fraud or chargebacks.",
    ] }] },
    { heading: "10. Our service", blocks: [{ p: "We work hard to keep Doova running and accurate, but we cannot promise it will always be available or error-free. We may change features." }] },
    { heading: "11. Changes to these terms", blocks: [{ p: "We may update these terms. For important changes we will tell you in the app or by text at least 14 days before they apply. If you keep using Doova after that, the new terms apply." }] },
    { heading: "12. Law and disputes", blocks: [{ p: `These terms are governed by the laws of the Federal Republic of Nigeria. Please contact us first at ${EMAIL} so we can try to fix any problem.` }] },
    { heading: "13. Contact", blocks: [{ p: `${COMPANY} (RC ${RC}), Lagos, Nigeria. Email ${EMAIL}; we reply within one working day.` }] },
  ],
};

const privacy: LegalDoc = {
  slug: "privacy",
  title: "Privacy policy",
  intro: `${COMPANY} (RC ${RC}) ("Doova", "we") is the data controller for the personal data described here. We follow the Nigeria Data Protection Act 2023 (NDPA) and the rules of the Nigeria Data Protection Commission (NDPC). We collect only what we need to run Doova, pay people safely and keep accounts real.`,
  sections: [
    { heading: "1. What we collect and why", blocks: [
      { table: { head: ["Data", "Why we need it", "Legal basis", "How long we keep it"], rows: [
        ["Phone number and/or email, name, password (stored scrambled)", "To create your account and sign you in", "Contract", "While your account is open, then 6 years"],
        ["Date of birth, and when you confirmed you are 18 or older", "To make sure everyone on Doova is 18 or older (checked against your NIN), to show you tasks meant for your age, and to give creators age-group totals", "Contract and legal obligation", "While your account is open, then 6 years"],
        ["Profile details you choose to add: state and area you live in, gender, what you do", "To show you tasks meant for people like you, and to give creators totals for groups of 5 or more people (never your details next to your answers)", "Consent (remove them any time in Your profile)", "Until you remove them or close your account"],
        ["NIN (stored only as a scrambled hash after checking)", "To confirm one real person per account before paying out", "Legal obligation and legitimate interest (fraud prevention)", "6 years after account closure"],
        ["Bank account number and name", "To send your withdrawals", "Contract", "6 years (financial records)"],
        ["Payments, wallet entries, withdrawals", "To keep accurate financial records", "Legal obligation", "6 years"],
        ["Task answers and files you submit", "To deliver the work to the creator who paid for it", "Contract", "Deleted 365 days after the task closes, unless the creator exported them"],
        ["Ratings, levels, XP, badges", "To run the levels and tiers system", "Contract", "While your account is open"],
        ["Notification settings and phone-notification subscription", "To tell you about new tasks, payments and reviews", "Consent (turn them off in Settings)", "Until you turn them off or close your account"],
        ["Device and sign-in data (IP address, browser, device identifier)", "Security and stopping duplicate or fake accounts", "Legitimate interest", "12 months"],
        ["Messages with our support team", "To help you", "Contract", "2 years"],
        ["Business name, RC/BN number, team members (creators)", "To check businesses with CAC and issue receipts", "Contract and legal obligation", "While the account is open, then 6 years"],
      ] } },
      { p: "We do not collect a selfie, your BVN, or your location from GPS." },
    ] },
    { heading: "2. Who we share it with", blocks: [{ list: [
      "Creators see your answers to their tasks, your first name and last initial, your level, badges and ratings. In Insights they see only totals by age group, state and level for groups of 5 or more people, never your details next to your answers. They do not see your phone number, email, date of birth, NIN or bank details.",
      "Payment partners (Paystack, and our bank, Moniepoint Microfinance Bank) receive what they need to move money and meet their own legal duties.",
      "Identity checking: our identity-check provider receives your NIN to confirm it once.",
      "Service providers who host or run Doova for us under contract: Supabase (database and sign-in), Vercel (website hosting), Cloudflare (domain and security), Resend (sign-in and reset emails), Termii (text messages).",
      "Authorities when the law requires it, for example a court order or a request from the police, NDPC, CBN or FIRS.",
    ] }, { p: "We never sell your personal data." }] },
    { heading: "3. Data stored outside Nigeria", blocks: [{ p: "Our database and website are hosted in the European Union (Ireland). The EU's data protection law gives a level of protection we believe is adequate under the NDPA." }] },
    { heading: "4. How we protect it", blocks: [{ p: "Data is encrypted in transit and at rest. Your NIN is stored only as a one-way hash. Access inside Doova is limited by role, staff sign in with two-step verification, and every staff action on accounts or money is logged by name." }] },
    { heading: "5. Your rights", blocks: [{ p: `You can ask to see, correct, export or delete your data, object to some uses, or withdraw consent where we rely on it. Most requests can be made in Settings or by emailing ${EMAIL}. We reply within 30 days. We may keep some records after deletion where the law requires, such as financial records. You can also complain to the NDPC.` }] },
    { heading: "6. Children", blocks: [{ p: "Doova is for people aged 18 and over. We ask for your date of birth when you sign up and refuse anyone younger. We close accounts we find belong to anyone under 18 and delete their data." }] },
    { heading: "7. Cookies", blocks: [{ p: "We use only the cookies needed to keep you signed in and secure. We do not use advertising cookies." }] },
    { heading: "8. Data Protection Officer and contact", blocks: [{ p: `Data Protection Officer: Oredipe Olanrewaju (founder and director), ${EMAIL}, ${COMPANY}, Lagos.` }] },
    { heading: "9. Changes", blocks: [{ p: "We will tell you in the app before important changes to this policy take effect." }] },
  ],
};

const rules: LegalDoc = {
  slug: "rules",
  title: "Community rules",
  intro: "Doova works when creators pay fairly and doers work honestly. These rules say what that means, and they are part of the Terms of use. Breaking them can lead to a warning, a lower level or tier, removal of a task, or a closed account.",
  sections: [
    { heading: "For everyone", blocks: [{ list: [
      "One person, one account. No fake, shared, bought or borrowed accounts, NINs, phone numbers or bank accounts.",
      "Be respectful. No insults, threats, harassment or hate speech in tasks, answers, ratings or chat.",
      "No scams. Never ask anyone to pay to get tasks, unlock a level or withdraw. Doova will never ask you for money this way, and neither may anyone else on Doova. Report it to us.",
      "Stay on Doova. Do not move payments or task work off Doova to avoid fees or our protections.",
      "Respect privacy. Do not collect, share or ask for other people's personal data beyond what a task openly states and needs.",
    ] }] },
    { heading: "Tasks Doova does not allow", blocks: [{ list: [
      "Anything illegal in Nigeria.",
      "Fake engagement: likes, follows, reviews, ratings, votes, sign-ups, app installs or clicks meant to mislead others.",
      "Academic dishonesty, such as writing someone's exam, assignment or project.",
      "Collecting passwords, PINs, BVNs, NINs, card details or other sensitive data.",
      "Adult or sexual content, gambling or betting promotion, and weapons or drugs.",
      "Political campaigning or election material.",
      "Tasks that put a doer at risk, ask them to break a law, or ask them to pay or buy anything.",
      "Misleading tasks: the title, time and reward must match what the task really asks.",
    ] }] },
    { heading: "For creators", blocks: [{ list: [
      "Lock the money first. Every task is funded in full before it goes live.",
      "Be clear. Say exactly what you need, how long it takes, and what you will check.",
      "No reason, no rejection. Reject work only with a specific written reason. Do not reject good work to avoid paying.",
      "Review on time. Work you don't review within your chosen window, up to 72 hours, is approved and paid automatically.",
      "Treat doers' data with care. Use answers only for the purpose you stated, and never try to identify or contact doers.",
    ] }] },
    { heading: "For doers", blocks: [{ list: [
      "Do the work yourself, honestly. No bots, scripts, AI-generated answers where the task asks for your own view, or copied answers.",
      "Read before you start. Attention checks are part of many tasks; failing them means the work isn't approved.",
      "Keep confidential tasks confidential. Follow any NDA you sign.",
      "Rate fairly. Ratings should reflect how you were treated, never be used to pressure a creator.",
    ] }] },
    { heading: "Appeals and enforcement", blocks: [{ list: [
      "A doer can appeal a rejection within 48 hours. A Doova reviewer decides, usually within 24 hours; overturned work is paid.",
      `Anyone can appeal an account action by replying to our message or emailing ${EMAIL} within 14 days.`,
      "For serious breaches, such as fraud, scams or fake engagement, we may close an account straight away and report it to the authorities.",
    ] }] },
    { heading: "Report a problem", blocks: [{ p: `Email us at ${EMAIL} about any task, rating or message. We reply within one working day.` }] },
  ],
};

export const LEGAL: Record<string, LegalDoc> = { terms, privacy, rules };
