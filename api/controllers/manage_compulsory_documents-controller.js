require("dotenv").config();

const sql = require("../../config/sql")
    , messages = require("../../config/constant");


/* Update/Remove Compulsory Documents for Matched Requests */
exports.manageDocuments = function(args, res, next) {

    let inputParams = args.body
        , id = inputParams.document_id
        , documents = inputParams.documents
        , currentTime = new Date().toISOString()
        , updateSql = "UPDATE documents SET compulsory_document = '" + documents + "', updated_at = '" + currentTime + "' WHERE id = " + id;

    return sql(updateSql).then(updateStatus => {

        res.writeHead(200, { "Content-Type": "application/json" });

        return res.end(JSON.stringify({
            status: true,
            message: "Compulsory Document Updated Successfully."
        }));

    });
};