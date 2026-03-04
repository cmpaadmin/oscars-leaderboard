import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import csv from "csv-parser";
import https from "https";

const ADMIN_PASSWORD = "f1!msk00lF$U";
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mfO73uNkVsp64qdkmgdUsOO93xiyk7gbxxfocIBYd7A/edit?gid=1643430082#gid=1643430082";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("frontend"));
app.use(express.json());

let categories = {};
let picks = [];
let winners = {};
let leaderboard = [];

function loadCategories() {
  categories = {};
  if (!fs.existsSync("backend/data/categories.csv")) return;
  fs.createReadStream("backend/data/categories.csv")
    .pipe(csv())
    .on("data", row => {
      if (!categories[row.category]) {
        categories[row.category] = { nominees: [], points: parseInt(row.points || 1) };
      }
      categories[row.category].nominees.push(row.nominee);
    })
    .on("end", recalcLeaderboard);
}

function fetchGoogleSheet() {
  if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes("PASTE")) return;
  https.get(GOOGLE_SHEET_URL, res => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => parseGoogleCSV(data));
  });
}

function parseGoogleCSV(csvText) {
  const rows = [];
  const lines = csvText.split("\n");
  const headers = lines[0].split(",");
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const values = lines[i].split(",");
    const row = {};
    headers.forEach((h, index) => row[h.trim()] = values[index]?.trim());
    rows.push(row);
  }
  picks = [];
  rows.forEach(row => {
    const name = row["Name"];
    headers.forEach(header => {
      if (!["Timestamp","Name","Email","Email Address"].includes(header) && row[header]) {
        picks.push({ name, category: header, nominee: row[header] });
      }
    });
  });
  recalcLeaderboard();
}

function recalcLeaderboard() {
  const scores = {};
  picks.forEach(p => {
    if (!scores[p.name]) scores[p.name] = 0;
    if (winners[p.category] === p.nominee) scores[p.name] += categories[p.category]?.points || 1;
  });
  leaderboard = Object.entries(scores).map(([name, score]) => ({ name, score }))
    .sort((a,b)=>b.score-a.score);
  io.emit("LEADERBOARD", leaderboard);
}

app.post("/winner",(req,res)=>{
  if(req.headers["x-admin"]!==ADMIN_PASSWORD) return res.sendStatus(403);

  const {category, nominee} = req.body;
  winners[category]=nominee;

  // Calculate most chosen nominee
  const counts = {};
  picks
    .filter(p => p.category === category)
    .forEach(p => {
      counts[p.nominee] = (counts[p.nominee] || 0) + 1;
    });

  let mostChosen = null;
  let max = 0;
  for (const n in counts) {
    if (counts[n] > max) {
      max = counts[n];
      mostChosen = n;
    }
  }

  recalcLeaderboard();

  io.emit("WINNER",{
    category,
    winner: nominee,
    mostChosen
  });

  res.sendStatus(200);
});

io.on("connection", socket => {
  socket.emit("INIT",{categories,leaderboard,winners});
});

loadCategories();
fetchGoogleSheet();
setInterval(fetchGoogleSheet,30000);

server.listen(process.env.PORT||3000);
