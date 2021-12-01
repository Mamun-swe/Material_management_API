
const auth = require("../helpers/auth")
const sql = require("../../config/sql")
const messages = require("../../config/constant")


/* List User Created Backfil/Disposal Requests With Matches */
exports.listUserRequestsWithMatches = async (req, res, next) => {
    try {
        const userId = req.swagger.params.user_id.value
        const requestType = req.swagger.params.request_type.value === 'Disposal' ? 1 : 2

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

        const ownRequestsData = await _ownRequests(userId, requestType)
        const matchesPerRequestData = await _matchesPerRequest(ownRequestsData)

        res.status(200).json({
            data: matchesPerRequestData
        })
    } catch (error) {
        res.status(500).json({
            message: messages.SOME_THING_WENT_WRONG,
            details: error
        })
    }
};

// Own requests
const _ownRequests = async (userId, requestType) => {
    try {
        const sqlQuery = "SELECT R.id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
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

        const result = await sql(sqlQuery, { requestType: requestType, userId: userId })
        return result

    } catch (error) {
        if (error) return error
    }
} //end _ownRequests

// Matches per request
const _matchesPerRequest = async (ownRequests) => {
    try {
        if (ownRequests.length > 0) {

            let ownRequestIds = '';
            for (let i = 0; i < ownRequests.length; i++) {
                ownRequestIds = ownRequestIds === '' ? ownRequests[i].id : ownRequestIds + ',' + ownRequests[i].id
            }

            const sqlQuery = "SELECT MR.own_request_id, MR.matched_request_id, R.department_key, IIF(R.filling_purpose = 1, 'Permanent', 'Temporary') AS filling_purpose, " +
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

            const matches = await sql(sqlQuery)
            if (matches && matches.length > 0) {
                const matchesInOwnRequests = mergeMatchesWithOwnRequests(ownRequests, matches)
                return matchesInOwnRequests
            }
        }
    } catch (error) {
        if (error) return error
    }
} //end _matchesPerRequest

const mergeMatchesWithOwnRequests = async (ownRequests, matches) => {
    for (let o = 0; o < ownRequests.length; o++) {
        ownRequests[o].matches = [];

        for (let m = 0; m < matches.length; m++) {
            if (matches[m].own_request_id === ownRequests[o].id) {

                let totalScore = (
                    matches[m].filling_purpose_score * 0.4 +
                    matches[m].schedule_score * 0.3 +
                    matches[m].material_volume_score * 0.2 +
                    matches[m].location_score * 0.1
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
