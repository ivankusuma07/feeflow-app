// Rasterises the app icon SVG into the PNG favicon and Apple touch icon.
// Run with `pnpm --filter @feeflow/ui icons`; outputs are committed.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const svg = await readFile(join(assets, "feeflow-app-icon.svg"));

await sharp(svg, { density: 300 }).resize(32, 32).png().toFile(join(assets, "favicon-32.png"));
// Apple touch icons are shown on a square; fill the corners black so iOS does not add white.
await sharp(svg, { density: 300 })
  .resize(180, 180)
  .flatten({ background: "#000000" })
  .png()
  .toFile(join(assets, "apple-touch-icon.png"));

console.log("wrote favicon-32.png and apple-touch-icon.png");
