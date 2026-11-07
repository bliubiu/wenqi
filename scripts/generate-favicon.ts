#!/usr/bin/env bun
/**
 * 生成站点图标 src/app/favicon.ico（16×16 + 32×32 双层，32 位 BGRA，Windows DIB 格式）
 *
 * 视觉语言与 src/app/icon.svg 一致：深空圆底 + 金色星核 + 十字星芒（文气星系主题）。
 * 逐像素函数式着色，确定性生成，无第三方依赖。
 *
 * 用法：bun run scripts/generate-favicon.ts
 */

const OUT_PATH = 'src/app/favicon.ico';

/** 线性插值两个 RGB 颜色，t ∈ [0,1] */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
  ];
}

/** 绘制单层图标，返回 BGRA 像素（自底向上，DIB 行序） */
function drawLayer(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.469; // 圆底半径，留 1px 余量
  const coreR = R * 0.42; // 星核半径
  const rayW = Math.max(1, size * 0.045); // 星芒半宽

  // 深空径向：内 #1A2342 → 外 #04060D；星核：内 #FFF3C4 → 外 #D99A33；星芒亮金 #FFE9A8
  const spaceIn: [number, number, number] = [0x1a, 0x23, 0x42];
  const spaceOut: [number, number, number] = [0x04, 0x06, 0x0d];
  const coreIn: [number, number, number] = [0xff, 0xf3, 0xc4];
  const coreOut: [number, number, number] = [0xd9, 0x9a, 0x33];
  const rayColor: [number, number, number] = [0xff, 0xe9, 0xa8];

  for (let row = 0; row < size; row++) {
    // DIB 自底向上：row=0 对应最下方的像素行
    const y = size - 1 - row;
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const idx = (row * size + x) * 4;

      if (d > R) continue; // 圆外透明

      // 边缘 1.2px 渐隐抗锯齿
      const edgeFade = Math.max(0, Math.min(1, (R - d) / 1.2));
      const t = d / R;

      // 深空底色
      let [r, g, b] = lerpColor(spaceIn, spaceOut, t);

      // 十字星芒提亮（仅在十字带内，随距离衰减）
      const onRay = Math.abs(dx) <= rayW || Math.abs(dy) <= rayW;
      if (onRay) {
        const strength = Math.pow(Math.max(0, 1 - d / (R * 0.95)), 0.7) * 0.85;
        [r, g, b] = lerpColor([r, g, b], rayColor, strength);
      }

      // 星核覆盖
      if (d < coreR) {
        [r, g, b] = lerpColor(coreIn, coreOut, d / coreR);
      }

      px[idx] = b;
      px[idx + 1] = g;
      px[idx + 2] = r;
      px[idx + 3] = Math.round(255 * edgeFade);
    }
  }
  return px;
}

/** 组装单层 BITMAPINFOHEADER + 像素 + AND 掩码的二进制块 */
function buildLayer(size: number): Uint8Array {
  const pixels = drawLayer(size);
  const header = new Uint8Array(40);
  const view = new DataView(header.buffer);
  view.setUint32(0, 40, true); // biSize
  view.setInt32(4, size, true); // biWidth
  view.setInt32(8, size * 2, true); // biHeight（XOR + AND 双高）
  view.setUint16(12, 1, true); // biPlanes
  view.setUint16(14, 32, true); // biBitCount
  view.setUint32(16, 0, true); // biCompression = BI_RGB
  view.setUint32(20, size * size * 4, true); // biSizeImage

  // AND 掩码（1bpp，每行 4 字节对齐），32bpp 下透明由 alpha 负责，全 0
  const maskRow = Math.ceil(size / 8 / 4) * 4;
  const mask = new Uint8Array(maskRow * size);

  const layer = new Uint8Array(40 + pixels.length + mask.length);
  layer.set(header, 0);
  layer.set(pixels, 40);
  layer.set(mask, 40 + pixels.length);
  return layer;
}

function main(): void {
  const sizes = [16, 32];
  const layers = sizes.map(buildLayer);

  // ICONDIR + 各层 ICONDIRENTRY
  const dirSize = 6 + sizes.length * 16;
  const total = dirSize + layers.reduce((sum, l) => sum + l.length, 0);
  const ico = new Uint8Array(total);
  const view = new DataView(ico.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type = icon
  view.setUint16(4, sizes.length, true); // count

  let offset = dirSize;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    ico[entry] = size; // width（16/32 直接写字节值）
    ico[entry + 1] = size; // height
    ico[entry + 2] = 0; // 调色板数
    ico[entry + 3] = 0; // reserved
    view.setUint16(entry + 4, 1, true); // planes
    view.setUint16(entry + 6, 32, true); // bitCount
    view.setUint32(entry + 8, layers[i].length, true); // bytesInRes
    view.setUint32(entry + 12, offset, true); // offset
    ico.set(layers[i], offset);
    offset += layers[i].length;
  });

  Bun.write(OUT_PATH, ico);
  console.log(`[文气图标] 已生成 ${OUT_PATH}（${ico.length} 字节，${sizes.join('/')} 双层）`);
}

main();
