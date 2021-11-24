require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , async = require('async');


/* Get the summary of a both-confirmed match */
exports.matchDetails = function(args, res, next) {

    let userId = args.swagger.params.user_id.value
        , ownRequestId = args.swagger.params.own_request_id.value
        , matchedRequestId = args.swagger.params.matched_request_id.value;

    let matchSql  = "SELECT * FROM matched_results WHERE status = 3 " +
        "AND own_request_id = " + ownRequestId + " AND matched_request_id = " + matchedRequestId + " " +
        "OR (own_request_id = " + matchedRequestId + " AND matched_request_id = " + ownRequestId + ")";

    try {
      sql(matchSql).then(matchedResult => {

            if ( matchedResult.length > 0 ) { // both-confirmed match

                async.waterfall([
                  _matchSummary( userId, ownRequestId, matchedRequestId, matchedResult ),
                  _compulsoryDocuments
                ],
                  function (err, result) {
            
                      if ( err ) {
            
                          console.log("ERROR IN DELETING REQUEST: ", JSON.stringify(err, null, 2));
            
                          res.writeHead(500, { "Content-Type": "application/json" });
                          return res.end(JSON.stringify({
                              status: false,
                              message: messages.SOME_THING_WENT_WRONG,
                              details: err
                          }));
            
                      } //end if

                      res.writeHead(200, { "Content-Type": "application/json" });
                      return res.end(JSON.stringify(result));
            
                  });

            } else { // invalid match info

                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({
                    status: false,
                    message: "Invalid match information!"
                }));

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
     * Matching Summary
     *
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} collections
     * @private
     */
    function _matchSummary( userId, ownRequestId, matchedRequestId, collections ) {

        console.log("STEP 1: _matchSummary");

        return function ( callback ) {

            let details = [];

            if ( collections.length > 0 ) {

                let joinSql  = "SELECT M.id, M.own_request_id, M.matched_request_id, R.department_key, R.project_address, " +
                    "IIF(R.request_type = 1, 'Disposal', 'Backfill') AS request_type, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
                    "S.material_volume, S.material_type, S.material_quality, " +
                    "FORMAT(S.schedule_start_date, 'dd/MM') AS schedule_overlapping_start_date, FORMAT(S.schedule_end_date, 'dd/MM') AS schedule_overlapping_end_date " +
                    "FROM matched_results M " +
                    "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                    "INNER JOIN requests AS R ON ( M.own_request_id = R.id ) " +
                    "WHERE (matched_request_id = " + matchedRequestId + " AND own_request_id = " + ownRequestId + ") " +
                    "OR (own_request_id = " + matchedRequestId + " AND matched_request_id = " + ownRequestId + ")";

                try {

                    sql(joinSql).then(matchDetails => {

                        if ( matchDetails.length > 0 )
                            callback( null, userId, ownRequestId, matchedRequestId, matchDetails );
                        else
                            callback( null, userId, ownRequestId, matchedRequestId, [] );
                    });

                } catch (joinSqlError) {
                    console.log("JOIN SQL ERROR IN STEP 1:");
                    console.log(joinSqlError);
                    callback(joinSqlError);
                }

            } else {
                callback( null, userId, ownRequestId, matchedRequestId, [] );
            }

        } //end return

    } //end _matchSummary

    /**
     * Get the compulsory documents
     *
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} matchDetails
     * @param callback
     * @private
     */
    function _compulsoryDocuments( userId, ownRequestId, matchedRequestId, matchDetails, callback ) {

        console.log("STEP 2: _compulsoryDocuments");

        if ( matchDetails.length > 0 ) {

            let matchedRequestIds = [];

            for ( let m = 0; m < matchDetails.length; m ++ ) {

                matchedRequestIds.push( matchDetails[m].id );

            } //end for

            let documentSql  = "SELECT * FROM documents WHERE matched_result_id IN (" + matchedRequestIds.join() + ")";

            try {

                sql(documentSql).then(docs => {

                    if ( docs.length > 0 ) {

                        let donatorFiles = []
                            , receiverFiles = [];

                        for ( let d = 0; d < docs.length; d ++ ) {

                            if ( docs[d].compulsory_document !== 'na' ) {

                                if ( docs[d].request_type === 1  )
                                    donatorFiles.push( docs[d].compulsory_document );
                                else
                                    receiverFiles.push( docs[d].compulsory_document );
                            }
                        } //end for

                        for ( let m = 0; m < matchDetails.length; m ++ ) {

                            if ( matchDetails[m].request_type === 'Disposal' ) {

                                matchDetails[m]["donator_files"] = [];
                                matchDetails[m]["donator_files"] = donatorFiles;

                            } else {

                                matchDetails[m]["receiver_files"] = [];
                                matchDetails[m]["receiver_files"] = receiverFiles;
                            }

                        } //end for

                        callback( null, matchDetails );

                    } else {
                        callback( null, matchDetails );
                    }
                });

            } catch (docsError) {

                console.log("DOCS ERROR IN STEP 2:");
                console.log(docsError);
                callback(docsError);
            }

        } else {
            callback( null, matchDetails );
        }

    } //end _compulsoryDocuments

};