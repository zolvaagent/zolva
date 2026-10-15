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

const worker: ExportedHandler<CloudflareEnv> = {
  fetch: handler.fetch,

  async scheduled(controller, env, ctx) {
    const request = new Request("https://sita.internal/api/cron/tick", {
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
