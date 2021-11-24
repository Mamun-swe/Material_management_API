require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , clientApiRoot = process.env.CLIENT_API_ROOT
    , async = require('async')
    , fetch  = require('node-fetch')
    , storageAccount = process.env.AZURE_STORAGE_ACCOUNT
    , containerName = 'supplementarydocs'
;


/* Get Request Details */
exports.requestDetails = function(args, res, next) {

    let 
      userId = args.swagger.params.user_id.value
      , requestId = args.swagger.params.request_id.value
      , isGlobalRequest = true
    ;

    try {
      sql(
        "SELECT * FROM requesting_users WHERE user_id = @userId AND request_id = @requestId", {userId: userId, requestId: requestId}).then(checkResult => {

            if ( checkResult.length > 0 ) { // user-created request

              isGlobalRequest = false;

                async.waterfall([
                  _getRequestInfo( isGlobalRequest, userId, requestId ),
                  _getProjectInfo,
                  _getContactInfo,
                  _getProjectTeam,
                  _getSupplementaryDocuments
                ],
                  function (err, result) {
            
                      if ( err ) {
            
                          console.log("ERROR IN FETCHING REQUEST DETAILS: ", JSON.stringify(err, null, 2));
            
                          res.writeHead(500, { "Content-Type": "application/json" });
                          return res.end(JSON.stringify({
                              status: false,
                              message: messages.SOME_THING_WENT_WRONG,
                              details: err
                          }));
            
                      } //end if

                      console.log("REQUEST DETAILS: ", JSON.stringify(result, null, 2));
            
                      res.writeHead(200, { "Content-Type": "application/json" });
                      return res.end(JSON.stringify(result));
            
                  });

            } else { // global request

                async.waterfall([
                  _getRequestInfo( isGlobalRequest, userId, requestId ),
                  _getProjectInfo
                ],
                  function (err, result) {
            
                      if ( err ) {
            
                          console.log("ERROR IN FETCHING REQUEST DETAILS: ", JSON.stringify(err, null, 2));
            
                          res.writeHead(500, { "Content-Type": "application/json" });
                          return res.end(JSON.stringify({
                              status: false,
                              message: messages.SOME_THING_WENT_WRONG,
                              details: err
                          }));
            
                      } //end if

                      console.log("REQUEST DETAILS: ", JSON.stringify(result, null, 2));
            
                      res.writeHead(200, { "Content-Type": "application/json" });
                      return res.end(JSON.stringify(result));
            
                  });

            } //end main else

      });
    } catch (checkError) {

        console.log("CHECK ERROR:");
        console.log(checkError);

        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
            status: false,
            message: messages.SOME_THING_WENT_WRONG,
            details: checkError
        }));

    }

      /**
       * Get Some Basic Data of the Request
       * 
       * @param {boolean} isGlobalRequest
       * @param {string} userId
       * @param {integer} requestId
       * 
       * @return {object} 
       */
      function _getRequestInfo( isGlobalRequest, userId, requestId ) {

        console.log("_getRequestInfo");

        return function ( callback ) {

          let selectSql = "SELECT R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " + 
                                  "M.material_type AS material_type, M.material_quality AS material_quality, " + 
                                  "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " + 
                                  "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " + 
                                  "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " + 
                                  "IIF(R.schedule_status = 1, 'Confirmed', 'Preliminary') AS schedule_status, " + 
                                  "R.remarks AS remarks " +
                                  "FROM requests AS R " +
                                  "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
                                  "WHERE R.id = @requestId";

          let requestDetailsObj = {};  

          try {
            sql(selectSql, { requestId: requestId }).then(requestResult => {

                requestDetailsObj["request_info"] = {};
                requestDetailsObj["request_info"]["filling_purpose"] = requestResult[0].filling_purpose;
                requestDetailsObj["request_info"]["material_type"] = requestResult[0].material_type;
                requestDetailsObj["request_info"]["material_quality"] = requestResult[0].material_quality;
                requestDetailsObj["request_info"]["material_volume"] = requestResult[0].material_volume;
                requestDetailsObj["request_info"]["schedule_start_date"] = requestResult[0].schedule_start_date;
                requestDetailsObj["request_info"]["schedule_end_date"] = requestResult[0].schedule_end_date;
                requestDetailsObj["request_info"]["schedule_status"] = requestResult[0].schedule_status;
                requestDetailsObj["request_info"]["remarks"] = requestResult[0].remarks;

                console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));

                callback( null, isGlobalRequest, userId, requestId, requestResult[0].department_key, requestDetailsObj );

            });
          } catch (requestSqlError) {

              console.log("REQUEST SQL ERROR:", JSON.stringify(requestSqlError, null, 2));
              callback( requestSqlError );

          }

        } //end return

      } //end _getRequestInfo      
      

      /**
       * Get Project Information
       * 
       * @param {boolean} isGlobalRequest
       * @param {string} userId
       * @param {integer} requestId
       * @param {string} departmentKey
       * @param {object} requestDetailsObj
       * @param {object} callback
       * 
       * @return {object} 
       */
       function _getProjectInfo( isGlobalRequest, userId, requestId, departmentKey, requestDetailsObj, callback ) {

          console.log("_getProjectInfo");

          let url = clientApiRoot + '/Project/' + departmentKey;

          const getData = async url => {

            try {

                const 
                  response = await fetch(url)
                  , data = await response.json()
                ;

                requestDetailsObj["project_info"] = {};
                requestDetailsObj["project_info"]["code"] = data.department_key;
                requestDetailsObj["project_info"]["name"] = data.projectName;
                requestDetailsObj["project_info"]["address"] = data.address;
                requestDetailsObj["project_info"]["latitude"] = data.latitude;
                requestDetailsObj["project_info"]["longitude"] = data.longitude;  

                //console.log("PROJECT INFO:", JSON.stringify(requestDetailsObj["project_info"], null, 2));
                console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));
                
                if ( isGlobalRequest )
                    callback( null, requestDetailsObj );
                else
                    callback( null, userId, requestId, departmentKey, requestDetailsObj );

          
              } catch ( projectError ) {
          
                  console.log("Error in Fetching Project Info:");
                  console.error(projectError);
                  callback( projectError );
          
              }

          }; //end getData

          getData( url );  

      } //end _getProjectInfo
      

      /**
       * Get Request Contacts
       * 
       * @param {string} userId
       * @param {integer} requestId
       * @param {string} departmentKey
       * @param {object} requestDetailsObj
       * @param {object} callback
       * 
       * @return {object}  
       */
      function _getContactInfo( userId, requestId, departmentKey, requestDetailsObj, callback ) {

          console.log("_getContactInfo");

          let contactSql = "SELECT C.name AS name, C.phone AS phone FROM requests AS R INNER JOIN contacts AS C ON ( C.request_id = R.id) WHERE R.id = @requestId";

          try {
            sql(contactSql, { requestId: requestId }).then(contactResult => {

                requestDetailsObj["contact_info"] = [];

                for ( var i = 0; i < contactResult.length; i ++ ) {

                  requestDetailsObj["contact_info"].push({
                      "name": contactResult[i]['name'],
                      "phone": contactResult[i]['phone']
                  });

                }

                console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));
                
                callback( null, userId, requestId, departmentKey, requestDetailsObj );

            });
          } catch (contactSqlError) {

              console.log("CONTACT SQL ERROR:", JSON.stringify(contactSqlError, null, 2));
              callback( contactSqlError );

          }
              

      } //end _getContactInfo
      

      /**
       * Get Project Team
       * 
       * @param {string} userId
       * @param {integer} requestId
       * @param {string} departmentKey
       * @param {object} requestDetailsObj
       * @param {object} callback
       * 
       * @return {object}  
       */
      function _getProjectTeam( userId, requestId, departmentKey, requestDetailsObj, callback ) {

        console.log("_getProjectTeam");

        let url = clientApiRoot + '/ProjectStaff/' + departmentKey;

        const getData = async url => {

          try {

              const 
                response = await fetch(url)
                , staffs = await response.json()
              ;

              requestDetailsObj["project_team"] = [];

              let n = staffs.length;

              for ( var i = 0; i < n; i ++ ) {

                requestDetailsObj["project_team"].push({
                    "name": staffs[i]['first_name'] + ' ' + staffs[i]['last_name'],
                    "position": staffs[i]['post_name']
                });
              } 

              //console.log("PROJECT INFO:", JSON.stringify(requestDetailsObj["project_info"], null, 2));
              console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));

              callback( null, userId, requestId, requestDetailsObj );

        
            } catch ( staffError ) {
        
                console.log("Error in Fetching Project Staff:");
                console.error(staffError);
                callback( staffError );
        
            }

        }; //end getData

        getData( url );        

      } //end _getProjectTeam
      

      /**
       * Get Supplementary Documents
       * 
       * @param {string} userId
       * @param {integer} requestId
       * @param {object} requestDetailsObj
       * @param {object} callback
       * 
       * @return {object}  
       */
      function _getSupplementaryDocuments( userId, requestId, requestDetailsObj, callback ) {

          console.log("_getSupplementaryDocuments");
        
          let docSql = "SELECT S.name AS name, S.supplementary_document AS supplementary_document FROM requests AS R INNER JOIN supplementaries AS S ON ( S.request_id = R.id) WHERE R.id = @requestId";

          try {
            sql(docSql, { requestId: requestId }).then(docResult => {

                requestDetailsObj["supplementary_documents"] = [];

                for ( var i = 0; i < docResult.length; i ++ ) {

                  requestDetailsObj["supplementary_documents"].push({
                      "name": docResult[i]['name'],
                      "document_path": "https://" + storageAccount + ".blob.core.windows.net/" + containerName + "/" + docResult[i]['supplementary_document']
                  });

                }

                console.log("REQUEST OBJ:", JSON.stringify(requestDetailsObj, null, 2));
                
                callback( null, requestDetailsObj );

            });
          } catch (docSqlError) {

              console.log("DOC SQL ERROR:", JSON.stringify(docSqlError, null, 2));
              callback( docSqlError );

          }

      } //end _getSupplementaryDocuments
    
};