require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , async = require('async')
    , matching = require('../helpers/matching')
    , apiKey = process.env.GOOGLE_API_KEY;
const distance = require("google-distance-matrix");


/* Create a Backfil/Disposal Request */
exports.createRequest = function(args, res, next) {

    let inputParams = args.body;

    //START TESTING
    let matchableRequestType = ( inputParams.request_type === 'Disposal' ) ? 2 : 1
        , matchableFillingPurpose = ( inputParams.filling_purpose === 'Permanent' ) ? 1 : 2
        , startDate = inputParams.schedule_start_date
        , endDate = inputParams.schedule_end_date
        , datesWithinTargetSchedule = matching.getDatesBetweenDates(startDate, endDate)
        , materialUnit = inputParams.material_unit;

    let selectSql = "DECLARE @FromDate datetime = @startDate;" +
        "DECLARE @ToDate datetime = @endDate;" +
        "SELECT R.id, FORMAT(R.schedule_start_date, 'yyyy-MM-dd') AS schedule_start_date, FORMAT(R.schedule_end_date, 'yyyy-MM-dd') AS schedule_end_date, " +
        "R.request_type, R.filling_purpose, R.project_address, M.material_type, M.material_quality, R.material_volume, R.available_volume, " +
        "IIF(R.filling_purpose = @fillingPurpose, 1, 0.5) AS filling_purpose_score, " +
        "IIF(@FromDate <= R.schedule_end_date AND @ToDate >= R.schedule_start_date, " +
        "   DATEDIFF(day," +
        "       IIF(R.schedule_start_date > @FromDate, R.schedule_start_date, @FromDate)," +
        "       IIF(R.schedule_end_date < @ToDate, R.schedule_end_date, @ToDate)" +
        "   ) + 1, " +
        "0) AS total_overlap_period, " +
        "DATEDIFF(day, @FromDate, @ToDate) + 1 AS total_own_period " +
        "FROM requests AS R " +
        "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
        "WHERE R.request_type = @requestType AND R.material_unit = @materialUnit";

    try {
        sql(selectSql, {
            startDate: startDate,
            endDate: endDate,
            fillingPurpose: matchableFillingPurpose,
            requestType: matchableRequestType,
            materialUnit: materialUnit
        }).then(matchResult => {

            let n = matchResult.length;

            if (n > 0) {

                let matchesForScheduleOverlaps = [];

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
                            "material_unit": materialUnit,
                            "filling_purpose_score": matchResult[i].filling_purpose_score,
                            "schedule_score": parseFloat( matchResult[i].total_overlap_period / matchResult[i].total_own_period ).toFixed(2)
                        });

                    } //end if

                } //end for

                let matchesForMaterialTypeAndQuality = [];

                for ( let i = 0; i < matchesForScheduleOverlaps.length; i ++ ) {

                    let materialMatched = false
                        , matchedMaterialTypes = ''
                        , matchedMaterialQuality = '';

                    if ( matchesForScheduleOverlaps[i].request_type === matchableRequestType ) {

                        if ( matchesForScheduleOverlaps[i].filling_purpose === 1 ) { //Permanent

                            if ( inputParams.material_type === matchesForScheduleOverlaps[i].material_type ) {

                                materialMatched = true;
                                matchedMaterialTypes = matchesForScheduleOverlaps[i].material_type;
                            }

                            if (
                                inputParams.hasOwnProperty('material_quality') &&
                                matchesForScheduleOverlaps[i].hasOwnProperty('material_quality') &&
                                ( inputParams.material_type === matchesForScheduleOverlaps[i].material_type ) &&
                                ( (inputParams.material_type !== 'Broken Concrete') && (inputParams.material_quality === matchesForScheduleOverlaps[i].material_quality) )
                            ) {

                                materialMatched = true;
                                matchedMaterialTypes = matchesForScheduleOverlaps[i].material_type;
                                matchedMaterialQuality = matchesForScheduleOverlaps[i].material_quality;
                            }

                        } else { //Temporary (multiple material-types can be chosen)

                            materialMatched = matching.matchesBetweenStrings(
                                inputParams.material_type,
                                matchesForScheduleOverlaps[i].material_type
                            );

                            if ( materialMatched ) {

                                matchedMaterialTypes = matching.matchesBetweenStrings(
                                    inputParams.material_type,
                                    matchesForScheduleOverlaps[i].material_type,
                                    true
                                );
                            }

                            if (
                                inputParams.hasOwnProperty('material_quality') &&
                                matchesForScheduleOverlaps[i].hasOwnProperty('material_quality') &&
                                ( inputParams.material_type === matchesForScheduleOverlaps[i].material_type ) &&
                                ( (inputParams.material_type !== 'Broken Concrete') && (inputParams.material_quality === matchesForScheduleOverlaps[i].material_quality) )
                            ) {

                                materialMatched = true;
                                matchedMaterialTypes = matchesForScheduleOverlaps[i].material_type;
                                matchedMaterialQuality = matchesForScheduleOverlaps[i].material_quality;
                            }
                        } //end else

                    } //end if

                    if ( materialMatched ) {

                        matchesForMaterialTypeAndQuality.push({
                            "id": matchesForScheduleOverlaps[i].id,
                            "filling_purpose": matchesForScheduleOverlaps[i].filling_purpose,
                            "overlapping_dates": matchesForScheduleOverlaps[i].overlapping_dates,
                            "address": matchesForScheduleOverlaps[i].address,
                            "material_type": matchedMaterialTypes,
                            "material_quality": matchedMaterialQuality,
                            "material_volume": matchesForScheduleOverlaps[i].material_volume,
                            "available_volume": matchesForScheduleOverlaps[i].available_volume,
                            "material_unit": matchesForScheduleOverlaps[i].material_unit,
                            "filling_purpose_score": matchesForScheduleOverlaps[i].filling_purpose_score,
                            "schedule_score": matchesForScheduleOverlaps[i].schedule_score
                        });
                    }

                } //end for

                let matchesForMaterialVolume = [];

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

                /*let distance = require('google-distance-matrix');
                distance.key(apiKey);

                var origins = ['Kai Tak, Kowloon City District, Hong Kong'];
                var destinations = ['11 Bonham Road, Mid-level, Hong Kong'];

                distance.matrix(origins, destinations, function (err, distances) {
                    if (err)
                        console.error("DISTANCE ERROR:", JSON.stringify(err, null, 2));
                    else
                        console.error("DISTANCE:", JSON.stringify(distances, null, 2));
                })*/

                let distance = require('google-distance-matrix')
                    , origins = [inputParams.project_address]
                    , destinations = []
                    , distancesInKm = []
                    , finalMatches = [];

                for ( let i = 0; i < matchesForMaterialVolume.length; i ++ ) {
                    destinations.push(matchesForMaterialVolume[i].address);
                }

                distance.key(apiKey);

                distance.matrix(origins, destinations, function (err, distances) {

                    if (err) {
                        console.log(err);
                    }

                    if(!distances) {
                        console.log('no distances');
                    }

                    if (distances.status === 'OK') {

                        for (let i=0; i < origins.length; i++) {

                            for (let j = 0; j < destinations.length; j++) {

                                let origin = distances.origin_addresses[i];
                                let destination = distances.destination_addresses[j];

                                if (distances.rows[0].elements[j].status === 'OK') {

                                    let distanceString = distances.rows[i].elements[j].distance.text
                                        , distanceArray = distanceString.split(' ')
                                        , distance = distanceArray[0];

                                    distancesInKm.push(distance);
                                    console.log('Distance from ' + origin + ' to ' + destination + ' is ' + distance + ' ' + distanceArray[1]);
                                } else {
                                    distancesInKm.push(0.00);
                                    console.log(destination + ' is not reachable by land from ' + origin);
                                }
                            }
                        }
                    }

                    console.log(distancesInKm);
                    for ( let i = 0; i < matchesForMaterialVolume.length; i ++ ) {

                        let locationScore = 0.00
                            , distanceInKm = parseFloat(distancesInKm[i]);

                        if ( distanceInKm <= 5 )
                            locationScore = 1;
                        else if ( distanceInKm <= 10 )
                            locationScore = 0.9;
                        else if ( distanceInKm <= 15 )
                            locationScore = 0.8;
                        else if ( distanceInKm <= 20 )
                            locationScore = 0.7;
                        else if ( distanceInKm <= 25 )
                            locationScore = 0.6;
                        else if ( distanceInKm <= 30 )
                            locationScore = 0.5;
                        else if ( distanceInKm <= 35 )
                            locationScore = 0.4;
                        else if ( distanceInKm <= 40 )
                            locationScore = 0.3;
                        else if ( distanceInKm <= 45 )
                            locationScore = 0.2;
                        else
                            locationScore = 0.1;

                        let overlappingDates = matchesForMaterialVolume[i].overlapping_dates
                            , numofOverlapping = overlappingDates.length;

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
                                "schedule_end_date": overlappingDates[ numofOverlapping-1 ]
                            }
                        });

                    } //end for

                    res.writeHead(200, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify(finalMatches));
                });

            } else {

                let response = { message: messages.RQUEST_NOT_FOUND };
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify(response));
            }

        });
    } catch (selectError) {

        let response = {
            message: messages.SOME_THING_WENT_WRONG,
            details: selectError
        };
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(response));

    }


    //END TESTING


    /*async.waterfall([
      _saveRequestBasic( inputParams ),
      _saveMaterials,
      _saveSupplementaryDocuments,
      _saveContacts,
      _saveRequestingUser,
      _matchWithFillingPurpose,
      _matchWithScheduleOverlap,
      _matchWithMaterialTypeAndQuality,
      _matchWithMaterialVolume,
      _matchWithLocation,
      _saveMatches
    ],
      function (err, result) {

          if ( err ) {

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

      });*/

    /**
     * Save Basic Information of Disposal/Backfill Request
     *
     * @param {object} inputParams
     * @return {object}
     */
    function _saveRequestBasic( inputParams ) {

        console.log("SETP 1: _saveRequestBasic");

        return function ( callback ) {

            let
                requestType = ( inputParams.request_type == 'Disposal' ) ? 1 : 2
                , fillingPurpose = ( inputParams.filling_purpose == 'Permanent' ) ? 1 : 2
                , scheduleStatus = ( inputParams.schedule_status == 'Confirmed' ) ? 1 : 2
                , scheduleStartDate = new Date( inputParams.schedule_start_date )
                , scheduleEndDate = new Date( inputParams.schedule_end_date )
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

                            callback( null, requestId, inputParams );

                        });
                    } catch (selectRequestIdError) {

                        console.log("SELECT REQUEST ID ERROR:", JSON.stringify(selectRequestIdError, null, 2));
                        callback( selectRequestIdError );

                    }

                });
            } catch (basicInsertionSqlError) {

                console.log("BASIC INSERTION ERROR:", JSON.stringify(basicInsertionSqlError, null, 2));
                callback( basicInsertionSqlError );

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
    function _saveMaterials( requestId, inputParams, callback ) {

        console.log("SETP 2: _saveMaterials");

        let
            materialType = inputParams.material_type
            , materialQuality = ( materialType == 'Broken Concrete' ) ? '' : inputParams.material_quality
        ;

        try {
            sql(
                "INSERT INTO materials (request_id, material_type, material_quality) VALUES (@requestId, @materialType, @materialQuality)",
                {
                    requestId: requestId,
                    materialType: materialType,
                    materialQuality: materialQuality
                }).then(materialInsertionResult => {

                callback( null, requestId, inputParams );

            });
        } catch (materialInsertionError) {

            console.log("MATERIAL INSERTION ERROR:", JSON.stringify(materialInsertionError, null, 2));
            callback( materialInsertionError );

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
    function _saveSupplementaryDocuments( requestId, inputParams, callback ) {

        console.log("SETP 3: _saveSupplementaryDocuments");

        if ( inputParams.supplementary_documents == '' ) {

            callback( null, requestId, inputParams );

        } else {

            let
                documentNames = inputParams.supplementary_document_names
                , names = documentNames.split(',')
                , docs = inputParams.supplementary_documents
                , documents = docs.split(',')
                , n = documents.length
                , insertData = ''
            ;

            for ( var i = 0; i < n; i ++ ) {

                if ( i == 0 )
                    insertData = "(" + requestId + ", '" + names[i] + "', '" + documents[i] + "')";
                else
                    insertData = insertData + ", (" + requestId + ", '" + names[i] + "', '" + documents[i] + "')";
            }

            let sqlQuery = "INSERT INTO supplementaries (request_id, name, supplementary_document) VALUES " + insertData;

            try {
                sql(sqlQuery).then(documentResult => {

                    callback( null, requestId, inputParams );

                });
            } catch (documentInsertionError) {

                console.log("DOCUMENT INSERTION ERROR:", JSON.stringify(documentInsertionError, null, 2));
                callback( documentInsertionError );

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
    function _saveContacts( requestId, inputParams, callback ) {

        console.log("SETP 4: _saveContacts");

        if ( inputParams.contact_names == '' ) {

            callback( null, requestId, inputParams );

        } else {

            let
                contactNames = inputParams.contact_names
                , names = contactNames.split(',')
                , contactPhones = inputParams.contact_phones
                , phones = contactPhones.split(',')
                , n = names.length
                , insertData = ''
            ;

            for ( var i = 0; i < n; i ++ ) {

                if ( i == 0 )
                    insertData = "(" + requestId + ", '" + names[i] + "', '" + phones[i] + "')";
                else
                    insertData = insertData + ", (" + requestId + ", '" + names[i] + "', '" + phones[i] + "')";
            }

            let sqlQuery = "INSERT INTO contacts (request_id, name, phone) VALUES " + insertData;

            try {
                sql(sqlQuery).then(contactResult => {

                    callback( null, requestId, inputParams );

                });
            } catch (contactInsertionError) {

                console.log("CONTACT INSERTION ERROR:", JSON.stringify(contactInsertionError, null, 2));
                callback( contactInsertionError );

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
    function _saveRequestingUser( requestId, inputParams, callback ) {

        console.log("SETP 5: _saveRequestingUser");

        try {
            sql(
                "INSERT INTO requesting_users (request_id, user_id) VALUES (@requestId, @userId)",
                {
                    requestId: requestId,
                    userId: inputParams.user_id
                }).then(userInsertionResult => {

                callback( null, true );

            });
        } catch (userInsertionError) {

            console.log("USER INSERTION ERROR:", JSON.stringify(userInsertionError, null, 2));
            callback( userInsertionError );

        }

    } //end _saveRequestingUser

    function _matchWithFillingPurpose( requestId, inputParams, callback ) {

        console.log("SETP 6: _matchWithFillingPurpose");

        let matchableRequestType = ( inputParams.request_type == 'Disposal' ) ? 2 : 1
            , matchableFillingPurpose = ( inputParams.filling_purpose == 'Permanent' ) ? 1 : 2;
        //SELECT id, schedule_start_date, schedule_end_date, IIF(filling_purpose = 2, 1, 0.5) AS filling_purpose_score FROM requests WHERE request_type=1
        /*
          DECLARE @FromDate datetime = '2021-09-12';
          DECLARE @ToDate datetime = '2021-09-15';

          SELECT R.id, R.schedule_start_date, R.schedule_end_date, M.material_type, M.material_quality, R.material_volume,
              IIF(R.filling_purpose = 2, 1, 0.5) AS filling_purpose_score,
              IIF(@FromDate <= R.schedule_end_date AND @ToDate >= R.schedule_start_date,
                  DATEDIFF(day,
                      IIF(R.schedule_start_date > @FromDate, R.schedule_start_date, @FromDate),
                      IIF(R.schedule_end_date < @ToDate, R.schedule_end_date, @ToDate)
                  ) + 1,
              0) AS total_overlap_period,
              DATEDIFF(day, @FromDate, @ToDate) + 1 AS total_own_period
          FROM [MaterialManagement].[dbo].[requests] AS R
          INNER JOIN [MaterialManagement].[dbo].[materials] AS M ON ( M.request_id = R.id)
          WHERE R.request_type=2
            AND R.material_unit='m3';
         */

    } //end _matchWithFillingPurpose

    function _matchWithScheduleOverlap( requestId, inputParams, matches, callback ) {

        console.log("SETP 7: _matchWithScheduleOverlap");

        let ownStartDate = inputParams.schedule_start_date
            , ownEndDate  =   inputParams.schedule_end_date
            , ownPeriodInDays   = ( new Date(ownEndDate) - new Date(ownStartDate) ) / (1000 * 60 * 60 * 24);

    } //end _matchWithScheduleOverlap

    function _matchWithMaterialTypeAndQuality( requestId, inputParams, matches, callback ) {

        console.log("SETP 8: _matchWithMaterialTypeAndQuality");

    } //end _matchWithMaterialTypeAndQuality

    function _matchWithMaterialVolume( requestId, inputParams, matches, callback ) {

        console.log("SETP 9: _matchWithMaterialVolume");

    } //end _matchWithMaterialVolume

    function _matchWithLocation( requestId, inputParams, matches, callback ) {

        console.log("SETP 9: _matchWithLocation");

    } //end _matchWithLocation

    function _saveMatches( requestId, inputParams, matches, callback ) {

        console.log("SETP 10: _saveMatches");

    } //end _saveMatches

};