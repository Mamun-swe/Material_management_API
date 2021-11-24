require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , async = require('async')
    , apiKey = process.env.GOOGLE_API_KEY
    , matching = require('../helpers/matching');
const distance = require("google-distance-matrix");
const Console = require("console");


/* Update an Existing Backfil/Disposal Request */
exports.updateRequest = function(args, res, next) {

    let inputParams = args.body;

    async.waterfall([
            _saveRequestBasic( inputParams ),
            _saveMaterials,
            _saveSupplementaryDocuments,
            _saveContacts,
            _rematchCollectMatchedRequestIds,
            _rematchAdjustMaterialVolumesToBothConfirmed,
            _rematchAdjustMaterialVolumesAsSuggested,
            _rematchAdjustMaterialVolumesAsOwn,
            _rematchCollectOwnedRequests,
            _rematchAdjustMatchedResultsForOwnedRequests,
            _rematchRemoveAllMatches,
            _rematchWithFillingPurposeAndScheduleOverlap,
            _rematchWithMaterialTypeAndQuality,
            _rematchWithMaterialVolume,
            _rematchWithLocation,
            _saveReMatches,
            _saveOtherSideReMatches
        ],
        function (err, result) {

            if ( err ) {

                console.log("ERROR IN UPDATING PROCESS: ", JSON.stringify(err, null, 2));

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
                message: "Request Updated Successfully"
            }));

        });

    /**
     * Save Basic Information of Disposal/Backfill Request
     *
     * @param {object} inputParams
     * @return {object}
     */
    function _saveRequestBasic( inputParams ) {

        console.log("STEP 1: _saveRequestBasic");

        return function ( callback ) {

            let
                requestType = ( inputParams.request_type === 'Disposal' ) ? 1 : 2
                , fillingPurpose = ( inputParams.filling_purpose === 'Permanent' ) ? 1 : 2
                , scheduleStatus = ( inputParams.schedule_status === 'Confirmed' ) ? 1 : 2
                , scheduleStartDate = new Date( inputParams.schedule_start_date )
                , scheduleEndDate = new Date( inputParams.schedule_end_date )
                , currentTime = new Date().toISOString()
                , shouldRematch = false;

            let checkUpdateCriteriaSql = "SELECT R.id, M.material_type, M.material_quality, R.material_volume, " +
                "FORMAT(R.schedule_start_date, 'yyyy-MM-dd') AS schedule_start_date, FORMAT(R.schedule_end_date, 'yyyy-MM-dd') AS schedule_end_date " +
                "FROM requests AS R " +
                "INNER JOIN materials AS M ON ( M.request_id = R.id ) " +
                "WHERE R.id=" + inputParams.id + " AND filling_purpose=" + fillingPurpose + " AND " +
                "M.material_type='" + inputParams.material_type + "' AND M.material_quality='" + inputParams.material_quality + "' AND R.material_volume=" + inputParams.material_volume + " AND " +
                "FORMAT(schedule_start_date, 'yyyy-MM-dd') = '" + inputParams.schedule_start_date + "' AND FORMAT(schedule_end_date, 'yyyy-MM-dd') = '" + inputParams.schedule_end_date + "'";

            try {

                sql(checkUpdateCriteriaSql).then( checkResult => {

                    if ( checkResult.length === 0 )
                        shouldRematch = true;

                    try {
                        sql(
                            "UPDATE requests SET department_key = @departmentKey, project_address = @projectAddress, request_type = @requestType, filling_purpose = @fillingPurpose, material_volume = @materialVolume, material_unit = @materialUnit, matched_volume = @matchedVolume, available_volume = @availableVolume, schedule_start_date = @scheduleStartDate, schedule_end_date = @scheduleEndDate, schedule_status = @scheduleStatus, remarks = @remarks, updated_at = @updatedAt WHERE id = @requestId",
                            {
                                departmentKey: inputParams.department_key,
                                projectAddress: inputParams.project_address,
                                requestType: requestType,
                                fillingPurpose: fillingPurpose,
                                materialVolume: inputParams.material_volume,
                                materialUnit: inputParams.material_unit,
                                matchedVolume: inputParams.matched_volume,
                                availableVolume: inputParams.available_volume,
                                scheduleStartDate: scheduleStartDate.toISOString(),
                                scheduleEndDate: scheduleEndDate.toISOString(),
                                scheduleStatus: scheduleStatus,
                                remarks: inputParams.remarks,
                                updatedAt: currentTime,
                                requestId: inputParams.id

                            }).then(basicUpdateResult => {

                            callback( null, inputParams, shouldRematch );

                        });
                    } catch (basicUpdateSqlError) {

                        console.log("BASIC UPDATE ERROR:");
                        console.log(basicUpdateSqlError);

                        callback( basicUpdateSqlError );
                    }

                } );

            } catch (checkError) {
                console.log('Check SQL Error');
                console.log(checkError);
                callback( checkError );
            }

        } //end return

    } //end _saveRequestBasic


    /**
     * Save Request Materials
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param callback
     *
     * @return {object}
     */
    function _saveMaterials( inputParams, shouldRematch, callback ) {

        console.log("STEP 2: _saveMaterials");

        let
            materialType = inputParams.material_type
            , materialQuality = ( materialType === 'Broken Concrete' ) ? '' : inputParams.material_quality
        ;

        try {
            sql(
                "UPDATE materials SET material_type = @materialType, material_quality = @materialQuality WHERE request_id = @requestId",
                {
                    materialType: materialType,
                    materialQuality: materialQuality,
                    requestId: inputParams.id
                }).then(materialUpdateResult => {

                callback( null, inputParams, shouldRematch );

            });
        } catch (materialUpdateError) {

            console.log("MATERIAL UPDATE ERROR:");
            console.log(materialUpdateError);

            callback( materialUpdateError );

        }

    } //end _saveMaterials



    /**
     * Save Uploaded Supplementary Documents
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param callback
     *
     * @return {object}
     */
    function _saveSupplementaryDocuments( inputParams, shouldRematch, callback ) {

        console.log("STEP 3: _saveSupplementaryDocuments");

        if ( inputParams.hasOwnProperty('supplementary_documents') !== false && inputParams.supplementary_documents !== '' ) { // supplementary document(s) exist

            let requestId = inputParams.id;

            try {
                sql(
                    "DELETE supplementaries WHERE request_id = @requestId", { requestId: requestId }).then(documentDeleteResult => {

                    let
                        documentNames = inputParams.supplementary_document_names
                        , names = documentNames.split(',')
                        , docs = inputParams.supplementary_documents
                        , documents = docs.split(',')
                        , n = documents.length
                        , insertData = ''
                    ;

                    for ( var i = 0; i < n; i ++ ) {

                        if ( i === 0 )
                            insertData = "(" + requestId + ", '" + names[i] + "', '" + documents[i] + "')";
                        else
                            insertData = insertData + ", (" + requestId + ", '" + names[i] + "', '" + documents[i] + "')";
                    }

                    try {
                        sql( "INSERT INTO supplementaries (request_id, name, supplementary_document) VALUES " + insertData ).then(documentResult => {

                            callback( null, inputParams, shouldRematch );

                        });
                    } catch (documentInsertionError) {

                        console.log("DOCUMENT INSERTION ERROR:");
                        console.log(documentInsertionError);

                        callback( documentInsertionError );

                    }

                });
            } catch (documentDeleteError) {

                console.log("DOCUMENT DELETE ERROR");
                console.log(documentDeleteError);

                callback( documentDeleteError );

            }


        }  else { // there is no supplementary document(s)

            callback( null, inputParams, shouldRematch );

        } //end else

    } //end _saveSupplementaryDocuments



    /**
     * Save Request Contacts
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param callback
     *
     * @return {object}
     */
    function _saveContacts( inputParams, shouldRematch, callback ) {

        console.log("STEP 4: _saveContacts");

        if ( inputParams.hasOwnProperty('contact_names') !== false && inputParams.contact_names !== '' ) { // contact(s) exist

            let requestId = inputParams.id;

            try {
                sql(
                    "DELETE contacts WHERE request_id = @requestId", { requestId: requestId }).then(contactDeleteResult => {

                    let
                        contactNames = inputParams.contact_names
                        , names = contactNames.split(',')
                        , contactPhones = inputParams.contact_phones
                        , phones = contactPhones.split(',')
                        , n = names.length
                        , insertData = ''
                    ;

                    for ( var i = 0; i < n; i ++ ) {

                        if ( i === 0 )
                            insertData = "(" + requestId + ", '" + names[i] + "', '" + phones[i] + "')";
                        else
                            insertData = insertData + ", (" + requestId + ", '" + names[i] + "', '" + phones[i] + "')";
                    }

                    let sqlQuery = "INSERT INTO contacts (request_id, name, phone) VALUES " + insertData;

                    try {
                        sql(sqlQuery).then(contactResult => {

                            callback( null, inputParams, shouldRematch );

                        });
                    } catch (contactInsertionError) {

                        console.log("CONTACT INSERTION ERROR:", JSON.stringify(contactInsertionError, null, 2));
                        callback( contactInsertionError );

                    }

                });
            } catch (contactDeleteError) {

                console.log("CONTACT DELETE ERROR");
                console.log(contactDeleteError);

                callback( contactDeleteError );

            }


        }  else { // there is no contact(s)

            callback( null, inputParams, shouldRematch );

        } //end else


    } //end _saveContacts

    /**
     * Rematch - Collect matched requests
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param callback
     * @private
     */
    function _rematchCollectMatchedRequestIds( inputParams, shouldRematch, callback ) {

        console.log("STEP 5: _rematchCollectMatchedRequestIds");

        let deletableIds = []
            , ownRequestIds = [];

        if ( shouldRematch ) {

            try {

                sql("SELECT id, matched_request_id, status FROM matched_results WHERE own_request_id = @requestId", { requestId: inputParams.id }).then(collections => {

                    if ( collections.length > 0 ) {

                        let matchedRequestIds = []
                            , bothConfirmedMatches = [];

                        for ( let c = 0; c < collections.length; c ++ ) {

                            deletableIds.push( collections[c].id );
                            matchedRequestIds.push( collections[c].matched_request_id );

                            if ( collections[c].status === 3 )
                                bothConfirmedMatches.push( collections[c].matched_request_id );

                        } //end for

                        try {
                            sql("SELECT id FROM matched_results WHERE own_request_id IN (" + matchedRequestIds.join() + ") AND matched_request_id = @requestId", { requestId: inputParams.id }).then(otherMatchedResult => {
                                
                                for ( let m = 0; m < otherMatchedResult.length; m++ ) {    
                                    deletableIds.push( otherMatchedResult[m].id );
                                }
    
                                let joinSql  = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                                    "FROM matched_results M " +
                                    "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                                    "WHERE matched_request_id IN(" + matchedRequestIds.join() + ") AND own_request_id != " + inputParams.id;

                                try {

                                    sql(joinSql).then(matchesForOwners => {

                                        if ( matchesForOwners.length > 0 )
                                            callback( null, inputParams, shouldRematch, deletableIds, [], bothConfirmedMatches );
                                        else
                                            callback( null, inputParams, shouldRematch, deletableIds, matchesForOwners, bothConfirmedMatches );

                                    });

                                } catch (joinSqlError) {
                                    console.log("JOIN SQL ERROR IN STEP 5:");
                                    console.log(joinSqlError);
                                    callback(joinSqlError);
                                }

                            });
                        } catch (otherMatchedResultError) {
                            console.log("OTHER MATCH SQL ERROR IN STEP 5:");
                            console.log(otherMatchedResultError);
                            callback( otherMatchedResultError );
                        } //end of select query

                    } else {
                        callback( null, inputParams, shouldRematch, [], [], [] );
                    }

                });

            } catch (selectError) {

                console.log("SELECT ERROR IN STEP 5:");
                console.log(selectError);
                callback(selectError);
            }

        } else {
            callback( null, inputParams, shouldRematch, [], [], [] );
        }

    } //end _rematchCollectMatchedRequestIds

    /**
     * Rematch - Adjust material volume for any both-confirmed matches found
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param {array} bothConfirmedMatches
     * @param callback
     * @private
     */
    function _rematchAdjustMaterialVolumesToBothConfirmed( inputParams, shouldRematch, deletableIds, matchesForOwners, bothConfirmedMatches, callback ) {

        console.log("STEP 6: _rematchAdjustMaterialVolumesToBothConfirmed");

        if ( shouldRematch !== false && bothConfirmedMatches.length > 0 ) {

            let joinSql  = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                "FROM matched_results M " +
                "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                "WHERE matched_request_id IN(" + bothConfirmedMatches.join() + ") AND own_request_id = " + inputParams.id;

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
                                callback(null, inputParams, shouldRematch, deletableIds, matchesForOwners);
                            });

                        } catch (updateSqlWithNewVolumesError) {
                            console.log("SELECT ERROR IN STEP 6:");
                            console.log(updateSqlWithNewVolumesError);
                            callback(updateSqlWithNewVolumesError);
                        }

                    } else {
                        callback( null, inputParams, shouldRematch, deletableIds, matchesForOwners );
                    }
                });

            } catch (bothConfirmedRequestsError) {

                console.log("BOTH CONFIRMED REQUESTS ERROR IN STEP 6:");
                console.log(bothConfirmedRequestsError);
                callback(bothConfirmedRequestsError);
            }

        } else {
            callback( null, inputParams, shouldRematch, deletableIds, matchesForOwners );
        }

    } //end _rematchAdjustMaterialVolumesToBothConfirmed

    /**
     * Rematch - Adjust material volume as suggested
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param callback
     * @private
     */
    function _rematchAdjustMaterialVolumesAsSuggested( inputParams, shouldRematch, deletableIds, matchesForOwners, callback ) {

        console.log("STEP 7: _rematchAdjustMaterialVolumesAsSuggested");

        if ( shouldRematch ) {

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
                            callback(null, inputParams, shouldRematch, deletableIds, matchesForOwners);
                        });

                    } catch (updateSqlWithNewVolumesError) {
                        console.log("SELECT ERROR IN STEP 6:");
                        console.log(updateSqlWithNewVolumesError);
                        callback(updateSqlWithNewVolumesError);
                    }

                } else {
                    callback( null, inputParams, shouldRematch, deletableIds, matchesForOwners );
                }

            } else {
                callback( null, inputParams, shouldRematch, deletableIds, matchesForOwners );
            }

        } else {
            callback( null, inputParams, shouldRematch, deletableIds, matchesForOwners );
        }

    } //end _rematchAdjustMaterialVolumesAsSuggested

    /**
     * Rematch - Adjust material volume as owner
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param callback
     * @private
     */
    function _rematchAdjustMaterialVolumesAsOwn( inputParams, shouldRematch, deletableIds, matchesForOwners, callback ) {

        console.log("STEP 8: _rematchAdjustMaterialVolumesAsOwn");

        if ( shouldRematch ) {

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
                                        callback( null, inputParams, shouldRematch, deletableIds );
                                    });

                                } catch (updateSqlWithNewVolumesError) {
                                    console.log("SELECT ERROR IN STEP 7:");
                                    console.log(updateSqlWithNewVolumesError);
                                    callback(updateSqlWithNewVolumesError);
                                }

                            } else {
                                callback( null, inputParams, shouldRematch, deletableIds );
                            }

                        } else {
                            callback( null, inputParams, shouldRematch, deletableIds );
                        }

                    });

                } catch (joinSqlError) {
                    console.log("JOIN SQL ERROR IN STEP 7:");
                    console.log(joinSqlError);
                    callback(joinSqlError);
                }

            } else {
                callback( null, inputParams, shouldRematch, deletableIds );
            }

        } else {
            callback( null, inputParams, shouldRematch, deletableIds );
        }

    } //end _rematchAdjustMaterialVolumesAsOwn

    /**
     * Rematch - Collections of own requests
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} deletableIds
     * @param callback
     * @private
     */
    function _rematchCollectOwnedRequests( inputParams, shouldRematch, deletableIds, callback ) {

        console.log("STEP 9: _rematchCollectOwnedRequests");

        if ( shouldRematch ) {

            let selectOwnersSql = "SELECT M.id, R1.id AS own_request_id, R1.request_type, R1.filling_purpose, R1.material_volume, R1.available_volume, R1.material_unit, MT.material_type, MT.material_quality, " +
                "FORMAT(R1.schedule_start_date, 'yyyy-MM-dd') AS schedule_start_date, FORMAT(R1.schedule_end_date, 'yyyy-MM-dd') AS schedule_end_date, M.status " +
                "FROM matched_results AS M " +
                "INNER JOIN requests AS R1 ON R1.id = M.own_request_id " +
                "INNER JOIN requests AS R2 ON R2.id = M.matched_request_id " +
                "INNER JOIN materials AS MT ON MT.request_id = M.matched_request_id " +
                "WHERE M.matched_request_id = " + inputParams.id;

            try {

                sql(selectOwnersSql).then(owners => {
                    callback(null, inputParams, shouldRematch, deletableIds, owners);
                });

            } catch (ownersError) {
                console.log("SQL ERROR IN STEP 8:");
                console.log(ownersError);
                callback(ownersError);
            }
        } else {
            callback(null, inputParams, shouldRematch, deletableIds, []);
        }

    } //end _rematchCollectOwnedRequests

    /**
     * Rematch - Adjust matched result for own requests
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} deletableIds
     * @param {array} owners
     * @param callback
     * @private
     */
    function _rematchAdjustMatchedResultsForOwnedRequests( inputParams, shouldRematch, deletableIds, owners, callback ) {

        console.log("STEP 10: _rematchAdjustMatchedResultsForOwnedRequests");

        if ( shouldRematch ) {

            let rematches = matching.isRematched(owners, inputParams)
                , rematchedIds = []
                , materialTypeCaseString = "(CASE "
                , materialQualityCaseString = "(CASE "
                , materialVolumeCaseString = "(CASE "
                , startDateCaseString = "(CASE "
                , endDateCaseString = "(CASE "
                , fillingPurposeScoreCaseString = "(CASE "
                , scheduleScoreCaseString = "(CASE "
                , materialVolumeScoreCaseString = "(CASE "
                , updateTime = new Date().toISOString();

            for ( let i = 0; i < rematches.length; i ++ ) {

                if ( rematches[i].filling_purpose_score > 0 && rematches[i].schedule_score > 0 && rematches[i].material_volume_score > 0 ) {

                    rematchedIds.push(rematches[i].id);

                    materialTypeCaseString = materialTypeCaseString + "WHEN matched_result_id = " + rematches[i].id + " THEN '" + rematches[i].material_type + "' ";
                    materialQualityCaseString = materialQualityCaseString + "WHEN matched_result_id = " + rematches[i].id + " THEN '" + rematches[i].material_quality + "' ";
                    materialVolumeCaseString = materialVolumeCaseString + "WHEN matched_result_id = " + rematches[i].id + " THEN " + rematches[i].material_volume + " ";

                    let scheduleStartDate = new Date( rematches[i].overlapping_start_date ).toISOString()
                        , scheduleEndDate = new Date( rematches[i].overlapping_end_date ).toISOString();
                    startDateCaseString = startDateCaseString + "WHEN matched_result_id = " + rematches[i].id + " THEN '" + scheduleStartDate + "' ";
                    endDateCaseString = endDateCaseString + "WHEN matched_result_id = " + rematches[i].id + " THEN '" + scheduleEndDate + "' ";

                    fillingPurposeScoreCaseString = fillingPurposeScoreCaseString + "WHEN id = " + rematches[i].id + " THEN " + rematches[i].filling_purpose_score + " ";
                    scheduleScoreCaseString = scheduleScoreCaseString + "WHEN id = " + rematches[i].id + " THEN " + rematches[i].schedule_score + " ";
                    materialVolumeScoreCaseString = materialVolumeScoreCaseString + "WHEN id = " + rematches[i].id + " THEN " + rematches[i].material_volume_score + " ";

                } else {
                    deletableIds.push(rematches[i].id);
                }

            } //end for


            if ( rematchedIds.length > 0 ) {

                materialTypeCaseString = materialTypeCaseString + "END)";
                materialQualityCaseString = materialQualityCaseString + "END)";
                materialVolumeCaseString = materialVolumeCaseString + "END)";
                startDateCaseString = startDateCaseString + "END)";
                endDateCaseString = endDateCaseString + "END)";
                fillingPurposeScoreCaseString = fillingPurposeScoreCaseString + "END)";
                scheduleScoreCaseString = scheduleScoreCaseString + "END)";
                materialVolumeScoreCaseString = materialVolumeScoreCaseString + "END)";

                let updateSqlMatchedSummaries = "UPDATE matched_summaries SET material_type = " + materialTypeCaseString + ", material_quality = " + materialQualityCaseString + ", material_volume = " + materialVolumeCaseString + ", schedule_start_date = " + startDateCaseString + ", schedule_end_date = " + endDateCaseString + ", updated_at = '" + updateTime + "' WHERE matched_result_id IN(" + rematchedIds.join() + ")";

                try {

                    sql(updateSqlMatchedSummaries).then(updateSqlMatched => {

                        let updateSqlMatchedResults = "UPDATE matched_results SET status = 0, filling_purpose_score = " + fillingPurposeScoreCaseString + ", schedule_score = " + scheduleScoreCaseString + ", material_volume_score = " + materialVolumeScoreCaseString + " WHERE id IN(" + rematchedIds.join() + ")";
                        try {

                            sql(updateSqlMatchedResults).then(updateResult => {
                                callback(null, inputParams, shouldRematch, deletableIds);
                            });

                        } catch (updateError) {
                            console.log("UPDATE MATCHING RESULT SQL ERROR IN STEP 9:");
                            console.log(updateError);
                            callback(updateError);
                        }
                    });

                } catch (updateSqlMatchedError) {
                    console.log("UPDATE MATCHING SUMMARY SQL ERROR IN STEP 9:");
                    console.log(updateSqlMatchedError);
                    callback(updateSqlMatchedError);
                }

            } else {
                callback(null, inputParams, shouldRematch, deletableIds);
            }

        } else {
            callback(null, inputParams, shouldRematch, deletableIds);
        }

    } //end _rematchAdjustMatchedResultsForOwnedRequests

    /**
     * Rematch - Remove all matches
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} deletableIds
     * @param callback
     * @private
     */
    function _rematchRemoveAllMatches( inputParams, shouldRematch, deletableIds, callback ) {

        console.log("STEP 11: _rematchRemoveAllMatches");

        if ( shouldRematch !== false && deletableIds.length > 0 ) {

            let ids = deletableIds.join();
            console.log(ids);

            try {

                sql("DELETE FROM documents WHERE matched_result_id IN (" + ids + ")").then(documentDeleteResult => {

                    try {
                        sql("DELETE FROM matched_summaries WHERE matched_result_id IN (" + ids + ")").then(summaryDeleteResult => {

                            try {
                                sql("DELETE FROM matched_results WHERE id IN (" + ids + ")").then(matchDeleteResult => {

                                    callback(null, inputParams, shouldRematch);

                                });
                            } catch (matchDeleteError) {
                                console.log("MATCH DELETE SQL ERROR IN STEP 10:");
                                console.log(matchDeleteError);
                                callback(matchDeleteError);
                            }
                        });
                    } catch (summaryDeleteError) {
                        console.log("SUMMARY DELETE SQL ERROR IN STEP 10:");
                        console.log(summaryDeleteError);
                        callback(summaryDeleteError);
                    }
                });
            } catch (documentDeleteError) {
                console.log("DOCUMENT DELETE SQL ERROR IN STEP 10:");
                console.log(documentDeleteError);
                callback(documentDeleteError);
            }
        } else {
            callback(null, inputParams, shouldRematch);
        }

    } //end _rematchRemoveAllMatches

    /**
     * Rematch - Find matching requests according to filling-purpose and schedule-overlap
     *
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param callback
     * @private
     */
    function _rematchWithFillingPurposeAndScheduleOverlap( inputParams, shouldRematch, callback ) {

        console.log("STEP 12: _rematchWithFillingPurposeAndScheduleOverlap");

        let matchableRequestType = 0
            , matchableFillingPurpose = 0;

        if ( inputParams.request_type === 'Disposal' || inputParams.request_type === 'Backfill' )
            matchableRequestType = ( inputParams.request_type === 'Disposal' ) ? 2 : 1

        if ( inputParams.request_type === 1 || inputParams.request_type === 2 )
            matchableRequestType = ( inputParams.request_type === 1 ) ? 2 : 1

        if ( inputParams.filling_purpose === 'Permanent' || inputParams.filling_purpose === 'Temporary' )
            matchableFillingPurpose = ( inputParams.filling_purpose === 'Permanent' ) ? 1 : 2;
        else
            matchableFillingPurpose = inputParams.filling_purpose;

        let startDate = inputParams.schedule_start_date
            , endDate = inputParams.schedule_end_date
            , datesWithinTargetSchedule = matching.getDatesBetweenDates(startDate, endDate)
            , materialUnit = inputParams.material_unit
            , requestingUser = inputParams.user_id
            , matchesForScheduleOverlaps = []
            , requestId = inputParams.id;

        if ( shouldRematch ) {

            let selectSql = "DECLARE @FromDate datetime = @startDate;" +
                "DECLARE @ToDate datetime = @endDate;" +
                "SELECT R.id, FORMAT(R.schedule_start_date, 'yyyy-MM-dd') AS schedule_start_date, FORMAT(R.schedule_end_date, 'yyyy-MM-dd') AS schedule_end_date, " +
                "R.request_type, R.filling_purpose, R.project_address, M.material_type, M.material_quality, R.material_volume, R.available_volume, R.material_unit, " +
                "IIF(R.filling_purpose = " + matchableFillingPurpose + ", 1, 0.5) AS filling_purpose_score, " +
                "IIF(@FromDate <= R.schedule_end_date AND @ToDate >= R.schedule_start_date, " +
                "   DATEDIFF(day," +
                "       IIF(R.schedule_start_date > @FromDate, R.schedule_start_date, @FromDate)," +
                "       IIF(R.schedule_end_date < @ToDate, R.schedule_end_date, @ToDate)" +
                "   ) + 1, " +
                "0) AS total_overlap_period, " +
                "DATEDIFF(day, @FromDate, @ToDate) + 1 AS total_own_period " +
                "FROM requests AS R " +
                "INNER JOIN materials AS M ON ( M.request_id = R.id ) " +
                "INNER JOIN requesting_users AS U ON ( U.request_id = R.id ) " +
                "WHERE R.request_type = @requestType AND R.material_unit = '" + materialUnit + "' AND U.user_id != '" + requestingUser + "'";

            try {

                sql(selectSql, {
                    startDate: startDate,
                    endDate: endDate,
                    fillingPurpose: matchableFillingPurpose,
                    requestType: matchableRequestType,
                    materialUnit: materialUnit,
                    userId: requestingUser
                }).then(matchResult => {

                    let n = matchResult.length
                        , matchesForScheduleOverlaps = [];

                    if (n > 0) {

                        for ( let i = 0; i < n; i ++ ) {

                            if ( matchResult[i].total_overlap_period > 0 ) {

                                let scheduleDates = matching.getDatesBetweenDates( matchResult[i].schedule_start_date, matchResult[i].schedule_end_date );

                                matchesForScheduleOverlaps.push({
                                    "id": matchResult[i].id,
                                    "request_type": matchResult[i].request_type,
                                    "filling_purpose": matchResult[i].filling_purpose,
                                    "overlapping_dates": matching.getOverlappingDates( scheduleDates, datesWithinTargetSchedule ),
                                    "address": matchResult[i].project_address,
                                    "material_type": matchResult[i].material_type,
                                    "material_quality": matchResult[i].material_quality,
                                    "material_volume": matchResult[i].material_volume,
                                    "available_volume": matchResult[i].available_volume,
                                    "material_unit": matchResult[i].material_unit,
                                    "filling_purpose_score": matchResult[i].filling_purpose_score,
                                    "schedule_score": parseFloat( matchResult[i].total_overlap_period / matchResult[i].total_own_period ).toFixed(2)
                                });

                            } //end if

                        } //end for
                    }  //end if

                    callback( null, requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForScheduleOverlaps );
                });

            } catch (selectError) {
                console.log("SELECT SQL ERROR IN STEP 11:");
                console.log(selectError);
                callback(selectError);
            }

        } else {
            callback( null, requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForScheduleOverlaps );
        }

    } //end _rematchWithFillingPurposeAndScheduleOverlap

    /**
     * Rematch - Find matching requests according to filling-purpose and schedule-overlap
     *
     * @param {number} requestId
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {string} matchableRequestType
     * @param {string} matchableFillingPurpose
     * @param {array} matchesForScheduleOverlaps
     * @param callback
     * @private
     */
    function _rematchWithMaterialTypeAndQuality( requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForScheduleOverlaps, callback ) {

        console.log("STEP 13: _rematchWithMaterialTypeAndQuality");

        let matchesForMaterialTypeAndQuality = [];

        if ( shouldRematch ) {

            if ( matchesForScheduleOverlaps.length > 0 ) {

                for ( let i = 0; i < matchesForScheduleOverlaps.length; i ++ ) {

                    let materialMatchingDetails = matching.isMaterialMatched(matchableRequestType, inputParams, matchesForScheduleOverlaps[i]);

                    if ( materialMatchingDetails.material_matched ) {

                        matchesForMaterialTypeAndQuality.push({
                            "id": matchesForScheduleOverlaps[i].id,
                            "filling_purpose": matchesForScheduleOverlaps[i].filling_purpose,
                            "overlapping_dates": matchesForScheduleOverlaps[i].overlapping_dates,
                            "address": matchesForScheduleOverlaps[i].address,
                            "material_type": materialMatchingDetails.matched_material_types,
                            "material_quality": materialMatchingDetails.matched_material_quality,
                            "material_volume": matchesForScheduleOverlaps[i].material_volume,
                            "available_volume": matchesForScheduleOverlaps[i].available_volume,
                            "material_unit": matchesForScheduleOverlaps[i].material_unit,
                            "filling_purpose_score": matchesForScheduleOverlaps[i].filling_purpose_score,
                            "schedule_score": matchesForScheduleOverlaps[i].schedule_score
                        });

                    } //end if

                } //end for
            } //end main if

            callback( null, requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForMaterialTypeAndQuality );

        } else {
            callback( null, requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForMaterialTypeAndQuality );
        }

    } //end _rematchWithMaterialTypeAndQuality

    /**
     * Rematch - Find matching requests according to material volume
     *
     * @param {number} requestId
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {string} matchableRequestType
     * @param {string} matchableFillingPurpose
     * @param {string} matchesForMaterialTypeAndQuality
     * @param callback
     * @private
     */
    function _rematchWithMaterialVolume( requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForMaterialTypeAndQuality, callback ) {

        console.log("STEP 14: _rematchWithMaterialVolume");

        let matchesForMaterialVolume = [];

        if ( shouldRematch ) {

            if ( matchesForMaterialTypeAndQuality.length > 0 ) {

                for ( let i = 0; i < matchesForMaterialTypeAndQuality.length; i ++ ) {

                    matchesForMaterialVolume.push({
                        "id": matchesForMaterialTypeAndQuality[i].id,
                        "address": matchesForMaterialTypeAndQuality[i].address,
                        "filling_purpose": matchesForMaterialTypeAndQuality[i].filling_purpose,
                        "filling_purpose_score": matchesForMaterialTypeAndQuality[i].filling_purpose_score,
                        "overlapping_dates": matchesForMaterialTypeAndQuality[i].overlapping_dates,
                        "schedule_score": matchesForMaterialTypeAndQuality[i].schedule_score,
                        "material_type": matchesForMaterialTypeAndQuality[i].material_type,
                        "material_quality": matchesForMaterialTypeAndQuality[i].material_quality,
                        "material_volume": matchesForMaterialTypeAndQuality[i].material_volume,
                        "material_unit": matchesForMaterialTypeAndQuality[i].material_unit,
                        "material_volume_score": (
                            matchesForMaterialTypeAndQuality[i].available_volume > inputParams.available_volume  ) ? 1 : (
                            matchesForMaterialTypeAndQuality[i].available_volume / inputParams.available_volume )
                            .toFixed(2)
                    });

                } //end for

            } //end main if

            callback( null, requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForMaterialVolume );

        } else {
            callback( null, requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForMaterialVolume );
        }

    } //end _rematchWithMaterialVolume

    /**
     * Rematch - Find matching requests according to project address
     *
     * @param {number} requestId
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {string} matchableRequestType
     * @param {string} matchableFillingPurpose
     * @param {array} matchesForMaterialVolume
     * @param callback
     * @private
     */
    function _rematchWithLocation( requestId, inputParams, shouldRematch, matchableRequestType, matchableFillingPurpose, matchesForMaterialVolume, callback ) {

        console.log("STEP 15: _rematchWithLocation");

        let finalMatches = [];

        if ( shouldRematch ) {

            if ( matchesForMaterialVolume.length > 0 ) {

                let distance = require('google-distance-matrix')
                    , origins = [inputParams.project_address]
                    , destinations = []
                    , distancesInKm = [];

                for ( let i = 0; i < matchesForMaterialVolume.length; i ++ ) {
                    destinations.push(matchesForMaterialVolume[i].address);
                }

                distance.key(apiKey);

                distance.matrix(origins, destinations, function (distanceError, distances) {

                    if (distanceError) {
                        //console.log(distanceError);
                        //console.log("DISTANCE ERROR: ", JSON.stringify(distanceError, null, 2));
                        callback( null, requestId, inputParams, shouldRematch, finalMatches );
                    }

                    if(!distances) {

                        //console.log('no distances');
                        callback( null, requestId, inputParams, shouldRematch, finalMatches );
                    }

                    if (distances.status === 'OK') {

                        for (let i=0; i < origins.length; i++) {

                            for (let j = 0; j < destinations.length; j++) {

                                if (distances.rows[0].elements[j].status === 'OK') {

                                    let distanceString = distances.rows[i].elements[j].distance.text
                                        , distanceArray = distanceString.split(' ')
                                        , distance = (distanceArray[1] === 'm') ? (distanceArray[0] * 0.001) : distanceArray[0];

                                    distancesInKm.push(distance);
                                    //console.log('Distance from ' + origin + ' to ' + destination + ' is ' + distance + ' ' + distanceArray[1]);
                                } else {
                                    distancesInKm.push(0.00);
                                    //console.log(destination + ' is not reachable by land from ' + origin);
                                }
                            } //end for
                        } //end for
                    } //end if

                    for ( let i = 0; i < matchesForMaterialVolume.length; i ++ ) {

                        let locationScore = matching.getLocationScoreByDistanceInKm(distancesInKm[i]);

                        let overlappingDates = matchesForMaterialVolume[i].overlapping_dates
                            , numOfOverlapping = overlappingDates.length;

                        finalMatches.push({
                            "id": matchesForMaterialVolume[i].id,
                            "filling_purpose_score": matchesForMaterialVolume[i].filling_purpose_score,
                            "schedule_score": matchesForMaterialVolume[i].schedule_score,
                            "material_volume_score": matchesForMaterialVolume[i].material_volume_score,
                            "location_score": locationScore,
                            "matching_summary": {
                                "filling_purpose": matchesForMaterialVolume[i].filling_purpose,
                                "material_type": matchesForMaterialVolume[i].material_type,
                                "material_quality": matchesForMaterialVolume[i].material_quality,
                                "material_volume": matchesForMaterialVolume[i].material_volume,
                                "material_unit": matchesForMaterialVolume[i].material_unit,
                                "schedule_start_date": overlappingDates[0],
                                "schedule_end_date": overlappingDates[ numOfOverlapping-1 ]
                            }
                        });

                    } //end for

                    callback( null, requestId, inputParams, shouldRematch, finalMatches );
                });

            } else {
                callback( null, requestId, inputParams, shouldRematch, finalMatches );
            }

        } else {
            callback( null, requestId, inputParams, shouldRematch, [] );
        }

    } //end _rematchWithLocation

    /**
     * Rematch - Saves matched requests
     *
     * @param {number} requestId
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} matches
     * @param callback
     * @private
     */
    function _saveReMatches( requestId, inputParams, shouldRematch, matches, callback ) {

        console.log("STEP 16: _saveReMatches");

        if ( shouldRematch ) {

            let n = matches.length;

            if ( n > 0 ) {

                let insertData = '';

                for ( let i = 0; i < n; i ++ ) {

                    let currentTime = new Date().toISOString();

                    if ( i === 0 )
                        insertData = "(" + requestId + ", " + matches[i].id + ", " + matches[i].filling_purpose_score + ", " + parseFloat(matches[i].schedule_score) + ", " + matches[i].material_volume_score + ", " + matches[i].location_score + ", '" + currentTime + "', 0)";
                    else
                        insertData = insertData + ", (" + requestId + ", " + matches[i].id + ", " + matches[i].filling_purpose_score + ", " + parseFloat(matches[i].schedule_score) + ", " + matches[i].material_volume_score + ", " + matches[i].location_score + ", '" + currentTime + "', 0)";
                } //end for

                let matchedResultInsertSqlQuery = "INSERT INTO matched_results (own_request_id, matched_request_id, filling_purpose_score, schedule_score, material_volume_score, location_score, created_at, status) VALUES " + insertData;

                try {
                    sql(matchedResultInsertSqlQuery).then(matchedResultInsert => {

                        try {
                            sql("SELECT id FROM matched_results WHERE own_request_id = @requestId", { requestId: requestId }).then(matchedResult => {

                                let matchedResultIds = [];
                                for( let m = 0; m < matchedResult.length; m++ ) {
                                    matchedResultIds.push(matchedResult[m].id);
                                }

                                let insertSummaryData = '';

                                for ( let i = 0; i < matchedResultIds.length; i ++ ) {

                                    let currentTime = new Date().toISOString()
                                        , scheduleStartDate = new Date( matches[i].matching_summary.schedule_start_date ).toISOString()
                                        , scheduleEndDate = new Date( matches[i].matching_summary.schedule_end_date ).toISOString();

                                    if ( i === 0 )
                                        insertSummaryData = "(" + matchedResultIds[i] + ", " + matches[i].matching_summary.filling_purpose + ", '" + matches[i].matching_summary.material_type + "', '" + matches[i].matching_summary.material_quality + "', " + matches[i].matching_summary.material_volume + ", '" + matches[i].matching_summary.material_unit + "', '" + scheduleStartDate + "', '" + scheduleEndDate + "', '" + currentTime + "')";
                                    else
                                        insertSummaryData = insertSummaryData + ", (" + matchedResultIds[i] + ", " + matches[i].matching_summary.filling_purpose + ", '" + matches[i].matching_summary.material_type + "', '" + matches[i].matching_summary.material_quality + "', " + matches[i].matching_summary.material_volume + ", '" + matches[i].matching_summary.material_unit + "', '" + scheduleStartDate + "', '" + scheduleEndDate + "', '" + currentTime + "')";
                                } //end for

                                let matchedSummaryInsertSqlQuery = "INSERT INTO matched_summaries (matched_result_id, filling_purpose, material_type, material_quality, material_volume, material_unit, schedule_start_date, schedule_end_date, created_at) VALUES " + insertSummaryData;

                                try {
                                    sql(matchedSummaryInsertSqlQuery).then(matchedSummaryInsert => {
                                        callback( null, requestId, inputParams, shouldRematch, matches );
                                    });
                                } catch (insertSummaryError) {

                                    console.log(insertSummaryError);
                                    callback( insertSummaryError );
                                }
                            });
                        } catch (matchedResultError) {

                            console.log(matchedResultError);
                            callback( matchedResultError );
                        } //end of select query

                    }); //end of matchedResultInsertSqlQuery
                } catch (matchedResultInsertError) {
                    console.log(matchedResultInsertError);
                    callback( matchedResultInsertError );
                }

            } else {
                callback( null, requestId, inputParams, shouldRematch, matches );
            }

        } else {
            callback( null, requestId, inputParams, shouldRematch, matches );
        }

    } //end _saveReMatches

    /**
     * Rematch - Saves matched requests
     *
     * @param {number} requestId
     * @param {object} inputParams
     * @param {boolean} shouldRematch
     * @param {array} matches
     * @param callback
     * @private
     */
    function _saveOtherSideReMatches( requestId, inputParams, shouldRematch, matches, callback ) {

        console.log("STEP 17: _saveOtherSideReMatches");

        if ( shouldRematch ) {

            let n = matches.length
            , matchedIds = [];

            if ( n > 0 ) {

                let insertData = '';

                for ( let i = 0; i < n; i ++ ) {

                    let currentTime = new Date().toISOString();
                    matchedIds.push(matches[i].id);

                    if ( i === 0 )
                        insertData = "(" + matches[i].id + ", " + requestId + ", " + matches[i].filling_purpose_score + ", " + parseFloat(matches[i].schedule_score) + ", " + matches[i].material_volume_score + ", " + matches[i].location_score + ", '" + currentTime + "', 0)";
                    else
                        insertData = insertData + ", (" + matches[i].id + ", " + requestId + ", " + matches[i].filling_purpose_score + ", " + parseFloat(matches[i].schedule_score) + ", " + matches[i].material_volume_score + ", " + matches[i].location_score + ", '" + currentTime + "', 0)";
                } //end for

                let matchedResultInsertSqlQuery = "INSERT INTO matched_results (own_request_id, matched_request_id, filling_purpose_score, schedule_score, material_volume_score, location_score, created_at, status) VALUES " + insertData;

                try {
                    sql(matchedResultInsertSqlQuery).then(matchedResultInsert => {

                        try {
                            sql("SELECT id FROM matched_results WHERE own_request_id IN (" + matchedIds.join() + ") AND matched_request_id = @requestId", { requestId: requestId }).then(matchedResult => {

                                let insertSummaryData = '';

                                for ( let m = 0; m < matchedResult.length; m ++ ) {

                                    let currentTime = new Date().toISOString()
                                        , scheduleStartDate = new Date( matches[m].matching_summary.schedule_start_date ).toISOString()
                                        , scheduleEndDate = new Date( matches[m].matching_summary.schedule_end_date ).toISOString();

                                    if ( m === 0 )
                                        insertSummaryData = "(" + matchedResult[m].id + ", " + matches[m].matching_summary.filling_purpose + ", '" + matches[m].matching_summary.material_type + "', '" + matches[m].matching_summary.material_quality + "', " + matches[m].matching_summary.material_volume + ", '" + matches[m].matching_summary.material_unit + "', '" + scheduleStartDate + "', '" + scheduleEndDate + "', '" + currentTime + "')";
                                    else
                                        insertSummaryData = insertSummaryData + ", (" + matchedResult[m].id + ", " + matches[m].matching_summary.filling_purpose + ", '" + matches[m].matching_summary.material_type + "', '" + matches[m].matching_summary.material_quality + "', " + matches[m].matching_summary.material_volume + ", '" + matches[m].matching_summary.material_unit + "', '" + scheduleStartDate + "', '" + scheduleEndDate + "', '" + currentTime + "')";
                                } //end for

                                let matchedSummaryInsertSqlQuery = "INSERT INTO matched_summaries (matched_result_id, filling_purpose, material_type, material_quality, material_volume, material_unit, schedule_start_date, schedule_end_date, created_at) VALUES " + insertSummaryData;

                                try {
                                    sql(matchedSummaryInsertSqlQuery).then(matchedSummaryInsert => {
                                        callback( null, true );
                                    });
                                } catch (insertSummaryError) {

                                    console.log(insertSummaryError);
                                    callback( insertSummaryError );
                                }
                            });
                        } catch (matchedResultError) {

                            console.log(matchedResultError);
                            callback( matchedResultError );
                        } //end of select query

                    }); //end of matchedResultInsertSqlQuery
                } catch (matchedResultInsertError) {
                    console.log(matchedResultInsertError);
                    callback( matchedResultInsertError );
                }

            } else {
                callback( null, true );
            }

        } else {
            callback( null, true );
        }

    } //end _saveOtherSideReMatches

};