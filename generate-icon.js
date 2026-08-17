/* generate-icon.js — 晨间电台应用图标(简约现代风,纯 Node 像素绘制)
 * 设计:琥珀渐变圆角方底 + 白色播放三角 + 三条声波弧线(音频/电台极简符号)
 * 输出:desktop/build/icon.png(256) + icons/icon-512.png(512)
 * 用法:node generate-icon.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/* ---------- 工具 ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const alpha = (d) => clamp(0.5 - d, 0, 1);
function sdRoundRect(px, py, cx, cy, w, h, r) {
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdCircle(px, py, cx, cy, r) { return Math.hypot(px - cx, py - cy) - r; }
function sdSeg(px, py, ax, ay, bx, by, halfW) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)) - halfW;
}
/* 弧线:圆心 (cx,cy) 半径 r 半宽 halfW,角度范围 a0..a1(弧度) */
function sdArc(px, py, cx, cy, r, halfW, a0, a1) {
  const dx = px - cx, dy = py - cy;
  const ang = Math.atan2(dy, dx);
  const ring = Math.abs(Math.hypot(dx, dy) - r);
  if (ang >= a0 && ang <= a1) return ring - halfW;
  const d0 = Math.hypot(px - (cx + r * Math.cos(a0)), py - (cy + r * Math.sin(a0)));
  const d1 = Math.hypot(px - (cx + r * Math.cos(a1)), py - (cy + r * Math.sin(a1)));
  return Math.min(d0, d1) - halfW;
}
/* 三角形内判断 + 到三边最近距离(抗锯齿) */
function triDist(px, py, a, b, c) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, a[0], a[1], b[0], b[1]);
  const d2 = sign(px, py, b[0], b[1], c[0], c[1]);
  const d3 = sign(px, py, c[0], c[1], a[0], a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  if (hasNeg && hasPos) {
    // 外部:到三边距离取正最小值(注意符号)
    return Math.min(Math.abs(d1) / 800, Math.abs(d2) / 800, Math.abs(d3) / 800);
  }
  return -Math.min(Math.abs(d1), Math.abs(d2), Math.abs(d3)) / 800;
}

function render(size) {
  const s = size / 512;
  const cx = (size - 1) / 2, cy = (size - 1) / 2;
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);

  const bgTop = [255, 196, 107], bgBot = [255, 122, 47]; // 琥珀渐变
  const white = [255, 255, 255];
  const A = [198, 194], B = [198, 318], C = [330, 256]; // 播放三角(512 系)
  const arcs = [[336, 256, 34, 4.5, -1.05, 1.05], [336, 256, 62, 4.5, -1.05, 1.05], [336, 256, 90, 4.5, -1.05, 1.05]];

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x - cx) / s + 256, py = (y - cy) / s + 256;
      let r = 0, g = 0, b = 0, a = 0;
      const paint = (col, al) => {
        if (al <= 0) return;
        r += (col[0] - r) * al; g += (col[1] - g) * al; b += (col[2] - b) * al; a += (1 - a) * al;
      };

      /* 1. 渐变圆角方底 */
      const dBg = sdRoundRect(px, py, 256, 256, 416, 416, 112);
      if (dBg < 1) {
        const t = clamp((py - 48) / 416, 0, 1);
        paint([lerp(bgTop[0], bgBot[0], t), lerp(bgTop[1], bgBot[1], t), lerp(bgTop[2], bgBot[2], t)], alpha(dBg));
      }

      /* 2. 白色播放三角 */
      const dT = triDist(px, py, A, B, C);
      if (dT < 1) paint(white, alpha(dT));

      /* 3. 三条声波弧线 */
      arcs.forEach(function (arc) {
        const dA = sdArc(px, py, arc[0], arc[1], arc[2], arc[3], arc[4], arc[5]);
        if (dA < 1) paint(white, alpha(dA));
      });

      const o = y * rowBytes + 1 + x * 4;
      raw[o] = Math.round(r); raw[o + 1] = Math.round(g); raw[o + 2] = Math.round(b);
      raw[o + 3] = Math.round(a * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const root = path.resolve(__dirname);
fs.mkdirSync(path.join(root, 'desktop', 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
fs.writeFileSync(path.join(root, 'desktop', 'build', 'icon.png'), render(256));
fs.writeFileSync(path.join(root, 'icons', 'icon-512.png'), render(512));
console.log('OK: 简约现代图标已生成(256 + 512)');
