
const FormData = require("form-data")
const axios = require("axios")
const clientApiRoot = process.env.CLIENT_API_ROOT
const auth = require("../helpers/auth")
const messages = require("../../config/constant")
const Validator = require("../validators/upload.validator")
const { FileNameGenerator } = require("../helpers")


// Upload supplementary document
exports.uploadSupplementaryDoc = async (req, res, next) => {
  try {
    const file = req.files
    const url = `${clientApiRoot}/FileUpload'`

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

    // check validity
    const validate = await Validator.Upload(file)
    if (!validate.isValid) {
      return res.status(422).json(validate.error)
    }

    const customFolderName = "supplementary-doc"
    const fileToUpload = file.supplementary_file[0]
    const fileName = await FileNameGenerator(fileToUpload.originalname)

    const formData = new FormData()
    formData.append("customFolderName", customFolderName)
    formData.append("fileName", fileName)
    formData.append("supplementary_file", fileToUpload)

    const response = await axios.post(url, formData, verifiedHeader)
    if (response && response.status === 200) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(response));
    }

  } catch (error) {
    if (error) {
      res.status(500).json({
        status: false,
        message: messages.SOME_THING_WENT_WRONG,
        details: error
      })
    }
  }
}

// Delete supplementary document
exports.deleteSupplementaryDoc = async (args, res, next) => {

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

  let blobName = args.body.supplementary_document;

  blobService.deleteBlobIfExists(containerName, blobName, (deleteError, deleteResult) => {

    if (!deleteError) {

      console.log("Delete successful", deleteResult);

      let response = {
        status: true,
        message: "Supplementary Document Deleted Successfully"
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(response));

    } else {

      //throw deleteError;
      console.log(deleteError);

      let response = {
        status: false,
        message: messages.SOME_THING_WENT_WRONG,
        details: deleteError
      };
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(response));
    }
  });
};