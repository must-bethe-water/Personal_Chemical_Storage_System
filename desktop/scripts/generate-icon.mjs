import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const output = process.argv[2];
if (!output) throw new Error("Output PNG path is required");

const size = 1024;
const pixels = Buffer.alloc((size * 4 + 1) * size);
const green = [23, 79, 61, 255];
const deepGreen = [15, 58, 44, 255];
const lime = [223, 243, 106, 255];
const pale = [239, 244, 235, 255];

function insideRoundedSquare(x, y, inset, radius) {
  const left = inset;
  const right = size - inset - 1;
  const top = inset;
  const bottom = size - inset - 1;
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insideCircle(x, y, cx, cy, radius) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function nearLine(x, y, ax, ay, bx, by, width) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  const px = ax + t * dx;
  const py = ay + t * dy;
  return (x - px) ** 2 + (y - py) ** 2 <= width ** 2;
}

for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  pixels[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const offset = row + 1 + x * 4;
    let color = [0, 0, 0, 0];
    if (insideRoundedSquare(x, y, 54, 214)) {
      color = y > 720 ? deepGreen : green;
      if (nearLine(x, y, 302, 324, 676, 264, 16) ||
          nearLine(x, y, 302, 324, 438, 650, 16) ||
          nearLine(x, y, 438, 650, 744, 630, 16)) color = pale;
      if (insideCircle(x, y, 302, 324, 104)) color = lime;
      if (insideCircle(x, y, 676, 264, 74)) color = pale;
      if (insideCircle(x, y, 438, 650, 88)) color = pale;
      if (insideCircle(x, y, 744, 630, 124)) color = lime;
    }
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return result;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(pixels, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(output, png);
