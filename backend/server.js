import express from "express";
import http from "http";
import { Server } from "socket.io";
import https from "https";
import fs from "fs";
import csv from "csv-parser";
import { Readable } from "stream";

const ADMIN_PASSWORD = "f1!msk00lF$U";

/* paste your Google sheet CSV here */
const GOOGLE_SHEET_URL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vTOW0D_7N_4XAuMQKM71quXgdPKFj3h52QF_rCAIo5-Uo3WQAjDOqHQr3JrfiemGkh644Yp-W8G2PrF/pub?output=csv";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("frontend"));
app.use(express.json());

let categories = {};
let picks = [];
let winners = {};
let leaderboard = [];
let firstWinnerSelected = false;


/* -----------------------------
   LOAD CATEGORY CSV
------------------------------*/

function loadCategories(){

categories = {};

if(!fs.existsSync("backend/data/categories.csv")){
console.log("No categories.csv found");
return;
}

fs.createReadStream("backend/data/categories.csv")
.pipe(csv())
.on("data",(row)=>{

if(!row.category || !row.nominee) return;

const category = row.category.trim().toUpperCase();
const nominee = row.nominee.trim();

if(!categories[category]){

categories[category] = {
nominees:[],
points:parseInt(row.points || 1)
};

}

categories[category].nominees.push(nominee);

})
.on("end",()=>{

console.log("Categories loaded:",Object.keys(categories).length);

recalcLeaderboard();

});

}


/* -----------------------------
   FETCH GOOGLE SHEET (WITH REDIRECT)
------------------------------*/

function fetchGoogleSheet(url = GOOGLE_SHEET_URL){

https.get(url,{
headers:{ "User-Agent":"Mozilla/5.0" }
},(res)=>{

/* follow redirect */

if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
console.log("Following redirect...");
return fetchGoogleSheet(res.headers.location);
}

let data="";

res.on("data",(chunk)=>data+=chunk);

res.on("end",()=>{

/* prevent HTML responses */

if(data.startsWith("<")){
console.log("Google returned HTML instead of CSV");
return;
}

parseGoogleCSV(data);

});

}).on("error",(err)=>{

console.log("Google fetch failed:",err);

});

}


/* -----------------------------
   PARSE GOOGLE FORM CSV
------------------------------*/

function parseGoogleCSV(csvText){

const rows = [];

Readable.from(csvText)
.pipe(csv())
.on("data",(row)=>rows.push(row))
.on("end",()=>{

if(rows.length === 0){
console.log("No rows found in sheet");
return;
}

const headers = Object.keys(rows[0]);

console.log("Detected headers:",headers);

picks = [];

rows.forEach((row)=>{

const values = Object.values(row);

/* Google Forms format
0 = Timestamp
1 = Name
2 = Email
3+ = Categories
*/

const name = values[1];

if(!name) return;

for(let i=3;i<values.length;i++){

const category = headers[i];
const nominee = values[i];

if(category && nominee){

picks.push({
name:name.trim(),
category:category.trim().toUpperCase(),
nominee:nominee.trim()
});

}

}

});

console.log("Picks loaded:",picks.length);

recalcLeaderboard();

});

}


/* -----------------------------
   CALCULATE LEADERBOARD
------------------------------*/

function recalcLeaderboard(){

const scores = {};

picks.forEach((p)=>{

if(!scores[p.name]) scores[p.name] = 0;

if(winners[p.category] === p.nominee){

scores[p.name] += categories[p.category]?.points || 1;

}

});

leaderboard = Object.entries(scores)
.map(([name,score])=>({name,score}))
.sort((a,b)=>b.score-a.score);

io.emit("LEADERBOARD",{
data: leaderboard,
started: firstWinnerSelected
});

}


/* -----------------------------
   MOST CHOSEN NOMINEE
------------------------------*/

function mostChosen(category){

const counts = {};

picks
.filter(p=>p.category === category)
.forEach((p)=>{

counts[p.nominee] = (counts[p.nominee] || 0) + 1;

});

let max = 0;
let nominee = null;

for(const n in counts){

if(counts[n] > max){
max = counts[n];
nominee = n;
}

}

return nominee;

}


/* -----------------------------
   ADMIN SET WINNER
------------------------------*/

app.post("/winner",(req,res)=>{

if(req.headers["x-admin"] !== ADMIN_PASSWORD){
return res.sendStatus(403);
}

const {category,nominee} = req.body;

const cat = category.trim().toUpperCase();

console.log("Winner selected:",cat,nominee);

winners[cat] = nominee;
firstWinnerSelected = true;
recalcLeaderboard();

io.emit("WINNER",{
category:cat,
winner:nominee,
mostChosen:mostChosen(cat)
});

res.sendStatus(200);

});

app.post("/reset",(req,res)=>{

if(req.headers["x-admin"] !== ADMIN_PASSWORD){
return res.sendStatus(403);
}

console.log("Scores reset");

winners = {};
leaderboard = [];

io.emit("RESET");

recalcLeaderboard();

res.sendStatus(200);

});

/* -----------------------------
   SOCKET CONNECTION
------------------------------*/

io.on("connection",(socket)=>{

socket.emit("INIT",{
categories,
leaderboard,
winners
});

});


/* -----------------------------
   START SERVER
------------------------------*/

loadCategories();
fetchGoogleSheet();

/* refresh picks every 30 seconds */

setInterval(fetchGoogleSheet,30000);

const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{

console.log("Server running on port",PORT);

});
