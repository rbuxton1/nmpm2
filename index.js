const express = require('express');
const app = express();
const bodyparser = require('body-parser');
const mysql = require('mysql');
const fileUpload = require('express-fileupload');
const cookieParser = require("cookie-parser");
const mailgun = require("mailgun-js");
const mg = mailgun({apiKey: process.env.MAILGUN_KEY, domain: "mg.namopaimo.com"});

var state = "complete";

const emailTemplate = {
	from: 'registrar@namopaimo.com',
	to: '',
	subject: 'NaMoPaiMo Registration',
	text: ''
};

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({extended: true}));
//app.set("view engine", "pug");
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(fileUpload());
app.use(cookieParser());

var db = mysql.createPool({
  host: process.env.DB,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: "nmpm"
});
var insertNew = "INSERT INTO `registrar`(`id`, `name`, `email`, `address1`, `address2`, `city`, `state`, `zip`, `country`, `level`, `age`, `description`, `medium`, `color`, `goals`, `fee`, `years`, `pre_img`, `code`, `reg_date`) VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)";
var instertComplete = "INSERT INTO `completed`(`id`, `code`, `post_img`, `finish`) VALUES (NULL,?,?,CURRENT_TIMESTAMP)";
var statsQuery = "SELECT (SELECT COUNT(DISTINCT registrar.name) FROM completed JOIN registrar on completed.code = registrar.code) as completedCount, (SELECT COUNT(DISTINCT registrar.name) FROM registrar) as registeredCount, (SELECT COUNT(DISTINCT registrar.country) FROM registrar) as uniqueCountries";
//WHERE completed.finish >= DATE("2021-02-01") GROUP BY name
var preImagesQuery = "SELECT registrar.pre_img, registrar.name FROM registrar WHERE NOT registrar.pre_img = 'NA' ORDER BY reg_date DESC LIMIT 25 OFFSET ?";
var postImagesQuery = "SELECT registrar.pre_img, registrar.name, completed.post_img FROM registrar JOIN completed ON registrar.code = completed.code ORDER BY finish DESC LIMIT 25 OFFSET ?";


function codeGen(callback){
  function gen(callback){
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for(var i = 0; i < 10; i++){
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    callback(result);
  }

  gen(result => {
    db.query("SELECT * FROM registrar WHERE code = ?", [result], function(err, sqlRes){
       if(err) console.error(err);
       if(sqlRes.length == 0) {
         callback(result);
       } else codeGen(callback);
    });
  });
}

app.get("/", (req, res) => {
  res.render("frame", {content: state == "register" ? "partials/register.ejs" : "partials/timeline.ejs"});
});

app.post("/changestate", (req, res) => {
	if(req.body.pass == process.env.STATE_PASS){
		state = req.body.state;
		res.send(state);
	} else {
		res.send("invalid auths");
	}
});

app.post("/register/new", (req, res) => {
  //db ops
  //console.log(req.body);
  codeGen(code => {
    if(!req.files){
      console.log("No image!");
      db.query(insertNew, [req.body.name, req.body.email, req.body.address1, req.body.address2, req.body.city, req.body.state, req.body.zip, req.body.country, req.body.level, req.body.age, req.body.desc, req.body.medium, req.body.color, req.body.goals, req.body.fee, req.body.years, "NA", code], (err, sql) => {
        if(err) res.render("frame", {content: "partials/error", error: err});
        else {
          res.cookie("code", code, { expires: new Date(Date.now() + 86400 * 1000 * 365 * 5), httpOnly: true });

          //prep email
          var data = emailTemplate;
          data.to = req.body.email;
          data.text = "Hello " + req.body.name + ",\n\n\tThank you for registering in NaMoPaiMo! Your completion code is: " + code + ". Please keep this code as you will need it to be marked as completed in the database!\n\n Good luck, \n\t NaMoPaiMo Registrar \n\n This is an automated email, replies will not be seen.";

          mg.messages().send(data, function (error, body) {
      	     if(!error) res.redirect("/register/done");
             else res.render("frame", {content: "partials/error", error: error});
          });
        }
      });
    } else {
      var ext = "." + req.files.img.name.split(".")[req.files.img.name.split(".").length - 1];
      var p = "./public/uploads/pre/" + code + ext;
      console.log("Image: " + p);
      req.files.img.mv(p, err => {
        if(err) res.render("frame", {content: "partials/error", error: err});
        else {
          db.query(insertNew, [req.body.name, req.body.email, req.body.address1, req.body.address2, req.body.city, req.body.state, req.body.zip, req.body.country, req.body.level, req.body.age, req.body.desc, req.body.medium, req.body.color, req.body.goals, req.body.fee, req.body.years, p, code], (err, sql) => {
            if(err) res.render("frame", {content: "partials/error", error: err});
            else {
              res.cookie("code", code, { expires: new Date(Date.now() + 86400 * 1000 * 365 * 5), httpOnly: true });

              //prep email
              var data = emailTemplate;
              data.to = req.body.email;
              data.text = "Hello " + req.body.name + ",\n\n\tThank you for registering in NaMoPaiMo! Your completion code is: " + code + ". Please keep this code as you will need it to be marked as completed in the database!\n\n Good luck, \n\t NaMoPaiMo Registrar \n\n This is an automated email, replies will not be seen.";

              mg.messages().send(data, function (error, body) {
          	     if(!error) res.redirect("/register/done");
                 else res.render("frame", {content: "partials/error", error: error});
              });
            }
          });
        }
      });
    }
  });
});

app.get("/register/done", (req, res) => {
  res.render("frame", {content: "partials/reg-confirmation.ejs", code: req.cookies.code || "Error!"});
});

app.get("/complete", (req, res) => {
  res.render("frame", {content: state == "complete" ? "partials/complete.ejs" : "partials/timeline.ejs", code: req.cookies.code});
});

app.post("/register/complete", (req, res) => {
  //db ops
  //res.redirect("/upload/done");
  db.query("SELECT * FROM completed WHERE code = ?", [req.body.code], (err, sql) => {
    if(err) res.render("frame", {content: "partials/error", error: err});
    else if(sql.length != 0) res.render("frame", {content: "partials/error", error: "That code has already been marked as completed!"});
    else {
      var ext = "." + req.files.img.name.split(".")[req.files.img.name.split(".").length - 1];
      var p = "./public/uploads/post/" + req.body.code + ext;
      console.log("Image: " + p);
      req.files.img.mv(p, err => {
        if(err) res.render("frame", {content: "partials/error", error: err});
        else {
          db.query(instertComplete, [req.body.code, p], (err, sql) => {
            if(err) res.render("frame", {content: "partials/error", error: err});
            else {
              res.redirect("/upload/done");
            }
          });
        }
      });
    }
  });
});

app.get("/upload/done", (req, res) => {
  res.render("frame", {content: "partials/upload-confirmation.ejs"});
});

app.get("/stats", (req, res) => {
	var page = (parseInt(req.query.page) || 0);
  db.query(statsQuery, (err, statsSql) => {
		db.query(state== "register" ? preImagesQuery : postImagesQuery, [page * 25], (err2, imagesSql) => {
			if(err) res.render("frame", {content: "partials/error", error: err});
			else if(err2) res.render("frame", {content: "partials/error", error: err2});
			else res.render("frame", {content: "partials/stats.ejs", stats: statsSql[0], images: imagesSql, page: page, state: state});
		});
  });
});

app.get("/about", (req, res) => {
	res.render("frame", {content: "partials/about.ejs"});
});

const server = app.listen(3000, () => {
  console.log(`The application started on port ${server.address().port}`);
});
