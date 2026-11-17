import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import {
  deleteImage,
  importedImageUri,
  isPersistedImage,
  persistImage,
  photoFileName,
  sweepPhotos,
} from "../src/utils/images";

jest.mock("expo-secure-store", () => ({}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  readDirectoryAsync: jest.fn(async () => []),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(async () => ({ uri: "file:///cache/smaller.jpg" })),
  SaveFormat: { JPEG: "jpeg" },
}));

// react-native-web's Image.getSize, as in the laptop version: callbacks only, and
// nothing returned. It calls `success` without looking, from a timer that only
// stops once that call has gone through.
const sizeIs = (width, height) =>
  jest.spyOn(Image, "getSize").mockImplementation((uri, success) => {
    setTimeout(() => success(width, height), 0);
  });

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe("a picked photo", () => {
  it("is shrunk when it's big, where Image.getSize only takes callbacks", async () => {
    sizeIs(4000, 3000);
    const saved = await persistImage("file:///cache/picked.jpg");
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      "file:///cache/picked.jpg",
      [{ resize: { width: 1280 } }],
      { compress: 0.75, format: "jpeg" }
    );
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: "file:///cache/smaller.jpg",
      to: saved,
    });
    expect(saved).toMatch(/^file:\/\/\/docs\/xrnhome_images\/.+\.jpg$/);
  });

  it("is shrunk by its longer side", async () => {
    sizeIs(1500, 3000);
    await persistImage("file:///cache/tall.jpg");
    expect(ImageManipulator.manipulateAsync.mock.calls[0][1]).toEqual([
      { resize: { height: 1280 } },
    ]);
  });

  it("is kept as it is when it's small enough", async () => {
    sizeIs(800, 600);
    await persistImage("file:///cache/small.png");
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(FileSystem.copyAsync.mock.calls[0][0].from).toBe("file:///cache/small.png");
  });

  it("is copied as it is when its size can't be read", async () => {
    jest.spyOn(Image, "getSize").mockImplementation((uri, success, failure) => {
      setTimeout(() => failure(), 0);
    });
    await persistImage("file:///cache/odd.heic");
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(FileSystem.copyAsync.mock.calls[0][0].from).toBe("file:///cache/odd.heic");
  });
});

describe("a picked photo that can't be copied", () => {
  it("fails the save instead of leaving the item on the picker's passing copy", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    sizeIs(800, 600);
    FileSystem.copyAsync.mockRejectedValueOnce(new Error("no space"));
    await expect(persistImage("file:///cache/ImagePicker/picked.jpg")).rejects.toThrow("couldn't be saved");
  });
});

describe("a photo path from a backup file", () => {
  const climbing = [
    "file:///docs/xrnhome_images/../../databases/RKStorage",
    "file:///docs/xrnhome_images/%2e%2e/%2e%2e/databases/RKStorage",
    "file:///docs/xrnhome_images/sub/a.jpg",
    "file:///docs/pantrypal_images/../xrnhome_images/a.jpg",
  ];

  it.each(climbing)("isn't ours when it leaves our folder: %s", async (uri) => {
    expect(isPersistedImage(uri)).toBe(false);
    expect(photoFileName(uri)).toBeNull();
    await deleteImage(uri);
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(importedImageUri(uri)).toBeNull();
  });

  it("is kept when it's a photo straight inside our folder", async () => {
    const ours = "file:///docs/xrnhome_images/1731-abc.jpg";
    expect(photoFileName(ours)).toBe("1731-abc.jpg");
    expect(importedImageUri(ours)).toBe(ours);
    await deleteImage(ours);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(ours, { idempotent: true });
  });

  it("is dropped when it names any other file on the phone", () => {
    expect(importedImageUri("file:///docs/notes.jpg")).toBeNull();
    expect(importedImageUri("file:///data/somewhere/else.jpg")).toBeNull();
    expect(importedImageUri("content://media/external/images/1")).toBe(
      "content://media/external/images/1"
    );
  });
});

describe("the photo folder", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const daysAgo = (days) => (now - days * 86400000) / 1000;

  it("loses the photos nothing names that aren't new, and keeps the rest", async () => {
    const dir = "file:///docs/xrnhome_images/";
    const ages = { "kept.jpg": 30, "gone.jpg": 30, "gone.jpg.part": 3, "fresh.jpg": 0.1 };
    FileSystem.readDirectoryAsync.mockResolvedValue(Object.keys(ages));
    FileSystem.getInfoAsync.mockImplementation(async (uri) => ({
      exists: true,
      isDirectory: false,
      modificationTime: daysAgo(ages[uri.slice(dir.length)]),
    }));
    expect(await sweepPhotos(new Set([`${dir}kept.jpg`]), now)).toBe(2);
    expect(FileSystem.deleteAsync.mock.calls.map(([uri]) => uri).sort()).toEqual([
      `${dir}gone.jpg`,
      `${dir}gone.jpg.part`,
    ]);
  });
});
