
const axios = require("axios")
const auth = require("../helpers/auth")
const sql = require("../../config/sql")
const messages = require("../../config/constant")
const clientApiRoot = process.env.CLIENT_API_ROOT

/* Get Request Details */
exports.requestDetails = async (req, res, next) => {
  try {
    const userId = req.swagger.params.user_id.value
    const requestId = req.swagger.params.request_id.value
    let isGlobalRequest = true

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

    // requesting user result
    const checkResult = await sql("SELECT * FROM requesting_users WHERE user_id = @userId AND request_id = @requestId", { userId: userId, requestId: requestId })

    if (checkResult.length > 0) {
      isGlobalRequest = false

      const requestInfoData = await _getRequestInfo(isGlobalRequest, userId, requestId)
      const projectInfoData = await _getProjectInfo(requestInfoData.department_key, verifiedHeader)
      const contactInfoData = await _getContactInfo(requestId)
      const projectTeamData = await _getProjectTeam(requestId, verifiedHeader)
      const documentsData = await _getSupplementaryDocuments(requestId)

      const data = {
        request_info: requestInfoData || null,
        project_info: projectInfoData,
        contact_info: contactInfoData,
        project_team: projectTeamData,
        supplementary_documents: documentsData
      }

      return res.status(200).json(data)
    } else {
      const requestInfoData = await _getRequestInfo(isGlobalRequest, userId, requestId)
      const projectInfoData = await _getProjectInfo(requestInfoData.department_key, verifiedHeader)

      const data = {
        request_info: requestInfoData || null,
        project_info: projectInfoData
      }

      return res.status(200).json(data)
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

// Get Some Basic Data of the Request
const _getRequestInfo = async (isGlobalRequest, userId, requestId) => {
  try {
    let request_info = {}

    const sqlQuery = "SELECT R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
      "M.material_type AS material_type, M.material_quality AS material_quality, " +
      "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " +
      "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " +
      "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " +
      "IIF(R.schedule_status = 1, 'Confirmed', 'Preliminary') AS schedule_status, " +
      "R.remarks AS remarks " +
      "FROM requests AS R " +
      "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
      "WHERE R.id = @requestId";

    const requestResult = await sql(sqlQuery, { requestId: requestId })
    if (requestResult) {
      request_info = {
        filling_purpose: requestResult[0].filling_purpose,
        material_type: requestResult[0].material_type,
        material_quality: requestResult[0].material_quality,
        material_volume: requestResult[0].material_volume,
        schedule_start_date: requestResult[0].schedule_start_date,
        schedule_end_date: requestResult[0].schedule_end_date,
        schedule_status: requestResult[0].schedule_status,
        remarks: requestResult[0].remarks,
        department_key: requestResult[0].department_key
      }
    }

    return request_info

  } catch (error) {
    if (error) return error
  }
} //end _getRequestInfo   


// Get Project Information
const _getProjectInfo = async (departmentKey, verifiedHeader) => {
  try {
    let project_info = {}
    const url = `${clientApiRoot}/Project/${departmentKey}`

    if (!departmentKey) return project_info

    const response = await axios.get(url, verifiedHeader)
    if (response && response.status === 200) {
      project_info = {
        code: response.data.department_key,
        name: response.data.projectName,
        address: response.data.address,
        latitude: response.data.latitude,
        longitude: response.data.longitude
      }
    }

    return project_info
  } catch (error) {
    if (error) return error
  }
} //end _getProjectInfo


// Get Request Contacts
const _getContactInfo = async (requestId) => {
  try {
    const items = []
    const sqlQuery = "SELECT C.name AS name, C.phone AS phone FROM requests AS R INNER JOIN contacts AS C ON ( C.request_id = R.id) WHERE R.id = @requestId"
    const results = await sql(sqlQuery, { requestId: requestId })

    if (results && results.length) {
      for (let i = 0; i < results.length; i++) {
        items.push({
          name: results[i].name,
          phone: results[i].phone
        })
      }
    }

    return items
  } catch (error) {
    if (error) return error
  }
} //end _getContactInfo


// Get Project Team
const _getProjectTeam = async (departmentKey, verifiedHeader) => {
  try {
    const items = []
    const url = `${clientApiRoot}/ProjectStaff/${departmentKey}`

    const response = await axios.get(url, verifiedHeader)
    if (response && response.status === 200) {
      if (response.data && response.data.length) {
        for (let i = 0; i < response.data.length; i++) {
          const element = response.data[i]
          items.push({
            name: element.first_name + ' ' + element.last_name,
            position: element.post_name
          })
        }
      }
    }

    return items
  } catch (error) {
    if (error) return error
  }
} //end _getProjectTeam


// Get Supplementary Documents
const _getSupplementaryDocuments = async (requestId) => {
  try {
    const items = []
    const sqlQuery = "SELECT S.name AS name, S.supplementary_document AS supplementary_document FROM requests AS R INNER JOIN supplementaries AS S ON ( S.request_id = R.id) WHERE R.id = @requestId"

    const results = await sql(sqlQuery, { requestId: requestId })
    if (results && results.length) {
      for (let i = 0; i < results.length; i++) {
        const element = results[i]
        items.push({
          name: element.name,
          document_path: element.supplementary_document
          // "document_path": "https://" + storageAccount + ".blob.core.windows.net/" + containerName + "/" + docResult[i]['supplementary_document']
        })
      }
    }

    return items
  } catch (error) {
    if (error) return error
  }
} //end _getSupplementaryDocuments
