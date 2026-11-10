// The laptop version is served from the home server under /xrnhome, so its files
// need that prefix. Only that build: the phone's bundle has its assets inside it.
module.exports = ({ config }) =>
  process.env.XRNHOME_WEB
    ? { ...config, experiments: { ...config.experiments, baseUrl: "/xrnhome" } }
    : config;
