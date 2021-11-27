"use strict";
require("dotenv").config()
let app = require("express")()
let swaggerTools = require("swagger-tools")
let YAML = require("yamljs")
const cors = require('cors')
const fileUpload = require("express-fileupload")
let auth = require("./api/helpers/auth")
let swaggerConfig = YAML.load("./api/swagger/swagger.yaml")


/* CONFIGURATIONS */
swaggerTools.initializeMiddleware(swaggerConfig, function (middleware) {
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

  // app.use((req, res, next) => {
  //   let error = new Error('404 Page not found')
  //   error.status = 404
  //   next(error)
  // })

  // app.use((error, req, res, next) => {
  //   if (error.status == 404) {
  //     return res.status(404).json({
  //       message: error.message
  //     })
  //   }
  //   if (error.status == 400) {
  //     return res.status(400).json({
  //       message: "Bad request"
  //     })
  //   }
  //   if (error.status == 401) {
  //     return res.status(401).json({
  //       message: "You have no permission"
  //     })
  //   }
  //   return res.status(500).json({
  //     message: "Something went wrong!"
  //   })
  // })



  /* START SERVER */
  let port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log("Started server on port " + port);
  });
});
