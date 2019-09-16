const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

module.exports.checkAccessToken = (issuer, audience) =>
  jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${issuer}/.well-known/jwks.json`
    }),
    audience,
    issuer: `https://${issuer}/`,
    algorithm: ['RS256']
  });

module.exports.checkPermission = permission => (req, res, next) => {
  const { permissions } = req.user;
  if (permissions.includes(permission)) return next();
  return res.status(403).send();
};
