# Cursor Directory (2026-11-16)

**Listing:** https://cursor.directory/plugins/zolva. It is unpublished and hidden, showing "Scan failed. An admin will re-run it shortly." Publish returns "Plugin not found." while the scan status is failed.

**On 2026-11-16 the owner updated:**
- description
- homepage (https://zolvaagent.app/docs/mcp)
- keywords
- component text

Re-scan requests go to GitHub issues in **cursor/community-plugins**. Several identical open issues exist (#517, #519, #524, #528, #533). Owner self-rescan is requested in #458.

## Issue draft (open from the zolvaagent account; needs the owner's yes)

**Title:** `Scan failed for Zolva, please re-run`

**Body:**
> Zolva has shown "Scan failed. An admin will re-run it shortly" since it was submitted. It is still unpublished and hidden from the directory, and Publish returns "Plugin not found." The owner menu has no rescan control.
>
> Could an admin re-run the security scan? If it turns up anything I need to fix, please tell me.
>
> - Listing: https://cursor.directory/plugins/zolva
> - Repo: https://github.com/zolvaagent/zolva (MIT)
> - Remote MCP endpoint in the listing: https://zolvaagent.app/mcp (Streamable HTTP; read-only tools work without a key, an optional Bearer API key adds paper-agent actions)
>
> The plugin is a single remote MCP server config (`{"type": "http", "url": "https://zolvaagent.app/mcp"}`): nothing is installed or run locally. The repo is the open-source web app behind the server; the listing installs no scripts, hooks or binaries from it.
>
> #458 would let owners re-run their own scans and would cover this.
- 2026-11-16: issue opened, https://github.com/cursor/community-plugins/issues/535 (zolvaagent).
- After the rescan, at the next description edit: add "Any agent can be verified: the real engine replays it against stored prices (MCP verify_agent)." (verify line, 2026-11-16)
