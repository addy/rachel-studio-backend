/* eslint-disable import/prefer-default-export */
module.exports.checkEnvironment = envVars => {
  Object.entries(envVars).forEach(([key, value]) => {
    if (!value) throw new Error(`Missing ${key} environment variable`);
  });
};
