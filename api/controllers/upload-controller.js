
const FormData = require("form-data")
const axios = require("axios")
const apiSecret = process.env.API_SECRET
const clientApiRoot = process.env.CLIENT_API_ROOT
const auth = require("../helpers/auth")
const messages = require("../../config/constant")
const Validator = require("../validators/upload.validator")
const { FileNameGenerator } = require("../helpers")
const fs = require("fs")

let storageAccount = process.env.AZURE_STORAGE_ACCOUNT;

const
  fetch = require('node-fetch')
  , sql = require("../../config/sql")
  , streamifier = require('streamifier')
  , containerName = 'supplementarydocs'
  , azureStorage = require('azure-storage')
  , blobService = azureStorage.createBlobService();

const getBlobName = originalName => {
  const identifier = Math.random().toString().replace(/0\./, ''); // remove "0." from start of string
  return `${identifier}-${originalName}`;
};

// Upload supplementary document
exports.uploadSupplementaryDoc = async (req, res, next) => {
  try {
    const file = req.files
    const url = `${clientApiRoot}/FileUpload'`

    // if (!req.headers.authorization) {
    //   return res.status(404).json({
    //     message: messages.TOKEN_IS_EMPTY
    //   })
    // }

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


    // console.log(formData.get("supplementary_file"));

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: req.headers
    })

    // const response = await axios.post(url, formData, verifiedHeader)


    console.log(response)

    // res.send(response)


  } catch (error) {
    if (error) {
      console.log(error);
      // console.log("SQL ERROR:", JSON.stringify(error, null, 2));
      // next(error)
    }
  }

  // const
  //   blobName = getBlobName(args.files['supplementary_file'][0].originalname)
  //   , fileBuffer = args.files['supplementary_file'][0].buffer
  //   , stream = streamifier.createReadStream(new Buffer(fileBuffer))
  //   , streamLength = args.files['supplementary_file'][0].buffer.length;

  // var options = {
  //   contentSettings: { contentType: args.files['supplementary_file'][0].mimetype }
  // }

  // blobService.createBlockBlobFromStream(containerName, blobName, stream, streamLength, options, (uploadError, uploadResult) => {

  //   if (!uploadError) {

  //     //console.log("Image upload successful", uploadResult);

  //     let response = {
  //       status: true,
  //       message: "Document Uploaded Successfully",
  //       //document_path: "https://" + storageAccount + ".blob.core.windows.net/" + containerName + "/" + blobName,
  //       file_name: blobName
  //     };

  //     res.writeHead(200, { "Content-Type": "application/json" });
  //     return res.end(JSON.stringify(response));

  //   } else {

  //     //throw uploadError;
  //     console.log(uploadError);

  //     let response = {
  //       status: false,
  //       message: messages.SOME_THING_WENT_WRONG,
  //       details: uploadError
  //     };
  //     res.writeHead(500, { "Content-Type": "application/json" });
  //     return res.end(JSON.stringify(response));
  //   }
  // });
}

// Delete supplementary document
exports.deleteSupplementaryDoc = function (args, res, next) {

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