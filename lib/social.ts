/**
 * Zolva's public accounts, shown in the site footer. An entry without `href`
 * shows as a "coming soon" icon, not a link. Add the X link once the account
 * exists: href: "https://x.com/<handle>".
 */
export const SOCIAL_LINKS: { label: string; href: string | null; icon: string }[] = [
  { label: "X", href: null, icon: "ph-x-logo" },
  { label: "GitHub", href: "https://github.com/zolvaagent/zolva", icon: "ph-github-logo" },
];
