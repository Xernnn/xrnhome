// The connection to the home server (server/xrnhome-sync.py): its address and
// login, kept in the phone's secure storage, and authenticated requests to it.
// In the browser the page itself comes from the home server, behind that login,
// so the browser already holds it and nothing here needs to: requests go to the
// same place, and no password is ever stored. A browser page served from
// anywhere else (the dev server) doesn't sync.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "xrnhome_home_server";

export const WEB_ROOT = "/xrnhome";

const inBrowser = Platform.OS === "web";
const servedByHomeServer =
  inBrowser &&
  typeof window !== "undefined" &&
  (window.location.pathname === WEB_ROOT ||
    window.location.pathname.startsWith(`${WEB_ROOT}/`));

export const syncAvailable = !inBrowser || servedByHomeServer;

// What the words on screen call this device, and what the server's log does.
export const deviceName = inBrowser ? "laptop" : "phone";

export const normalizeUrl = (url) => (url || "").trim().replace(/\/+$/, "");

// The server sits behind HTTPS (Tailscale Funnel); a password never goes out
// in the clear.
export const isValidUrl = (url) => /^https:\/\/[^/\s]+\S*$/i.test(url);

export async function loadServer() {
  if (inBrowser) {
    return servedByHomeServer ? { url: WEB_ROOT, browser: true } : null;
  }
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const server = raw ? JSON.parse(raw) : null;
    return server && server.url && server.user && server.password ? server : null;
  } catch (error) {
    console.error("Failed to read the home server login:", error);
    return null;
  }
}

export async function saveServer(server) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(server));
}

export async function clearServer() {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch (error) {
    console.error("Failed to forget the home server login:", error);
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Base64 of the text's UTF-8 bytes, for the Basic auth header.
const base64 = (text) => {
  const bytes = [];
  for (const ch of String(text)) {
    let c = ch.codePointAt(0);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else {
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63)
      );
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
};

export const authHeaders = (server) => ({
  ...(server.browser
    ? {}
    : { Authorization: `Basic ${base64(`${server.user}:${server.password}`)}` }),
  "X-Device": deviceName,
});

export class ServerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// What to tell the person when a request didn't work.
export const failureText = (status) => {
  if (status === 401) return "Wrong user name or password.";
  if (status === 429) return "Too many wrong passwords. Try again in 15 minutes.";
  if (status === 404) return "Nothing answers at that address. Check it ends in /xrnhome.";
  if (status >= 500) return "The home server had a problem. Try again later.";
  if (status) return `The home server answered ${status}.`;
  return `Can't reach the home server. Check the ${deviceName} is online.`;
};

export const errorFrom = (res) => new ServerError(res.status, failureText(res.status));

export async function call(server, path, options = {}) {
  const { method = "GET", headers = {}, body, timeoutMs = 20000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${server.url}${path}`, {
      method,
      headers: { ...authHeaders(server), ...headers },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    throw new ServerError(0, failureText(0));
  } finally {
    clearTimeout(timer);
  }
}

// `"7"` or `W/"7"` → 7.
export const etagVersion = (header) => {
  const n = parseInt(String(header || "").replace(/^W\//, "").replace(/"/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
