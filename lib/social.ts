/** Zolva's X account, for "Follow on X" links. */
export const X_HANDLE = "zolva_agent";
export const X_URL = `https://x.com/${X_HANDLE}`;

/**
 * Zolva's public accounts, shown in the site footer and the app sidebar. An
 * entry without `href` shows as a "coming soon" icon, not a link.
 */
export const SOCIAL_LINKS: { label: string; href: string | null; icon: string }[] = [
  { label: "X", href: X_URL, icon: "ph-x-logo" },
  { label: "GitHub", href: "https://github.com/zolvaagent/zolva", icon: "ph-github-logo" },
];
