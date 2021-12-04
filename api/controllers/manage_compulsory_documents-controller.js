require("dotenv").config();

const sql = require("../../config/sql")
const messages = require("../../config/constant");
const auth = require("../helpers/auth")

/* Update/Remove Compulsory Documents for Matched Requests */
exports.manageDocuments = async(args, res, next)=> {
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