"use strict";
require("dotenv").config()
let app = require("express")()
let swaggerTools = require("swagger-tools")
let YAML = require("yamljs")
const cors = require('cors')
const bodyParser = require("body-parser")
const fileUpload = require("express-fileupload")
let auth = require("./api/helpers/auth")
let swaggerConfig = YAML.load("./api/swagger/swagger.yaml")


/* CONFIGURATIONS */
swaggerTools.initializeMiddleware(swaggerConfig, function (middleware) {

  app.use(
    bodyParser.urlencoded({
      extended: true
    })
  )

  //Serves the Swagger UI on /docs
  app.use(middleware.swaggerMetadata()); // needs to go BEFORE swaggerSecurity

  app.use(
    middleware.swaggerSecurity({
      //manage token function in the 'auth' module
      Bearer: auth.verifyToken
    })
  );

  let routerConfig = {
    controllers: "./api/controllers",
    useStubs: false
  };

  /* MODULES */
  const sql = require('./config/sql');

  /* USES */

  app.use(cors());

  app.use(middleware.swaggerRouter(routerConfig))
  app.use(middleware.swaggerUi())
  app.use(fileUpload())


  /* START SERVER */
  let port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log("Started server on port " + port);
  });
});
