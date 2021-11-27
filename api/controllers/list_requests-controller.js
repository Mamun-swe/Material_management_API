
const sql = require("../../config/sql")
const auth = require("../helpers/auth")
const messages = require("../../config/constant")


/* List User Created Backfil/Disposal Requests */
exports.listUserRequests = async (req, res, next) => {
  try {
    const userId = req.swagger.params.user_id.value
    const requestType = req.swagger.params.request_type.value === "Disposal" ? 1 : 2

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

    const sqlQuery = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
      "M.material_type AS material_type, M.material_quality AS material_quality, " +
      "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " +
      "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " +
      "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " +
      "FORMAT(R.schedule_start_date,'yyyy-MM-dd') AS schedule_date_sorting " +
      "FROM requests AS R " +
      "INNER JOIN requesting_users AS U ON ( U.request_id = R.id) " +
      "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
      "WHERE R.request_type = @requestType AND U.user_id = @userId"

    const result = await sql(sqlQuery, { requestType: requestType, userId: userId })

    res.status(200).json(result)
  } catch (error) {
    if (error) {
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}

/* List Backfil/Disposal Requests, which are not Created by Logged In User */
exports.listGlobalRequests = async (req, res, next) => {
  try {
    const userId = req.swagger.params.user_id.value
    const requestType = req.swagger.params.request_type.value === "Disposal" ? 1 : 2

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

    const selectSql = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
      "M.material_type AS material_type, M.material_quality AS material_quality, " +
      "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " +
      "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " +
      "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " +
      "FORMAT(R.schedule_start_date,'yyyy-MM-dd') AS schedule_date_sorting " +
      "FROM requests AS R " +
      "INNER JOIN requesting_users AS U ON ( U.request_id = R.id) " +
      "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
      "WHERE R.request_type = @requestType AND U.user_id != @userId"

    const results = await sql(selectSql, { requestType: requestType, userId: userId })
    if (results.length > 0) {
      return res.status(200).json(results)
    }

    res.status(404).json({ message: messages.RQUEST_NOT_FOUND })
  } catch (error) {
    if (error) {
      res.status(500).json({
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}