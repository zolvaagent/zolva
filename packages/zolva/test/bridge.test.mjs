import { createServer } from "node:http";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { startBridge } from "../lib/bridge.mjs";

/** A stand-in for zolvaagent.app/mcp: answers JSON-RPC requests as JSON and records what it got. */
async function fakeServer(answer) {
  const seen = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const message = JSON.parse(body);
      seen.push({ headers: request.headers, message });
      const { status = 200, result } = answer(message);
      if (message.id === undefined) {
        response.writeHead(202).end();
        return;
      }
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(status === 200 ? JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) : JSON.stringify({ error: "nope" }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Runs the bridge on in-memory streams; send() writes a line, next() reads one answer. */
async function bridgeTo(url, apiKey) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const lines = [];
  const waiting = [];
  let buffer = "";
  stdout.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = JSON.parse(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      const resolve = waiting.shift();
      if (resolve) resolve(line);
      else lines.push(line);
    }
  });
  const logs = [];
  const close = await startBridge({ url, apiKey, userAgent: "zolva-npm/test", stdin, stdout, log: (line) => logs.push(line) });
  return {
    logs,
    close,
    send: (message) => stdin.write(`${JSON.stringify(message)}\n`),
    next: () => (lines.length ? Promise.resolve(lines.shift()) : new Promise((resolve) => waiting.push(resolve))),
  };
}

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

describe("zolva stdio bridge", () => {
  it("forwards requests with the key and passes the answers back", async () => {
    const server = await fakeServer((message) =>
      message.method === "initialize" ? { result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "zolva", version: "1.2.0" } } } : { result: { tools: [{ name: "list_agents" }] } },
    );
    const bridge = await bridgeTo(server.url, "zk_test");
    cleanups.push(server.close, bridge.close);

    bridge.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    expect((await bridge.next()).result.serverInfo.name).toBe("zolva");
    bridge.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    bridge.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(await bridge.next()).toEqual({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "list_agents" }] } });

    const list = server.seen.find((entry) => entry.message.method === "tools/list");
    expect(list.headers.authorization).toBe("Bearer zk_test");
    expect(list.headers["user-agent"]).toBe("zolva-npm/test");
    // The version agreed at initialize goes with every later call.
    expect(list.headers["mcp-protocol-version"]).toBe("2025-06-18");
  });

  it("sends no Authorization header without a key", async () => {
    const server = await fakeServer(() => ({ result: { tools: [] } }));
    const bridge = await bridgeTo(server.url, undefined);
    cleanups.push(server.close, bridge.close);

    bridge.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    await bridge.next();
    expect(server.seen[0].headers.authorization).toBeUndefined();
  });

  it("answers a request with a readable error when the key is refused", async () => {
    const server = await fakeServer(() => ({ status: 401 }));
    const bridge = await bridgeTo(server.url, "zk_wrong");
    cleanups.push(server.close, bridge.close);

    bridge.send({ jsonrpc: "2.0", id: 7, method: "tools/list" });
    const answer = await bridge.next();
    expect(answer.id).toBe(7);
    expect(answer.error.message).toMatch(/refused the API key/);
    expect(bridge.logs.join(" ")).toMatch(/refused the API key/);
  });
});
