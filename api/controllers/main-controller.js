
const fetch = require("node-fetch")
const sql = require("../../config/sql")
const auth = require("../helpers/auth")
const messages = require("../../config/constant")
const Validator = require("../validators/auth.validator")
const apiSecret = process.env.API_SECRET
const clientApiRoot = process.env.CLIENT_API_ROOT

// Account login 
exports.loginPost = async (req, res, next) => {
  try {
    const role = "admin"
    const { email, password } = req.body

    // check validity
    const validate = await Validator.Login(req.body)
    if (!validate.isValid) {
      return res.status(422).json({
        message: validate.error
      })
    }

    // match user credentials
    const result = await sql("SELECT user_id, email FROM authorized_users WHERE email=@email AND password=@pass", { email: email, pass: password })
    if (result && result.length > 0) {
      const token = auth.issueToken(email, role)

      // Verify token
      const verifiedToken = await auth.isVerifiedToken(token, apiSecret)
      if (!verifiedToken) {
        return res.status(500).json({
          message: messages.INVALID_TOKEN
        })
      }

      return res.status(200).json({
        access_token: token,
        token_type: "bearer",
        expires_in: verifiedToken.exp,
        user_id: result[0].user_id,
        scope: role
      })
    }

    res.status(404).json({
      message: messages.WRONG_CREDENTIAL
    })
  } catch (error) {
    if (error) next(error)
  }
}

/* Get user details from Client API, associated with the logged in user */
exports.appUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization
    if (!token) return res.status(404).json({ message: messages.TOKEN_IS_EMPTY })
    const splitToken = await token.split(' ')[1]

    // check valid token
    const validToken = await auth.isVerifiedToken(splitToken, apiSecret)
    if (!validToken) {
      return res.status(501).json({
        message: messages.INVALID_TOKEN
      })
    }

    const userId = req.swagger.params.user_id.value
    const url = clientApiRoot + '/User/' + userId

    const response = await fetch(url)
    const data = await response.json()
    if (!data.length) {
      return res.status(400).json({
        message: messages.APP_USER_NOT_FOUND
      })
    }

    res.status(200).json(data)
  } catch (error) {
    if (error) {
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
    const token = req.headers.authorization
    if (!token) return res.status(404).json({ message: messages.TOKEN_IS_EMPTY })
    const splitToken = await token.split(' ')[1]

    // check valid token
    const validToken = await auth.isVerifiedToken(splitToken, apiSecret)
    if (!validToken) {
      return res.status(501).json({
        message: messages.INVALID_TOKEN
      })
    }

    const departmentKey = req.swagger.params.department_key.value
    const url = clientApiRoot + '/Project/' + departmentKey

    const response = await fetch(url, { header: req.headers })
    const data = await response.json()

    res.status(200).json(data)
  } catch (error) {
    if (error) {
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}
