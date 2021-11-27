
const axios = require("axios")
const auth = require("../helpers/auth")
const messages = require("../../config/constant")
const Validator = require("../validators/auth.validator")
const clientApiRoot = process.env.CLIENT_API_ROOT


// Account login 
exports.loginPost = async (req, res, next) => {
  try {
    const { uid, pwd } = req.body
    const url = `${clientApiRoot}/AuthServer/Login`

    // check validity
    const validate = await Validator.Login(req.body)
    if (!validate.isValid) {
      return res.status(422).json({
        message: validate.error
      })
    }

    const formData = { uid, pwd }

    const response = await axios.post(url, formData)

    if (response && response.status === 200) {
      return res.status(200).json(response.data)
    }




  } catch (error) {
    if (error) {
      res.status(404).json({
        message: "Provided uid or password is not correct! Please try again."
      })
    }
  }
}

/* Get user details from Client API, associated with the logged in user */
exports.appUser = async (req, res, next) => {
  try {

    const userId = req.swagger.params.user_id.value
    const url = `${clientApiRoot}/User/${userId}`

    if (!req.headers) {
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
      console.log(error);
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}

/* Get projects from Client API, associated with the logged in user's department */
exports.projectByDepartment = async (req, res, next) => {
  try {
    const departmentKey = req.swagger.params.department_key.value
    const url = `${clientApiRoot}/Project/${departmentKey}`

    if (!req.headers) {
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
      res.status(200).json(response.data)
    }

  } catch (error) {
    if (error) {
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG
      })
    }
  }
}
