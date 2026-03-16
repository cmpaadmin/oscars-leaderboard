<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Oscars Admin</title>

<style>
body{
background:black;
color:gold;
font-family:Arial;
text-align:center;
}

h1{
margin-top:30px;
}

#resetButton,
#exportButton{
margin-top:10px;
padding:8px 16px;
font-size:16px;
cursor:pointer;
}

#exportButton{
margin-left:10px;
display:inline-block;
}

#categories{
margin-top:40px;
width:90%;
margin-left:auto;
margin-right:auto;
}

.row{
display:flex;
justify-content:center;
align-items:center;
margin-bottom:15px;
gap:10px;
flex-wrap:wrap;
}

.row span{
min-width:220px;
text-align:right;
}

.row select{
padding:8px;
font-size:16px;
min-width:220px;
}

.row button{
padding:8px 12px;
cursor:pointer;
}

.completed{
background:gold;
color:black;
padding:6px;
border-radius:6px;
}

.dual-select-wrap{
display:flex;
gap:8px;
flex-wrap:wrap;
justify-content:center;
align-items:center;
}

.status-text{
min-width:180px;
text-align:left;
font-size:14px;
color:#fff2a8;
}
</style>
</head>
<body>

<h1>Admin Control Panel</h1>

<button id="resetButton">Reset Scores</button>
<button id="exportButton">Export Final CSV</button>

<div id="categories"></div>

<script src="/socket.io/socket.io.js"></script>

<script>
const socket = io();
const ADMIN_PASSWORD = "f1!msk00lF$U";

function winnerList(value){
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function renderAdmin(data){
  const container = document.getElementById("categories");
  container.innerHTML = "";

  const categories = data.categories || {};
  const winners = data.winners || {};

  Object.keys(categories).forEach(category => {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("span");
    label.innerText = category;

    const selectWrap = document.createElement("div");
    selectWrap.className = "dual-select-wrap";

    const select1 = document.createElement("select");
    const select2 = document.createElement("select");

    const blank1 = document.createElement("option");
    blank1.value = "";
    blank1.innerText = "-- Select Winner 1 --";
    select1.appendChild(blank1);

    const blank2 = document.createElement("option");
    blank2.value = "";
    blank2.innerText = "-- Optional Winner 2 --";
    select2.appendChild(blank2);

    categories[category].nominees.forEach(nominee => {
      const option1 = document.createElement("option");
      option1.value = nominee;
      option1.innerText = nominee;
      select1.appendChild(option1);

      const option2 = document.createElement("option");
      option2.value = nominee;
      option2.innerText = nominee;
      select2.appendChild(option2);
    });

    const savedWinners = winnerList(winners[category]);

    if (savedWinners[0]) select1.value = savedWinners[0];
    if (savedWinners[1]) select2.value = savedWinners[1];

    const setButton = document.createElement("button");
    setButton.innerText = winners[category] ? "Winner Selected" : "Set Winner(s)";

    const undoButton = document.createElement("button");
    undoButton.innerText = "Undo Winner";

    const status = document.createElement("div");
    status.className = "status-text";
    status.innerText = savedWinners.length > 0
      ? "Saved: " + savedWinners.join(" / ")
      : "No winner selected";

    if (winners[category]) {
      row.classList.add("completed");
    }

    setButton.onclick = async function(){
      const nominees = [select1.value, select2.value]
        .map(v => String(v || "").trim())
        .filter(v => v);

      const uniqueNominees = [...new Set(nominees)];

      if (uniqueNominees.length === 0) {
        alert("Please select at least one winner.");
        return;
      }

      const response = await fetch("/winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin": ADMIN_PASSWORD
        },
        body: JSON.stringify({
          category: category,
          nominee: uniqueNominees
        })
      });

      console.log("Winner sent:", category, uniqueNominees);
      console.log("Server response:", response.status);

      if (response.status === 200) {
        setButton.innerText = "Winner Selected";
        row.classList.add("completed");
        status.innerText = "Saved: " + uniqueNominees.join(" / ");
      }
    };

    undoButton.onclick = async function(){
      const response = await fetch("/undo-winner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin": ADMIN_PASSWORD
        },
        body: JSON.stringify({
          category: category
        })
      });

      console.log("Undo winner:", category);
      console.log("Server response:", response.status);

      if (response.status === 200) {
        select1.value = "";
        select2.value = "";
        setButton.innerText = "Set Winner(s)";
        row.classList.remove("completed");
        status.innerText = "No winner selected";
      }
    };

    selectWrap.appendChild(select1);
    selectWrap.appendChild(select2);

    row.appendChild(label);
    row.appendChild(selectWrap);
    row.appendChild(setButton);
    row.appendChild(undoButton);
    row.appendChild(status);

    container.appendChild(row);
  });
}

socket.on("INIT", (data) => {
  renderAdmin(data);
});

socket.on("UNDO_WINNER", () => {
  // no-op; state refresh is handled by current page controls
});

document.getElementById("exportButton").onclick = async function(){
  const response = await fetch("/export-final", {
    method: "GET",
    headers: {
      "x-admin": ADMIN_PASSWORD
    }
  });

  if (response.status !== 200) {
    alert("Final CSV is not available until all categories have winners selected.");
    return;
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "oscars-final-leaderboard.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
};

document.getElementById("resetButton").onclick = async function(){
  if (!confirm("Reset all scores?")) return;

  const response = await fetch("/reset", {
    method: "POST",
    headers: {
      "x-admin": ADMIN_PASSWORD
    }
  });

  console.log("Reset response:", response.status);

  location.reload();
};
</script>

</body>
</html>
