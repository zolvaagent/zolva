// Generates one text-free image with gpt-image-2 on Replicate (2026-11-11). Paid: about $0.05 at
// medium. Copy goes on top later in HTML (house rule: the model makes the visual only).
//
//   REPLICATE_API_TOKEN=... node scripts/generate-image.mjs <out.png> "<prompt>" [aspect_ratio]
//
// aspect_ratio defaults to 3:2. A refused request (rate limit) bills nothing; wait and retry.
import { writeFileSync } from "node:fs";

const [out, prompt, aspectRatio = "3:2"] = process.argv.slice(2);
if (!out || !prompt) throw new Error('Usage: node scripts/generate-image.mjs <out.png> "<prompt>" [aspect_ratio]');
const token = process.env.REPLICATE_API_TOKEN;
if (!token) throw new Error("REPLICATE_API_TOKEN is not set");

let prediction = await fetch("https://api.replicate.com/v1/models/openai/gpt-image-2/predictions", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" },
  body: JSON.stringify({ input: { prompt, quality: "medium", aspect_ratio: aspectRatio, background: "opaque", output_format: "png" } }),
}).then((response) => response.json());
if (!prediction.id) throw new Error(`refused, nothing billed: ${JSON.stringify(prediction).slice(0, 300)}`);
while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  prediction = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
}
if (prediction.status !== "succeeded") throw new Error(`${prediction.status} ${prediction.error ?? ""}`);
const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
writeFileSync(out, Buffer.from(await fetch(url).then((response) => response.arrayBuffer())));
console.log(`saved ${out} (${prediction.id})`);
