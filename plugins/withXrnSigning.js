// Signs release builds with the key the other xrn apps (xrnrule, xrnloops) share, when its
// properties file sits next to this repo: ../xrn-signing.properties, with storeFile,
// storePassword, keyAlias and keyPassword, storeFile relative to that file's folder. Neither file
// is in git. Without them (another machine, EAS), release builds keep the React Native template's
// debug key. Android installs an update only over an app signed with the same key, so a phone
// must never get builds signed both ways.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// xrn signing";

const LOADER = `${MARK}: ../xrn-signing.properties beside the repo, if it's there (plugins/withXrnSigning.js)
def xrnSigningFile = new File(rootDir.getAbsoluteFile().getParentFile().getParentFile(), "xrn-signing.properties")
def xrnSigning = null
if (xrnSigningFile.isFile()) {
    xrnSigning = new Properties()
    xrnSigningFile.withInputStream { xrnSigning.load(it) }
}
`;

const CONFIG = `signingConfigs {
        if (xrnSigning != null) {
            xrn {
                storeFile new File(xrnSigningFile.getParentFile(), xrnSigning.getProperty("storeFile"))
                storePassword xrnSigning.getProperty("storePassword")
                keyAlias xrnSigning.getProperty("keyAlias")
                keyPassword xrnSigning.getProperty("keyPassword")
            }
        }
`;

const replaceOnce = (text, pattern, replacement, what) => {
  if (!pattern.test(text)) {
    throw new Error(`withXrnSigning: no ${what} in android/app/build.gradle`);
  }
  return text.replace(pattern, replacement);
};

module.exports = function withXrnSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARK)) {
      return cfg;
    }
    gradle = replaceOnce(gradle, /\nandroid \{/, `\n${LOADER}\nandroid {`, "android block");
    gradle = replaceOnce(gradle, /signingConfigs \{\n/, CONFIG, "signingConfigs block");
    gradle = replaceOnce(
      gradle,
      /(\n {8}release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig xrnSigning != null ? signingConfigs.xrn : signingConfigs.debug",
      "release signingConfig"
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
