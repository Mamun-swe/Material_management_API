require("dotenv").config();

const sql = require("../../config/sql");
const messages = require("../../config/constant");
var auth = require("../helpers/auth");

/* GET ALL PROJECTS */
exports.listProjects = function(args, res, next) {

    return sql("SELECT * FROM Project").then(result => {

        if (result.length > 0) {
    
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(result));
    
        } else {
    
          var response = { message: messages.PROJECT_NOT_FOUND };
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(response));
        }
          
      });
};

/* GET A SINGLE PROJECT */
exports.singleProject = function(args, res, next) {

  let projectId = args.swagger.params.id.value;

  return sql("SELECT * FROM Project WHERE id=@id", {id: projectId}).then(result => {

      //console.error("SQL QUERY RESULT:", JSON.stringify(result, null, 2));
      
      if (result.length > 0) {
  
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify(result[0]));
  
      } else {
  
        var response = { message: messages.PROJECT_NOT_FOUND };
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(response));
      }
        
    });
};