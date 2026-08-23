import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [iconset, output] = process.argv.slice(2);
if (!iconset || !output) throw new Error("Iconset and output paths are required");

const entries = [
  ["icp4", "icon_16x16.png"],
  ["ic11", "icon_16x16@2x.png"],
  ["icp5", "icon_32x32.png"],
  ["ic12", "icon_32x32@2x.png"],
  ["ic07", "icon_128x128.png"],
  ["ic13", "icon_128x128@2x.png"],
  ["ic08", "icon_256x256.png"],
  ["ic14", "icon_256x256@2x.png"],
  ["ic09", "icon_512x512.png"],
  ["ic10", "icon_512x512@2x.png"],
].map(([type, filename]) => {
  const image = readFileSync(join(iconset, filename));
  const entry = Buffer.alloc(image.length + 8);
  entry.write(type, 0, 4, "ascii");
  entry.writeUInt32BE(entry.length, 4);
  image.copy(entry, 8);
  return entry;
});

const length = 8 + entries.reduce((sum, entry) => sum + entry.length, 0);
const header = Buffer.alloc(8);
header.write("icns", 0, 4, "ascii");
header.writeUInt32BE(length, 4);
writeFileSync(output, Buffer.concat([header, ...entries], length));
