"use strict";

const zlib = require("node:zlib");

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, checksum]);
}

function makePng(width, height, palette) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  const [base, stripe, spot] = palette;

  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const diagonal = Math.abs(((x + y * 2) % 120) - 60) < 11;
      const centre = Math.abs(x - width / 2) < width / 6 &&
        Math.abs(y - height / 2) < height / 7;
      const colour = centre ? spot : diagonal ? stripe : base;
      const offset = row + 1 + x * 4;
      scanlines[offset] = colour[0];
      scanlines[offset + 1] = colour[1];
      scanlines[offset + 2] = colour[2];
      scanlines[offset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function previewPhotoPayloads() {
  const definitions = [
    ["preview-coral.png", 360, 480, [[226, 91, 82], [255, 212, 59], [255, 245, 232]]],
    ["preview-blue.png", 480, 360, [[35, 87, 255], [222, 210, 242], [255, 255, 255]]],
    ["preview-mint.png", 420, 420, [[57, 184, 127], [255, 216, 234], [17, 17, 17]]]
  ];

  return definitions.map(([name, width, height, palette]) => ({
    name,
    mimeType: "image/png",
    buffer: makePng(width, height, palette)
  }));
}

module.exports = { previewPhotoPayloads };
