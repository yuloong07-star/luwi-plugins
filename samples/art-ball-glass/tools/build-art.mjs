#!/usr/bin/env node
/**
 * 「深海琉璃」浮标外观 · 素材生成器
 *
 * 纯 Node，零第三方依赖（自己写 PNG 编码），于是手机、Windows、Linux 上都能直接跑：
 *
 *     node tools/build-art.mjs
 *
 * 产出的东西：
 *   plugin/art/ball-{idle,listening,thinking,speaking,peeked,failed}.png   每个状态一张静态图
 *   plugin/art/listen/frame-00..23.png                                      listening 的脉冲帧序列
 *
 * 想改配色就改下面 STATES 里那几行，重跑一遍即可。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ART = join(ROOT, 'plugin', 'art');
const LISTEN = join(ART, 'listen');

const SIZE = 240;   // 240px 画一张 48dp 的球，够清楚又不占包体
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 84;       // 球半径
const HALO = 22;    // 光晕向外衰减的宽度

/** 状态 → 球心色 / 球缘色 / 光环色 */
const STATES = {
  idle:      { core: [0x49, 0x8c, 0xd6], edge: [0x08, 0x1b, 0x33], ring: [0x7f, 0xc8, 0xff] },
  listening: { core: [0x3a, 0xcb, 0xa2], edge: [0x04, 0x26, 0x20], ring: [0x6e, 0xf3, 0xb0] },
  thinking:  { core: [0xe6, 0xa2, 0x35], edge: [0x2a, 0x1b, 0x04], ring: [0xff, 0xc2, 0x4d] },
  speaking:  { core: [0xa1, 0x73, 0xf5], edge: [0x1f, 0x0d, 0x31], ring: [0xb3, 0x88, 0xff] },
  peeked:    { core: [0xec, 0x7a, 0xba], edge: [0x2e, 0x0c, 0x24], ring: [0xff, 0x9a, 0xd5] },
  failed:    { core: [0xe4, 0x5b, 0x5b], edge: [0x2e, 0x07, 0x0b], ring: [0xff, 0x6b, 0x6b] },
};

const FRAME_COUNT = 24;
const FRAME_FPS = 12;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** source-over 合成两个 [r,g,b,a(0..1)] */
const over = (s, d) => {
  const a = s[3] + d[3] * (1 - s[3]);
  if (a <= 0) return [0, 0, 0, 0];
  return [
    (s[0] * s[3] + d[0] * d[3] * (1 - s[3])) / a,
    (s[1] * s[3] + d[1] * d[3] * (1 - s[3])) / a,
    (s[2] * s[3] + d[2] * d[3] * (1 - s[3])) / a,
    a,
  ];
};

/** 一个采样点上的颜色（球体 + 光环） */
function sample(px, py, st, pulse, ringScale) {
  const dx = px - CX;
  const dy = py - CY;
  const d = Math.hypot(dx, dy);

  // 呼吸：脉冲相位让球体大小轻轻起伏
  const rr = R * (1 + 0.012 * (pulse - 0.5) * 2);

  let out = [0, 0, 0, 0];

  const cov = clamp(rr - d + 0.5, 0, 1);
  if (cov > 0) {
    const t = Math.min(1, d / rr);
    let col = mix(st.core, st.edge, Math.pow(t, 1.4));       // 中心亮、边缘沉下去
    col = mix(col, st.ring, Math.pow(t, 7) * 0.55);          // 贴近边缘透出状态色的光
    const h1 = Math.exp(
      -(((px - (CX - 0.34 * rr)) ** 2 + (py - (CY - 0.4 * rr)) ** 2) / (2 * (0.3 * rr) ** 2)),
    );
    col = mix(col, [255, 255, 255], h1 * 0.55);              // 左上一块主高光
    const h2 = Math.exp(
      -(((px - (CX + 0.08 * rr)) ** 2 + (py - (CY + 0.68 * rr)) ** 2) / (2 * (0.26 * rr) ** 2)),
    );
    col = mix(col, [255, 255, 255], h2 * 0.14);              // 右下一点反射，免得是颗平圆
    out = [col[0], col[1], col[2], cov];
  }

  const inner = R * ringScale;
  if (d > inner - 1) {
    const fall = Math.max(0, 1 - (d - inner) / HALO);
    const ga = Math.pow(fall, 2.0) * (0.35 + 0.65 * pulse);
    if (ga > 0.002) {
      const gc = mix(st.ring, [255, 255, 255], 0.18);
      out = over([gc[0], gc[1], gc[2], ga], out);
    }
  }
  return out;
}

/** 3x3 超采样渲染一张 RGBA 图 */
function render(st, pulse, ringScale) {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const SS = 3;
  const n = SS * SS;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, st, pulse, ringScale);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (y * SIZE + x) * 4;
      if (a > 0) {
        buf[i] = Math.round(clamp(r / a, 0, 255));
        buf[i + 1] = Math.round(clamp(g / a, 0, 255));
        buf[i + 2] = Math.round(clamp(b / a, 0, 255));
        buf[i + 3] = Math.round(clamp((a / n) * 255, 0, 255));
      }
    }
  }
  return buf;
}

// ---- 最小 PNG 编码（RGBA8，逐行 filter 0）----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(rgba) {
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function save(path, buf) {
  writeFileSync(path, buf);
  const kb = (statSync(path).size / 1024).toFixed(1);
  console.log('  %s  %s KB', path.replace(ROOT + '/', '').padEnd(46), kb.padStart(6));
}

function main() {
  mkdirSync(ART, { recursive: true });
  mkdirSync(LISTEN, { recursive: true });

  console.log('静态状态图：');
  for (const [name, st] of Object.entries(STATES)) {
    // 静态图上给一点稳定的光环强度，看着像一颗会呼吸的球但不刺眼
    const pulse = name === 'listening' ? 0.75 : 0.55;
    save(join(ART, `ball-${name}.png`), png(render(st, pulse, 1)));
  }

  console.log('listening 脉冲帧序列（%d 帧 / %d fps）：', FRAME_COUNT, FRAME_FPS);
  const st = STATES.listening;
  for (let f = 0; f < FRAME_COUNT; f++) {
    const phase = Math.sin((f / FRAME_COUNT) * Math.PI * 2);
    const pulse = 0.45 + 0.55 * ((phase + 1) / 2);       // 0.45 .. 1.0
    const ringScale = 1 + 0.05 * ((phase + 1) / 2);      // 光圈向外扩一点再收回
    const name = `frame-${String(f).padStart(2, '0')}.png`;
    save(join(LISTEN, name), png(render(st, pulse, ringScale)));
  }
  console.log('完成。');
}

main();
