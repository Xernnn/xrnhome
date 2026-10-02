import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { CURRENT_SCHEMA_VERSION } from "./storage";

const BACKUP_VERSION = 3;

// Writes all items to a JSON file and opens the system share sheet.
export const exportData = async (items) => {
  const payload = {
    app: "xrnhome",
    version: BACKUP_VERSION,
    // Item schema the items are written in (see storage.js). Backups made
    // before this field existed use schema 1.
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    items: Array.isArray(items) ? items : [],
  };
  const json = JSON.stringify(payload, null, 2);
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) {
    throw new Error("No writable directory available for export.");
  }
  const fileUri = `${dir}xrnhome-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Export xrnhome data",
      UTI: "public.json",
    });
  }
  return fileUri;
};

// Lets the user pick a JSON backup file and returns { items, schemaVersion }.
// Returns null if the user cancels. Throws on an invalid file. Older backups
// (including PantryPal ones) carry no schemaVersion and are read as schema 1.
export const importData = async () => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }
  const asset = result.assets && result.assets[0];
  if (!asset) {
    return null;
  }

  const content = await FileSystem.readAsStringAsync(asset.uri);
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : parsed.items;

  if (!Array.isArray(items)) {
    throw new Error("This file doesn't look like an xrnhome backup.");
  }
  const schemaVersion =
    !Array.isArray(parsed) && Number.isFinite(parsed.schemaVersion)
      ? parsed.schemaVersion
      : 1;
  return { items, schemaVersion };
};
