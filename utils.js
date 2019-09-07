/* eslint-disable import/prefer-default-export */
module.exports.checkEnvironment = envVars => {
  envVars.forEach((key, envVar) => {
    if (!envVar) throw new Error(`Missing ${key} environment variable`);
  });
};
