import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import csv from "csv-parser";
import https from "https";

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


/* LOAD CATEGORY CSV */

function loadCategories(){

categories = {};

if(!fs.existsSync("backend/data/categories.csv")) return;

fs.createReadStream("backend/data/categories.csv")
.pipe(csv())
.on("data", row => {

if(!categories[row.category]){

categories[row.category] = {
nominees:[],
points:parseInt(row.points || 1)
};

}

categories[row.category].nominees.push(row.nominee);

})
.on("end", ()=>{
recalcLeaderboard();
});

}



/* FETCH GOOGLE SHEET */

function fetchGoogleSheet(){

if(!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("PASTE")) return;

https.get(GOOGLE_SHEET_URL,res=>{

let data="";

res.on("data",chunk=>data+=chunk);

res.on("end",()=>parseGoogleCSV(data));

}).on("error",err=>console.log(err));

}



/* PARSE GOOGLE SHEET */
function parseGoogleCSV(csvText){

const rows = [];

require("stream")
.Readable
.from(csvText)
.pipe(require("csv-parser")())
.on("data",(row)=>{
rows.push(row);
})
.on("end",()=>{

if(rows.length === 0){
console.log("No rows found in sheet");
return;
}

const headers = Object.keys(rows[0]);

const nameColumn = headers[1];

console.log("Using name column:", nameColumn);

picks = [];

rows.forEach(row=>{

const name = row[nameColumn];

headers.forEach(header=>{

if(
header !== headers[0] && // timestamp
header !== headers[1] && // name
header !== headers[2]    // email
){

const nominee = row[header];

if(nominee){

picks.push({
name:name,
category:header,
nominee:nominee
});

}

}

});

});

console.log("Picks loaded:", picks.length);

recalcLeaderboard();

});

}
/* rebuild picks */

picks = [];

rows.forEach(row=>{

const name = row[nameColumn];

headers.forEach(header=>{

if(
header !== nameColumn &&
!header.toLowerCase().includes("timestamp") &&
!header.toLowerCase().includes("email")
){

const nominee = row[header];

if(nominee){

picks.push({
name:name,
category:header,
nominee:nominee
});

}

}

});

});

console.log("Picks loaded:", picks.length);

recalcLeaderboard();

}




/* CALCULATE LEADERBOARD */

function recalcLeaderboard(){

const scores = {};

picks.forEach(p=>{

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



/* FIND MOST CHOSEN */

function mostChosen(category){

const counts = {};

picks
.filter(p=>p.category === category)
.forEach(p=>{

counts[p.nominee] = (counts[p.nominee] || 0) + 1;

});

let max = 0;
let winner = null;

for(const n in counts){

if(counts[n] > max){

max = counts[n];
winner = n;

}

}

return winner;

}



/* ADMIN SELECT WINNER */

app.post("/winner",(req,res)=>{

if(req.headers["x-admin"] !== ADMIN_PASSWORD)
return res.sendStatus(403);

const {category,nominee} = req.body;

winners[category] = nominee;

recalcLeaderboard();

io.emit("WINNER",{
category,
winner:nominee,
mostChosen:mostChosen(category)
});

res.sendStatus(200);

});



/* SOCKET CONNECTION */

io.on("connection",socket=>{

socket.emit("INIT",{
categories,
leaderboard,
winners
});

});



loadCategories();
fetchGoogleSheet();

setInterval(fetchGoogleSheet,30000);



server.listen(process.env.PORT || 3000);
