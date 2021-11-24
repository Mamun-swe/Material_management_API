require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    ;


/* List User Created Backfil/Disposal Requests */
exports.listUserRequests = function(args, res, next) {

    let 
      userId = args.swagger.params.user_id.value
      , requestType = ( args.swagger.params.request_type.value === 'Disposal' ) ? 1 : 2
      , selectSql = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " + 
                            "M.material_type AS material_type, M.material_quality AS material_quality, " + 
                            "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " + 
                            "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " + 
                            "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " + 
                            "FORMAT(R.schedule_start_date,'yyyy-MM-dd') AS schedule_date_sorting " +
                            "FROM requests AS R " +
                            "INNER JOIN requesting_users AS U ON ( U.request_id = R.id) " +
                            "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
                            "WHERE R.request_type = @requestType AND U.user_id = @userId"
    ;

    try {
      sql(selectSql, {requestType: requestType, userId: userId}).then(selectResult => {

        if (selectResult.length > 0) {

            for( let i = 0; i < selectResult.length; i++ ) {

                /*let matchedResultIds = [];

                let matchedResult;
                matchedResultIds.push(matchedResult[m].id);*/
                let matches = []
                    ,   selectMatchingSql = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
                            "M.material_type AS material_type, M.material_quality AS material_quality, " +
                            "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " +
                            "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " +
                            "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " +
                            "FORMAT(R.schedule_start_date,'yyyy-MM-dd') AS schedule_date_sorting " +
                            "FROM requests AS R " +
                            "INNER JOIN requesting_users AS U ON ( U.request_id = R.id) " +
                            "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
                            "WHERE R.request_type = @requestType AND U.user_id = @userId";

            } //end for

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(selectResult));
    
        } else {
    
            var response = { message: messages.RQUEST_NOT_FOUND };
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(response));
        }

      });
    } catch (selectError) {

          var response = { 
              message: messages.SOME_THING_WENT_WRONG,
              details: selectError
          };
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));

    }
    
};

/* List Backfil/Disposal Requests, which are not Created by Logged In User */
exports.listGlobalRequests = function(args, res, next) {

  let 
    userId = args.swagger.params.user_id.value
    , requestType = ( args.swagger.params.request_type.value == 'Disposal' ) ? 1 : 2
    , selectSql = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " + 
                          "M.material_type AS material_type, M.material_quality AS material_quality, " + 
                          "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " + 
                          "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " + 
                          "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " + 
                          "FORMAT(R.schedule_start_date,'yyyy-MM-dd') AS schedule_date_sorting " +
                          "FROM requests AS R " +
                          "INNER JOIN requesting_users AS U ON ( U.request_id = R.id) " +
                          "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
                          "WHERE R.request_type = @requestType AND U.user_id != @userId"
  ;

  try {
    sql(selectSql, {requestType: requestType, userId: userId}).then(selectResult => {

      if (selectResult.length > 0) {

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(selectResult));
  
      } else {
  
          var response = { message: messages.RQUEST_NOT_FOUND };
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));
      }

    });
  } catch (selectError) {

        var response = { 
            message: messages.SOME_THING_WENT_WRONG,
            details: selectError
        };
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(response));

  }
  
};