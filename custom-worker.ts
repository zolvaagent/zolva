// Worker entry point: the OpenNext app plus an hourly cron trigger.
//
// The scheduled handler does not run trading code itself. It calls the app's
// own /api/cron/tick route, so all logic lives in one place inside Next.js
// and runs with the same environment as every other request. Supabase pg_cron
// calls the same route as a backup; the tick is idempotent, so two callers in
// the same hour cannot double-trade.

// `.open-next/worker.js` only exists after `opennextjs-cloudflare build`, so
// the type checker may or may not find it; ts-expect-error would fail either way.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

/** Public hosts: plain http there is sent to https (301). workers.dev and local runs are left alone. */
const HTTPS_HOSTS = new Set(["zolvaagent.app", "www.zolvaagent.app"]);
/** The every-minute trigger in wrangler.jsonc; it does nothing until trench_settings.enabled agents exist. */
const TRENCH_CRON = "* * * * *";

const worker: ExportedHandler<CloudflareEnv> = {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.protocol === "http:" && HTTPS_HOSTS.has(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    return handler.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    // "* * * * *" is the trench minute (memecoin agents on Rushr); the rest is the hourly tick.
    const path = controller.cron === TRENCH_CRON ? "/api/cron/trench" : "/api/cron/tick";
    const request = new Request(`https://zolva.internal${path}`, {
      method: "POST",
      headers: { "x-cron-secret": env.CRON_SECRET },
    });
    ctx.waitUntil(
      handler
        .fetch(request, env, ctx)
        .then((response: Response) => response.text())
        .then((body: string) => console.log(JSON.stringify({ cron: controller.cron, tick: body.slice(0, 800) }))),
    );
  },
};

export default worker;

// Durable Object classes OpenNext may reference must be re-exported.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
