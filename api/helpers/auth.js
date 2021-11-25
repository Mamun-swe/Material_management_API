"use strict"
const sqlConnect = require("../../config/sql")
const jwt = require("jsonwebtoken")
const apiSecret = process.env.API_SECRET
var issuer = process.env.API_ROOT

//Here we setup the security checks for the endpoints
//that need it (in our case, only /protected). This
//function will be called every time a request to a protected
//endpoint is received
exports.verifyToken = function (req, authOrSecDef, token, callback) {
  //these are the scopes/roles defined for the current endpoint
  var currentScopes = req.swagger.operation["x-security-scopes"];

  function sendError() {
    return req.res.status(403).json({ message: "Access Denied" });
  }

  //validate the 'Authorization' header. it should have the following format:
  //'Bearer tokenString'
  if (token && token.indexOf("Bearer ") == 0) {
    var tokenString = token.split(" ")[1];

    sqlConnect("SELECT id, created_at FROM AccessToken WHERE token=@accessToken", { accessToken: tokenString }).then(result => {

      if (result.length > 0) {

        jwt.verify(tokenString, apiSecret, function (
          verificationError,
          decodedToken
        ) {
          //check if the JWT was verified correctly
          if (
            verificationError == null &&
            Array.isArray(currentScopes) &&
            decodedToken &&
            decodedToken.role
          ) {
            // check if the role is valid for this endpoint
            var roleMatch = currentScopes.indexOf(decodedToken.role) !== -1;
            // check if the issuer matches
            var issuerMatch = decodedToken.iss == issuer;

            // you can add more verification checks for the
            // token here if necessary, such as checking if
            // the useremail belongs to an active user

            if (roleMatch && issuerMatch) {
              //add the token to the request so that we
              //can access it in the endpoint code if necessary
              req.auth = decodedToken;
              //if there is no error, just return null in the callback
              return callback(null);
            } else {
              //return the error in the callback if there is one              
              return callback(sendError());
            }
          } else {

            try {
              sqlConnect(
                "DELETE FROM AccessToken WHERE token=@accessToken", { accessToken: tokenString }).then(delResult => {
                  console.log('Invalid Token Deleted From DB');
                });
            } catch (delError) {
              console.error("SQL DELETION ERROR:", JSON.stringify(delError, null, 2));
            }
            //return the error in the callback if the JWT was not verified
            return callback(sendError());
          }
        });

      } else {

        return callback(sendError());
      }

    });

  } else {
    //return the error in the callback if the Authorization header doesn't have the correct format
    return callback(sendError());
  }
};

exports.issueToken = function (useremail, role) {
  const token = jwt.sign(
    {
      sub: useremail,
      iss: issuer,
      role: role
    },
    apiSecret,
    { expiresIn: 3600 * process.env.TOKEN_EXPIRATION_HOUR }
  )

  return token;
};


// token verification
exports.isVerifiedToken = async (token, secrect) => {
  try {
    return await jwt.verify(token, secrect)
  } catch (error) {
    if (error) return false
  }
}