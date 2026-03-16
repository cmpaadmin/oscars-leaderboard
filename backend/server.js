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

/* -----------------------------
   LOAD CATEGORY CSV
------------------------------*/

function loadCategories() {
  categories = {};

  if (!fs.existsSync("backend/data/categories.csv")) {
    console.log("No categories.csv found");
    return;
  }

  fs.createReadStream("backend/data/categories.csv")
    .pipe(csv())
    .on("data", (row) => {
      if (!row.category || !row.nominee) return;

      const category = row.category.trim().toUpperCase();
      const nominee = row.nominee.trim();

      if (!category || !nominee) return;

      if (!categories[category]) {
        categories[category] = {
          nominees: [],
          points: parseInt(row.points || 1, 10)
        };
      }

      categories[category].nominees.push(nominee);
    })
    .on("end", () => {
      console.log("Categories loaded:", Object.keys(categories).length);
      recalcLeaderboard();
    });
}

/* -----------------------------
   FETCH GOOGLE SHEET (WITH REDIRECT)
------------------------------*/

function fetchGoogleSheet(url = GOOGLE_SHEET_URL) {
  https
    .get(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0" }
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          console.log("Following redirect...");
          return fetchGoogleSheet(res.headers.location);
        }

        let data = "";

        res.on("data", (chunk) => (data += chunk));

        res.on("end", () => {
          if (data.trim().startsWith("<")) {
            console.log("Google returned HTML instead of CSV");
            return;
          }

          parseGoogleCSV(data);
        });
      }
    )
    .on("error", (err) => {
      console.log("Google fetch failed:", err);
    });
}

/* -----------------------------
   PARSE GOOGLE FORM CSV
------------------------------*/

function parseGoogleCSV(csvText) {
  const rows = [];

  Readable.from(csvText)
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", () => {
      if (rows.length === 0) {
        console.log("No rows found in sheet");
        return;
      }

      const headers = Object.keys(rows[0]);
      console.log("Detected headers:", headers);

      picks = [];

      rows.forEach((row) => {
        const values = Object.values(row);

        /* Google Forms format
           0 = Timestamp
           1 = Name
           2 = Email
           3+ = Categories
        */

        const name = values[1];

        if (!name || !String(name).trim()) return;

        for (let i = 3; i < values.length; i++) {
          const category = headers[i];
          const nominee = values[i];

          if (
            category &&
            nominee &&
            String(category).trim() &&
            String(nominee).trim()
          ) {
            picks.push({
              name: String(name).trim(),
              category: String(category).trim().toUpperCase(),
              nominee: String(nominee).trim()
            });
          }
        }
      });

      console.log("Picks loaded:", picks.length);
      recalcLeaderboard();
    });
}

/* -----------------------------
   CALCULATE LEADERBOARD
------------------------------*/

function recalcLeaderboard() {
  const scores = {};

  picks.forEach((p) => {
    if (!scores[p.name]) scores[p.name] = 0;

    const winnerValue = winners[p.category];
    const winnerList = Array.isArray(winnerValue) ? winnerValue : [winnerValue];

    if (winnerList.includes(p.nominee)) {
      scores[p.name] += categories[p.category]?.points || 1;
    }
  });

  leaderboard = Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const started = Object.values(winners).some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  });

  const totalCategories = Object.keys(categories).length;
  const completedCategories = Object.keys(winners).filter((cat) => {
    const value = winners[cat];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  }).length;
  const allCategoriesComplete =
    totalCategories > 0 && completedCategories === totalCategories;

  io.emit("LEADERBOARD", {
    data: leaderboard,
    started,
    allCategoriesComplete
  });
}

/* -----------------------------
   BUILD FINAL CSV EXPORT
------------------------------*/

function buildFinalCsv() {
  const lines = [];
  lines.push("Rank,Name,Score");

  const sorted = [...leaderboard].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name)
  );

  let rank = 1;

  sorted.forEach((row, index) => {
    if (index > 0 && sorted[index - 1].score > row.score) {
      rank = index + 1;
    }

    const safeName = `"${String(row.name || "").replace(/"/g, '""')}"`;
    lines.push(`${rank},${safeName},${row.score}`);
  });

  return lines.join("\n");
}

/* -----------------------------
   MOST CHOSEN NOMINEE
------------------------------*/

function mostChosen(category) {
  const counts = {};

  picks
    .filter((p) => p.category === category)
    .forEach((p) => {
      counts[p.nominee] = (counts[p.nominee] || 0) + 1;
    });

  let max = 0;
  let nominee = null;

  for (const n in counts) {
    if (counts[n] > max) {
      max = counts[n];
      nominee = n;
    }
  }

  return nominee;
}

/* -----------------------------
   ADMIN SET WINNER
------------------------------*/

app.post("/winner", (req, res) => {
  if (req.headers["x-admin"] !== ADMIN_PASSWORD) {
    return res.sendStatus(403);
  }

  const { category, nominee } = req.body;

  if (!category || !nominee) {
    return res.status(400).send("Missing category or nominee");
  }

  const cat = String(category).trim().toUpperCase();

  let selectedNominee;

  if (Array.isArray(nominee)) {
    selectedNominee = nominee
      .map((n) => String(n).trim())
      .filter((n) => n);
  } else {
    selectedNominee = String(nominee).trim();
  }

  console.log("Winner selected:", cat, selectedNominee);

  winners[cat] = selectedNominee;

  recalcLeaderboard();

  io.emit("WINNER", {
    category: cat,
    winner: Array.isArray(selectedNominee)
      ? selectedNominee.join(" / ")
      : selectedNominee,
    mostChosen: mostChosen(cat)
  });

  res.sendStatus(200);
});

app.post("/reset", (req, res) => {
  if (req.headers["x-admin"] !== ADMIN_PASSWORD) {
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
   EXPORT FINAL CSV
------------------------------*/

app.get("/export-final", (req, res) => {
  if (req.headers["x-admin"] !== ADMIN_PASSWORD) {
    return res.sendStatus(403);
  }

  const totalCategories = Object.keys(categories).length;
  const selectedCategories = Object.keys(winners).filter((cat) => {
    const value = winners[cat];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  }).length;

  if (totalCategories === 0 || selectedCategories < totalCategories) {
    return res
      .status(400)
      .send("Final category has not been selected yet.");
  }

  const csvText = buildFinalCsv();

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="oscars-final-leaderboard.csv"'
  );
  res.send(csvText);
});

/* -----------------------------
   SOCKET CONNECTION
------------------------------*/

io.on("connection", (socket) => {
  const totalCategories = Object.keys(categories).length;
  const completedCategories = Object.keys(winners).filter((cat) => {
    const value = winners[cat];
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
  }).length;
  const allCategoriesComplete =
    totalCategories > 0 && completedCategories === totalCategories;

  socket.emit("INIT", {
    categories,
    leaderboard,
    winners,
    allCategoriesComplete
  });
});

/* -----------------------------
   START SERVER
------------------------------*/

loadCategories();
fetchGoogleSheet();

/* refresh picks every 30 seconds */
setInterval(fetchGoogleSheet, 30000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
