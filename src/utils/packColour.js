import { unzlibSync } from "fflate";

// Every card wears the colour of the pack in its photo. This is the pure part:
// finding that colour in a small copy of the photo, and turning it into a shade
// white text can sit on.

const HUE_BUCKETS = 24;
// Benchtops, shelves and shadows are what a pack is photographed on, so they don't count.
const MIN_SATURATION = 0.38;
const MIN_BRIGHTNESS = 0.3;

const PACK_SATURATION = 0.62; // at least, so that a shade looks like a colour
const PACK_LIGHTNESS = 0.38; // at most; yellows and oranges go darker to stay readable
const GREY_SATURATION = 0.1; // below this a colour stays grey, or it would turn red
export const MIN_CONTRAST = 4.5; // what test/theme.test.js holds text colours to

const toHsv = (r, g, b) => {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let hue = 0;
  if (delta > 0) {
    if (max === r) {
      hue = ((g - b) / delta + 6) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
  }
  return { hue: hue / 6, saturation: max ? delta / max : 0, value: max / 255 };
};

// The most colourful hue among RGBA pixels, as a hex colour, or null for a photo
// with no colour in it. Strong pixels count for more, so a small bright label
// beats a big pale background.
export const pickPackColour = (pixels) => {
  const buckets = new Map();
  for (let at = 0; at + 3 < pixels.length; at += 4) {
    const [r, g, b, a] = [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]];
    const { hue, saturation, value } = toHsv(r, g, b);
    if (a < 128 || saturation < MIN_SATURATION || value < MIN_BRIGHTNESS) {
      continue;
    }
    // Half a bucket round, so that red isn't split across both ends of the wheel.
    const key = Math.floor(((hue + 0.5 / HUE_BUCKETS) % 1) * HUE_BUCKETS);
    const weight = saturation * saturation * value;
    const bucket = buckets.get(key) || { weight: 0, r: 0, g: 0, b: 0 };
    bucket.weight += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  let best = null;
  buckets.forEach((bucket) => {
    if (!best || bucket.weight > best.weight) {
      best = bucket;
    }
  });
  if (!best) {
    return null;
  }
  const part = (total) =>
    Math.round(total / best.weight)
      .toString(16)
      .padStart(2, "0");
  return `#${part(best.r)}${part(best.g)}${part(best.b)}`;
};

const toHsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue: toHsv(r * 255, g * 255, b * 255).hue, saturation, lightness };
};

const fromHsl = (hue, saturation, lightness) => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = (shift) => {
    const k = (shift + hue * 12) % 12;
    const value = lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${part(0)}${part(8)}${part(4)}`;
};

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastOnWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

// The card's colour: the same hue as what was found, strong and dark enough for
// white text whatever the hue. Works the same in both themes.
export const packShade = (hex) => {
  const { hue, saturation } = toHsl(hex);
  const strength = saturation < GREY_SATURATION ? saturation : Math.max(saturation, PACK_SATURATION);
  let lightness = PACK_LIGHTNESS;
  let shade = fromHsl(hue, strength, lightness);
  while (contrastOnWhite(shade) < MIN_CONTRAST && lightness > 0.05) {
    lightness -= 0.01;
    shade = fromHsl(hue, strength, lightness);
  }
  return shade;
};

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map([...BASE64].map((char, value) => [char, value]));

export const base64ToBytes = (text) => {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let held = 0;
  let out = 0;
  for (const char of clean) {
    bits = (bits << 6) | BASE64_VALUES.get(char);
    held += 6;
    if (held >= 8) {
      held -= 8;
      bytes[out++] = (bits >> held) & 255;
      bits &= (1 << held) - 1;
    }
  }
  return bytes;
};

const paeth = (left, up, corner) => {
  const estimate = left + up - corner;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toCorner = Math.abs(estimate - corner);
  if (toLeft <= toUp && toLeft <= toCorner) {
    return left;
  }
  return toUp <= toCorner ? up : corner;
};

const unfilter = (raw, width, height, channels) => {
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[to + x - channels] : 0;
      const up = y > 0 ? out[to + x - stride] : 0;
      const corner = y > 0 && x >= channels ? out[to + x - stride - channels] : 0;
      const guess = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
      out[to + x] = (raw[from + x] + guess) & 255;
    }
  }
  return out;
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// RGBA pixels from a small PNG, the only way to read a photo's pixels on a phone
// without native code of our own. Null for a kind of PNG the image library
// doesn't write, so the card falls back to its category's colour.
export const decodePng = (bytes) => {
  if (PNG_SIGNATURE.some((value, at) => bytes[at] !== value)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = [];
  let header = null;
  let at = PNG_SIGNATURE.length;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") {
      header = {
        width: view.getUint32(at + 8),
        height: view.getUint32(at + 12),
        depth: data[8],
        type: data[9],
        interlaced: data[12] !== 0,
      };
    } else if (kind === "IDAT") {
      parts.push(data);
    } else if (kind === "IEND") {
      break;
    }
    at += 12 + length;
  }
  if (
    !header ||
    header.depth !== 8 ||
    header.interlaced ||
    (header.type !== 2 && header.type !== 6)
  ) {
    return null;
  }
  const packed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let filled = 0;
  parts.forEach((part) => {
    packed.set(part, filled);
    filled += part.length;
  });
  const { width, height } = header;
  const channels = header.type === 6 ? 4 : 3;
  const raw = unzlibSync(packed);
  if (raw.length < (width * channels + 1) * height) {
    return null;
  }
  const flat = unfilter(raw, width, height, channels);
  if (channels === 4) {
    return flat;
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgba.set(flat.subarray(pixel * 3, pixel * 3 + 3), pixel * 4);
    rgba[pixel * 4 + 3] = 255;
  }
  return rgba;
};
