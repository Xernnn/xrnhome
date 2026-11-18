// What stops scripts/release.mjs before it builds or uploads anything, and the
// signer check after the build. Tested in test/release.test.js.
const { execFileSync } = require("child_process");

// The branch releases are made from.
const RELEASE_BRANCH = "master";

// Why the working tree at `root` isn't one to release from; empty if it is.
// What's built is what the folder holds, so it must be master with everything
// committed: a file not added would go into the build as well.
function treeRefusals(root) {
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const out = [];
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== RELEASE_BRANCH) out.push(`on ${branch}, not ${RELEASE_BRANCH}`);
  const changed = git("status", "--porcelain");
  if (changed) out.push(`not committed:\n${changed}`);
  return out;
}

// release.json's "signer", the installed app's certificate SHA-256, as
// apksigner prints it (hex, lower case, no colons). Required: Android takes an
// update only when it's signed with the same key, and without the pin a build
// signed with another one reached the server and the phone refused it.
function pinnedSigner(config, file = "release.json") {
  const signer = String(config?.signer || "").toLowerCase().replace(/:/g, "");
  if (!/^[0-9a-f]{64}$/.test(signer)) {
    throw new Error(`${file} needs "signer": the SHA-256 of the installed app's signing certificate`);
  }
  return signer;
}

// Throws unless `cert` (the built APK's, or null when it couldn't be read) is
// `signer`. Unchecked is as bad as wrong.
function checkSigner(cert, signer) {
  if (!cert) {
    throw new Error("can't read the APK's signer to check it against release.json's: set ANDROID_HOME to the Android SDK");
  }
  if (cert !== signer) {
    throw new Error(`the APK is signed by ${cert}, not the installed app's ${signer}: the phone would refuse it`);
  }
}

module.exports = { RELEASE_BRANCH, treeRefusals, pinnedSigner, checkSigner };
