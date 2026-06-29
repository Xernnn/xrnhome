import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

const BACKUP_VERSION = 2;

// Writes all items to a JSON file and opens the system share sheet.
export const exportData = async (items) => {
  const payload = {
    app: "PantryPal",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    items: Array.isArray(items) ? items : [],
  };
  const json = JSON.stringify(payload, null, 2);
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!dir) {
    throw new Error("No writable directory available for export.");
  }
  const fileUri = `${dir}pantrypal-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Export PantryPal data",
      UTI: "public.json",
    });
  }
  return fileUri;
};

// Lets the user pick a JSON backup file and returns the parsed items array.
// Returns null if the user cancels. Throws on an invalid file.
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
    throw new Error("This file doesn't look like a PantryPal backup.");
  }
  return items;
};
