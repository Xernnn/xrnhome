// Publishes a build of the app to the home server, which the installed app updates itself from:
//
//   node scripts/release.mjs          the phone app
//   node scripts/release.mjs --web    the laptop version
//
// The phone only takes a build newer than the one it has, so when the server already has
// app.json's android.versionCode (or a later one), it's bumped first. Then the native project is
// regenerated (expo prebuild, android/ is not in git), Gradle builds the release APK, and it goes
// up with an app.json that names it. The installed app looks every few hours, or at once from
// Settings → Check for updates.
//
// Reads ~/.config/xrnhome/release.json:
//   { "server": "https://<host>/xrnhome", "ssh": ["<ssh-host>", "<another way in>"],
//     "signer": "<SHA-256 of the signing certificate, optional>" }
// and uses the first ssh host that answers. The address never enters the repo. Android installs
// an update only if it's signed with the same key as the installed app; with "signer" set, a
// build signed any other way stops here instead of failing on the phone.
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execFileSync, spawnSync } from "child_process";
import { createHash } from "crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const APP_JSON = join(ROOT, "app.json");
const PACKAGE_JSON = join(ROOT, "package.json");
const ANDROID = join(ROOT, "android");
const APK_DIR = join(ANDROID, "app", "build", "outputs", "apk", "release");
const CONFIG = join(homedir(), ".config", "xrnhome", "release.json");
const REMOTE_DIR = "xrnhome-sync/data/update"; // the sync server's --data, from the ssh login's home
const WEB_DIR = "xrnhome-sync/data/web";
const WEB_BUILD = join(ROOT, "dist");

const { server, host, signer } = readConfig();
const ssh = (command, input) =>
  execFileSync("ssh", ["-o", "BatchMode=yes", host, command], {
    input,
    maxBuffer: 1 << 30,
    stdio: [input ? "pipe" : "ignore", "pipe", "inherit"],
  });
// Written beside its final name and moved into place, so nothing ever reads a half-written file.
const put = (name, data) =>
  ssh(`cat > ${REMOTE_DIR}/${name}.part && mv ${REMOTE_DIR}/${name}.part ${REMOTE_DIR}/${name}`, data);
ssh(`mkdir -p ${REMOTE_DIR}`);

if (process.argv.includes("--web")) {
  publishWeb();
  process.exit(0);
}

// app.json needs the login over https; ssh doesn't.
const liveText = ssh(`cat ${REMOTE_DIR}/app.json 2>/dev/null || true`).toString().trim();
const live = liveText ? JSON.parse(liveText) : null;
const appJson = JSON.parse(readFileSync(APP_JSON, "utf8"));
let versionCode = Number(appJson.expo.android.versionCode) || 1;
if (live && live.versionCode >= versionCode) {
  versionCode = live.versionCode + 1;
  appJson.expo.android.versionCode = versionCode;
  writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2) + "\n");
  console.log(`the server already has build ${live.versionCode}: app.json is now versionCode ${versionCode}`);
}

// From nothing, because prebuild keeps what it finds in android/: a manifest patched for a test
// build would otherwise reach the phone. It also rewrites package.json's scripts for a native
// project; this repo keeps Expo's.
rmSync(ANDROID, { recursive: true, force: true });
const packageJson = readFileSync(PACKAGE_JSON, "utf8");
try {
  run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], ROOT);
} finally {
  writeFileSync(PACKAGE_JSON, packageJson);
}
run("./gradlew", ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"], ANDROID);

const [built] = JSON.parse(readFileSync(join(APK_DIR, "output-metadata.json"), "utf8")).elements;
if (built.versionCode !== versionCode) {
  throw new Error(`built versionCode ${built.versionCode}, expected ${versionCode}`);
}
const apkPath = join(APK_DIR, built.outputFile);
const apk = readFileSync(apkPath);
const cert = signerOf(apkPath);
if (signer && cert && cert !== signer.toLowerCase().replace(/:/g, "")) {
  throw new Error(`the APK is signed by ${cert}, not the installed app's ${signer}: the phone would refuse it`);
}
const name = `xrnhome-${versionCode}.apk`;
const info = {
  versionCode,
  versionName: built.versionName,
  apk: name,
  size: apk.length,
  sha256: createHash("sha256").update(apk).digest("hex"),
  md5: createHash("md5").update(apk).digest("hex"),
};
console.log(`${name}: ${(apk.length / 1048576).toFixed(1)} MB, version ${built.versionName} (${versionCode})`);
if (cert) console.log(`signed by ${cert}`);

// The APK first and app.json last, so the phone never hears of a file that isn't there.
put(name, apk);
ssh(`cd ${REMOTE_DIR} && cp -f ${name} xrnhome.apk.part && mv xrnhome.apk.part xrnhome.apk`);
put("app.json", Buffer.from(JSON.stringify(info, null, 2) + "\n"));
ssh(`cd ${REMOTE_DIR} && for f in xrnhome-*.apk; do [ "$f" = ${name} ] || rm -f "$f"; done`);

// Without the login it must say 401: proof the route is there and guarded.
const res = await fetch(`${server}/update/app.json`, { cache: "no-store" });
if (res.status !== 401) {
  throw new Error(`${server}/update/app.json answered ${res.status} without the login, not 401: is xrnhome-sync running behind ${server}?`);
}
console.log(`published build ${versionCode}. The app finds it within a few hours, or at once from
Settings → Check for updates. A phone without the app: ${server}/update/xrnhome.apk (with the sync login)`);

// The laptop version needs no version number: the page is always the latest, and it takes the
// same server copy the phone does. The new files go up beside the old ones and swap in with two
// moves, so a page being opened meanwhile gets one or the other, whole.
function publishWeb() {
  rmSync(WEB_BUILD, { recursive: true, force: true });
  run("npx", ["expo", "export", "--platform", "web", "--output-dir", WEB_BUILD], ROOT, { XRNHOME_WEB: "1" });
  const files = execFileSync("tar", ["-C", WEB_BUILD, "-cz", "."], { maxBuffer: 1 << 30 });
  rmSync(WEB_BUILD, { recursive: true, force: true }); // app.json bundles everything it finds
  ssh(
    `rm -rf ${WEB_DIR}.new ${WEB_DIR}.old && mkdir -p ${WEB_DIR}.new && tar -xz -C ${WEB_DIR}.new && ` +
      `{ [ ! -e ${WEB_DIR} ] || mv ${WEB_DIR} ${WEB_DIR}.old; } && mv ${WEB_DIR}.new ${WEB_DIR} && rm -rf ${WEB_DIR}.old`,
    files
  );
  console.log(`published the laptop version: ${server}/`);
}

function readConfig() {
  if (!existsSync(CONFIG)) {
    console.error(`No ${CONFIG}. Create it with the sync server's public address and its ssh host:
  { "server": "https://<host>/xrnhome", "ssh": ["<ssh-host>"] }`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(CONFIG, "utf8"));
  const server = String(config.server || "").replace(/\/+$/, "");
  const hosts = [config.ssh].flat().filter(Boolean);
  if (!/^https:\/\/[^/]+/.test(server) || !hosts.length) {
    throw new Error(`${CONFIG} needs "server" (https://…) and "ssh"`);
  }
  const host = hosts.find(
    (h) => spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", h, "true"]).status === 0
  );
  if (!host) throw new Error(`none of ${hosts.join(", ")} answers over ssh`);
  return { server, host, signer: config.signer || null };
}

function run(command, args, cwd, env) {
  const r = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

// The signing certificate's SHA-256 (hex, no colons), from the SDK's apksigner; null without one.
function signerOf(file) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk || !existsSync(join(sdk, "build-tools"))) return null;
  const [newest] = readdirSync(join(sdk, "build-tools")).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const apksigner = join(sdk, "build-tools", newest, "apksigner");
  if (!existsSync(apksigner)) return null;
  const out = execFileSync(apksigner, ["verify", "--print-certs", file]).toString();
  const m = /certificate SHA-256 digest: ([0-9a-f]+)/.exec(out);
  return m ? m[1] : null;
}
