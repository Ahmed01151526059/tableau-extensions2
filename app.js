// 🔧 Configuration
const BACKEND_URL = "http://127.0.0.1:5000"; // your Flask backend
let worksheet = null;
let currentData = [];
let charts = [];

function log(msg) {
  console.log("[Extension]", msg);
}

function addMessage(sender, text, cls = "ai") {
  const div = document.createElement("div");
  div.className = `chat-msg ${cls}`;
  div.textContent = `${sender}: ${text}`;
  document.getElementById("chat-window").appendChild(div);
  const chatWindow = document.getElementById("chat-window");
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// === Tableau Integration ===
async function initTableau() {
  await tableau.extensions.initializeAsync();
  const dashboard = tableau.extensions.dashboardContent.dashboard;
  worksheet = dashboard.worksheets[0];
  document.getElementById("worksheet-name").textContent = "Connected to: " + worksheet.name;
  log("Connected to worksheet: " + worksheet.name);
}

async function loadWorksheetData() {
  if (!worksheet) return addMessage("System", "No worksheet found", "system");
  const summary = await worksheet.getSummaryDataAsync({ maxRows: 5000, ignoreSelection: true });
  const cols = summary.columns.map(c => c.fieldName || c.caption);
  currentData = summary.data.map(row => {
    const obj = {};
    row.forEach((cell, i) => (obj[cols[i]] = cell.formattedValue));
    return obj;
  });
  document.getElementById("data-info").textContent =
    `Loaded ${currentData.length} rows / ${cols.length} columns.`;
}

// === Chat ===
async function sendChat(question) {
  if (!question) return;
  addMessage("You", question, "user");
  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, data: currentData }),
  });
  const json = await res.json();
  addMessage("AI", json.answer || "No response", "ai");
}

document.getElementById("btn-chat-send").onclick = () => {
  const q = document.getElementById("chat-input").value;
  document.getElementById("chat-input").value = "";
  sendChat(q);
};

document.querySelectorAll(".preset").forEach(btn => {
  btn.onclick = () => sendChat(btn.dataset.q);
});

// === AI Dashboard ===
async function generateDashboard() {
  if (!currentData.length)
    return addMessage("System", "Load data first.", "system");

  const res = await fetch(`${BACKEND_URL}/ai-dashboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: currentData }),
  });

  const spec = await res.json();
  renderCharts(spec.charts || []);
}

function renderCharts(chartsSpec) {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = "";
  charts.forEach(c => c.destroy());
  charts = [];

  chartsSpec.slice(0, 4).forEach(cfg => {
    const div = document.createElement("div");
    div.className = "dashboard-chart";
    const canvas = document.createElement("canvas");
    div.appendChild(canvas);
    container.appendChild(div);

    const x = cfg.x;
    const y = cfg.y;
    const t = cfg.type || "bar";
    const dataMap = {};

    currentData.forEach(row => {
      const key = String(row[x]);
      const val = parseFloat(String(row[y] || "1").replace(/[^\d.-]/g, ""));
      if (!isNaN(val)) dataMap[key] = (dataMap[key] || 0) + val;
    });

    const labels = Object.keys(dataMap).slice(0, 10);
    const values = labels.map(k => dataMap[k]);

    const chart = new Chart(canvas, {
      type: t === "pie" ? "pie" : t === "line" ? "line" : "bar",
      data: {
        labels,
        datasets: [{ label: cfg.title || y || x, data: values }],
      },
      options: {
        plugins: {
          legend: { labels: { color: "#fff" } },
          title: {
            display: true,
            text: cfg.title || "",
            color: "#fff",
          },
        },
        scales: {
          x: { ticks: { color: "#fff" } },
          y: { ticks: { color: "#fff" } },
        },
      },
    });
    charts.push(chart);
  });
}

document.getElementById("btn-ai-dashboard").onclick = generateDashboard;
document.getElementById("btn-load-data").onclick = loadWorksheetData;

initTableau();
