import { zlibSync } from "fflate";

import {
  MIN_CONTRAST,
  base64ToBytes,
  contrastOnWhite,
  decodePng,
  packShade,
  pickPackColour,
} from "../src/utils/packColour";

const fill = (count, [r, g, b, a = 255]) =>
  Array.from({ length: count }, () => [r, g, b, a]).flat();

const channels = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

const chunk = (kind, data) => {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length);
  bytes.set([...kind].map((char) => char.charCodeAt(0)), 4);
  bytes.set(data, 8);
  return bytes; // decodePng doesn't check the CRC, the last 4 bytes
};

const png = ({ width, height, type, depth = 8, interlace = 0 }, rows) => {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([depth, type, 0, 0, interlace], 8);
  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(Uint8Array.from(rows.flat()))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  parts.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return out;
};

describe("pickPackColour", () => {
  test("a small bright label beats a big dark benchtop", () => {
    const pixels = [...fill(900, [28, 24, 22]), ...fill(100, [220, 40, 30])];
    expect(pickPackColour(pixels)).toBe("#dc281e");
  });

  test("a small strong colour beats a big washed-out one", () => {
    const pale = fill(300, [200, 150, 110]);
    const strong = fill(100, [20, 90, 220]);
    const [r, , b] = channels(pickPackColour([...pale, ...strong]));
    expect(b).toBeGreaterThan(r);
  });

  test("reds on both sides of the wheel count as one colour", () => {
    const pixels = [
      ...fill(40, [230, 30, 40]), // just below 360 degrees
      ...fill(40, [230, 40, 30]), // just above 0
      ...fill(60, [30, 200, 60]),
    ];
    const [r, g] = channels(pickPackColour(pixels));
    expect(r).toBeGreaterThan(g);
  });

  test("a photo with no colour in it gives null, and so does a see-through one", () => {
    expect(pickPackColour(fill(100, [120, 120, 120]))).toBeNull();
    expect(pickPackColour(fill(100, [220, 40, 30, 0]))).toBeNull();
    expect(pickPackColour([])).toBeNull();
  });
});

describe("packShade", () => {
  test("white text is readable on it, whatever the colour", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      for (const lightness of [30, 50, 70, 90]) {
        const hex = `#${["00", "80", "ff"][hue % 3]}${(hue % 256)
          .toString(16)
          .padStart(2, "0")}${(lightness * 2).toString(16).padStart(2, "0")}`;
        expect(contrastOnWhite(packShade(hex))).toBeGreaterThanOrEqual(MIN_CONTRAST);
      }
    }
  });

  test("the pale and the yellow still come out readable", () => {
    for (const hex of ["#ffff00", "#fff7c2", "#eca52d", "#ffffff", "#00ff00", "#00ffff"]) {
      expect(contrastOnWhite(packShade(hex))).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  test("keeps the hue: a blue pack gives a blue card", () => {
    const [r, g, b] = channels(packShade("#59849f"));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  test("a grey stays grey instead of turning red", () => {
    const [r, g, b] = channels(packShade("#9e9e9e"));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8);
  });
});

describe("decodePng", () => {
  test("reads RGBA through every filter a PNG can use", () => {
    const first = [10, 20, 30, 255, 40, 50, 60, 255];
    const rows = [
      [0, ...first], // none
      [1, 7, 8, 9, 255, 1, 2, 3, 0], // sub
      [2, 1, 1, 1, 0, 2, 2, 2, 0], // up
      [3, 5, 5, 5, 100, 6, 6, 6, 50], // average
      [4, 9, 9, 9, 0, 1, 2, 3, 0], // paeth
    ];
    const pixels = decodePng(png({ width: 2, height: 5, type: 6 }, rows));
    expect([...pixels.slice(0, 8)]).toEqual(first);
    expect([...pixels.slice(8, 16)]).toEqual([7, 8, 9, 255, 8, 10, 12, 255]);
    expect([...pixels.slice(16, 24)]).toEqual([8, 9, 10, 255, 10, 12, 14, 255]);
    expect([...pixels.slice(24, 28)]).toEqual([9, 9, 10, 227]);
    expect([...pixels.slice(32, 36)]).toEqual([18, 18, 19, 227]);
  });

  test("turns RGB into opaque RGBA", () => {
    const rows = [[0, 1, 2, 3, 4, 5, 6]];
    const pixels = decodePng(png({ width: 2, height: 1, type: 2 }, rows));
    expect([...pixels]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  test("gives null for what it can't read, rather than wrong colours", () => {
    const row = [[0, 1, 2]];
    expect(decodePng(png({ width: 2, height: 1, type: 3 }, row))).toBeNull(); // palette
    expect(decodePng(png({ width: 1, height: 1, type: 6, depth: 16 }, row))).toBeNull();
    expect(decodePng(png({ width: 1, height: 1, type: 6, interlace: 1 }, row))).toBeNull();
    expect(decodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
    expect(decodePng(png({ width: 50, height: 50, type: 6 }, row))).toBeNull(); // cut short
  });

  test("the whole road from base64 to a colour", () => {
    const red = [220, 40, 30, 255];
    const rows = Array.from({ length: 4 }, () => [0, ...red, ...red, ...red, ...red]);
    const bytes = png({ width: 4, height: 4, type: 6 }, rows);
    const text = Buffer.from(bytes).toString("base64");
    expect(base64ToBytes(text)).toEqual(bytes);
    expect(pickPackColour(decodePng(base64ToBytes(text)))).toBe("#dc281e");
  });
});
