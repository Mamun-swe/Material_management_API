require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , async = require('async');


/* Cancel a selected match after adjusting material volumes */
exports.cancelMatch = function(args, res, next) {

    let inputParams = args.body
        , userId = inputParams.user_id
        , ownRequestId = inputParams.own_request_id
        , matchedRequestId = inputParams.matched_request_id;

    /*let matchSql  = "SELECT * FROM matched_results WHERE status = 3 " +
        "AND own_request_id = " + ownRequestId + " AND matched_request_id = " + matchedRequestId + " " +
        "OR (own_request_id = " + matchedRequestId + " AND matched_request_id = " + ownRequestId + ")";*/

    let matchSql  = "SELECT * FROM matched_results WHERE own_request_id = " + ownRequestId + " AND matched_request_id = " + matchedRequestId + " " +
        "OR (own_request_id = " + matchedRequestId + " AND matched_request_id = " + ownRequestId + ")";    

    try {
      sql(matchSql).then(matchedResult => {

            if ( matchedResult.length > 0 ) {

                //console.error("MATCH RESULT:", JSON.stringify(matchedResult, null, 2));

                async.waterfall([
                  _cancelMatchCollectMatchedRequestIds( userId, ownRequestId, matchedRequestId, matchedResult ),
                  _cancelMatchAdjustMaterialVolumesToBothConfirmed,
                  _cancelMatchAdjustMaterialVolumesAsSuggested,
                  _cancelMatchAdjustMaterialVolumesAsOwn,
                  _cancelMatchRemoveAllMatches
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
                      return res.end(JSON.stringify({
                          status: true,
                          message: "Match Cancelled Successfully"
                      }));
            
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
     * Cancel Matching - Collect matched requests
     *
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} collections
     * @private
     */
    function _cancelMatchCollectMatchedRequestIds( userId, ownRequestId, matchedRequestId, collections ) {

        console.log("STEP 1: _cancelMatchCollectMatchedRequestIds");

        return function ( callback ) {

            let deletableIds = [];

            if ( collections.length > 0 ) {

                let bothConfirmedMatches = [];

                for ( let c = 0; c < collections.length; c ++ ) {

                    deletableIds.push( collections[c].id );

                    if ( collections[c].status === 3 )
                        bothConfirmedMatches.push( collections[c].matched_request_id );

                } //end for

                if ( bothConfirmedMatches.length > 0 ) {

                    let joinSql  = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                        "FROM matched_results M " +
                        "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                        "WHERE matched_request_id IN(" + bothConfirmedMatches.join() + ") AND own_request_id NOT IN (" + ownRequestId + "," + matchedRequestId + ")";

                    try {

                        sql(joinSql).then(matchesForOwners => {

                            if ( matchesForOwners.length > 0 )
                                callback( null, userId, ownRequestId, matchedRequestId, deletableIds, [], bothConfirmedMatches );
                            else
                                callback( null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners, bothConfirmedMatches );
                        });

                    } catch (joinSqlError) {
                        console.log("JOIN SQL ERROR IN STEP 1:");
                        console.log(joinSqlError);
                        callback(joinSqlError);
                    }

                } else {
                    callback( null, userId, ownRequestId, matchedRequestId, deletableIds, [], [] );
                }

            } else {
                callback( null, userId, ownRequestId, matchedRequestId, [], [], [] );
            }

        } //end return

    } //end _cancelMatchCollectMatchedRequestIds

    /**
     * Cancel Matching - Adjust material volume for any both-confirmed matches found
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param {array} bothConfirmedMatches
     * @param callback
     * @private
     */
    function _cancelMatchAdjustMaterialVolumesToBothConfirmed( userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners, bothConfirmedMatches, callback ) {

        console.log("STEP 2: _cancelMatchAdjustMaterialVolumesToBothConfirmed");

        if ( bothConfirmedMatches.length > 0 ) {

            let joinSql  = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                "FROM matched_results M " +
                "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                "WHERE matched_request_id IN(" + bothConfirmedMatches.join() + ") AND own_request_id IN (" + ownRequestId + "," + matchedRequestId + ")";

            try {

                sql(joinSql).then(bothConfirmedRequests => {

                    if ( bothConfirmedRequests.length > 0 ) {

                        let materialVolumes = []
                            , matchedRequestIds = [];

                        for ( let b = 0; b < bothConfirmedRequests.length; b ++ ) {

                            materialVolumes.push( bothConfirmedRequests[b].material_volume );
                            matchedRequestIds.push( bothConfirmedRequests[b].matched_request_id );

                        } //end for

                        let matchedVolumeCaseString = "(CASE "
                            , availableVolumeCaseString = "(CASE ";

                        for ( let i = 0; i < materialVolumes.length; i ++ ) {

                            matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN matched_volume - " + materialVolumes[i] + " ";
                            availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN available_volume + " + materialVolumes[i] + " ";

                            if ( i === materialVolumes.length - 1 ) {

                                matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                                availableVolumeCaseString = availableVolumeCaseString + "END)";
                            }
                        } //end for

                        let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + matchedRequestIds.join() + ")";

                        try {
                            sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {
                                callback(null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners);
                            });

                        } catch (updateSqlWithNewVolumesError) {
                            console.log("SELECT ERROR IN STEP 2:");
                            console.log(updateSqlWithNewVolumesError);
                            callback(updateSqlWithNewVolumesError);
                        }

                    } else {
                        callback( null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners );
                    }
                });

            } catch (bothConfirmedRequestsError) {

                console.log("BOTH CONFIRMED REQUESTS ERROR IN STEP 2:");
                console.log(bothConfirmedRequestsError);
                callback(bothConfirmedRequestsError);
            }

        } else {
            callback( null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners );
        }

    } //end _cancelMatchAdjustMaterialVolumesToBothConfirmed

    /**
     * Cancel Matching - Adjust material volume as suggested
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param callback
     * @private
     */
    function _cancelMatchAdjustMaterialVolumesAsSuggested( userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners, callback ) {

        console.log("STEP 3: _cancelMatchAdjustMaterialVolumesAsSuggested");

        if ( matchesForOwners.length > 0 ) {

            let materialVolumes = []
                , ownRequestIds = [];

            for ( let m = 0; m < matchesForOwners.length; m ++ ) {

                deletableIds.push( matchesForOwners[m].id );

                if ( matchesForOwners[m].status === 3 ) {
                    materialVolumes.push( matchesForOwners[m].material_volume );
                    ownRequestIds.push( matchesForOwners[m].own_request_id );
                }
            } //end for

            if ( materialVolumes.length > 0 && ownRequestIds.length > 0 ) {

                let matchedVolumeCaseString = "(CASE "
                    , availableVolumeCaseString = "(CASE ";

                for ( let i = 0; i < materialVolumes.length; i ++ ) {

                    matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + ownRequestIds[i] + " THEN matched_volume - " + materialVolumes[i] + " ";
                    availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + ownRequestIds[i] + " THEN available_volume + " + materialVolumes[i] + " ";

                    if ( i === materialVolumes.length - 1 ) {

                        matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                        availableVolumeCaseString = availableVolumeCaseString + "END)";
                    }
                } //end for

                let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + ownRequestIds.join() + ")";

                try {
                    sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {
                        callback(null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners);
                    });

                } catch (updateSqlWithNewVolumesError) {
                    console.log("SELECT ERROR IN STEP 3:");
                    console.log(updateSqlWithNewVolumesError);
                    callback(updateSqlWithNewVolumesError);
                }

            } else {
                callback( null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners );
            }

        } else {
            callback( null, userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners );
        }

    } //end _cancelMatchAdjustMaterialVolumesAsSuggested

    /**
     * Cancel Matching - Adjust material volume as owner
     *
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param callback
     * @private
     */
    function _cancelMatchAdjustMaterialVolumesAsOwn( userId, ownRequestId, matchedRequestId, deletableIds, matchesForOwners, callback ) {

        console.log("STEP 4: _cancelMatchAdjustMaterialVolumesAsOwn");

        if ( matchesForOwners.length > 0 ) {

            let joinSql  = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                "FROM matched_results M " +
                "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                "WHERE own_request_id IN(" + matchesForOwners.join() + ")";

            try {

                sql(joinSql).then(matches => {

                    if ( matches.length > 0 ) {

                        let materialVolumes = []
                            , matchedRequestIds = [];

                        for ( let m = 0; m < matches.length; m ++ ) {

                            deletableIds.push( matches[m].id );

                            if ( matches[m].status === 3 ) {
                                materialVolumes.push( matches[m].material_volume );
                                matchedRequestIds.push( matches[m].matched_request_id );
                            }
                        } //end for

                        if ( materialVolumes.length > 0 && matchedRequestIds.length > 0 ) {

                            let matchedVolumeCaseString = "(CASE "
                                , availableVolumeCaseString = "(CASE ";

                            for ( let i = 0; i < materialVolumes.length; i ++ ) {

                                matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN matched_volume - " + materialVolumes[i] + " ";
                                availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN available_volume + " + materialVolumes[i] + " ";

                                if ( i === materialVolumes.length - 1 ) {

                                    matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                                    availableVolumeCaseString = availableVolumeCaseString + "END)";
                                }
                            } //end for

                            let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + matchedRequestIds.join() + ")";

                            try {
                                sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {
                                    callback( null, userId, ownRequestId, matchedRequestId, deletableIds );
                                });

                            } catch (updateSqlWithNewVolumesError) {
                                console.log("SELECT ERROR IN STEP 4:");
                                console.log(updateSqlWithNewVolumesError);
                                callback(updateSqlWithNewVolumesError);
                            }

                        } else {
                            callback( null, userId, ownRequestId, matchedRequestId, deletableIds );
                        }

                    } else {
                        callback( null, userId, ownRequestId, matchedRequestId, deletableIds );
                    }

                });

            } catch (joinSqlError) {
                console.log("JOIN SQL ERROR IN STEP 4:");
                console.log(joinSqlError);
                callback(joinSqlError);
            }

        } else {
            callback( null, userId, ownRequestId, matchedRequestId, deletableIds );
        }

    } //end _cancelMatchAdjustMaterialVolumesAsOwn

    /**
     * Cancel Matching - Remove all matches
     *
     * @param {string} userId
     * @param {number} ownRequestId
     * @param {number} matchedRequestId
     * @param {array} deletableIds
     * @param callback
     * @private
     */
    function _cancelMatchRemoveAllMatches( userId, ownRequestId, matchedRequestId, deletableIds, callback ) {

        console.log("STEP 5: _cancelMatchRemoveAllMatches");

        if ( deletableIds.length > 0 ) {

            let ids = deletableIds.join();

            try {

                sql("DELETE FROM documents WHERE matched_result_id IN (" + ids + ")").then(documentDeleteResult => {

                    try {
                        sql("DELETE FROM matched_summaries WHERE matched_result_id IN (" + ids + ")").then(summaryDeleteResult => {

                            try {
                                sql("DELETE FROM matched_results WHERE id IN (" + ids + ")").then(matchDeleteResult => {

                                    callback(null, true);

                                });
                            } catch (matchDeleteError) {
                                console.log("MATCH DELETE SQL ERROR IN STEP 5:");
                                console.log(matchDeleteError);
                                callback(matchDeleteError);
                            }
                        });
                    } catch (summaryDeleteError) {
                        console.log("SUMMARY DELETE SQL ERROR IN STEP 5:");
                        console.log(summaryDeleteError);
                        callback(summaryDeleteError);
                    }
                });
            } catch (documentDeleteError) {
                console.log("DOCUMENT DELETE SQL ERROR IN STEP 5:");
                console.log(documentDeleteError);
                callback(documentDeleteError);
            }
        } else {
            callback(null, true);
        }

    } //end _cancelMatchRemoveAllMatches

};