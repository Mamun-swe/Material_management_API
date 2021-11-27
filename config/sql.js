require("dotenv").config();
const sql = require('mssql');

/* SQL CONFIG */
const sqlConfig = {
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	server: process.env.DB_SERVER,
	database: process.env.DB_NAME
}

sql.on('error', err => {
	console.error("SQL ERROR:", JSON.stringify(err, null, 2));
})

var dbConnection;
sql.connect(sqlConfig).then(pool => {
	dbConnection = pool;
});

//module.exports = dbConnection;

module.exports = function (query, params) {

	params = params || {}; // default to empty JSON if undefined

	var req = dbConnection.request();

	// loop through params JSON and add them as input
	Object.keys(params).forEach(key => {
		req.input(key, params[key]);
	})

	return req.query(query).then(result => {
		return result.recordset;
	}).catch(err => {
		//console.log(err);
		console.error("SQL QUERY ERROR:", JSON.stringify(err, null, 2));
		return null;
	});
}
