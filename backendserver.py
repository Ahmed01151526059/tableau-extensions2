from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import xml.etree.ElementTree as ET
import pandas as pd
from io import StringIO
import json

# ===== Tableau Server details (same method as before) =====
DOMAIN = "https://prod-ch-a.online.tableau.com"
API_VERSION = "3.25"
SITE_CONTENT_URL = ""  # set if you use a named site, else leave empty for default

# ===== Ollama (local LLM) =====
OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL = "llama3"  # change if you use a different model

app = Flask(__name__)
CORS(app)


def _coerce_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Convert mostly-numeric object columns into numeric dtype."""
    for col in df.columns:
        if df[col].dtype == object:
            try:
                cleaned = df[col].replace(",", "", regex=True)
                numeric = pd.to_numeric(cleaned, errors="coerce")
                # if at least 60% of values become numeric, keep it
                if numeric.notna().mean() > 0.6:
                    df[col] = numeric
            except Exception:
                pass
    return df


def call_ollama(prompt: str, timeout: int = 180) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/generate", json=payload, timeout=timeout)
        if resp.status_code != 200:
            return f"(Ollama error: HTTP {resp.status_code})"
        data = resp.json()
        return data.get("response", "").strip() or "(No response from model.)"
    except Exception as e:
        return f"(Error calling Ollama: {e})"


# ======== Tableau REST endpoints ========

@app.route("/signin", methods=["POST"])
def signin():
    """
    Body: { "username": "...", "password": "...", "siteContentUrl": "" }
    Returns: { "authToken": "...", "siteId": "...", "message": "..." }
    """
    body = request.get_json(silent=True) or {}
    username = body.get("username", "").strip()
    password = body.get("password", "").strip()
    site_content_url = body.get("siteContentUrl", SITE_CONTENT_URL)

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    signin_url = f"{DOMAIN}/api/{API_VERSION}/auth/signin"
    payload = f"""
    <tsRequest>
      <credentials name="{username}" password="{password}">
        <site contentUrl="{site_content_url}" />
      </credentials>
    </tsRequest>
    """
    headers = {"Content-Type": "application/xml"}

    try:
        resp = requests.post(
            signin_url,
            data=payload,
            headers=headers,
            verify=False,  # match your Tkinter code behavior
            timeout=60,
        )
        if resp.status_code != 200:
            return jsonify({"error": "Login failed: invalid username or password."}), 401

        namespace = {"t": "http://tableau.com/api"}
        root = ET.fromstring(resp.text)
        creds = root.find(".//t:credentials", namespace)
        if creds is None:
            return jsonify({"error": "Login failed: invalid credentials."}), 401

        auth_token = creds.attrib["token"]
        site_elem = creds.find("t:site", namespace)
        site_id = site_elem.attrib["id"]

        return jsonify({
            "authToken": auth_token,
            "siteId": site_id,
            "message": "Successfully connected to Tableau Server."
        })
    except Exception as e:
        return jsonify({"error": f"Connection failed: {e}"}), 500


@app.route("/workbooks", methods=["GET"])
def get_workbooks():
    """
    Query params: authToken, siteId
    Returns: { "workbooks": [ { "id": "...", "name": "..." }, ... ] }
    """
    auth_token = request.args.get("authToken", "")
    site_id = request.args.get("siteId", "")

    if not auth_token or not site_id:
        return jsonify({"error": "authToken and siteId are required."}), 400

    headers = {"x-tableau-auth": auth_token}
    url = f"{DOMAIN}/api/{API_VERSION}/sites/{site_id}/workbooks?pageSize=1000"

    try:
        resp = requests.get(url, headers=headers, verify=False, timeout=60)
        if resp.status_code != 200:
            return jsonify({"error": f"Failed to get workbooks: HTTP {resp.status_code}"}), 500

        namespace = {"t": "http://tableau.com/api"}
        root = ET.fromstring(resp.text)
        workbooks = [
            {"id": wb.attrib["id"], "name": wb.attrib["name"]}
            for wb in root.findall(".//t:workbook", namespace)
        ]
        return jsonify({"workbooks": workbooks})
    except Exception as e:
        return jsonify({"error": f"Error reading workbooks: {e}"}), 500


@app.route("/views", methods=["GET"])
def get_views():
    """
    Query params: authToken, siteId, workbookId
    Returns: { "views": [ { "id": "...", "name": "..." }, ... ] }
    """
    auth_token = request.args.get("authToken", "")
    site_id = request.args.get("siteId", "")
    workbook_id = request.args.get("workbookId", "")

    if not auth_token or not site_id or not workbook_id:
        return jsonify({"error": "authToken, siteId and workbookId are required."}), 400

    headers = {"x-tableau-auth": auth_token}
    url = f"{DOMAIN}/api/{API_VERSION}/sites/{site_id}/workbooks/{workbook_id}/views"

    try:
        resp = requests.get(url, headers=headers, verify=False, timeout=60)
        if resp.status_code != 200:
            return jsonify({"error": f"Failed to get views: HTTP {resp.status_code}"}), 500

        namespace = {"t": "http://tableau.com/api"}
        root = ET.fromstring(resp.text)
        views = [
            {"id": v.attrib["id"], "name": v.attrib["name"]}
            for v in root.findall(".//t:view", namespace)
        ]
        return jsonify({"views": views})
    except Exception as e:
        return jsonify({"error": f"Error reading views: {e}"}), 500


@app.route("/view-data", methods=["GET"])
def get_view_data():
    """
    Query params: authToken, siteId, viewId
    Returns: { "columns": [...], "rows": [ {col: value, ...}, ... ] }
    """
    auth_token = request.args.get("authToken", "")
    site_id = request.args.get("siteId", "")
    view_id = request.args.get("viewId", "")

    if not auth_token or not site_id or not view_id:
        return jsonify({"error": "authToken, siteId and viewId are required."}), 400

    headers = {"x-tableau-auth": auth_token}
    url = f"{DOMAIN}/api/{API_VERSION}/sites/{site_id}/views/{view_id}/data"

    try:
        resp = requests.get(url, headers=headers, verify=False, timeout=60)
        if resp.status_code != 200:
            return jsonify({"error": f"Failed to get view data: HTTP {resp.status_code}"}), 500

        df = pd.read_csv(StringIO(resp.text))
        df = _coerce_numeric_columns(df)

        columns = list(df.columns)
        rows = df.to_dict(orient="records")
        return jsonify({"columns": columns, "rows": rows})
    except Exception as e:
        return jsonify({"error": f"Error reading view data: {e}"}), 500


# ======== AI: chat & dashboard ========

@app.route("/chat", methods=["POST"])
def chat():
    """
    Body: { "question": "text", "data": [ {...}, {...}, ... ] }
    """
    body = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()
    rows = body.get("data", [])

    if not question:
        return jsonify({"answer": "No question provided."}), 400

    df = pd.DataFrame(rows)
    schema_lines = [f"- {col} ({str(dtype)})" for col, dtype in df.dtypes.items()]
    full_rows = df.to_dict(orient="records")

    prompt_parts = [
        "You are a helpful data analyst assistant.",
        "You must answer ONLY based on the provided table data.",
        "If something is not clearly supported by the data, say you are not sure briefly.",
        "",
        "Table schema (columns and dtypes):",
        "\n".join(schema_lines),
        "",
        "Full table as JSON (each row is a dict):",
        json.dumps(full_rows, ensure_ascii=False),
        "",
        f"User question: {question}",
        "Answer concisely.",
    ]
    prompt = "\n".join(prompt_parts)

    answer = call_ollama(prompt)
    return jsonify({"answer": answer})


@app.route("/ai-dashboard", methods=["POST"])
def ai_dashboard():
    """
    Body: { "data": [ {...}, ... ] }
    Returns: { "charts": [ {title,type,x,y,agg}, ... ] }
    """
    body = request.get_json(silent=True) or {}
    rows = body.get("data", [])
    df = pd.DataFrame(rows)

    if df.empty:
        return jsonify({"error": "No data provided."}), 400

    schema_lines = [f"- {col} ({str(dtype)})" for col, dtype in df.dtypes.items()]
    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    text_cols = [c for c in df.columns if c not in numeric_cols]

    prompt_parts = [
        "You are a senior BI analyst.",
        "Design a compact but insightful dashboard from the provided table.",
        "Return ONLY valid JSON, no explanation, no markdown, no comments.",
        "",
        "Use this JSON schema EXACTLY:",
        '{ "charts": [',
        '  { "title": "string", "type": "bar|line|pie", "x": "column_name", "y": "column_name or null", "agg": "sum|mean|count" }',
        "] }",
        "",
        "Rules:",
        "- Use only existing column names.",
        "- Prefer numeric columns for y.",
        "- x should usually be a categorical or date column.",
        "- Use 2 to 4 charts.",
        "",
        "Table schema:",
        "\n".join(schema_lines),
        "",
        "Numeric columns:",
        ", ".join(numeric_cols) if numeric_cols else "None",
        "Other columns:",
        ", ".join(text_cols) if text_cols else "None",
    ]
    prompt = "\n".join(prompt_parts)

    raw = call_ollama(prompt)
    text = raw.strip()

    # Clean possible ```json fences
    if text.startswith("```"):
        first_nl = text.find("\n")
        if first_nl != -1:
            text = text[first_nl + 1:]
        text = text.replace("```", "")

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return jsonify({"error": "AI did not return recognizable JSON.", "raw": raw}), 400

    json_text = text[start:end + 1]
    try:
        spec = json.loads(json_text)
    except json.JSONDecodeError as e:
        if "Extra data" in str(e):
            try:
                spec = json.loads(json_text[: e.pos])
            except Exception as e2:
                return jsonify({"error": f"Failed to parse AI JSON: {e2}", "raw": raw}), 400
        else:
            return jsonify({"error": f"Failed to parse AI JSON: {e}", "raw": raw}), 400

    if "charts" not in spec or not isinstance(spec["charts"], list):
        return jsonify({"error": "AI JSON has no 'charts' list.", "raw": raw}), 400

    return jsonify(spec)


if __name__ == "__main__":
    # Run backend on localhost:5000
    app.run(host="127.0.0.1", port=5000, debug=True)
