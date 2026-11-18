// New builds of the app from the home server, as xrnrule gets its own: the
// release script (scripts/release.mjs) puts an APK and app.json under
// /update/, the app sees a higher build number there, downloads the APK and
// hands it to Android's installer once its SHA-256 is the one app.json gives.
// Android only takes it if it carries the same signature as the installed app.
import { Platform } from "react-native";
import * as Application from "expo-application";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Network from "expo-network";

import { ServerError, authHeaders, call, errorFrom, failureText } from "./homeServer";
import { createSha256 } from "./sha256";

const UPDATE_DIR = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}update/`
  : null;
const APK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.apk$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HASH_CHUNK = 1 << 20;

// An APK only means something to Android.
export const updatesSupported = Platform.OS === "android";

export const onMobileData = async () => {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.CELLULAR;
  } catch (error) {
    return false;
  }
};

export const installedBuild = () => Number(Application.nativeBuildVersion) || 0;
export const installedVersion = () => Application.nativeApplicationVersion || "";

// The server's latest release, or null when it has none yet:
// { versionCode, versionName, apk, size, sha256, md5 }. Without a SHA-256 there's
// nothing to check the download against, so it isn't one.
export async function fetchRelease(server) {
  const res = await call(server, "/update/app.json");
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw errorFrom(res);
  }
  const info = await res.json();
  if (
    !Number.isInteger(info?.versionCode) ||
    !APK_NAME.test(info?.apk || "") ||
    !SHA256.test(info?.sha256 || "")
  ) {
    throw new Error("The home server's app.json isn't one this app understands.");
  }
  return info;
}

// The file's SHA-256, read a megabyte at a time with a pause between, so the
// screen keeps moving through the tens of megabytes of an APK.
export async function fileSha256(path) {
  const handle = new File(path).open();
  try {
    const hash = createSha256();
    for (;;) {
      const bytes = handle.readBytes(HASH_CHUNK);
      if (!bytes.length) {
        break;
      }
      hash.update(bytes);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return hash.hex();
  } finally {
    handle.close();
  }
}

// Downloads the release's APK (or finds it already downloaded) and checks it is
// the one app.json names, by its SHA-256: MD5, which this went by, lets a file
// be made to match another's. Returns the file.
export async function downloadRelease(server, info, onProgress) {
  if (!UPDATE_DIR) {
    throw new Error("Updates only work in the phone app.");
  }
  await FileSystem.makeDirectoryAsync(UPDATE_DIR, { intermediates: true }).catch(() => {});
  const file = `${UPDATE_DIR}${info.apk}`;
  const matches = async () => {
    const got = await FileSystem.getInfoAsync(file);
    if (!got.exists || (Number.isFinite(info.size) && got.size !== info.size)) {
      return false;
    }
    try {
      return (await fileSha256(file)) === info.sha256;
    } catch (error) {
      return false;
    }
  };
  if (await matches()) {
    return file;
  }
  // Only this release's APK is worth keeping.
  await FileSystem.deleteAsync(UPDATE_DIR, { idempotent: true });
  await FileSystem.makeDirectoryAsync(UPDATE_DIR, { intermediates: true });

  const task = FileSystem.createDownloadResumable(
    `${server.url}/update/${info.apk}`,
    file,
    { headers: authHeaders(server) },
    (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) {
        onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    }
  );
  let result;
  try {
    result = await task.downloadAsync();
  } catch (error) {
    await FileSystem.deleteAsync(file, { idempotent: true });
    throw new ServerError(0, failureText(0));
  }
  if (!result || result.status !== 200) {
    await FileSystem.deleteAsync(file, { idempotent: true });
    throw new ServerError(result?.status || 0, failureText(result?.status || 0));
  }
  if (!(await matches())) {
    await FileSystem.deleteAsync(file, { idempotent: true });
    throw new Error("The download came out wrong. Try again.");
  }
  return file;
}

// Opens Android's "update this app?" screen for the downloaded APK. The first
// time, Android asks to allow installs from xrnhome.
export async function openInstaller(file) {
  const uri = await FileSystem.getContentUriAsync(file);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: uri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: "application/vnd.android.package-archive",
  });
}

// Drops downloads the installed app has caught up with.
export async function clearOldDownloads() {
  if (UPDATE_DIR) {
    await FileSystem.deleteAsync(UPDATE_DIR, { idempotent: true }).catch(() => {});
  }
}
