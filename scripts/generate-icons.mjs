// Generates the 3D icon set with Replicate (openai/gpt-image-2).
// Paid API: run only after the user approves the list in assets/icon-prompts.json.
//
//   REPLICATE_API_TOKEN=... node scripts/generate-icons.mjs [name ...]
//
// Writes prototype/img/icons/<name>.png. Existing files are skipped so a rerun
// never pays twice; delete a file to regenerate it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const token = process.env.REPLICATE_API_TOKEN;
if (!token) throw new Error("Set REPLICATE_API_TOKEN");

const config = JSON.parse(readFileSync(new URL("../assets/icon-prompts.json", import.meta.url), "utf8"));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(config.icons);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const name of names) {
  const out = new URL(`../prototype/img/icons/${name}.png`, import.meta.url);
  if (existsSync(out)) {
    console.log(`skip ${name} (exists)`);
    continue;
  }
  const prompt = `${config.style}\n${config.icons[name]}`;
  let response = await fetch(`https://api.replicate.com/v1/models/${config.model}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify({ input: { ...config.input, prompt } }),
  });
  let prediction = await response.json();
  if (!response.ok) throw new Error(`${name}: ${response.status} ${JSON.stringify(prediction)}`);

  // Poll until done; image models can outlast the 60s wait.
  while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
    await sleep(3000);
    response = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    prediction = await response.json();
  }
  if (prediction.status !== "succeeded") throw new Error(`${name}: ${prediction.status} ${prediction.error ?? ""}`);

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const image = await fetch(url);
  writeFileSync(out, Buffer.from(await image.arrayBuffer()));
  console.log(`saved ${name} (${prediction.id})`);
  // Low-credit Replicate accounts are limited to 6 requests a minute.
  await sleep(11000);
}
