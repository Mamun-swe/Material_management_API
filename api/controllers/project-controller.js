
const axios = require("axios")
const sql = require("../../config/sql")
const auth = require("../helpers/auth")
const messages = require("../../config/constant")
const clientApiRoot = process.env.CLIENT_API_ROOT

/* GET ALL PROJECTS */
exports.listProjects = async (req, res, next) => {
  try {
    const id = req.swagger.params.id.value
    const url = `${clientApiRoot}/projects/${id}`

    if (!req.headers.authorization) {
      return res.status(404).json({
        message: messages.TOKEN_IS_EMPTY
      })
    }

    const verifiedHeader = await auth.isValidToken(req.headers)
    if (!verifiedHeader) {
      return res.status(501).json({
        message: messages.INVALID_TOKEN
      })
    }

    const response = await axios.get(url, verifiedHeader)
    if (response && response.status === 200) {
      return res.status(200).json(response.data)
    }
  } catch (error) {
    if (error) {
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
  // return sql("SELECT * FROM Project").then(result => {

  //   if (result.length > 0) {

  //     res.writeHead(200, { "Content-Type": "application/json" });
  //     return res.end(JSON.stringify(result));

  //   } else {

  //     var response = { message: messages.PROJECT_NOT_FOUND };
  //     res.writeHead(404, { "Content-Type": "application/json" });
  //     return res.end(JSON.stringify(response));
  //   }

  // });
};

/* PROJECT SAFF */
exports.projectStaff = async (req, res, next) => {
  try {
    const department_key = req.swagger.params.department_key.value
    const url = `${clientApiRoot}/ProjectStaff/${department_key}`

    if (!req.headers.authorization) {
      return res.status(404).json({
        message: messages.TOKEN_IS_EMPTY
      })
    }

    const verifiedHeader = await auth.isValidToken(req.headers)
    if (!verifiedHeader) {
      return res.status(501).json({
        message: messages.INVALID_TOKEN
      })
    }

    const response = await axios.get(url, verifiedHeader)
    if (response && response.status === 200) {
      return res.status(200).json(response.data)
    }
  } catch (error) {
    if (error) {
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}

// ALL PROJECT BY PAGE
exports.allProjectByPage = async (req, res, next) => {
  try {
    const currentPage = req.swagger.params.currentPage.value
    const pageSize = req.swagger.params.pageSize.value
    const url = `${clientApiRoot}/PagedProjects/${currentPage}/${pageSize}`

    if (!req.headers.authorization) {
      return res.status(404).json({
        message: messages.TOKEN_IS_EMPTY
      })
    }

    const verifiedHeader = await auth.isValidToken(req.headers)
    if (!verifiedHeader) {
      return res.status(501).json({
        message: messages.INVALID_TOKEN
      })
    }

    const response = await axios.get(url, verifiedHeader)
    if (response && response.status === 200) {
      return res.status(200).json(response.data)
    }
  } catch (error) {
    if (error) {
      console.log(error)
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}

/* GET A SINGLE PROJECT */
exports.singleProject = function (args, res, next) {

  let projectId = args.swagger.params.id.value;

  return sql("SELECT * FROM Project WHERE id=@id", { id: projectId }).then(result => {

    //console.error("SQL QUERY RESULT:", JSON.stringify(result, null, 2));

    if (result.length > 0) {

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result[0]));

    } else {

      var response = { message: messages.PROJECT_NOT_FOUND };
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(response));
    }

  });
};

