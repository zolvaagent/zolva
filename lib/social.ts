/** Zolva's X account, for "Follow on X" links. */
export const X_HANDLE = "zolva_agent";
export const X_URL = `https://x.com/${X_HANDLE}`;

/** The public source code. Its GitHub homepage points back to zolvaagent.app, so the two link each other. */
export const GITHUB_REPO_URL = "https://github.com/zolvaagent/zolva";

/**
 * Zolva's public accounts, shown in the site footer and the app sidebar. An
 * entry without `href` shows as a "coming soon" icon, not a link.
 */
export const SOCIAL_LINKS: { label: string; href: string | null; icon: string }[] = [
  { label: "X", href: X_URL, icon: "ph-x-logo" },
  { label: "GitHub", href: GITHUB_REPO_URL, icon: "ph-github-logo" },
];
