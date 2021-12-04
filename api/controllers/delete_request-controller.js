require("dotenv").config();

const sql = require("../../config/sql")
const messages = require("../../config/constant")
const clientApiRoot = process.env.CLIENT_API_ROOT
const async = require('async')
const fetch = require('node-fetch')
const containerName = 'supplementarydocs'
const azureStorage = require('azure-storage')
const blobService = azureStorage.createBlobService()
const auth = require("../helpers/auth")


/* Delete user-created request, if s/he is a member of the project-staff */
exports.deleteRequest = async (args, res, next) => {
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

    let
        userId = args.swagger.params.user_id.value
        , requestId = args.swagger.params.request_id.value
        , departmentKey = args.swagger.params.department_key.value
        , isRequestOwner = false
        ;

    try {
        sql(
            "SELECT * FROM requesting_users WHERE user_id = @userId AND request_id = @requestId", { userId: userId, requestId: requestId }).then(checkResult => {

                if (checkResult.length > 0) { // user-created request

                    isProjectStaff = true;

                    async.waterfall([
                        _deleteSupplementaryDocuments(userId, requestId, departmentKey),
                        _deleteContacts,
                        _cancelMatchCollectMatchedRequestIds,
                        _cancelMatchAdjustMaterialVolumesToBothConfirmed,
                        _cancelMatchAdjustMaterialVolumesAsSuggested,
                        _cancelMatchAdjustMaterialVolumesAsOwn,
                        _cancelMatchRemoveAllMatches,
                        _deleteMaterials,
                        _deleteRequestingUser,
                        _deleteMainRequest
                    ],
                        function (err, result) {

                            if (err) {

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
                                message: "Request Deleted Successfully"
                            }));

                        });

                } else { // global request

                    //check whether the user is a project-staff
                    let
                        isProjectStaff = false
                        , url = clientApiRoot + '/ProjectStaff/' + departmentKey
                        ;

                    const getData = async url => {

                        try {

                            const
                                response = await fetch(url)
                                , staffs = await response.json()
                                ;

                            let n = staffs.length;

                            for (var i = 0; i < n; i++) {

                                if (staffs[i]['user_id'] === userId)
                                    isProjectStaff = true;
                            }

                            if (isProjectStaff) {

                                async.waterfall([
                                    _deleteSupplementaryDocuments(userId, requestId, departmentKey),
                                    _deleteContacts,
                                    _cancelMatchCollectMatchedRequestIds,
                                    _cancelMatchAdjustMaterialVolumesToBothConfirmed,
                                    _cancelMatchAdjustMaterialVolumesAsSuggested,
                                    _cancelMatchAdjustMaterialVolumesAsOwn,
                                    _cancelMatchRemoveAllMatches,
                                    _deleteMaterials,
                                    _deleteRequestingUser,
                                    _deleteMainRequest
                                ],
                                    function (err, result) {

                                        if (err) {

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
                                            message: "Request Deleted Successfully"
                                        }));

                                    });

                            } else {

                                res.writeHead(404, { "Content-Type": "application/json" });
                                return res.end(JSON.stringify({
                                    status: false,
                                    message: "You are not responsible member to delete the project"
                                }));

                            } //end else


                        } catch (staffError) {

                            console.log("Error in Fetching Project Staff:");
                            console.error(staffError);
                            callback(staffError);

                        }

                    }; //end getData

                    getData(url);

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
     * Delete Supplementary Documents
     * 
     * @param {string} userId
     * @param {integer} requestId
     * @param {string} departmentKey
     * 
     * @return {object} 
     */
    function _deleteSupplementaryDocuments(userId, requestId, departmentKey) {

        console.log("STEP 1: _deleteSupplementaryDocuments");

        return function (callback) {

            try {
                sql("SELECT * FROM supplementaries WHERE request_id = @requestId AND name != '' AND supplementary_document != ''", { requestId: requestId }).then(selectDocumentResult => {

                    if (selectDocumentResult.length > 0) {

                        let
                            n = selectDocumentResult.length
                            , index = 0
                            ;

                        selectDocumentResult.forEach(element => {

                            //console.log(element);

                            let
                                blobName = element.supplementary_document
                                , documentId = element.id
                                ;

                            blobService.deleteBlobIfExists(containerName, blobName, (deleteError, deleteResult) => {

                                if (!deleteError) {

                                    //console.log("Delete successful from Azure", deleteResult);

                                    try {
                                        sql("DELETE FROM supplementaries WHERE id = @documentId", { documentId: documentId }).then(deleteDocumentSqlResult => {

                                            index = index + 1;

                                            if (index == (n - 1))
                                                callback(null, userId, requestId, departmentKey);

                                        });
                                    } catch (deleteDocumentSqlError) {

                                        console.log("DOCUMENT DELETE SQL ERROR:");
                                        console.log(deleteDocumentSqlError);

                                        callback(deleteDocumentSqlError);

                                    }

                                } else {

                                    //throw deleteError;
                                    console.log("FILE DELETE ERROR:");
                                    console.log(deleteError);

                                    callback(deleteError);
                                }
                            });

                        });

                    } else { // no documents found

                        callback(null, userId, requestId, departmentKey);
                    }

                });
            } catch (selectDocumentSqlError) {

                console.log("SELECT DOCUMENT SQL ERROR:");
                console.log(selectDocumentSqlError);
                callback(selectDocumentSqlError);

            }

        } //end return

    } //end _getRequestInfo      


    /**
     * Delete Request Contacts
     * 
     * @param {string} userId
     * @param {integer} requestId
     * @param {string} departmentKey
     * @param {object} callback
     * 
     * @return {object} 
     */
    function _deleteContacts(userId, requestId, departmentKey, callback) {

        console.log("STEP 2: _deleteContacts");

        try {
            sql("DELETE FROM contacts WHERE request_id = @requestId", { requestId: requestId }).then(deleteContactSqlResult => {

                callback(null, userId, requestId, departmentKey);

            });
        } catch (deleteContatSqlError) {

            console.log("CONTACT DELETE SQL ERROR:");
            console.log(deleteContatSqlError);

            callback(deleteContatSqlError);

        }

    } //end _deleteContacts

    /**
     * Cancel Matching - Collect matched requests
     *
     * @param {string} userId
     * @param {number} requestId
     * @param {string} departmentKey
     * @param callback
     * @private
     */
    function _cancelMatchCollectMatchedRequestIds(userId, requestId, departmentKey, callback) {

        console.log("STEP 3: _cancelMatchCollectMatchedRequestIds");

        let deletableIds = []
            , matchSql = "SELECT id, matched_request_id, status FROM matched_results WHERE own_request_id = " + requestId + " OR matched_request_id = " + requestId;

        try {

            sql(matchSql).then(collections => {

                if (collections.length > 0) {

                    let matchedRequestIds = []
                        , bothConfirmedMatches = [];

                    for (let c = 0; c < collections.length; c++) {

                        deletableIds.push(collections[c].id);
                        matchedRequestIds.push(collections[c].matched_request_id);

                        if (collections[c].status === 3)
                            bothConfirmedMatches.push(collections[c].matched_request_id);

                    } //end for

                    let joinSql = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                        "FROM matched_results M " +
                        "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                        "WHERE matched_request_id IN(" + matchedRequestIds.join() + ") AND own_request_id != " + requestId;

                    try {

                        sql(joinSql).then(matchesForOwners => {

                            if (matchesForOwners.length > 0)
                                callback(null, userId, requestId, departmentKey, deletableIds, [], bothConfirmedMatches);
                            else
                                callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners, bothConfirmedMatches);

                        });

                    } catch (joinSqlError) {
                        console.log("JOIN SQL ERROR IN STEP 3:");
                        console.log(joinSqlError);
                        callback(joinSqlError);
                    }

                } else {
                    callback(null, userId, requestId, departmentKey, [], [], []);
                }

            });

        } catch (selectError) {

            console.log("SELECT ERROR IN STEP 3:");
            console.log(selectError);
            callback(selectError);
        }

    } //end _cancelMatchCollectMatchedRequestIds

    /**
     * Cancel Matching - Adjust material volume for any both-confirmed matches found
     * @param {string} userId
     * @param {number} requestId
     * @param {string} departmentKey
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param {array} bothConfirmedMatches
     * @param callback
     * @private
     */
    function _cancelMatchAdjustMaterialVolumesToBothConfirmed(userId, requestId, departmentKey, deletableIds, matchesForOwners, bothConfirmedMatches, callback) {

        console.log("STEP 4: _cancelMatchAdjustMaterialVolumesToBothConfirmed");

        if (bothConfirmedMatches.length > 0) {

            let joinSql = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                "FROM matched_results M " +
                "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                "WHERE matched_request_id IN(" + bothConfirmedMatches.join() + ") AND own_request_id = " + requestId;

            try {

                sql(joinSql).then(bothConfirmedRequests => {

                    if (bothConfirmedRequests.length > 0) {

                        let materialVolumes = []
                            , matchedRequestIds = [];

                        for (let b = 0; b < bothConfirmedRequests.length; b++) {

                            materialVolumes.push(bothConfirmedRequests[b].material_volume);
                            matchedRequestIds.push(bothConfirmedRequests[b].matched_request_id);

                        } //end for

                        let matchedVolumeCaseString = "(CASE "
                            , availableVolumeCaseString = "(CASE ";

                        for (let i = 0; i < materialVolumes.length; i++) {

                            matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN matched_volume - " + materialVolumes[i] + " ";
                            availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN available_volume + " + materialVolumes[i] + " ";

                            if (i === materialVolumes.length - 1) {

                                matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                                availableVolumeCaseString = availableVolumeCaseString + "END)";
                            }
                        } //end for

                        let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + matchedRequestIds.join() + ")";

                        try {
                            sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {
                                callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners);
                            });

                        } catch (updateSqlWithNewVolumesError) {
                            console.log("SELECT ERROR IN STEP 4:");
                            console.log(updateSqlWithNewVolumesError);
                            callback(updateSqlWithNewVolumesError);
                        }

                    } else {
                        callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners);
                    }
                });

            } catch (bothConfirmedRequestsError) {

                console.log("BOTH CONFIRMED REQUESTS ERROR IN STEP 4:");
                console.log(bothConfirmedRequestsError);
                callback(bothConfirmedRequestsError);
            }

        } else {
            callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners);
        }

    } //end _cancelMatchAdjustMaterialVolumesToBothConfirmed

    /**
     * Cancel Matching - Adjust material volume as suggested
     * @param {string} userId
     * @param {number} requestId
     * @param {string} departmentKey
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param callback
     * @private
     */
    function _cancelMatchAdjustMaterialVolumesAsSuggested(userId, requestId, departmentKey, deletableIds, matchesForOwners, callback) {

        console.log("STEP 5: _cancelMatchAdjustMaterialVolumesAsSuggested");

        if (matchesForOwners.length > 0) {

            let materialVolumes = []
                , ownRequestIds = [];

            for (let m = 0; m < matchesForOwners.length; m++) {

                deletableIds.push(matchesForOwners[m].id);

                if (matchesForOwners[m].status === 3) {
                    materialVolumes.push(matchesForOwners[m].material_volume);
                    ownRequestIds.push(matchesForOwners[m].own_request_id);
                }
            } //end for

            if (materialVolumes.length > 0 && ownRequestIds.length > 0) {

                let matchedVolumeCaseString = "(CASE "
                    , availableVolumeCaseString = "(CASE ";

                for (let i = 0; i < materialVolumes.length; i++) {

                    matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + ownRequestIds[i] + " THEN matched_volume - " + materialVolumes[i] + " ";
                    availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + ownRequestIds[i] + " THEN available_volume + " + materialVolumes[i] + " ";

                    if (i === materialVolumes.length - 1) {

                        matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                        availableVolumeCaseString = availableVolumeCaseString + "END)";
                    }
                } //end for

                let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + ownRequestIds.join() + ")";

                try {
                    sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {
                        callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners);
                    });

                } catch (updateSqlWithNewVolumesError) {
                    console.log("SELECT ERROR IN STEP 5:");
                    console.log(updateSqlWithNewVolumesError);
                    callback(updateSqlWithNewVolumesError);
                }

            } else {
                callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners);
            }

        } else {
            callback(null, userId, requestId, departmentKey, deletableIds, matchesForOwners);
        }

    } //end _cancelMatchAdjustMaterialVolumesAsSuggested

    /**
     * Cancel Matching - Adjust material volume as owner
     *
     * @param {string} userId
     * @param {number} requestId
     * @param {string} departmentKey
     * @param {array} deletableIds
     * @param {array} matchesForOwners
     * @param callback
     * @private
     */
    function _cancelMatchAdjustMaterialVolumesAsOwn(userId, requestId, departmentKey, deletableIds, matchesForOwners, callback) {

        console.log("STEP 6: _cancelMatchAdjustMaterialVolumesAsOwn");

        if (matchesForOwners.length > 0) {

            let joinSql = "SELECT M.id, M.own_request_id, M.matched_request_id, M.status, S.material_volume " +
                "FROM matched_results M " +
                "INNER JOIN matched_summaries AS S ON ( S.matched_result_id = M.id ) " +
                "WHERE own_request_id IN(" + matchesForOwners.join() + ")";

            try {

                sql(joinSql).then(matches => {

                    if (matches.length > 0) {

                        let materialVolumes = []
                            , matchedRequestIds = [];

                        for (let m = 0; m < matches.length; m++) {

                            deletableIds.push(matches[m].id);

                            if (matches[m].status === 3) {
                                materialVolumes.push(matches[m].material_volume);
                                matchedRequestIds.push(matches[m].matched_request_id);
                            }
                        } //end for

                        if (materialVolumes.length > 0 && matchedRequestIds.length > 0) {

                            let matchedVolumeCaseString = "(CASE "
                                , availableVolumeCaseString = "(CASE ";

                            for (let i = 0; i < materialVolumes.length; i++) {

                                matchedVolumeCaseString = matchedVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN matched_volume - " + materialVolumes[i] + " ";
                                availableVolumeCaseString = availableVolumeCaseString + "WHEN id = " + matchedRequestIds[i] + " THEN available_volume + " + materialVolumes[i] + " ";

                                if (i === materialVolumes.length - 1) {

                                    matchedVolumeCaseString = matchedVolumeCaseString + "END)";
                                    availableVolumeCaseString = availableVolumeCaseString + "END)";
                                }
                            } //end for

                            let updateSqlWithNewVolumes = "UPDATE requests SET matched_volume = " + matchedVolumeCaseString + ", available_volume = " + availableVolumeCaseString + " WHERE id IN(" + matchedRequestIds.join() + ")";

                            try {
                                sql(updateSqlWithNewVolumes).then(updateSqlWithNewVolumes => {
                                    callback(null, userId, requestId, departmentKey, deletableIds);
                                });

                            } catch (updateSqlWithNewVolumesError) {
                                console.log("SELECT ERROR IN STEP 6:");
                                console.log(updateSqlWithNewVolumesError);
                                callback(updateSqlWithNewVolumesError);
                            }

                        } else {
                            callback(null, userId, requestId, departmentKey, deletableIds);
                        }

                    } else {
                        callback(null, userId, requestId, departmentKey, deletableIds);
                    }

                });

            } catch (joinSqlError) {
                console.log("JOIN SQL ERROR IN STEP 6:");
                console.log(joinSqlError);
                callback(joinSqlError);
            }

        } else {
            callback(null, userId, requestId, departmentKey, deletableIds);
        }

    } //end _cancelMatchAdjustMaterialVolumesAsOwn

    /**
     * Cancel Matching - Remove all matches
     *
     * @param {string} userId
     * @param {number} requestId
     * @param {string} departmentKey
     * @param {array} deletableIds
     * @param callback
     * @private
     */
    function _cancelMatchRemoveAllMatches(userId, requestId, departmentKey, deletableIds, callback) {

        console.log("STEP 7: _cancelMatchRemoveAllMatches");

        if (deletableIds.length > 0) {

            let ids = deletableIds.join();
            console.log(ids);

            try {

                sql("DELETE FROM documents WHERE matched_result_id IN (" + ids + ")").then(documentDeleteResult => {

                    try {
                        sql("DELETE FROM matched_summaries WHERE matched_result_id IN (" + ids + ")").then(summaryDeleteResult => {

                            try {
                                sql("DELETE FROM matched_results WHERE id IN (" + ids + ")").then(matchDeleteResult => {

                                    callback(null, userId, requestId, departmentKey);

                                });
                            } catch (matchDeleteError) {
                                console.log("MATCH DELETE SQL ERROR IN STEP 7:");
                                console.log(matchDeleteError);
                                callback(matchDeleteError);
                            }
                        });
                    } catch (summaryDeleteError) {
                        console.log("SUMMARY DELETE SQL ERROR IN STEP 7:");
                        console.log(summaryDeleteError);
                        callback(summaryDeleteError);
                    }
                });
            } catch (documentDeleteError) {
                console.log("DOCUMENT DELETE SQL ERROR IN STEP 7:");
                console.log(documentDeleteError);
                callback(documentDeleteError);
            }
        } else {
            callback(null, userId, requestId, departmentKey);
        }

    } //end _cancelMatchRemoveAllMatches


    /**
     * Get Request Materials
     * 
     * @param {string} userId
     * @param {integer} requestId
     * @param {string} departmentKey
     * @param {object} callback
     * 
     * @return {object}  
     */
    function _deleteMaterials(userId, requestId, departmentKey, callback) {

        console.log("STEP 8: _deleteMaterials");

        try {
            sql("DELETE FROM materials WHERE request_id = @requestId", { requestId: requestId }).then(deleteMaterialSqlResult => {

                callback(null, userId, requestId, departmentKey);

            });
        } catch (deleteMaterialSqlError) {

            console.log("MATERIAL DELETE SQL ERROR:");
            console.log(deleteMaterialSqlError);

            callback(deleteMaterialSqlError);

        }

    } //end _deleteMaterials


    /**
     * Delete Requesting User
     * 
     * @param {string} userId
     * @param {integer} requestId
     * @param {string} departmentKey
     * @param {object} callback
     * 
     * @return {object}  
     */
    function _deleteRequestingUser(userId, requestId, departmentKey, callback) {

        console.log("STEP 9: _deleteRequestingUser");

        try {
            sql("DELETE FROM requesting_users WHERE request_id = @requestId", { requestId: requestId }).then(deleteUserSqlResult => {

                callback(null, userId, requestId, departmentKey);

            });
        } catch (deleteUserSqlError) {

            console.log("REQUESTING USER DELETE SQL ERROR:");
            console.log(deleteUserSqlError);

            callback(deleteUserSqlError);

        }

    } //end _deleteRequestingUser


    /**
     * Get Supplementary Documents
     * 
     * @param {string} userId
     * @param {integer} requestId
     * @param {string} departmentKey
     * @param {object} callback
     * 
     * @return {object}  
     */
    function _deleteMainRequest(userId, requestId, departmentKey, callback) {

        console.log("STEP 10: _deleteMainRequest");

        try {
            sql("DELETE FROM requests WHERE id = @requestId", { requestId: requestId }).then(deleteRequestSqlResult => {

                callback(null, true);

            });
        } catch (deleteRequestSqlError) {

            console.log("REQUEST DELETE SQL ERROR:");
            console.log(deleteRequestSqlError);

            callback(deleteRequestSqlError);

        }

    } //end _deleteMainRequest

};