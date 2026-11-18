// What stops scripts/release.mjs (scripts/release-guard.js): a tree that isn't
// master with everything committed, and an APK whose signer isn't the pinned one.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { checkSigner, pinnedSigner, treeRefusals } = require("../scripts/release-guard");

const SIGNER = "ab".repeat(32);

test("a release is made from master with everything committed, or not at all", () => {
  // release.mjs built whatever the working tree held, a branch's or a half-done edit's.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "xrnhome-release-"));
  try {
    const git = (...args) =>
      execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], {
        stdio: "pipe",
      });
    git("init", "-q", "-b", "master");
    fs.writeFileSync(path.join(repo, "a.txt"), "1");
    git("add", "a.txt");
    git("commit", "-q", "-m", "one");
    expect(treeRefusals(repo)).toEqual([]);
    fs.writeFileSync(path.join(repo, "a.txt"), "2");
    expect(treeRefusals(repo)).toHaveLength(1); // a change not committed
    git("checkout", "-q", "-b", "topic");
    expect(treeRefusals(repo)).toHaveLength(2); // and a branch other than master
    git("checkout", "-q", "--", "a.txt");
    expect(treeRefusals(repo).join()).toMatch(/topic/);
    git("checkout", "-q", "master");
    fs.writeFileSync(path.join(repo, "new.js"), "");
    expect(treeRefusals(repo)).toHaveLength(1); // a file not added would be built too
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("release.json has to pin the installed app's signer", () => {
  expect(() => pinnedSigner({})).toThrow(/signer/);
  expect(() => pinnedSigner({ signer: "fac61745" })).toThrow(/signer/);
  const colons = SIGNER.toUpperCase().match(/../g).join(":");
  expect(pinnedSigner({ signer: colons })).toBe(SIGNER);
});

test("an APK goes up only when its signer is the pinned one, and was read", () => {
  expect(() => checkSigner(null, SIGNER)).toThrow(/can't read/);
  expect(() => checkSigner("cd".repeat(32), SIGNER)).toThrow(/would refuse/);
  expect(() => checkSigner(SIGNER, SIGNER)).not.toThrow();
});

test("the release script checks the tree before it reaches the server", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "scripts", "release.mjs"), "utf8");
  const at = (text) => script.indexOf(text);
  expect(at("guard.treeRefusals(ROOT)")).toBeGreaterThan(-1);
  expect(at("guard.treeRefusals(ROOT)")).toBeLessThan(at("readConfig();"));
  expect(at("guard.pinnedSigner(")).toBeLessThan(at('run("npx", ["expo", "prebuild"'));
  expect(script).toMatch(/guard\.checkSigner\(cert, pinned\)/);
});
