// A new build from the home server (src/utils/updates.js): what has to hold before
// the downloaded APK goes to Android's installer.
import { createHash } from "crypto";
import * as FileSystem from "expo-file-system/legacy";

import { createSha256 } from "../src/utils/sha256";
import { downloadRelease, fetchRelease } from "../src/utils/updates";

// The files the test has "on the phone", by path.
const mockDisk = new Map();

jest.mock("expo-secure-store", () => ({}));
jest.mock("expo-application", () => ({ nativeBuildVersion: "1" }));
jest.mock("expo-intent-launcher", () => ({}));
jest.mock("expo-network", () => ({}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  createDownloadResumable: jest.fn(),
}));
jest.mock("expo-file-system", () => ({
  File: class {
    constructor(path) {
      this.path = path;
    }
    open() {
      const bytes = mockDisk.get(this.path);
      let at = 0;
      return {
        readBytes: (n) => {
          const out = bytes.subarray(at, at + n);
          at += out.length;
          return out;
        },
        close: () => {},
      };
    }
  },
}));

const server = { url: "https://example.test/xrnhome", user: "u", password: "p" };
const hex = (algorithm, bytes) => createHash(algorithm).update(bytes).digest("hex");

describe("the SHA-256 the download is checked with", () => {
  it("is SHA-256, however the bytes are handed to it", () => {
    for (const size of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 70000]) {
      const bytes = new Uint8Array(size).map((_, i) => (i * 31 + size) & 0xff);
      expect([size, createSha256().update(bytes).hex()]).toEqual([size, hex("sha256", bytes)]);
      const pieces = createSha256();
      for (let at = 0; at < size; at += 7 + (at % 61)) {
        pieces.update(bytes.subarray(at, at + 7 + (at % 61)));
      }
      expect([size, pieces.hex()]).toEqual([size, hex("sha256", bytes)]);
    }
  });
});

describe("a release on the home server", () => {
  const good = new Uint8Array(3000).map((_, i) => i & 0xff);
  const info = {
    versionCode: 9,
    versionName: "1.2.1",
    apk: "xrnhome-9.apk",
    size: good.length,
    sha256: hex("sha256", good),
    md5: hex("md5", good),
  };
  const path = "file:///cache/update/xrnhome-9.apk";

  beforeEach(() => {
    jest.clearAllMocks();
    mockDisk.clear();
    FileSystem.getInfoAsync.mockImplementation(async (file) =>
      mockDisk.has(file) ? { exists: true, size: mockDisk.get(file).length, md5: info.md5 } : { exists: false }
    );
  });

  // What the server sends instead of `good`: the same size, and an MD5 made to
  // come out the same (MD5 collisions can be made to order).
  const downloads = (bytes) =>
    FileSystem.createDownloadResumable.mockImplementation((url, file) => ({
      downloadAsync: async () => {
        mockDisk.set(file, bytes);
        return { status: 200 };
      },
    }));

  it("is handed over when its SHA-256 is the one app.json gives", async () => {
    downloads(good);
    expect(await downloadRelease(server, info)).toBe(path);
  });

  it("isn't, when only its size and MD5 match", async () => {
    const other = good.map((b, i) => (i === 100 ? b ^ 1 : b));
    downloads(other);
    await expect(downloadRelease(server, info)).rejects.toThrow("came out wrong");
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(path, { idempotent: true });
  });

  it("downloaded earlier isn't taken on its MD5 either", async () => {
    mockDisk.set(path, good.map((b, i) => (i === 7 ? b ^ 1 : b)));
    downloads(good);
    expect(await downloadRelease(server, info)).toBe(path);
    expect(FileSystem.createDownloadResumable).toHaveBeenCalledTimes(1);
  });

  it("whose app.json gives no SHA-256 isn't one", async () => {
    const { sha256, ...withoutIt } = info;
    global.fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => withoutIt }));
    await expect(fetchRelease(server)).rejects.toThrow("app.json");
    global.fetch = jest.fn(async () => ({ status: 200, ok: true, json: async () => info }));
    expect(await fetchRelease(server)).toEqual(info);
  });
});
