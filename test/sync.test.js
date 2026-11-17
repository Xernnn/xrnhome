import * as FileSystem from "expo-file-system/legacy";

import { itemsHash, pushItems, snapshot, withLocalPhotos } from "../src/utils/sync";

jest.mock("expo-secure-store", () => ({}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  cacheDirectory: "file:///cache/",
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  uploadAsync: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));

const server = { url: "https://example.test/xrnhome", user: "u", password: "p" };
const items = [
  { id: "1", name: "A", photo: "a.jpg" },
  { id: "2", name: "B", photo: "b.jpg" },
  { id: "3", name: "C", photo: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  FileSystem.getInfoAsync.mockResolvedValue({ exists: false });
});

describe("bringing the photos back", () => {
  it("points every item at its downloaded photo", async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 200 });
    const result = await withLocalPhotos(server, items);
    expect(result.missing).toBe(0);
    expect(result.items.map((i) => i.imageUri)).toEqual([
      "file:///docs/xrnhome_images/a.jpg",
      "file:///docs/xrnhome_images/b.jpg",
      null,
    ]);
    expect(FileSystem.moveAsync).toHaveBeenCalledTimes(2);
  });

  it("stops the whole restore when the network drops", async () => {
    FileSystem.downloadAsync
      .mockResolvedValueOnce({ status: 200 })
      .mockRejectedValueOnce(new Error("connection lost"));
    await expect(withLocalPhotos(server, items)).rejects.toThrow(
      "Can't reach the home server"
    );
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///docs/xrnhome_images/b.jpg.part",
      { idempotent: true }
    );
  });

  it("stops when the server has trouble", async () => {
    FileSystem.downloadAsync.mockResolvedValue({ status: 503 });
    await expect(withLocalPhotos(server, items)).rejects.toThrow("had a problem");
  });

  it("carries on past a photo the server truly doesn't have, and counts it", async () => {
    FileSystem.downloadAsync
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 200 });
    const result = await withLocalPhotos(server, items);
    expect(result.missing).toBe(1);
    expect(result.items[0].imageUri).toBeNull();
    expect(result.items[1].imageUri).toContain("b.jpg");
  });

  it("doesn't fetch what's already here, so a retry picks up where it stopped", async () => {
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    await withLocalPhotos(server, items);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it("refuses an unsafe photo name from the server", async () => {
    const result = await withLocalPhotos(server, [
      { id: "1", photo: "../../evil.jpg" },
    ]);
    expect(result.items[0].imageUri).toBeNull();
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });
});

describe("what goes to the server", () => {
  it("carries the person's categories", () => {
    const doc = snapshot([], [{ label: "Baby", room: "household", icon: "x" }]);
    expect(doc.categories).toEqual([{ label: "Baby", room: "household" }]);
  });

  it("counts a new category as a change worth sending", () => {
    expect(itemsHash([], [])).not.toBe(
      itemsHash([], [{ label: "Baby", room: "household" }])
    );
  });
});

describe("sending the items", () => {
  it("still sends them when the server has no room left for a photo", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    FileSystem.getInfoAsync.mockResolvedValue({ exists: true });
    FileSystem.uploadAsync.mockResolvedValue({ status: 507 });
    const sent = [];
    global.fetch = jest.fn(async (url, { method = "GET", body } = {}) => {
      if (url.endsWith("/photos")) {
        return { status: 200, ok: true, json: async () => [] };
      }
      sent.push([method, JSON.parse(body)]);
      return { status: 200, ok: true, headers: { get: () => '"5"' } };
    });
    const mine = [{ id: "1", name: "A", imageUri: "file:///docs/xrnhome_images/a.jpg" }];
    const result = await pushItems(server, mine, 4, [], "w1");
    expect(result.version).toBe(5);
    expect(sent.map(([method, doc]) => [method, doc.items[0].photo])).toEqual([["PUT", "a.jpg"]]);
  });
});
