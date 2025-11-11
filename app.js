// ===== Tableau REST config =====
const DOMAIN = "https://prod-ch-a.online.tableau.com"; // your Tableau Cloud
const API_VERSION = "3.25";
const SITE_CONTENT_URL_DEFAULT = ""; // set if you use a named site

// ===== Session state =====
const session = {
  authToken: null,
  siteId: null,
  userName: null,
};

let currentWorkbooks = [];
let currentViews = [];
let currentData = {
  columns: [],
  rows: [], // array of objects { col: value }
};
let charts = [];

// ===== Helper UI functions =====
function setStatus(msg) {
  const el = document.getElementById("status-text");
  if (el) el.textContent = msg;
}

function setLoginInfo(msg) {
  const el = document.getElementById("login-info");
  if (el) el.textContent = msg;
}

function setUserName(name) {
  const el = document.getElementById("user-name");
  if (el) el.textContent = "Logged in as: " + (name || "(unknown)");
}

// ===== REST helpers =====

async function tableauSignin(username, password, siteContentUrl) {
  const url = `${DOMAIN}/api/${API_VERSION}/auth/signin`;
  const site = siteContentUrl || SITE_CONTENT_URL_DEFAULT;

  const xmlBody = `
    <tsRequest>
      <credentials name="${username}" password="${password}">
        <site contentUrl="${site}" />
      </credentials>
    </tsRequest>
  `.trim();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/xml" },
    body: xmlBody,
  });

  if (!res.ok) {
    throw new Error(`Signin failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");

  const creds = doc.getElementsByTagName("credentials")[0];
  if (!creds) {
    throw new Error("Signin response missing <credentials>.");
  }

  const token = creds.getAttribute("token");
  const siteElem = creds.getElementsByTagName("site")[0];
  const siteId = siteElem ? siteElem.getAttribute("id") : null;

  const userElem = creds.getElementsByTagName("user")[0];
  const userName = userElem ? userElem.getAttribute("name") : null;

  if (!token || !siteId) {
    throw new Error("Signin response missing token or site id.");
  }

  return { authToken: token, siteId, userName };
}

async function fetchWorkbooks() {
  const url = `${DOMAIN}/api/${API_VERSION}/sites/${encodeURIComponent(
    session.siteId
  )}/workbooks?pageSize=1000`;

  const res = await fetch(url, {
    headers: { "X-Tableau-Auth": session.authToken },
  });

  if (!res.ok) {
    throw new Error(`Workbooks failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");

  const wbs = Array.from(doc.getElementsByTagName("workbook")).map((wb) => ({
    id: wb.getAttribute("id"),
    name: wb.getAttribute("name"),
  }));

  return wbs;
}

async function fetchViews(workbookId) {
  const url = `${DOMAIN}/api/${API_VERSION}/sites/${encodeURIComponent(
    session.siteId
  )}/workbooks/${encodeURIComponent(workbookId)}/views`;

  const res = await fetch(url, {
    headers: { "X-Tableau-Auth": session.authToken },
  });

  if (!res.ok) {
    throw new Error(`Views failed: HTTP ${res.status}`);
  }

  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");

  const vs = Array.from(doc.getElementsByTagName("view")).map((v) => ({
    id: v.getAttribute("id"),
    name: v.getAttribute("name"),
  }));

  return vs;
}

async function fetchViewData(viewId) {
  const url = `${DOMAIN}/api/${API_VERSION}/sites/${encodeURIComponent(
    session.siteId
  )}/views/${encodeURIComponent(viewId)}/data`;

  const res = await fetch(url, {
    headers: { "X-Tableau-Auth": session.authToken },
  });

  if (!res.ok) {
    throw new Error(`Data failed: HTTP ${res.status}`);
  }

  const csvText = await res.text();

  // Use PapaParse to parse CSV
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors && parsed.errors.length) {
    console.warn("CSV parse errors:", parsed.errors);
  }

  const cols = parsed.meta.fields || [];
  const rows = parsed.data || [];

  return { columns: cols, rows: rows };
}

// ===== UI updating functions =====

function populateWorkbookDropdown() {
  const sel = document.getElementById("workbook-select");
  sel.innerHTML = "";

  currentWorkbooks.forEach((wb) => {
    const opt = document.createElement("option");
    opt.value = wb.id;
    opt.textContent = wb.name;
    sel.appendChild(opt);
  });
}

function populateViewDropdown() {
  const sel = document.getElementById("view-select");
  sel.innerHTML = "";

  currentViews.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.name;
    sel.appendChild(opt);
  });
}

function renderTable() {
  const container = document.getElementById("table-container");
  container.innerHTML = "";

  const cols = currentData.columns;
  const rows = currentData.rows;

  if (!cols.length || !rows.length) {
    container.textContent = "No data loaded.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.slice(0, 100).forEach((row) => {
    const tr = document.createElement("tr");
    cols.forEach((c) => {
      const td = document.createElement("td");
      td.textContent = row[c];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function initChartConfig(columns) {
  const container = document.getElementById("charts-config");
  container.innerHTML = "";

  for (let i = 0; i < 4; i++) {
    const div = document.createElement("div");
    div.className = "chart-config";
    div.dataset.index = String(i);

    const title = document.createElement("h3");
    title.textContent = `Chart ${i + 1}`;
    div.appendChild(title);

    // X selector
    const labelX = document.createElement("label");
    labelX.textContent = "X (category):";
    div.appendChild(labelX);

    const selectX = document.createElement("select");
    selectX.className = "cfg-x";
    const emptyOptX = document.createElement("option");
    emptyOptX.value = "";
    emptyOptX.textContent = "-- none --";
    selectX.appendChild(emptyOptX);
    columns.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectX.appendChild(opt);
    });
    div.appendChild(selectX);

    // Y selector
    const labelY = document.createElement("label");
    labelY.textContent = "Y (numeric, optional):";
    div.appendChild(labelY);

    const selectY = document.createElement("select");
    selectY.className = "cfg-y";
    const emptyOptY = document.createElement("option");
    emptyOptY.value = "";
    emptyOptY.textContent = "-- count --";
    selectY.appendChild(emptyOptY);
    columns.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectY.appendChild(opt);
    });
    div.appendChild(selectY);

    // Type selector
    const labelT = document.createElement("label");
    labelT.textContent = "Chart type:";
    div.appendChild(labelT);

    const selectT = document.createElement("select");
    selectT.className = "cfg-type";
    ["bar", "line", "pie"].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      selectT.appendChild(opt);
    });
    selectT.value = "bar";
    div.appendChild(selectT);

    container.appendChild(div);
  }
}

// ===== Charts =====

function generateDashboard() {
  const container = document.getElementById("dashboard-container");
  container.innerHTML = "";

  charts.forEach((ch) => ch.destroy());
  charts = [];

  const cols = currentData.columns;
  const rows = currentData.rows;

  if (!cols.length || !rows.length) {
    setStatus("No data loaded. Please load data first.");
    return;
  }

  const cfgDivs = document.querySelectorAll(".chart-config");

  cfgDivs.forEach((cfgDiv, index) => {
    const selectX = cfgDiv.querySelector(".cfg-x");
    const selectY = cfgDiv.querySelector(".cfg-y");
    const selectT = cfgDiv.querySelector(".cfg-type");

    const xCol = selectX.value;
    const yCol = selectY.value || null;
    const type = (selectT.value || "bar").toLowerCase();

    if (!xCol) {
      return; // skip chart if X not selected
    }

    const grouped = {};
    rows.forEach((row) => {
      const key = String(row[xCol]);
      let val = 1;

      if (yCol) {
        const raw = row[yCol];
        const num = parseFloat(
          String(raw || "").replace(/,/g, "").replace(/[^\d.-]/g, "")
        );
        if (!Number.isNaN(num)) {
          val = num;
        }
      }

      if (!(key in grouped)) grouped[key] = 0;
      grouped[key] += val;
    });

    const labels = Object.keys(grouped).slice(0, 10);
    const values = labels.map((k) => grouped[k]);

    const slot = document.createElement("div");
    slot.className = "chart-slot";
    const canvas = document.createElement("canvas");
    slot.appendChild(canvas);
    container.appendChild(slot);

    const ctx = canvas.getContext("2d");

    let chartType = "bar";
    if (type === "line") chartType = "line";
    if (type === "pie") chartType = "pie";

    const chart = new Chart(ctx, {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: yCol ? `${yCol} by ${xCol}` : `Count by ${xCol}`,
            data: values,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#fff", font: { size: 9 } },
          },
          title: {
            display: true,
            text: `Chart ${index + 1}`,
            color: "#fff",
            font: { size: 11, weight: "bold" },
          },
        },
        scales:
          chartType === "pie"
            ? {}
            : {
                x: { ticks: { color: "#fff", font: { size: 9 } } },
                y: { ticks: { color: "#fff", font: { size: 9 } } },
              },
      },
    });

    charts.push(chart);
  });

  if (!charts.length) {
    setStatus("No charts configured. Choose X columns and try again.");
  } else {
    setStatus(`Rendered ${charts.length} chart(s).`);
  }
}

// ===== Event handlers =====

async function handleLogin() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const siteContentUrl = document.getElementById("login-site").value.trim();

  if (!username || !password) {
    setLoginInfo("Please enter username and password.");
    return;
  }

  setStatus("Signing in to Tableau...");
  setLoginInfo("");

  try {
    const res = await tableauSignin(username, password, siteContentUrl);
    session.authToken = res.authToken;
    session.siteId = res.siteId;
    session.userName = res.userName;

    setUserName(res.userName);
    setStatus("Connected to Tableau.");
    setLoginInfo("Successfully connected.");

    // Auto-load workbooks
    await handleLoadWorkbooks();
  } catch (err) {
    console.error("Login error:", err);
    setStatus("Login failed.");
    setLoginInfo(err.message);
  }
}

async function handleLoadWorkbooks() {
  if (!session.authToken || !session.siteId) {
    setStatus("Please log in first.");
    return;
  }

  setStatus("Loading workbooks...");
  try {
    currentWorkbooks = await fetchWorkbooks();
    populateWorkbookDropdown();
    setStatus(`Loaded ${currentWorkbooks.length} workbooks.`);
  } catch (err) {
    console.error("Workbooks error:", err);
    setStatus("Failed to load workbooks.");
  }
}

async function handleLoadViews() {
  if (!session.authToken || !session.siteId) {
    setStatus("Please log in first.");
    return;
  }

  const wbSel = document.getElementById("workbook-select");
  const workbookId = wbSel.value;
  if (!workbookId) {
    setStatus("Please select a workbook.");
    return;
  }

  setStatus("Loading views...");
  try {
    currentViews = await fetchViews(workbookId);
    populateViewDropdown();
    setStatus(`Loaded ${currentViews.length} views.`);
  } catch (err) {
    console.error("Views error:", err);
    setStatus("Failed to load views.");
  }
}

async function handleLoadData() {
  if (!session.authToken || !session.siteId) {
    setStatus("Please log in first.");
    return;
  }

  const viewSel = document.getElementById("view-select");
  const viewId = viewSel.value;
  if (!viewId) {
    setStatus("Please select a view.");
    return;
  }

  setStatus("Loading view data...");
  try {
    const data = await fetchViewData(viewId);
    currentData = data;

    document.getElementById(
      "data-info"
    ).textContent = `Loaded ${data.rows.length} rows, ${data.columns.length} columns.`;

    renderTable();
    initChartConfig(data.columns);
    setStatus("Data loaded successfully.");
  } catch (err) {
    console.error("Data error:", err);
    setStatus("Failed to load view data.");
  }
}

// ===== Wire up events =====
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-login").addEventListener("click", handleLogin);
  document
    .getElementById("btn-load-workbooks")
    .addEventListener("click", handleLoadWorkbooks);
  document
    .getElementById("btn-load-views")
    .addEventListener("click", handleLoadViews);
  document
    .getElementById("btn-load-data")
    .addEventListener("click", handleLoadData);
  document
    .getElementById("btn-generate-dashboard")
    .addEventListener("click", generateDashboard);

  setStatus("Please log in.");
});
