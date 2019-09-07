/* eslint-disable import/prefer-default-export */
export const checkEnvironment = envVars => {
  envVars.forEach((key, envVar) => {
    if (!envVar) throw new Error(`Missing ${key} environment variable`);
  });
};
