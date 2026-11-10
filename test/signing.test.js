// The installed app is signed with the React Native template's debug key (SHA-256 fac61745…,
// pinned as "signer" in ~/.config/xrnhome/release.json), and Android takes an update only when it
// is signed with the same key. So no config plugin may change which key release builds use:
// withXrnSigning did, picking xrnrule's and xrnloops' key whenever its properties file sat beside
// the repo, and every release from such a laptop was a build the phone would refuse.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const plugins = require(path.join(root, "app.json")).expo.plugins ?? [];

const localPlugins = plugins
  .map((entry) => (Array.isArray(entry) ? entry[0] : entry))
  .filter((name) => name.startsWith("."));

test("no plugin of this repo changes how release builds are signed", () => {
  for (const name of localPlugins) {
    const file = require.resolve(path.join(root, name));
    expect([name, /signingConfig|keystore|storeFile/.test(fs.readFileSync(file, "utf8"))]).toEqual([name, false]);
  }
});

test("the release script won't publish an APK whose signer it couldn't check", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "release.mjs"), "utf8");
  expect(script).toMatch(/if \(signer && !cert\)/);
});
