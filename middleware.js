let jwt = require('jsonwebtoken');

module.exports.checkBearerToken = (req, res, next) => {
  let { authorization } = req.headers;

  if (authorization) {
    if (authorization.startsWith('Bearer ')) authorization = authorization.slice(7, authorization);
    jwt.verify(authorization, process.env.AUTH_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: 'Unauthorized' });
      }

      req.decoded = decoded;
      return next();
    });
  }

  return res.status(401).send({ message: 'Unauthorized' });
};
