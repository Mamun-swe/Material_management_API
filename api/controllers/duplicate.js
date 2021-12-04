require("dotenv").config();

const sql = require("../../config/sql")
const messages = require("../../config/constant")
const async = require('async')
const matching = require('../helpers/matching')
const apiKey = process.env.GOOGLE_API_KEY
const distance = require("google-distance-matrix")
const Console = require("console");
const auth = require("../helpers/auth")

/* Create a Backfill/Disposal Request */
exports.createRequest = async (args, res, next) => {
    if (!args.headers.authorization) {
        return res.status(404).json({
            message: messages.TOKEN_IS_EMPTY
        })
    }

    const verifiedHeader = await auth.isValidToken(args.headers)
    if (!verifiedHeader) {
        return res.status(501).json({
            message: messages.INVALID_TOKEN
        })
    }

    let inputParams = args.body;

    async.waterfall([
        _saveRequestBasic(inputParams),
        _saveMaterials,
        _saveSupplementaryDocuments,
        _saveContacts,
        _saveRequestingUser,
        _matchWithFillingPurposeAndScheduleOverlap,
        _matchWithMaterialTypeAndQuality,
        _matchWithMaterialVolume,
        _matchWithLocation,
        _saveMatches
    ],
        function (err, result) {

            if (err) {

                console.log("ERROR IN CREATION PROCESS: ", JSON.stringify(err, null, 2));

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
                message: "Request Created Successfully"
            }));

        });

    /**
     * Save Basic Information of Disposal/Backfill Request
     * 
     * @param {object} inputParams
     * @return {object} 
     */
    function _saveRequestBasic(inputParams) {

        console.log("STEP 1: _saveRequestBasic");

        return function (callback) {

            let
                requestType = (inputParams.request_type === 'Disposal') ? 1 : 2
                , fillingPurpose = (inputParams.filling_purpose === 'Permanent') ? 1 : 2
                , scheduleStatus = (inputParams.schedule_status === 'Confirmed') ? 1 : 2
                , scheduleStartDate = new Date(inputParams.schedule_start_date)
                , scheduleEndDate = new Date(inputParams.schedule_end_date)
                , currentTime = new Date().toISOString()
                , basicSaved = false
                , idObtained = false
                ;

            var requestId;

            try {
                sql(
                    "INSERT INTO requests (department_key, project_address, request_type, filling_purpose, material_volume, material_unit, matched_volume, available_volume, schedule_start_date, schedule_end_date, schedule_status, remarks, created_at) VALUES (@departmentKey, @projectAddress, @requestType, @fillingPurpose, @materialVolume, @materialUnit, @matchedVolume, @availableVolume, @scheduleStartDate, @scheduleEndDate, @scheduleStatus, @remarks, @createdAt)",
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
                        createdAt: currentTime

                    }).then(basicInsertionResult => {

                        basicSaved = true;

                        try {
                            sql(
                                "SELECT id FROM requests ORDER BY id DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY").then(selectRequestIdResult => {

                                    requestId = selectRequestIdResult[0].id;
                                    idObtained = true;

                                    callback(null, requestId, inputParams);

                                });
                        } catch (selectRequestIdError) {

                            console.log("SELECT REQUEST ID ERROR:", JSON.stringify(selectRequestIdError, null, 2));
                            callback(selectRequestIdError);

                        }

                    });
            } catch (basicInsertionSqlError) {

                console.log("BASIC INSERTION ERROR:", JSON.stringify(basicInsertionSqlError, null, 2));
                callback(basicInsertionSqlError);

            }

        } //end return

    } //end _saveRequestBasic



    /**
     * Save Request Materials
     * 
     * @param {integer} requestId
     * @param {object} inputParams
     * @param {object} callback
     * 
     * @return {object} 
     */
    function _saveMaterials(requestId, inputParams, callback) {

        console.log("STEP 2: _saveMaterials");

        let
            materialType = inputParams.material_type
            , materialQuality = (materialType === 'Broken Concrete') ? '' : inputParams.material_quality
            ;

        try {
            sql(
                "INSERT INTO materials (request_id, material_type, material_quality) VALUES (@requestId, @materialType, @materialQuality)",
                {
                    requestId: requestId,
                    materialType: materialType,
                    materialQuality: materialQuality
                }).then(materialInsertionResult => {

                    callback(null, requestId, inputParams);

                });
        } catch (materialInsertionError) {

            console.log("MATERIAL INSERTION ERROR:", JSON.stringify(materialInsertionError, null, 2));
            callback(materialInsertionError);

        }

    } //end _saveMaterials



    /**
     * Save Uploaded Supplementary Documents
     * 
     * @param {integer} requestId
     * @param {object} inputParams
     * @param {object} callback
     * 
     * @return {object}  
     */
    function _saveSupplementaryDocuments(requestId, inputParams, callback) {

        console.log("STEP 3: _saveSupplementaryDocuments");

        if (inputParams.supplementary_documents === '') {

            callback(null, requestId, inputParams);

        } else {

            let
                documentNames = inputParams.supplementary_document_names
                , names = documentNames.split(',')
                , docs = inputParams.supplementary_documents
                , documents = docs.split(',')
                , n = documents.length
                , insertData = ''
                ;

            for (var i = 0; i < n; i++) {

                if (i === 0)
                    insertData = "(" + requestId + ", '" + names[i] + "', '" + documents[i] + "')";
                else
                    insertData = insertData + ", (" + requestId + ", '" + names[i] + "', '" + documents[i] + "')";
            }

            let sqlQuery = "INSERT INTO supplementaries (request_id, name, supplementary_document) VALUES " + insertData;

            try {
                sql(sqlQuery).then(documentResult => {

                    callback(null, requestId, inputParams);

                });
            } catch (documentInsertionError) {

                console.log("DOCUMENT INSERTION ERROR:", JSON.stringify(documentInsertionError, null, 2));
                callback(documentInsertionError);

            }

        } //end else


    } //end _saveSupplementaryDocuments



    /**
     * Save Request Contacts
     * 
     * @param {integer} requestId
     * @param {object} inputParams
     * @param {object} callback
     * 
     * @return {object}  
     */
    function _saveContacts(requestId, inputParams, callback) {

        console.log("STEP 4: _saveContacts");

        if (inputParams.contact_names === '') {

            callback(null, requestId, inputParams);

        } else {

            let
                contactNames = inputParams.contact_names
                , names = contactNames.split(',')
                , contactPhones = inputParams.contact_phones
                , phones = contactPhones.split(',')
                , n = names.length
                , insertData = ''
                ;

            for (let i = 0; i < n; i++) {

                if (i === 0)
                    insertData = "(" + requestId + ", '" + names[i] + "', '" + phones[i] + "')";
                else
                    insertData = insertData + ", (" + requestId + ", '" + names[i] + "', '" + phones[i] + "')";
            }

            let sqlQuery = "INSERT INTO contacts (request_id, name, phone) VALUES " + insertData;

            try {
                sql(sqlQuery).then(contactResult => {

                    callback(null, requestId, inputParams);

                });
            } catch (contactInsertionError) {

                console.log("CONTACT INSERTION ERROR:", JSON.stringify(contactInsertionError, null, 2));
                callback(contactInsertionError);

            }

        }

    } //end _saveContacts


    /**
     * Save Requesting User of the Request
     * 
     * @param {integer} requestId
     * @param {object} inputParams
     * @param {object} callback
     * 
     * @return {object}  
     */
    function _saveRequestingUser(requestId, inputParams, callback) {

        console.log("STEP 5: _saveRequestingUser");

        try {
            sql(
                "INSERT INTO requesting_users (request_id, user_id) VALUES (@requestId, @userId)",
                {
                    requestId: requestId,
                    userId: inputParams.user_id
                }).then(userInsertionResult => {

                    callback(null, requestId, inputParams);

                });
        } catch (userInsertionError) {

            console.log("USER INSERTION ERROR:", JSON.stringify(userInsertionError, null, 2));
            callback(userInsertionError);

        }

    } //end _saveRequestingUser

    /**
     * Find matching requests according to filling-purpose and schedule-overlap
     *
     * @param requestId
     * @param inputParams
     * @param callback
     * @private
     */
    function _matchWithFillingPurposeAndScheduleOverlap(requestId, inputParams, callback) {

        console.log("STEP 6: _matchWithFillingPurposeAndScheduleOverlap");

        let matchableRequestType = (inputParams.request_type === 'Disposal') ? 2 : 1
            , matchableFillingPurpose = (inputParams.filling_purpose === 'Permanent') ? 1 : 2
            , startDate = inputParams.schedule_start_date
            , endDate = inputParams.schedule_end_date
            , datesWithinTargetSchedule = matching.getDatesBetweenDates(startDate, endDate)
            , materialUnit = inputParams.material_unit
            , requestingUser = inputParams.user_id;

        //console.log('matchableRequestType: ' + matchableRequestType + '; matchableFillingPurpose: ' + matchableFillingPurpose);

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

                    for (let i = 0; i < n; i++) {

                        if (matchResult[i].total_overlap_period > 0) {

                            let scheduleDates = matching.getDatesBetweenDates(matchResult[i].schedule_start_date, matchResult[i].schedule_end_date);

                            matchesForScheduleOverlaps.push({
                                "id": matchResult[i].id,
                                "request_type": matchResult[i].request_type,
                                "filling_purpose": matchResult[i].filling_purpose,
                                "overlapping_dates": matching.getOverlappingDates(scheduleDates, datesWithinTargetSchedule),
                                "address": matchResult[i].project_address,
                                "material_type": matchResult[i].material_type,
                                "material_quality": matchResult[i].material_quality,
                                "material_volume": matchResult[i].material_volume,
                                "available_volume": matchResult[i].available_volume,
                                "material_unit": matchResult[i].material_unit,
                                "filling_purpose_score": matchResult[i].filling_purpose_score,
                                "schedule_score": parseFloat(matchResult[i].total_overlap_period / matchResult[i].total_own_period).toFixed(2)
                            });

                        } //end if

                    } //end for
                }  //end if

                callback(null, requestId, inputParams, matchableRequestType, matchableFillingPurpose, matchesForScheduleOverlaps);
            });

        } catch (selectError) {

            console.log("MATCH SELECTION ERROR:", JSON.stringify(selectError, null, 2));
            callback(selectError);
        }

    } //end _matchWithFillingPurposeAndScheduleOverlap

    /**
     * Find matching requests according to material type & quantity
     *
     * @param requestId
     * @param inputParams
     * @param matchableRequestType
     * @param matchableFillingPurpose
     * @param matchesForScheduleOverlaps
     * @param callback
     * @private
     */
    function _matchWithMaterialTypeAndQuality(requestId, inputParams, matchableRequestType, matchableFillingPurpose, matchesForScheduleOverlaps, callback) {

        console.log("STEP 7: _matchWithMaterialTypeAndQuality");

        let matchesForMaterialTypeAndQuality = [];

        if (matchesForScheduleOverlaps.length > 0) {

            for (let i = 0; i < matchesForScheduleOverlaps.length; i++) {

                let materialMatchingDetails = matching.isMaterialMatched(matchableRequestType, inputParams, matchesForScheduleOverlaps[i]);

                if (materialMatchingDetails.material_matched) {

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

        callback(null, requestId, inputParams, matchableRequestType, matchableFillingPurpose, matchesForMaterialTypeAndQuality);

    } //end _matchWithMaterialTypeAndQuality

    /**
     * Find matching requests according to material volume
     *
     * @param requestId
     * @param inputParams
     * @param matchableRequestType
     * @param matchableFillingPurpose
     * @param matchesForMaterialTypeAndQuality
     * @param callback
     * @private
     */
    function _matchWithMaterialVolume(requestId, inputParams, matchableRequestType, matchableFillingPurpose, matchesForMaterialTypeAndQuality, callback) {

        console.log("STEP 8: _matchWithMaterialVolume");

        let matchesForMaterialVolume = [];

        if (matchesForMaterialTypeAndQuality.length > 0) {

            for (let i = 0; i < matchesForMaterialTypeAndQuality.length; i++) {

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
                        matchesForMaterialTypeAndQuality[i].available_volume > inputParams.available_volume) ? 1 : (
                            matchesForMaterialTypeAndQuality[i].available_volume / inputParams.available_volume)
                            .toFixed(2)
                });

            } //end for

        } //end main if

        callback(null, requestId, inputParams, matchableRequestType, matchableFillingPurpose, matchesForMaterialVolume);

    } //end _matchWithMaterialVolume

    /**
     * Find matching requests according to project address
     *
     * @param requestId
     * @param inputParams
     * @param matchableRequestType
     * @param matchableFillingPurpose
     * @param matchesForMaterialVolume
     * @param callback
     * @private
     */
    function _matchWithLocation(requestId, inputParams, matchableRequestType, matchableFillingPurpose, matchesForMaterialVolume, callback) {

        console.log("STEP 9: _matchWithLocation");

        let finalMatches = [];

        if (matchesForMaterialVolume.length > 0) {

            let distance = require('google-distance-matrix')
                , origins = [inputParams.project_address]
                , destinations = []
                , distancesInKm = [];

            for (let i = 0; i < matchesForMaterialVolume.length; i++) {
                destinations.push(matchesForMaterialVolume[i].address);
            }

            distance.key(apiKey);

            distance.matrix(origins, destinations, function (distanceError, distances) {

                if (distanceError) {
                    //console.log(distanceError);
                    //console.log("DISTANCE ERROR: ", JSON.stringify(distanceError, null, 2));
                    callback(null, requestId, inputParams, finalMatches);
                }

                if (!distances) {

                    //console.log('no distances');
                    callback(null, requestId, inputParams, finalMatches);
                }

                if (distances.status === 'OK') {

                    for (let i = 0; i < origins.length; i++) {

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

                console.log(distancesInKm);
                for (let i = 0; i < matchesForMaterialVolume.length; i++) {

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
                            "schedule_end_date": overlappingDates[numOfOverlapping - 1]
                        }
                    });

                } //end for

                callback(null, requestId, inputParams, finalMatches);
            });

        } else {

            callback(null, requestId, inputParams, finalMatches);
        }

    } //end _matchWithLocation

    /**
     * Saves matched requests
     *
     * @param requestId
     * @param inputParams
     * @param matches
     * @param callback
     * @private
     */
    function _saveMatches(requestId, inputParams, matches, callback) {

        console.log("STEP 10: _saveMatches");

        let n = matches.length;

        if (n > 0) {

            let insertData = '';

            for (let i = 0; i < n; i++) {

                let currentTime = new Date().toISOString();
                matchedIds.push(matches[i].id);

                if (i === 0)
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
                            for (let m = 0; m < matchedResult.length; m++) {
                                matchedResultIds.push(matchedResult[m].id);
                            }

                            let insertSummaryData = '';

                            for (let i = 0; i < matchedResultIds.length; i++) {

                                let currentTime = new Date().toISOString()
                                    , scheduleStartDate = new Date(matches[i].matching_summary.schedule_start_date).toISOString()
                                    , scheduleEndDate = new Date(matches[i].matching_summary.schedule_end_date).toISOString();

                                if (i === 0)
                                    insertSummaryData = "(" + matchedResultIds[i] + ", " + matches[i].matching_summary.filling_purpose + ", '" + matches[i].matching_summary.material_type + "', '" + matches[i].matching_summary.material_quality + "', " + matches[i].matching_summary.material_volume + ", '" + matches[i].matching_summary.material_unit + "', '" + scheduleStartDate + "', '" + scheduleEndDate + "', '" + currentTime + "')";
                                else
                                    insertSummaryData = insertSummaryData + ", (" + matchedResultIds[i] + ", " + matches[i].matching_summary.filling_purpose + ", '" + matches[i].matching_summary.material_type + "', '" + matches[i].matching_summary.material_quality + "', " + matches[i].matching_summary.material_volume + ", '" + matches[i].matching_summary.material_unit + "', '" + scheduleStartDate + "', '" + scheduleEndDate + "', '" + currentTime + "')";
                            } //end for

                            let matchedSummaryInsertSqlQuery = "INSERT INTO matched_summaries (matched_result_id, filling_purpose, material_type, material_quality, material_volume, material_unit, schedule_start_date, schedule_end_date, created_at) VALUES " + insertSummaryData;

                            try {
                                sql(matchedSummaryInsertSqlQuery).then(matchedSummaryInsert => {
                                    callback(null, true);
                                });
                            } catch (insertSummaryError) {

                                console.log(insertSummaryError);
                                callback(insertSummaryError);
                            }
                        });
                    } catch (matchedResultError) {

                        console.log(matchedResultError);
                        callback(matchedResultError);
                    } //end of select query

                }); //end of matchedResultInsertSqlQuery
            } catch (matchedResultInsertError) {
                console.log(matchedResultInsertError);
                callback(matchedResultInsertError);
            }

        } else {

            callback(null, true);
        }

    } //end _saveMatches

};