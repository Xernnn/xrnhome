import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import { persistImage } from "../src/utils/images";

jest.mock("expo-secure-store", () => ({}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
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
