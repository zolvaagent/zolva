// Edit an existing image with gpt-image-2 on Replicate, using extra reference images
// (for example the Zolva mark to emboss onto a 3D object). Paid: about $0.05 at medium.
//
//   REPLICATE_API_TOKEN=... node scripts/edit-image.mjs <out.png> "<prompt>" <image> [reference ...]
//
// The images go up as data URIs, the first is the one to edit. Writes <out.png>.
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

const [out, prompt, ...images] = process.argv.slice(2);
if (!out || !prompt || !images.length) throw new Error('Usage: node scripts/edit-image.mjs <out.png> "<prompt>" <image> [reference ...]');
const token = process.env.REPLICATE_API_TOKEN;
if (!token) throw new Error("REPLICATE_API_TOKEN is not set");

const dataUri = (file) => `data:image/${extname(file).slice(1).replace("jpg", "jpeg")};base64,${readFileSync(file).toString("base64")}`;

let prediction = await fetch("https://api.replicate.com/v1/models/openai/gpt-image-2/predictions", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" },
  body: JSON.stringify({ input: { prompt, input_images: images.map(dataUri), quality: "medium", aspect_ratio: "3:2", background: "opaque", output_format: "png" } }),
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
