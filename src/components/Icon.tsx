// Line icons from the Doova design canvas (24px grid, 1.8px stroke by default).

const PATHS: Record<string, React.ReactNode> = {
  tasks: (<><path d="M4 6h16M4 12h16M4 18h10" /></>),
  mytasks: (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  wallet: (<><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M16 12.5h2M3 9.5h18" /></>),
  settings: (<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  check: (<><path d="M5 12.5l4.5 4.5L19 7.5" /></>),
  chev: (<><path d="M9 5l7 7-7 7" /></>),
  back: (<><path d="M15 5l-7 7 7 7" /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  eyeoff: (<><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.7 3.4M6.6 7.6C3.9 9.4 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2M4 4l16 16" /></>),
  laptop: (<><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19.5h20" /></>),
  spark: (<><path d="M12 3c.8 4.6 3.4 7.2 8 8-4.6.8-7.2 3.4-8 8-.8-4.6-3.4-7.2-8-8 4.6-.8 7.2-3.4 8-8z" /></>),
  info: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>),
  out: (<><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" /></>),
  user: (<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  download: (<><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></>),
  x: (<><path d="M6 6l12 12M18 6L6 18" /></>),
  bell: (<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" /><path d="M10 20.5a2.2 2.2 0 0 0 4 0" /></>),
  users: (<><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19.5c.9-3 3.2-4.5 6-4.5s5.1 1.5 6 4.5" /><path d="M16 5.5a3 3 0 0 1 0 6M18 15c1.6.6 2.6 2.1 3 4.5" /></>),
  trash: (<><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></>),
  up: (<><path d="M6 15l6-6 6 6" /></>),
  down: (<><path d="M6 9l6 6 6-6" /></>),
  home: (<><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>),
  help: (<><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7" /><path d="M12 17h.01" /></>),
  data: (<><path d="M5 18l4-5 3 3 4-6 3 4" /><path d="M4 4v16h16" /></>),
  more: (<><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>),
  review: (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
  pin: (<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="10" r="2.3" /></>),
  cake: (<><path d="M4 20h16M5 20v-7h14v7M5 16.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0M12 13V9.5" /><path d="M12 7.5c-.9-.8-.9-2 0-3.5.9 1.5.9 2.7 0 3.5z" /></>),
  phone: (<><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 17.5h2" /></>),
  mail: (<><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>),
  work: (<><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></>),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.8, label }: { name: IconName; size?: number; stroke?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {PATHS[name]}
    </svg>
  );
}
