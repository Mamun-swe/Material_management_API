require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , clientApiRoot = process.env.CLIENT_API_ROOT
    , async = require('async');
const fetch = require("node-fetch");


/* Create One/More Matches of a Request */
exports.confirmMatches = function(args, res, next) {

    let inputParams = args.body;

    async.waterfall([
      _getMatchingInfo( inputParams ),
      _updateMatchingStatus,
      _updateAsOtherSide,
      _adjustMaterialVolumesForOwner,
      _adjustMaterialVolumesForOthers,
      _updateMatchingSummary,
      _getContractTypes,
      _saveCompulsoryDocuments
    ],
      function (err, ourSideConfirmedRequestIds, otherSideConfirmedRequests) {

          if ( err ) {

              console.log("ERROR IN MATCHING CONFIRMATION PROCESS: ", JSON.stringify(err, null, 2));

              res.writeHead(500, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({
                  status: false,
                  message: messages.SOME_THING_WENT_WRONG,
                  details: err
              }));

          } //end if

          let message = '';

          if ( ourSideConfirmedRequestIds !== '' )
              message = ourSideConfirmedRequestIds + ' confirmed successfully';

          if ( otherSideConfirmedRequests.length > 0 ) {

              let otherSideConfirmedRequestIds = otherSideConfirmedRequests.join();

              if ( message !== '' )
                  message = message + ". " + otherSideConfirmedRequestIds + " are also confirmed.";
              else
                  message = otherSideConfirmedRequestIds + ' confirmed successfully.';
          }

          if ( message === '' )
              message = "Nothing to confirm! Maybe no matches found.";

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
              status: true,
              message: message
          }));

      });

    /**
     * Fetch Matching Data
     *
     * @param {array} inputParams
     * @returns {(function(*): void)|*}
     * @private
     */
    function _getMatchingInfo( inputParams ) {

        console.log("STEP 1: _getMatchingInfo");

        return function ( callback ) {

            let
                ownRequestId = inputParams.own_request_id
                , matches = inputParams.matched_requests
                , matchedRequests = matches.join()
                , userId = inputParams.user_id;

            let selectStatusSql = "SELECT R1.id AS own_request_id, IIF(R1.request_type = 1, 'Donator', 'Receiver') AS own_request_type, IIF(R1.filling_purpose = 1, 'Permanent', 'Temporary') AS own_filling_purpose, R1.department_key AS own_department_key, R1.material_volume AS own_material_volume, R1.matched_volume AS own_matched_volume, R1.available_volume AS own_available_volume, " +
                    "R2.id AS matched_request_id, IIF(R2.request_type = 1, 'Donator', 'Receiver') AS other_request_type, IIF(R2.filling_purpose = 1, 'Permanent', 'Temporary') AS other_filling_purpose, R2.department_key AS other_department_key, R2.material_volume AS other_material_volume, R2.matched_volume AS other_matched_volume, R2.available_volume AS other_available_volume, " +
                    "M.status, M.id " +
                    "FROM matched_results AS M " +
                    "INNER JOIN requests AS R1 ON R1.id = M.own_request_id " +
                    "INNER JOIN requests AS R2 ON R2.id = M.matched_request_id " +
                    "INNER JOIN requesting_users AS U1 ON U1.request_id = M.own_request_id " +
                    "INNER JOIN requesting_users AS U2 ON U2.request_id = M.matched_request_id " +
                    "WHERE U1.user_id = '" + userId + "' AND U2.user_id != '" + userId + "' AND M.own_request_id = " + ownRequestId + " AND M.matched_request_id IN (" + matchedRequests + ")";

            try {

                sql(selectStatusSql).then(statusResult => {

                    callback(null, userId, ownRequestId, matchedRequests, statusResult);

                });

            } catch (statusError) {

                console.log(statusError);
                callback(statusError);
            }

        } //end return

      } //end _getMatchingInfo

    /**
     * Update Matching Status
     *
     * @param {string} userId
     * @param {integer} ownRequestId
     * @param {object} matchedRequests
     * @param {object} statusResult
     * @param callback
     * @private
     */
      function _updateMatchingStatus( userId, ownRequestId, matchedRequests, statusResult, callback ) {

        console.log("STEP 2: _updateMatchingStatus");

        let ourSideConfirmedRequests = [],
            otherSideConfirmedRequests = [],
            bothSideConfirmedRequests = [],
            nonConfirmedRequests = [],
            n = statusResult.length;

        if ( n > 0 ) {

            for ( let i = 0; i < n; i ++ ) {

                switch ( statusResult[i].status ) {

                    case 3: //Both confirmed
                        bothSideConfirmedRequests.push(statusResult[i].matched_request_id);
                        break;

                    case 2: //Other Side confirmed
                        otherSideConfirmedRequests.push(statusResult[i].matched_request_id);
                        break;

                    case 1: //Our Side confirmed
                        ourSideConfirmedRequests.push(statusResult[i].matched_request_id);
                        break;

                    default: //Not confirmed
                        nonConfirmedRequests.push(statusResult[i].matched_request_id);

                } //end switch

            } //end for

            /*res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                status: true,
                both_confirmed: bothSideConfirmedRequests,
                other_confirmed: otherSideConfirmedRequests,
                own_confirmed: ourSideConfirmedRequests,
                not_confirmed: nonConfirmedRequests
            }));*/

            if ( ( ourSideConfirmedRequests.length === n ) || bothSideConfirmedRequests.length === n ) {

                console.log('Ignoring, as nothing to confirm');
                callback(null, userId, ownRequestId, matchedRequests, statusResult, '', []);

            } else {

                if ( nonConfirmedRequests.length > 0 ) {

                    let nonConfirmedRequestIds = nonConfirmedRequests.join();

                    try {
                        //confirming our side
                        sql("UPDATE matched_results SET status = 1 WHERE own_request_id = " + ownRequestId +" AND matched_request_id IN(" + nonConfirmedRequestIds + ")").then(updatesResult => {

                            callback(null, userId, ownRequestId, matchedRequests, statusResult, nonConfirmedRequestIds, otherSideConfirmedRequests);

                        });

                    } catch (updateError) {

                        console.log(updateError);
                        callback(updateError);
                    }

                } else {
                    callback(null, userId, ownRequestId, matchedRequests, statusResult, '', otherSideConfirmedRequests);
                }

            } //end sub else

        } else {

            callback(null, userId, ownRequestId, matchedRequests, statusResult, '', []);
        }

      } //end _updateMatchingStatus

    /**
     * Update As Other Side
     *
     * @param {string} userId
     * @param {integer} ownRequestId
     * @param {object} matchedRequests
     * @param {object} statusResult
     * @param {string} ourSideConfirmedRequestIds
     * @param {object} otherSideConfirmedRequests
     * @param callback
     * @private
     */
      function _updateAsOtherSide( userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, callback ) {

          console.log("STEP 3: _updateAsOtherSide");

          if ( ourSideConfirmedRequestIds !== '' ) {

              try {

                  sql("UPDATE matched_results SET status = 2 WHERE matched_request_id = " + ownRequestId +" AND own_request_id IN(" + ourSideConfirmedRequestIds + ")").then(updateResult => {

                      callback(null, userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests);

                  });

              } catch (updateError) {

                  console.log(updateError);
                  callback(updateError);
              }

          } else { //nothing to confirm as other side
              callback(null, userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests);
          }

      } //end _updateAsOtherSide

    /**
     * Adjust Material Volumes for Owner Side
     *
     * @param {string} userId
     * @param {string} ownRequestId
     * @param {object} matchedRequests
     * @param {object} statusResult
     * @param {string} ourSideConfirmedRequestIds
     * @param {object} otherSideConfirmedRequests
     * @param callback
     * @private
     */
      function _adjustMaterialVolumesForOwner( userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, callback ) {

          console.log("STEP 4: _adjustMaterialVolumesForOwner");

          if ( otherSideConfirmedRequests.length > 0 ) {

              let otherSideConfirmedRequestIds = otherSideConfirmedRequests.join()
                  , allIds = ownRequestId + ',' + otherSideConfirmedRequestIds;

              try {
                  //confirming both side
                  sql("UPDATE matched_results SET status = 3 WHERE own_request_id = " + ownRequestId +" AND matched_request_id IN(" + otherSideConfirmedRequestIds + ")").then(updateResult => {

                      for ( let i = 0; i < statusResult.length; i ++ ) {

                          if ( otherSideConfirmedRequests.includes(statusResult[i].matched_request_id) ) {

                              if ( statusResult[i].other_available_volume < statusResult[i].own_available_volume ) {

                                  statusResult[i].own_matched_volume = statusResult[i].own_matched_volume + statusResult[i].other_available_volume;
                                  statusResult[i].other_matched_volume = statusResult[i].other_matched_volume + statusResult[i].other_available_volume;

                              } else {

                                  statusResult[i].own_matched_volume = statusResult[i].own_matched_volume + statusResult[i].own_available_volume;
                                  statusResult[i].other_matched_volume = statusResult[i].other_matched_volume + statusResult[i].own_available_volume;

                              } //end else

                              statusResult[i].own_available_volume = statusResult[i].own_material_volume - statusResult[i].own_matched_volume;
                              statusResult[i].other_available_volume = statusResult[i].other_material_volume - statusResult[i].other_matched_volume;

                          } //end if

                      } //end for

                      let matchedVolumeCaseString = "(CASE WHEN id = " + ownRequestId + " THEN " + statusResult[statusResult.length-1].own_matched_volume + " "
                          , availableVolumeCaseString = "(CASE WHEN id = " + ownRequestId + " THEN " + statusResult[statusResult.length-1].own_available_volume + " ";

                      for ( let i = 0; i < statusResult.length; i ++ ) {

                          matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + statusResult[i].matched_request_id + " THEN " + statusResult[i].other_matched_volume + " ";
                          availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + statusResult[i].matched_request_id + " THEN " + statusResult[i].other_available_volume + " ";

                          if ( i === statusResult.length - 1 ) {

                              matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                              availableVolumeCaseString = availableVolumeCaseString + "END)";
                          }

                      } //end for

                      let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + allIds + ")";

                      try {

                          sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {

                              callback(null, userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests);

                          });

                      } catch (updateSqlWithNewVolumesError) {

                          console.log(updateSqlWithNewVolumesError);
                          callback(updateSqlWithNewVolumesError);
                      }

                  });

              } catch (updateError) {

                  console.log(updateError);
                  callback(updateError);
              }

          } else { //nothing to adjust, as no matches found with the status 'Other Side confirmed'

              callback(null, userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, []);
          }

      } //end _adjustMaterialVolumesForOwner

    /**
     * Adjust Material Volumes for Other Sides
     *
     * @param {string} userId
     * @param {integer} ownRequestId
     * @param {object} matchedRequests
     * @param {object} statusResult
     * @param {string} ourSideConfirmedRequestIds
     * @param {object} otherSideConfirmedRequests
     * @param callback
     * @private
     */
    function _adjustMaterialVolumesForOthers( userId, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, callback ) {

        console.log("STEP 5: _adjustMaterialVolumesForOthers");

        if ( otherSideConfirmedRequests.length > 0 ) {

            try {

                sql("UPDATE matched_results SET status = 3 WHERE matched_request_id = " + ownRequestId + " AND own_request_id IN (" + otherSideConfirmedRequests.join() + ")").then(mainUpdate => {

                    let selectOthersStatusSql = "SELECT R1.id AS own_request_id, IIF(R1.request_type = 1, 'Donator', 'Receiver') AS own_request_type, IIF(R1.filling_purpose = 1, 'Permanent', 'Temporary') AS own_filling_purpose, R1.department_key AS own_department_key, R1.material_volume AS own_material_volume, R1.matched_volume AS own_matched_volume, R1.available_volume AS own_available_volume, " +
                        "R2.id AS matched_request_id, IIF(R2.request_type = 1, 'Donator', 'Receiver') AS other_request_type, IIF(R2.filling_purpose = 1, 'Permanent', 'Temporary') AS other_filling_purpose, R2.department_key AS other_department_key, R2.material_volume AS other_material_volume, R2.matched_volume AS other_matched_volume, R2.available_volume AS other_available_volume, " +
                        "M.status, M.id " +
                        "FROM matched_results AS M " +
                        "INNER JOIN requests AS R1 ON R1.id = M.own_request_id " +
                        "INNER JOIN requests AS R2 ON R2.id = M.matched_request_id " +
                        "INNER JOIN requesting_users AS U1 ON U1.request_id = M.own_request_id " +
                        "INNER JOIN requesting_users AS U2 ON U2.request_id = M.matched_request_id " +
                        "WHERE U1.user_id != '" + userId + "' AND U2.user_id = '" + userId + "' AND M.matched_request_id = " + ownRequestId + " AND M.own_request_id IN (" + otherSideConfirmedRequests.join() + ")";

                    try {

                        sql(selectOthersStatusSql).then(othersStatusResult => {

                            for ( let i = 0; i < othersStatusResult.length; i ++ ) {

                                if ( otherSideConfirmedRequests.includes(othersStatusResult[i].own_request_id) ) {

                                    if ( othersStatusResult[i].other_available_volume < othersStatusResult[i].own_available_volume ) {

                                        othersStatusResult[i].own_matched_volume = othersStatusResult[i].own_matched_volume + othersStatusResult[i].other_available_volume;
                                        othersStatusResult[i].other_matched_volume = othersStatusResult[i].other_matched_volume + othersStatusResult[i].other_available_volume;

                                    } else {

                                        othersStatusResult[i].own_matched_volume = othersStatusResult[i].own_matched_volume + othersStatusResult[i].own_available_volume;
                                        othersStatusResult[i].other_matched_volume = othersStatusResult[i].other_matched_volume + othersStatusResult[i].own_available_volume;

                                    } //end else

                                    othersStatusResult[i].own_available_volume = othersStatusResult[i].own_material_volume - othersStatusResult[i].own_matched_volume;
                                    othersStatusResult[i].other_available_volume = othersStatusResult[i].other_material_volume - othersStatusResult[i].other_matched_volume;

                                } // end if

                            } //end main for

                            /*let matchedVolumeCaseString = "(CASE "
                                , availableVolumeCaseString = "(CASE ";

                            for ( let o = 0; o < otherSideConfirmedRequests.length; o ++ ) {
                                matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + otherSideConfirmedRequests[o] + " THEN " + othersStatusResult[othersStatusResult.length-1].own_matched_volume + " ";
                                availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + otherSideConfirmedRequests[o] + " THEN " + othersStatusResult[othersStatusResult.length-1].own_available_volume + " ";
                            }

                            for ( let i = 0; i < othersStatusResult.length; i ++ ) {

                                matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + othersStatusResult[i].matched_request_id + " THEN " + othersStatusResult[i].other_matched_volume + " ";
                                availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + othersStatusResult[i].matched_request_id + " THEN " + othersStatusResult[i].other_available_volume + " ";

                                if ( i === othersStatusResult.length - 1 ) {

                                    matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                                    availableVolumeCaseString = availableVolumeCaseString + "END)";
                                }

                            }*/ //end for

                            callback(null, ownRequestId, matchedRequests, statusResult, othersStatusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests);

                            /*let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + allIds + ")";

                            try {

                                sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {

                                    callback(null, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests);

                                });

                            } catch (updateSqlWithNewVolumesError) {

                                console.log(updateSqlWithNewVolumesError);
                                callback(updateSqlWithNewVolumesError);
                            }*/

                        });

                    } catch (othersStatusError) {

                        console.log("OTHERS STATUS ERROR IN STEP 5:");
                        console.log(othersStatusError);
                        callback(othersStatusError);
                    }

                });

            } catch (mainUpdateError) {

                console.log("MAIN UPDATE ERROR IN STEP 5:");
                console.log(mainUpdateError);
                callback(mainUpdateError);
            }

        } else {
            callback(null, ownRequestId, matchedRequests, statusResult, [], ourSideConfirmedRequestIds, otherSideConfirmedRequests);
        }

    } //end _adjustMaterialVolumesForOthers

    /**
     * Update Match Summary
     *
     * @param {integer} ownRequestId
     * @param {object} matchedRequests
     * @param {array} statusResult
     * @param {array} othersStatusResult
     * @param {string} ourSideConfirmedRequestIds
     * @param {object} otherSideConfirmedRequests
     * @param callback
     * @private
     */
      function _updateMatchingSummary( ownRequestId, matchedRequests, statusResult, othersStatusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, callback ) {

          console.log("STEP 6: _updateMatchingSummary");

          if ( otherSideConfirmedRequests.length > 0 ) {

              console.log("OWN STATUS:", JSON.stringify(statusResult, null, 2));
              console.log("OTHERS STATUS:", JSON.stringify(othersStatusResult, null, 2));

              let matchedResultIds = ''
                  , materialVolumeCaseString = "(CASE ";

              for ( let i = 0; i < statusResult.length; i ++ ) {

                  matchedResultIds = ( matchedResultIds === '' ) ? statusResult[i].id : matchedResultIds + ',' + statusResult[i].id;
                  materialVolumeCaseString = materialVolumeCaseString + "WHEN matched_result_id = " + statusResult[i].id + " THEN " + statusResult[i].other_matched_volume + " ";

                  if ( (othersStatusResult.length === 0) && (i === statusResult.length - 1) )
                      materialVolumeCaseString = materialVolumeCaseString + "END)";
              } //end for

              if ( othersStatusResult.length > 0 ) {

                  for ( let i = 0; i < othersStatusResult.length; i ++ ) {

                      matchedResultIds = matchedResultIds + ',' + othersStatusResult[i].id;
                      materialVolumeCaseString = materialVolumeCaseString + "WHEN matched_result_id = " + othersStatusResult[i].id + " THEN " + othersStatusResult[i].other_matched_volume + " ";

                      if ( i === othersStatusResult.length - 1 )
                          materialVolumeCaseString = materialVolumeCaseString + "END)";
                  } //end for

              } //end if

              let updateSqlWithNewVolumes = "UPDATE matched_summaries SET material_volume = " + materialVolumeCaseString + " WHERE matched_result_id IN(" + matchedResultIds + ")";

              console.log(updateSqlWithNewVolumes);

              try {

                  sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {

                      callback(null, ownRequestId, matchedRequests, statusResult, othersStatusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests);

                  });

              } catch (updateSqlWithNewVolumesError) {

                  console.log(updateSqlWithNewVolumesError);
                  callback(updateSqlWithNewVolumesError);
              }

          } else { //nothing to do, as no matches found with the status 'Other Side confirmed'

              callback(null, ownRequestId, matchedRequests, statusResult, othersStatusResult, ourSideConfirmedRequestIds, []);
          }

      } //end _updateMatchingSummary

    /**
     * Get Contract Types of All Requests
     *
     * @param {integer} ownRequestId
     * @param {object} matchedRequests
     * @param {array} statusResult
     * @param {array} othersStatusResult
     * @param {string} ourSideConfirmedRequestIds
     * @param {object} otherSideConfirmedRequests
     * @param callback
     * @private
     */
      function _getContractTypes( ownRequestId, matchedRequests, statusResult, othersStatusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, callback ) {

          console.log("STEP 7: _getContractTypes");

          let contractTypes = []
              , requests = [];

          if ( otherSideConfirmedRequests.length > 0 ) {

              requests.push({
                  "request_id": ownRequestId,
                  "request_type": statusResult[0].own_request_type,
                  "filling_purpose": statusResult[0].own_filling_purpose,
                  "department_key": statusResult[0].own_department_key,
                  "category": "Own Request",
                  "id": 0
              });

              for ( let i = 0; i < statusResult.length; i ++ ) {

                  if ( otherSideConfirmedRequests.includes(statusResult[i].matched_request_id) ) {

                    requests.push({
                        "request_id": statusResult[i].matched_request_id,
                        "request_type": statusResult[i].other_request_type,
                        "filling_purpose": statusResult[i].other_filling_purpose,
                        "department_key": statusResult[i].other_department_key,
                        "category": "Other Request",
                        "id": statusResult[i].id
                    });

                  } //end if

              } //end for

              /*for ( let i = 0; i < othersStatusResult.length; i ++ ) {

                  if ( otherSideConfirmedRequests.includes(othersStatusResult[i].own_request_id) ) {

                      requests.push({
                          "request_id": othersStatusResult[i].matched_request_id,
                          "request_type": othersStatusResult[i].other_request_type,
                          "filling_purpose": othersStatusResult[i].other_filling_purpose,
                          "department_key": othersStatusResult[i].other_department_key,
                          "category": "Own Request",
                          "id": othersStatusResult[i].id
                      });

                  } //end if

              }*/ //end for

              let promises = requests.map( (request) => {

                  let url = clientApiRoot + '/Project/' + request.department_key;

                  const getData = async url => {

                      try {

                          const
                              response = await fetch(url)
                              , data = await response.json();

                          console.log("PROJECT DETAILS FOR " + request.matched_request_id + ":", JSON.stringify(data, null, 2));

                          contractTypes.push({
                              "id": request.id,
                              "request_id": request.matched_request_id,
                              "request_type": request.request_type,
                              "filling_purpose": request.filling_purpose,
                              "department_key": request.department_key,
                              "category": request.category,
                              "contract_type": data.contractType
                          });

                      } catch (projectError) {

                          console.log("Error in Fetching Project Info:");
                          console.error(projectError);
                      }

                  } //end getData;

                  return getData(url);

              } );

              Promise.all(promises).then( () => {
                  callback(null, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, contractTypes);
              } );

          } else {

              callback(null, ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, [], contractTypes);
          }

      } //end _getContractTypes

    /**
     * Save Compulsory Documents
     *
     * @param {integer} ownRequestId
     * @param {object} matchedRequests
     * @param {object} statusResult
     * @param {string} ourSideConfirmedRequestIds
     * @param {object} otherSideConfirmedRequests
     * @param {object} contractTypes
     * @param callback
     * @private
     */
    function _saveCompulsoryDocuments( ownRequestId, matchedRequests, statusResult, ourSideConfirmedRequestIds, otherSideConfirmedRequests, contractTypes, callback ) {

          console.log("STEP 8: _saveCompulsoryDocuments");

          if ( otherSideConfirmedRequests.length > 0 ) {

              console.log("CONTRACT TYPES:", JSON.stringify(contractTypes, null, 2));

              /*let ownRequestType = ''
                  , ownFillingPurpose = ''
                  , ownContractType = ''
                  , insertData = '';*/
              let ownRequestType = ( statusResult[0].own_request_type === 'Donator' ) ? 1 : 2
                  , ownFillingPurpose = ( statusResult[0].own_filling_purpose === 'Permanent' ) ? 1 : 2
                  , ownContractType = ''
                  , insertData = '';

              for ( let c = 0; c < contractTypes.length; c ++ ) {

                  if ( contractTypes[c].category === 'Own Request' )
                      ownContractType = contractTypes[c].contract_type;
              }

              for ( let i = 0; i < contractTypes.length; i ++ ) {

                  if ( contractTypes[i].category === 'Other Request' ) {

                      let otherRequestType = ( contractTypes[i].request_type === 'Donator' ) ? 1 : 2
                          , otherFillingPurpose = ( contractTypes[i].filling_purpose === 'Permanent' ) ? 1 : 2
                          , otherContractType = contractTypes[i].contract_type
                          , matchedResultId = contractTypes[i].id
                          , currentTime = new Date().toISOString();

                      //check Case 1
                      if ( ownContractType === 'PRIVATE' && otherContractType === 'PRIVATE' ) {

                          if ( ownRequestType === 1 && otherRequestType === 2 && otherFillingPurpose !== 1 ) {

                              console.log("CASE 1");

                              if ( insertData === '' )
                                  insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 1, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 1, 0, '" + currentTime + "')";
                              else
                                  insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 1, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 1, 0, '" + currentTime + "')";
                          }

                          if ( otherRequestType === 1 && ownRequestType === 2 && ownFillingPurpose !== 1 ) {

                              console.log("CASE 1");

                              if ( insertData === '' )
                                  insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 1, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 1, 0, '" + currentTime + "')";
                              else
                                  insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 1, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 1, 0, '" + currentTime + "')";
                          }

                          if ( ownRequestType === 1 && otherRequestType === 2 && otherFillingPurpose === 1 ) {

                              console.log("CASE 2");

                              if ( insertData === '' )
                                  insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter of Acceptance (Client to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, 0, '" + currentTime + "')";
                              else
                                  insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter of Acceptance (Client to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, 0, '" + currentTime + "')";
                          }

                          if ( otherRequestType === 1 && ownRequestType === 2 && ownFillingPurpose === 1 ) {

                              console.log("CASE 2");

                              if ( insertData === '' )
                                  insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter of Acceptance (Client to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, 0, '" + currentTime + "')";
                              else
                                  insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 2, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter of Acceptance (Client to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 2, 0, '" + currentTime + "')";
                          }

                      } //end Case 1 & 2


                      if ( ownContractType === 'GOVERNMENT' || otherContractType === 'GOVERNMENT' ) {

                         if ( ownRequestType === 1 && otherRequestType === 2 && otherFillingPurpose !== 1 ) {

                             console.log("CASE 3");

                              if ( insertData === '' )
                                  insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "')";
                              else
                                  insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "')";
                          }

                         if ( otherRequestType === 1 && ownRequestType === 2 && ownFillingPurpose !== 1 ) {

                            console.log("CASE 3");

                             if ( insertData === '' )
                                 insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "')";
                             else
                                  insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 3, 0, '" + currentTime + "')";
                         }

                         if ( ownRequestType === 1 && otherRequestType === 2 && otherFillingPurpose === 1 ) {

                             console.log("CASE 4");

                             if ( insertData === '' )
                                 insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 5, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "')";
                             else
                                 insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 5, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "')";
                         }

                         if ( otherRequestType === 1 && ownRequestType === 2 && ownFillingPurpose === 1 ) {

                             console.log("CASE 4");

                             if ( insertData === '' )
                                 insertData = "(" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 5, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "')";
                             else
                                 insertData = insertData + ", (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (Donator to Receiver)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Test Report', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Disposal to Receiver (HH to Client)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Disposal to Receiver (Client to HH)', 'na', " + otherRequestType + ", " + otherFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Acceptance (Receiver to Donator)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 5, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Letter of Request for Acceptance (Receiver to Client)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "'), (" + matchedResultId + ", 'Approval Letter for Acceptance from Donator (Client to Receiver)', 'na', " + ownRequestType + ", " + ownFillingPurpose + ", 4, 0, '" + currentTime + "')";
                         }

                      } //end Case 3 & 4

                  } //end if

              } //end for

              let documentInsertSqlQuery = "INSERT INTO documents (matched_result_id, name, compulsory_document, request_type, filling_purpose, matched_case, status, created_at) VALUES " + insertData;
              console.log(documentInsertSqlQuery);

              try {

                  sql(documentInsertSqlQuery).then(documentInsert => {

                      callback(null, ourSideConfirmedRequestIds, otherSideConfirmedRequests );

                  });

              } catch (documentInsertError) {

                  console.log("DOCUMENT INSERTION ERROR IN STEP 8:");
                  console.log(documentInsertError);
                  callback(documentInsertError);
              }

          } else {
              callback(null, ourSideConfirmedRequestIds, otherSideConfirmedRequests);
          }

      } //end _saveCompulsoryDocuments

};