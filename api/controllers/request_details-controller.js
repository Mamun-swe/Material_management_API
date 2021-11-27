
const axios = require("axios")
const auth = require("../helpers/auth")
const sql = require("../../config/sql")
  , messages = require("../../config/constant")
  , clientApiRoot = process.env.CLIENT_API_ROOT
  , async = require('async')
  , fetch = require('node-fetch')
  , storageAccount = process.env.AZURE_STORAGE_ACCOUNT
  , containerName = 'supplementarydocs'
  ;





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
      const projectTeamData = await _getProjectTeam(requestId)

      // const asyncRequest = await async.waterfall([
      //   _getRequestInfo(isGlobalRequest, userId, requestId)
      //   _getProjectInfo,
      //   _getContactInfo,
      //   _getProjectTeam,
      //   _getSupplementaryDocuments
      // ])

      // if (!requestInfo) {
      //   return res.status(500).json({
      //     status: false,
      //     message: messages.SOME_THING_WENT_WRONG,
      //     details: err
      //   })
      // }

      const data = {
        request_info: requestInfoData || null,
        project_info: projectInfoData,
        contact_info: contactInfoData
      }


      return res.status(200).json(data)
    } else {


      return res.status(200).json("fsdfsf")
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










// let
// userId = args.swagger.params.user_id.value
// , requestId = args.swagger.params.request_id.value
// , isGlobalRequest = true
// ;

// try {
// sql(
//   "SELECT * FROM requesting_users WHERE user_id = @userId AND request_id = @requestId", { userId: userId, requestId: requestId }).then(checkResult => {

//     if (checkResult.length > 0) { // user-created request

//       isGlobalRequest = false;

//       async.waterfall([
//         _getRequestInfo(isGlobalRequest, userId, requestId),
//         _getProjectInfo,
//         _getContactInfo,
//         _getProjectTeam,
//         _getSupplementaryDocuments
//       ],
//         function (err, result) {

//           if (err) {

//             console.log("ERROR IN FETCHING REQUEST DETAILS: ", JSON.stringify(err, null, 2));

//             res.writeHead(500, { "Content-Type": "application/json" });
//             return res.end(JSON.stringify({
//               status: false,
//               message: messages.SOME_THING_WENT_WRONG,
//               details: err
//             }));

//           } //end if

//           console.log("REQUEST DETAILS: ", JSON.stringify(result, null, 2));

//           res.writeHead(200, { "Content-Type": "application/json" });
//           return res.end(JSON.stringify(result));

//         });

//     } else { // global request

//       async.waterfall([
//         _getRequestInfo(isGlobalRequest, userId, requestId),
//         _getProjectInfo
//       ],
//         function (err, result) {

//           if (err) {

//             console.log("ERROR IN FETCHING REQUEST DETAILS: ", JSON.stringify(err, null, 2));

//             res.writeHead(500, { "Content-Type": "application/json" });
//             return res.end(JSON.stringify({
//               status: false,
//               message: messages.SOME_THING_WENT_WRONG,
//               details: err
//             }));

//           } //end if

//           console.log("REQUEST DETAILS: ", JSON.stringify(result, null, 2));

//           res.writeHead(200, { "Content-Type": "application/json" });
//           return res.end(JSON.stringify(result));

//         });

//     } //end main else

//   });
// } catch (checkError) {

// console.log("CHECK ERROR:");
// console.log(checkError);

// res.writeHead(500, { "Content-Type": "application/json" });
// return res.end(JSON.stringify({
//   status: false,
//   message: messages.SOME_THING_WENT_WRONG,
//   details: checkError
// }));

// }










// /**
// * Get Project Team
// * 
// * @param {string} userId
// * @param {integer} requestId
// * @param {string} departmentKey
// * @param {object} requestDetailsObj
// * @param {object} callback
// * 
// * @return {object}  
// */
// function _getProjectTeam(userId, requestId, departmentKey, requestDetailsObj, callback) {

// console.log("_getProjectTeam");

// let url = clientApiRoot + '/ProjectStaff/' + departmentKey;

// const getData = async url => {

//   try {

//     const
//       response = await fetch(url)
//       , staffs = await response.json()
//       ;

//     requestDetailsObj["project_team"] = [];

//     let n = staffs.length;

//     for (var i = 0; i < n; i++) {

//       requestDetailsObj["project_team"].push({
//         "name": staffs[i]['first_name'] + ' ' + staffs[i]['last_name'],
//         "position": staffs[i]['post_name']
//       });
//     }

//     //console.log("PROJECT INFO:", JSON.stringify(requestDetailsObj["project_info"], null, 2));
//     console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));

//     callback(null, userId, requestId, requestDetailsObj);


//   } catch (staffError) {

//     console.log("Error in Fetching Project Staff:");
//     console.error(staffError);
//     callback(staffError);

//   }

// }; //end getData

// getData(url);

// } //end _getProjectTeam


// /**
// * Get Supplementary Documents
// * 
// * @param {string} userId
// * @param {integer} requestId
// * @param {object} requestDetailsObj
// * @param {object} callback
// * 
// * @return {object}  
// */
// function _getSupplementaryDocuments(userId, requestId, requestDetailsObj, callback) {

// console.log("_getSupplementaryDocuments");

// let docSql = "SELECT S.name AS name, S.supplementary_document AS supplementary_document FROM requests AS R INNER JOIN supplementaries AS S ON ( S.request_id = R.id) WHERE R.id = @requestId";

// try {
//   sql(docSql, { requestId: requestId }).then(docResult => {

//     requestDetailsObj["supplementary_documents"] = [];

//     for (var i = 0; i < docResult.length; i++) {

//       requestDetailsObj["supplementary_documents"].push({
//         "name": docResult[i]['name'],
//         "document_path": "https://" + storageAccount + ".blob.core.windows.net/" + containerName + "/" + docResult[i]['supplementary_document']
//       });

//     }

//     console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));

//     callback(null, requestDetailsObj);

//   });
// } catch (docSqlError) {

//   console.log("DOC SQL ERROR:", JSON.stringify(docSqlError, null, 2));
//   callback(docSqlError);

// }

// } //end _getSupplementaryDocuments