// Reading a backup file (src/utils/backup.js).
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { importData } from "../src/utils/backup";

jest.mock("expo-secure-store", () => ({}));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("expo-sharing", () => ({}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  readAsStringAsync: jest.fn(),
}));

const backup = (items) => {
  DocumentPicker.getDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///cache/backup.json" }],
  });
  FileSystem.readAsStringAsync.mockResolvedValue(
    JSON.stringify({ app: "xrnhome", version: 3, schemaVersion: 2, items })
  );
};

it("keeps only photo paths inside the app's own photo folder", async () => {
  backup([
    { id: "1", name: "Milk", imageUri: "file:///docs/xrnhome_images/1731-abc.jpg" },
    { id: "2", name: "Rice", imageUri: "file:///docs/xrnhome_images/../../databases/RKStorage" },
    { id: "3", name: "Tea", imageUri: "file:///docs/elsewhere/tea.jpg" },
    { id: "4", name: "Salt", imageUri: null },
  ]);
  const { items } = await importData();
  expect(items.map((item) => item.imageUri)).toEqual([
    "file:///docs/xrnhome_images/1731-abc.jpg",
    null,
    null,
    null,
  ]);
});
