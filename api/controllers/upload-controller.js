require("dotenv").config();

let storageAccount = process.env.AZURE_STORAGE_ACCOUNT;

const 
    fetch  = require('node-fetch')
  , sql = require("../../config/sql")
  , messages = require("../../config/constant")
  , streamifier = require('streamifier')
  , containerName = 'supplementarydocs'
  , azureStorage = require('azure-storage')
  , blobService = azureStorage.createBlobService();

const getBlobName = originalName => {
    const identifier = Math.random().toString().replace(/0\./, ''); // remove "0." from start of string
    return `${identifier}-${originalName}`;
};  


exports.uploadSupplementaryDoc = function(args, res, next) {
  
    const
          blobName = getBlobName(args.files['supplementary_file'][0].originalname)
        , fileBuffer = args.files['supplementary_file'][0].buffer
        , stream = streamifier.createReadStream(new Buffer(fileBuffer))
        , streamLength = args.files['supplementary_file'][0].buffer.length;

    var options = {
      contentSettings:{contentType: args.files['supplementary_file'][0].mimetype}
    };

    blobService.createBlockBlobFromStream(containerName, blobName, stream, streamLength, options, (uploadError, uploadResult)=>{

      if (!uploadError) {

          //console.log("Image upload successful", uploadResult);

          let response = {
              status: true,
              message: "Document Uploaded Successfully",
              //document_path: "https://" + storageAccount + ".blob.core.windows.net/" + containerName + "/" + blobName,
              file_name: blobName
          };
      
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));  
  
      } else{
  
          //throw uploadError;
          console.log(uploadError);

          let response = {
              status: false,
              message: messages.SOME_THING_WENT_WRONG,
              details: uploadError
          };
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));
      }
    });
  };

  exports.deleteSupplementaryDoc = function(args, res, next) {

    let blobName =  args.body.supplementary_document;

    blobService.deleteBlobIfExists(containerName, blobName, (deleteError, deleteResult) => {

      if (!deleteError) {

          console.log("Delete successful", deleteResult);

          let response = {
            status: true,
            message: "Supplementary Document Deleted Successfully"
          };
      
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));  
  
      } else{
  
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