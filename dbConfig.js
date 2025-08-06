var mysql = require('mysql');
var conn = mysql.createConnection({
	host: process.env.DB_HOST, // from .env file, 
	user: process.env.DB_USER, // from .env file
	password: process.env.DB_PASSWORD, // from .env file   
	database: process.env.DB_NAME // mysql Database name in XAMPP
}); 

conn.connect(function(err) {
	if (err) {
		console.error('Database connection failed:', err.stack);
		return;
	}
	console.log('Mysql database is connected successfully !');
});
module.exports = conn;