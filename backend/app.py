import os
import uuid
import threading
from datetime import datetime, timedelta
from functools import wraps

import pytz
from dateutil import parser as date_parser
from flask import Flask, jsonify, request, abort
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup

APP = Flask(__name__)

# Configuration
LMS_BASE = os.environ.get("LMS_BASE", "https://lms.ssn.edu.in")
SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_SECONDS", 1800))  # 30 minutes
ALLOWED_ORIGINS = os.environ.get("EXTENSION_ORIGINS", "*")

# CORS: for dev set EXTENSION_ORIGINS to explicit chrome-extension origin
if ALLOWED_ORIGINS == "*":
    CORS(APP, resources={r"/api/*": {"origins": "*"}})
else:
    CORS(APP, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

# In-memory session store: token -> { session: requests.Session, expires_at: datetime, user: {...} }
SESSION_STORE = {}
STORE_LOCK = threading.Lock()


def cleanup_sessions_loop():
    while True:
        now = datetime.utcnow()
        to_delete = []
        with STORE_LOCK:
            for token, rec in list(SESSION_STORE.items()):
                if rec.get("expires_at") and rec["expires_at"] < now:
                    to_delete.append(token)
            for token in to_delete:
                try:
                    del SESSION_STORE[token]
                except KeyError:
                    pass
        # Sleep for a minute
        threading.Event().wait(60)


# start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_sessions_loop, daemon=True)
cleanup_thread.start()


def make_token():
    return uuid.uuid4().hex


def require_token(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"ok": False, "error": "missing token"}), 401
        token = auth[len("Bearer "):]
        with STORE_LOCK:
            rec = SESSION_STORE.get(token)
        if not rec:
            return jsonify({"ok": False, "error": "invalid or expired token"}), 401
        # refresh TTL
        rec["expires_at"] = datetime.utcnow() + timedelta(seconds=SESSION_TTL_SECONDS)
        request._lms_session = rec["session"]
        request._lms_user = rec.get("user")
        request._lms_token = token
        return f(*args, **kwargs)

    return wrapper


@APP.route("/api/login", methods=["POST"])
def api_login():
    print(f"Login request received. Content-Type: {request.content_type}")
    print(f"Raw data: {request.get_data()}")
    
    try:
        payload = request.get_json(force=True)
        print(f"Parsed JSON: {payload}")
    except Exception as e:
        print(f"JSON parsing error: {e}")
        return jsonify({"ok": False, "error": "invalid JSON"}), 400
    
    email = payload.get("email") if payload else None
    password = payload.get("password") if payload else None
    
    print(f"Email: {email}, Password: {'***' if password else None}")
    
    if not email or not password:
        return jsonify({"ok": False, "error": "missing credentials"}), 400

    sess = requests.Session()
    sess.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0"
    })

    try:
        # GET login page to collect any hidden tokens
        login_page = sess.get(f"{LMS_BASE}/login/index.php", timeout=15)
        print(f"Login page status: {login_page.status_code}")
    except Exception as e:
        print(f"Cannot reach LMS: {e}")
        return jsonify({"ok": False, "error": "cannot reach LMS"}), 502

    soup = BeautifulSoup(login_page.text, "html.parser")
    
    # Save login page for debugging
    with open('debug_login_page.html', 'w', encoding='utf-8') as f:
        f.write(login_page.text)
    print("Login page saved to debug_login_page.html")

    # Find the login form and extract all hidden fields
    login_form = soup.find("form", {"id": "login"}) or soup.find("form", {"method": "post"})
    data = {}
    
    if login_form:
        # Extract all hidden input fields
        for hidden in login_form.find_all("input", {"type": "hidden"}):
            name = hidden.get("name")
            value = hidden.get("value", "")
            if name:
                data[name] = value
                print(f"Found hidden field: {name} = {value}")
    
    # Look for typical Moodle logintoken field
    token_field = soup.find("input", attrs={"name": "logintoken"})
    if token_field:
        data["logintoken"] = token_field.get("value", "")
        print(f"Found logintoken: {data['logintoken']}")

    # Add required fields based on the actual form structure
    data["anchor"] = ""  # Required by SSN LMS
    data["username"] = email
    data["password"] = password

    print(f"Posting login data: {data}")
    
    # Update headers for POST request
    sess.headers.update({
        "Referer": f"{LMS_BASE}/login/index.php",
        "Origin": LMS_BASE,
        "Content-Type": "application/x-www-form-urlencoded",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1"
    })
    
    try:
        r = sess.post(f"{LMS_BASE}/login/index.php", data=data, timeout=15, allow_redirects=True)
        print(f"Login POST status: {r.status_code}")
        print(f"Login POST URL after redirects: {r.url}")
    except Exception as e:
        print(f"Login POST error: {e}")
        return jsonify({"ok": False, "error": "login request failed"}), 502

    # After login attempt, check if /my/ or dashboard accessible and shows logged in
    try:
        dash = sess.get(f"{LMS_BASE}/my/", timeout=15)
        print(f"Dashboard status: {dash.status_code}")
        print(f"Dashboard URL: {dash.url}")
        print(f"Dashboard contains 'logout': {'logout' in dash.text.lower()}")
        print(f"Dashboard contains 'my courses': {'my courses' in dash.text.lower()}")
    except Exception as e:
        print(f"Dashboard fetch error: {e}")
        return jsonify({"ok": False, "error": "cannot fetch dashboard"}), 502

    # Heuristic: if response contains 'logout' link or user's fullname, consider success
    if dash.status_code == 200 and ("logout" in dash.text.lower() or "my courses" in dash.text.lower()):
        # try to extract display name
        dsoup = BeautifulSoup(dash.text, "html.parser")
        name = None
        # common Moodle places
        user_menu = dsoup.select_one("#action-menu-toggle-1, .usermenu, .usermenu .dropdown")
        if user_menu:
            name = user_menu.get_text(strip=True)
        if not name:
            # fallback: find element with class 'fullname'
            fn = dsoup.select_one(".usertext, .fullname")
            if fn:
                name = fn.get_text(strip=True)
        user = {"email": email, "name": name or "(unknown)"}
        token = make_token()
        expires = datetime.utcnow() + timedelta(seconds=SESSION_TTL_SECONDS)
        with STORE_LOCK:
            SESSION_STORE[token] = {"session": sess, "expires_at": expires, "user": user}

        print(f"Login successful for user: {user}")
        return jsonify({"ok": True, "token": token, "user": user})
    else:
        print(f"Login failed - dashboard check failed")
        # Save dashboard content for debugging
        with open('debug_dashboard.html', 'w', encoding='utf-8') as f:
            f.write(dash.text)
        print("Dashboard content saved to debug_dashboard.html")
        return jsonify({"ok": False, "error": "invalid credentials"}), 400


@APP.route("/api/logout", methods=["POST"])
@require_token
def api_logout():
    token = request._lms_token
    with STORE_LOCK:
        if token in SESSION_STORE:
            del SESSION_STORE[token]
    return jsonify({"ok": True})


@APP.route("/api/courses", methods=["GET"])
@require_token
def api_courses():
    sess = request._lms_session
    try:
        r = sess.get(f"{LMS_BASE}/my/", timeout=15)
    except Exception:
        return jsonify({"ok": False, "error": "failed to fetch dashboard"}), 502

    soup = BeautifulSoup(r.text, "html.parser")
    courses = []

    # Moodle theme variations: look for links to course/view.php?id=NNN
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/course/view.php" in href:
            title = a.get_text(strip=True)
            # avoid duplicates
            course_id = None
            try:
                # parse id= from query
                if "id=" in href:
                    course_id = href.split("id=")[-1].split("&")[0]
            except Exception:
                course_id = None
            courses.append({"id": course_id or "", "title": title, "link": href})

    # dedupe by title+id
    seen = set()
    uniq = []
    for c in courses:
        key = (c.get("id"), c.get("title"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)

    return jsonify(uniq)


def _parse_due_date(text):
    # Try to parse date text into aware datetime in Asia/Kolkata
    if not text:
        return None
    try:
        dt = date_parser.parse(text, fuzzy=True)
    except Exception:
        return None
    # If naive, assume local timezone of Asia/Kolkata
    if dt.tzinfo is None:
        tz = pytz.timezone("Asia/Kolkata")
        dt = tz.localize(dt)
    else:
        dt = dt.astimezone(pytz.timezone("Asia/Kolkata"))
    return dt


@APP.route("/api/deadlines", methods=["GET"])
@require_token
def api_deadlines():
    filter_mode = request.args.get("filter", "all")
    sess = request._lms_session
    try:
        r = sess.get(f"{LMS_BASE}/mod/assign/index.php?id=1", timeout=15)
    except Exception:
        # fallback to dashboard page
        try:
            r = sess.get(f"{LMS_BASE}/my/", timeout=15)
        except Exception:
            return jsonify({"ok": False, "error": "failed to fetch assignments"}), 502

    soup = BeautifulSoup(r.text, "html.parser")

    items = []

    # Attempt to find assignment rows
    # Try Moodle assignment tables and lists
    for row in soup.select("tr"):  # rough scan
        text = row.get_text(" ", strip=True)
        if "assignment" in text.lower() or "due" in text.lower():
            # attempt to extract link and date
            a = row.find("a", href=True)
            title = a.get_text(strip=True) if a else (row.find("td").get_text(strip=True) if row.find("td") else "")
            link = a["href"] if a else ""
            # find date-like text in row
            date_text = None
            for small in row.find_all(text=True):
                t = small.strip()
                if t and any(k in t.lower() for k in ("due", "deadline", ":")):
                    date_text = t
                    break
            due_dt = _parse_due_date(date_text) if date_text else None
            items.append({
                "assignment_id": link.split("#")[-1] if link else title,
                "title": title,
                "course": "",
                "course_id": "",
                "due_at": due_dt.isoformat() if due_dt else None,
                "status": "unknown",
            })

    # If nothing found, try another approach: find elements with 'deadline' class
    if not items:
        for el in soup.select(".deadline, .duedate, .submissionduedate"):
            title = el.get_text(strip=True)
            due_dt = _parse_due_date(title)
            items.append({
                "assignment_id": title,
                "title": title,
                "course": "",
                "course_id": "",
                "due_at": due_dt.isoformat() if due_dt else None,
                "status": "unknown",
            })

    # Filter overdue if requested
    now = datetime.now(pytz.timezone("Asia/Kolkata"))
    results = []
    for it in items:
        if not it.get("due_at"):
            continue
        try:
            dt = date_parser.isoparse(it["due_at"]).astimezone(pytz.timezone("Asia/Kolkata"))
        except Exception:
            continue
        overdue = dt < now
        if filter_mode == "overdue" and not overdue:
            continue
        if filter_mode == "upcoming" and overdue:
            continue
        if overdue:
            it["status"] = "not_submitted"
        results.append(it)

    return jsonify(results)


if __name__ == "__main__":
    # For dev only. Use a real WSGI server in production.
    port = int(os.environ.get("PORT", 5000))
    APP.run(host="0.0.0.0", port=port, debug=True)
