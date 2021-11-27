## How to run this
 
1) At least Node.js version 12 need to be installed. Check by running `node -v` in the terminal, which will show something like 'v12.x.x'.

2) Install all the dependencies by running `npm install`. You may also need to run `npm audit fix`, if your terminal asks to do so.

3) Create a database in MSSQL Server (at least version 2014), then also a database user. Execute from line# 85 till the end of the attached 'projects_new.sql' file to create all the necessary tables, as well as to insert sample data.

4) In the '.env' file, provide your database settings from line# 9 to 12.

5) Start the server by running `npm start`

6) Check the swagger-ui on `http://localhost:3000/docs`

7) The GET APIs should NOT work before authentication.

5) POST `http://localhost:3000/api/oauth/token` with the following body
``
{
"email": "user1@email.com",
"password": "pw1"
}
``
 and take the access token that you get in the response
 
 6) Test any GET API again with the following header
 ``Authorization: Bearer _TOKEN_``, replacing `_TOKEN_ ` with the value you got from request #5
  
 By default, your role is defined as 'admin' to access into the protected routes.


Set MSSQL in ubuntu 20.0
https://docs.microsoft.com/en-us/sql/linux/quickstart-install-connect-ubuntu?view=sql-server-ver15