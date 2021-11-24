require("dotenv").config();
let apiSecret = process.env.API_SECRET;

const fetch = require('node-fetch');
const sql = require("../../config/sql");
const messages = require("../../config/constant");
var jwt = require("jsonwebtoken");
var auth = require("../helpers/auth");
var clientApiRoot = process.env.CLIENT_API_ROOT;

exports.loginPost = function (args, res, next) {

  var role = 'admin';

  var response;

  if (args.body.email == undefined || args.body.password == undefined) {
    response = {
      message: messages.SOME_THING_WENT_WRONG,
      details: messages.MISSING_EMAIL_OR_PASSWORD_FIELD
    };
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(response));
  }

  let useremail = args.body.email;
  let password = args.body.password;

  if (useremail == '')
    response = { message: messages.EMAIL_IS_EMPTY };

  if (password == '')
    response = { message: messages.PASSWORD_IS_EMPTY };

  if (useremail == '' || password == '') {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(response));
  }

  return sql("SELECT user_id, email FROM authorized_users WHERE email=@email AND password=@pass", { email: useremail, pass: password }).then(result => {

    if (result.length > 0) {

      var tokenString = auth.issueToken(useremail, role);

      jwt.verify(tokenString, apiSecret, function (verificationError, decoded) {

        if (verificationError) {
          response = { message: messages.INVALID_TOKEN };
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));
        }

        response = {
          access_token: tokenString,
          token_type: "bearer",
          expires_in: decoded.exp,
          user_id: result[0].user_id,
          scope: role
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(response));

      });

    } else {

      var response = { message: messages.WRONG_CREDENTIAL };
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(response));
    }

  });

};

/* Get user details from Client API, associated with the logged in user */
exports.appUser = function (args, res, next) {

  let userId = args.swagger.params.user_id.value;
  var url = clientApiRoot + '/User/' + userId;

  const getData = async url => {

    try {

      const response = await fetch(url);
      const data = await response.json();

      //console.log("App User Data:", JSON.stringify(data, null, 2));

      return res.send(data);

    } catch (error) {

      console.log("ERROR in App User Data:", JSON.stringify(error, null, 2));

      response = {
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      };

      return res.send(response);

    }
  };

  getData(url);

};

/* Get projects from Client API, associated with the logged in user's department */
exports.projectByDepartment = function (args, res, next) {

  let departmentKey = args.swagger.params.department_key.value;

  var url = clientApiRoot + '/Project/' + departmentKey;

  const getData = async url => {

    try {

      const response = await fetch(url);
      const data = await response.json();

      //console.log("Project Data:", JSON.stringify(data, null, 2));

      return res.send(data);

    } catch (error) {

      console.log("ERROR in Project Data:", JSON.stringify(error, null, 2));

      response = {
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      };

      return res.send(response);

    }
  };

  getData(url);

};

exports.logoutPost = function (args, res, next) {

  let authHeader = args.headers.authorization;
  let accessToken = authHeader.split(" ")[1];

  return sql("DELETE FROM AccessToken WHERE token=@accessToken", { accessToken: accessToken }).then(result => {

    response = { message: messages.SUCCESS_LOGOUT };

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(response));

  });

};
