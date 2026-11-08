import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import { base64ToBytes, decodePng } from "./packColour";

export const PIXEL_SIDE = 48;

// RGBA pixels of a tiny copy of a photo on this device.
export const photoPixels = async (uri) => {
  const small = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: PIXEL_SIDE, height: PIXEL_SIDE } }],
    { base64: true, format: ImageManipulator.SaveFormat.PNG }
  );
  FileSystem.deleteAsync(small.uri, { idempotent: true }).catch(() => {});
  return decodePng(base64ToBytes(small.base64));
};
