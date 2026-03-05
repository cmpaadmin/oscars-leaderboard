import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import https from "https";
import csv from "csv-parser";
import { Readable } from "stream";

const ADMIN_PASSWORD = "f1!msk00lF$U";
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOW0D_7N_4XAuMQKM71quXgdPKFj3h52QF_rCAIo5-Uo3WQAjDOqHQr3JrfiemGkh644Yp-W8G2PrF/pub?gid=1643430082&single=true&output=csv";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("frontend"));
app.use(express.json());

let categories = {};
let picks = [];
let winners = {};
let leaderboard = [];


/* ---------------------------
   LOAD CATEGORY CSV
----------------------------*/

function loadCategories(){

categories = {};

if(!fs.existsSync("backend/data/categories.csv")){
console.log("No categories.csv found");
return;
}

fs.createReadStream("backend/data/categories.csv")
.pipe(csv())
.on("data",(row)=>{

if(!categories[row.category]){

categories[row.category.trim().toUpperCase()] = {
nominees:[],
points:parseInt(row.points || 1)
};

}

categories[row.category.trim().toUpperCase()].nominees.push(row.nominee.trim());

})
.on("end",()=>{

console.log("Categories loaded:",Object.keys(categories).length);

recalcLeaderboard();

});

}


/* ---------------------------
   FETCH GOOGLE SHEET
----------------------------*/

function fetchGoogleSheet(){

if(!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("PASTE")){
console.log("Google Sheet URL not configured");
return;
}

https.get(GOOGLE_SHEET_URL,(res)=>{

let data="";

res.on("data",(chunk)=>data+=chunk);

res.on("end",()=>{

if(data.trim().length < 50){
console.log("Sheet response invalid");
return;
}

parseGoogleCSV(data);

});

}).on("error",(err)=>{

console.log("Google fetch failed",err);

});

}


/* ---------------------------
   PARSE GOOGLE SHEET CSV
----------------------------*/

function parseGoogleCSV(csvText){

const rows = [];

Readable.from(csvText)
.pipe(csv())
.on("data",(row)=>{
rows.push(row);
})
.on("end",()=>{

if(rows.length === 0){
console.log("No rows found in sheet");
return;
}

const headers = Object.keys(rows[0])
.map(h => h.trim())
.filter(h => h.length > 0);

/* normalize headers */

const cleanedHeaders = headers.map(h =>
  h.replace(/\r/g,"")
   .replace(/\n/g," ")
   .trim()
);

const nameColumn = cleanedHeaders[1];  // Google Forms always puts name in column 2

console.log("Using name column:",nameColumn);

picks = [];

rows.forEach((row)=>{

const name = row[nameColumn];

cleanedHeaders.forEach((header)=>{

if(
header !== headers[0] && // timestamp
header !== headers[1] && // name
header !== headers[2]    // email
){

const nominee = row[header];

if(nominee){

picks.push({
name:name.trim(),
category:header.trim().toUpperCase(),
nominee:nominee.trim()
});

}

}

});

});

console.log("Picks loaded:",picks.length);

recalcLeaderboard();

});

}


/* ---------------------------
   CALCULATE LEADERBOARD
----------------------------*/

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

io.emit("LEADERBOARD",leaderboard);

}


/* ---------------------------
   FIND MOST CHOSEN NOMINEE
----------------------------*/

function mostChosen(category){

const counts = {};

picks
.filter(p=>p.category === category)
.forEach((p)=>{

counts[p.nominee] = (counts[p.nominee] || 0) + 1;

});

let max = 0;
let winner = null;

for(const nominee in counts){

if(counts[nominee] > max){
max = counts[nominee];
winner = nominee;
}

}

return winner;

}


/* ---------------------------
   ADMIN SELECT WINNER
----------------------------*/

app.post("/winner",(req,res)=>{

if(req.headers["x-admin"] !== ADMIN_PASSWORD){
return res.sendStatus(403);
}

const {category,nominee} = req.body;
console.log("Winner received:",category,nominee);
winners[category] = nominee;

recalcLeaderboard();

io.emit("WINNER",{
category,
winner:nominee,
mostChosen:mostChosen(category)
});
res.sendStatus(200);


});


/* ---------------------------
   SOCKET CONNECTION
----------------------------*/

io.on("connection",(socket)=>{

socket.emit("INIT",{
categories,
leaderboard,
winners
});

});


/* ---------------------------
   START SERVER
----------------------------*/

loadCategories();
fetchGoogleSheet();

setInterval(fetchGoogleSheet,30000);

const PORT = process.env.PORT || 3000;

server.listen(PORT,()=>{
console.log("Server running on port",PORT);
});
