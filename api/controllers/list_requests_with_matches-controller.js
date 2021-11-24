require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant")
    , async = require('async');


/**
 * Merge matches within own-requests
 *
 * @param {[]} ownRequests
 * @param {[]} matches
 *
 * @returns {[]}
 */
function mergeMatchesWithOwnRequests( ownRequests, matches ) {

    for ( let o = 0; o < ownRequests.length; o ++ ) {

        ownRequests[o].matches = [];

        for ( let m = 0; m < matches.length; m ++ ) {

            if ( matches[m].own_request_id === ownRequests[o].id ) {

                let totalScore = ( 
                    matches[m].filling_purpose_score*0.4 + 
                    matches[m].schedule_score*0.3 + 
                    matches[m].material_volume_score*0.2 + 
                    matches[m].location_score*0.1 
                ).toFixed(2);

                ownRequests[o].matches.push({
                    "matched_request_id": matches[m].matched_request_id,
                    "department_key": matches[m].department_key,
                    "filling_purpose": matches[m].filling_purpose,
                    "schedule_start_date": matches[m].schedule_start_date,
                    "schedule_end_date": matches[m].schedule_end_date,
                    "material_type": matches[m].material_type,
                    "material_quality": matches[m].material_quality,
                    "material_volume": matches[m].material_volume,
                    "project_address": matches[m].project_address,
                    "status": matches[m].status,
                    "score_details": {
                        "filling_purpose_score": matches[m].filling_purpose_score,
                        "schedule_score": matches[m].schedule_score,
                        "material_volume_score": matches[m].material_volume_score,
                        "location_score": matches[m].location_score,
                        "total_score": totalScore
                    }
                });

            } //end if

        } //end for

    } //end main for

    return ownRequests;

} //end mergeMatchesWithOwnRequests


/* List User Created Backfil/Disposal Requests With Matches */
exports.listUserRequestsWithMatches = function(args, res, next) {

    let userId = args.swagger.params.user_id.value
        , requestType = ( args.swagger.params.request_type.value === 'Disposal' ) ? 1 : 2;

    async.waterfall([
        _ownRequests( userId, requestType ),
        _matchesPerRequest
    ],
    (err, result) => {

        if ( err ) {

            console.log("ERROR IN LISTING PROCESS: ", JSON.stringify(err, null, 2));

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

    /**
     * Fetch user-requests by a given request-type
     *
     * @param userId
     * @param requestType
     *
     * @returns {(function(*): void)|*}
     * @private
     */
    function _ownRequests( userId, requestType ) {

        console.log("SETP 1: _ownRequests");

        return function ( callback ) {

            let selectSql = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
                "M.material_type AS material_type, M.material_quality AS material_quality, " +
                "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " +
                "CONCAT(R.matched_volume,' ',R.material_unit) AS matched_volume, " +
                "CONCAT(R.available_volume,' ',R.material_unit) AS available_volume, " +
                "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " +
                "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " +
                "R.project_address " +
                "FROM requests AS R " +
                "INNER JOIN requesting_users AS U ON ( U.request_id = R.id) " +
                "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
                "WHERE R.request_type = @requestType AND U.user_id = @userId";

            try {

                sql(selectSql, {requestType: requestType, userId: userId}).then(ownRequests => {
                    callback(null, userId, requestType, ownRequests);
                });

            } catch (selectError) {

                console.log(selectError);
                callback(selectError);
            }

        } //end callback

    } //end _ownRequests

    function _matchesPerRequest( userId, requestType, ownRequests, callback ) {

        console.log("SETP 2: _matchesPerRequest");

        if ( ownRequests.length > 0 ) {

            let ownRequestIds = '';

            for ( let i = 0; i < ownRequests.length; i ++ ) {
                ownRequestIds = ( ownRequestIds === '' ) ? ownRequests[i].id : ownRequestIds + ',' + ownRequests[i].id;
            }

            let selectSql = "SELECT MR.own_request_id, MR.matched_request_id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
                "FORMAT(R.schedule_start_date,'d/M/yyyy') AS schedule_start_date, " +
                "FORMAT(R.schedule_end_date,'d/M/yyyy') AS schedule_end_date, " +
                "M.material_type AS material_type, M.material_quality AS material_quality, " +
                "CONCAT(R.material_volume,' ',R.material_unit) AS material_volume, " +
                "R.project_address, " +
                "MR.filling_purpose_score, MR.schedule_score, MR.material_volume_score, MR.location_score, " +
                "CASE" +
                " WHEN MR.status = 0 THEN 'Not confirmed'" +
                " WHEN MR.status = 1 THEN 'Our side confirmed'" +
                " WHEN MR.status = 2 THEN 'Other side confirmed'" +
                " ELSE 'Both confirmed' " +
                "END AS status " +
                "FROM requests AS R " +
                "INNER JOIN materials AS M ON ( M.request_id = R.id) " +
                "INNER JOIN matched_results AS MR ON ( MR.matched_request_id = R.id) " +
                "WHERE MR.own_request_id IN(" + ownRequestIds + ") " +
                "ORDER BY (MR.filling_purpose_score*0.4 + MR.schedule_score*0.3 + MR.material_volume_score*0.2 + MR.location_score*0.1) DESC";

            try {

                sql(selectSql).then(matches => {

                    if ( matches.length > 0 ) {

                        let matchesInOwnRequests = mergeMatchesWithOwnRequests(ownRequests, matches);
                        callback(null, matchesInOwnRequests);

                    } else {
                        callback(null, ownRequests);
                    }
                });

            } catch (selectError) {

                console.log(selectError);
                callback(selectError);
            }

        } else {
            callback( null, ownRequests );
        }

    } //end _matchesPerRequest
    
};