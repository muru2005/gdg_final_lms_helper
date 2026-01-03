import os
import io
import re
import json
import base64
import time
import socket  # Added for LAN IP detection
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from PyPDF2 import PdfReader
from groq import Groq
import chromadb
from flask_cors import cross_origin
from chromadb.utils import embedding_functions
from dotenv import load_dotenv
import asyncio
import time
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import firebase_admin
from firebase_admin import credentials, firestore
from dateutil import parser as date_parser
import hashlib
SCOPES = ["https://www.googleapis.com/auth/forms.body"]
from drive import (
    get_drive_service,
    get_or_create_folder,
    upload_pdf,
    summary_json_to_pdf)

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import FieldFilter
import smtplib
import secrets
from datetime import datetime,timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from googleapiclient.http import MediaIoBaseUpload
import io  # Add this if you use io.BytesIO
from io import BytesIO  # OR add this to use BytesIO directly
# 1. INITIALIZATION
load_dotenv()
app = Flask(__name__)

# Enable CORS for Chrome Extension and Local Dev
CORS(app, origins=["*"], supports_credentials=True)

# AI Setup
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
GA_MEASUREMENT_ID = os.getenv("GA_MEASUREMENT_ID")
GA_API_SECRET = os.getenv("GA_API_SECRET")

# ChromaDB Setup
CHROMA_PATH = ".chromadb"
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)
# Firebase Setup
cred = credentials.Certificate("firebase-service-account.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
BASE_URL = os.getenv("BASE_URL")

# In-Memory Cache for Session Data
PROCESSED_FILES = {}

# --- NEW LAN IP HELPER ---

def get_lan_ip():
    """Dynamically finds the local network IP of this machine"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # This doesn't actually need to reach the IP
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

# --- HELPER FUNCTIONS ---

def extract_text_from_bytes(pdf_bytes):
    """Parses raw PDF bytes into a single text string"""
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            content = page.extract_text()
            if content:
                text += content + "\n"
        return text
    except Exception as e:
        print(f"❌ PDF Extraction Error: {e}")
        return ""

def split_text(text: str, chunk_size=800, overlap=150):
    """Splits text into chunks for better AI context"""
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        start += chunk_size - overlap
    return chunks

def get_file_collection(file_path: str):
    """Creates a valid ChromaDB collection name from a URL"""
    # ChromaDB requires alpha-numeric start/end
    file_id = re.sub(r'[^a-zA-Z0-9]', '_', file_path)
    collection_name = f"c_{file_id}"[-60:].strip("_")
    return chroma_client.get_or_create_collection(
        name=collection_name,
        embedding_function=embedding_function
    )
def get_calendar_gmail_services(token):
    """Builds the Calendar and Gmail services using the smuggled token."""
    creds = Credentials(token=token)
    cal_service = build('calendar', 'v3', credentials=creds)
    gmail_service = build('gmail', 'v1', credentials=creds)
    return cal_service, gmail_service

def parse_dd_mm_yyyy(date_str):
    """Standard SSN Date Parser"""
    return datetime.strptime(date_str.strip(), "%d-%m-%Y").date()

def delete_existing_calendar_event(service, summary, date_str):
    """Finds and deletes any existing event with this summary on this date."""
    target_date = parse_dd_mm_yyyy(date_str)
    t_min = datetime.combine(target_date, datetime.min.time()).isoformat() + 'Z'
    t_max = datetime.combine(target_date, datetime.max.time()).isoformat() + 'Z'
    
    events_result = service.events().list(
        calendarId='primary', timeMin=t_min, timeMax=t_max, 
        singleEvents=True, q=summary
    ).execute()
    
    events = events_result.get('items', [])
    for event in events:
        if event.get('summary') == summary:
            service.events().delete(calendarId='primary', eventId=event['id']).execute()

def create_calendar_event_body(summary, start_str, end_str=None, description=""):
    """Formats the JSON for Google Calendar API"""
    start_date = parse_dd_mm_yyyy(start_str)
    if end_str:
        # Google Calendar 'end' for all-day events is exclusive (Day + 1)
        end_date = parse_dd_mm_yyyy(end_str) + timedelta(days=1)
    else:
        end_date = start_date + timedelta(days=1)

    return {
        'summary': summary,
        'description': description,
        'start': {'date': start_date.isoformat(), 'timeZone': 'Asia/Kolkata'},
        'end': {'date': end_date.isoformat(), 'timeZone': 'Asia/Kolkata'},
    }

# --- API ROUTES ---
@app.route('/sync-calendar', methods=['POST', 'OPTIONS'])
@cross_origin()
def sync_calendar():
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    data = request.json
    token = data.get('token')
    if not token: 
        return jsonify({"ok": False, "error": "No token provided"}), 400

    try:
        cal_service, gmail_service = get_calendar_gmail_services(token)
        today = datetime.now().date()
        stats = {"circulars_synced": 0, "academic_events_refreshed": 0}

        # 1. REFRESH GMAIL CIRCULARS (Search principal's office)
        query = 'from:principalsoffice@ssn.edu.in newer_than:7d'
        results = gmail_service.users().messages().list(userId='me', q=query).execute()
        
        for msg in results.get('messages', []):
            msg_data = gmail_service.users().messages().get(userId='me', id=msg['id']).execute()
            content = msg_data.get('snippet', '')
            
            # 🔍 REFINED REGEX: Non-greedy match (.*?) stops at the first date it finds
            pattern = r'(working day|holiday)\s+(?:on|for)\s+(.*?(?:202\d|January|February|March|April|May|June|July|August|September|October|November|December))'
            matches = re.finditer(pattern, content, re.IGNORECASE)
            
            for match in matches:
                e_type = match.group(1).title()
                date_text = match.group(2).strip()
                summary = f"SSN: {e_type}"
                
                print(f"🔍 Processing: {e_type} | Text: '{date_text}'")
                
                try:
                    # Extract ALL numbers (days) from this specific match
                    days = re.findall(r'\d+', date_text)
                    
                    # Find the month in the snippet
                    month_match = re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)', content, re.IGNORECASE)
                    month_str = month_match.group(0) if month_match else "January"

                    for day in days:
                        # 🚨 FIX: Prevent year duplication. 
                        # Only add 2026 if the 'day' isn't already 2026
                        if int(day) > 31: continue # Skip if the "day" is actually a year
                        
                        clean_date_str = f"{day} {month_str} 2026"
                        
                        # 📅 PARSE
                        target_date = date_parser.parse(clean_date_str).date()

                        if target_date >= today:
                            d_str = target_date.strftime("%d-%m-%Y")
                            delete_existing_calendar_event(cal_service, summary, d_str)
                            body = create_calendar_event_body(summary, d_str, description="SSN Admin Circular Sync")
                            cal_service.events().insert(calendarId='primary', body=body).execute()
                            
                            stats["circulars_synced"] += 1
                            print(f"✅ SYNCED: {summary} on {d_str}")
                            
                except Exception as e:
                    print(f"⚠️ Error parsing '{date_text}': {e}")
        # 2. REFRESH FIXED ACADEMIC SCHEDULE
        academic_events = [
            {"summary": "Commencement of Classes (Even Sem)", "start": "15-12-2025", "end": None, "desc": "Academic Schedule 2025-2026"},
            {"summary": "CAT-1 Exams", "start": "30-01-2026", "end": "06-02-2026", "desc": "Continuous Assessment Test 1"},
            {"summary": "Submission of Attendance & CAT-1 Marks", "start": "13-02-2026", "end": None, "desc": "For period 15-12-2025 to 06-02-2026"},
            {"summary": "CAT-2 Exams & CAT-1 for TCP", "start": "17-03-2026", "end": "24-03-2026", "desc": "CAT-2 and CAT-1 for TCP"},
            {"summary": "Submission of Attendance & CAT-2 Marks", "start": "31-03-2026", "end": None, "desc": "For period 09-02-2026 to 24-03-2026"},
            {"summary": "Supplementary Assessment Test (SAT)", "start": "30-03-2026", "end": "01-04-2026", "desc": "SAT"},
            {"summary": "CAT-2 (TCP) & Model Practicals", "start": "02-04-2026", "end": "09-04-2026", "desc": "CAT-2 (TCP) & Model Practicals"},
            {"summary": "Last Working Day", "start": "09-04-2026", "end": None, "desc": "Last working day for Even Semester"},
            {"summary": "Final Submission (Attendance/Marks)", "start": "09-04-2026", "end": None, "desc": "Submission of marks"},
            {"summary": "End Semester Practical Exams", "start": "10-04-2026", "end": "17-04-2026", "desc": "Including TCP courses"},
            {"summary": "End Semester Theory Exams Commence", "start": "24-04-2026", "end": None, "desc": "Commencement of Theory Exams"},
            {"summary": "Re-opening of Higher Semesters (2026-27)", "start": "22-06-2026", "end": None, "desc": "Odd Semester 2026-2027"}
        ]

        for event in academic_events:
            delete_existing_calendar_event(cal_service, event['summary'], event['start'])
            # Pass the 'desc' if your create_calendar_event_body supports it
            body = create_calendar_event_body(
                event['summary'], 
                event['start'], 
                event.get('end'), 
                description=event.get('desc', '')
            )
            cal_service.events().insert(calendarId='primary', body=body).execute()
            stats["academic_events_refreshed"] += 1

        return jsonify({"ok": True, "message": "Demo Refresh Complete!", "details": stats})
    except Exception as e:
        print(f"❌ Calendar Sync Error: {str(e)}")
        return jsonify({"ok": False, "error": str(e)}), 500
    
@app.route('/process-file', methods=['POST'])
def process_file():
    """Receives file bytes from extension and indexes them"""
    data = request.json
    file_path = data.get('file_path')
    base64_data = data.get('pdf_data')

    if not base64_data:
        return jsonify({"error": "No PDF data received"}), 400

    print(f"DEBUG: Processing {file_path}")
    
    try:
        # Decode the file smuggled from the browser
        pdf_bytes = base64.b64decode(base64_data)
        text = extract_text_from_bytes(pdf_bytes)

        if len(text.strip()) < 10:
            return jsonify({"error": "Could not read PDF text"}), 400

        # Store text in memory for Summary and Mindmap
        PROCESSED_FILES[file_path] = {
            "text": text,
            "summary": None,
            "mindmap": None
        }

        # Indexing for Chat
        collection = get_file_collection(file_path)
        chunks = split_text(text)
        
        try: collection.delete(where={}) # Clear old data
        except: pass
        
        collection.add(
            documents=chunks,
            ids=[f"id_{i}_{int(time.time())}" for i in range(len(chunks))]
        )
        print(f"✅ Indexed {len(chunks)} chunks for chat")
        return jsonify({"ok": True})
    except Exception as e:
        print(f"🔥 Process Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/track-event', methods=['POST', 'OPTIONS'])
@cross_origin()
def track_event():
    # 1. Handle Browser Preflight (CORS)
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200

    # 2. Extract Data from Extension
    data = request.json
    event_name = data.get('name', 'unnamed_event')
    params = data.get('params', {})
    user_email = data.get('email', 'anonymous')

    # 3. SETTINGS
    # Changed to False so data actually reaches your dashboard
    DEBUG = False 
    endpoint = "mp/collect" if not DEBUG else "debug/mp/collect"
    
    url = f"https://www.google-analytics.com/{endpoint}?measurement_id={GA_MEASUREMENT_ID}&api_secret={GA_API_SECRET}"

    # 4. THE PAYLOAD
    # GA4 requires a client_id and specific session params to appear in Realtime
    payload = {
        "client_id": user_email if (user_email and user_email != 'anonymous') else "12345.67890",
        "events": [{
            "name": event_name[:40].replace("-", "_"), 
            "params": {
                **params,
                "session_id": "1712215304", 
                "engagement_time_msec": 100,
                "debug_mode": 1 # Leave as 1 to see events in Admin > DebugView
            }
        }]
    }

    try:
        # Send to Google
        response = requests.post(url, json=payload, timeout=5)
        
        # Production returns 204 (No Content), Debug returns 200 (JSON)
        return jsonify({
            "status": "success", 
            "google_response": response.status_code,
            "mode": "production" if not DEBUG else "debug"
        }), 200

    except Exception as e:
        print(f"❌ Analytics Error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500
def extract_digital_id(email):
    match=re.search(r'(\d)@',email)
    if(match):
       return match.group(1)
    return None

def get_file_hash(file_url):
    """Generates a unique 32-character fingerprint for the file."""
    return hashlib.md5(file_url.encode('utf-8')).hexdigest()

@app.route('/generate-summary', methods=['POST'])
def generate_summary():
    data = request.json
    file_path = data.get('file_path')
    user_email = data.get('email', 'unknown@ssn.edu.in')
    force_refresh = data.get('forceRefresh', False)
    
    # --- START WAIT LOGIC ---
    # Give the background 'process-file' thread time to finish extracting text
    max_retries = 25
    retry_count = 0
    
    while file_path not in PROCESSED_FILES and retry_count < max_retries:
        print(f"⏳ File {file_path} not ready. Waiting... ({retry_count + 1}/{max_retries})")
        time.sleep(1)  # Wait 1 second before checking again
        retry_count += 1
    
    if file_path not in PROCESSED_FILES:
        print(f"❌ Error: {file_path} failed to process in time.")
        return jsonify({"error": "File is still being processed. Please wait a moment and try again."}), 400
    # --- END WAIT LOGIC ---

    # 1. Generate IDs
    file_hash = get_file_hash(file_path)
    user_id = extract_digital_id(user_email)

    # 2. CACHE CHECK: Look in Firestore 'ai_content' collection
    doc_ref = db.collection('ai_content').document(file_hash)
    cached_doc = doc_ref.get()

    # Skip cache check if force_refresh is True
    if cached_doc.exists and not force_refresh:
        stored_data = cached_doc.to_dict()
        if "summary_data" in stored_data:
            print(f"📦 Cache Hit: Found summary for {file_hash}")
            return jsonify({
                "summary": stored_data["summary_data"], 
                "isCached": True,
                "status": "success"
            })

    # 3. AI GENERATION (Cache Miss or Force Refresh)
    print(f"🤖 AI Generation Started for: {file_hash} (Force: {force_refresh})")
    text_to_use = PROCESSED_FILES[file_path]["text"][:12000] 
    prompt = f"Summarize this document with bold headings and detailed bullets:\n\n{text_to_use}"
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        summary = response.choices[0].message.content
        
        # 4. SAVE TO FIRESTORE: Store for next time
        doc_ref.set({
            "summary_data": summary,
            "topic_name": data.get('fileName', 'LMS Document'),
            "generated_by_user": user_id,
            "last_updated": firestore.SERVER_TIMESTAMP
        }, merge=True)

        return jsonify({
            "summary": summary, 
            "isCached": False,
            "status": "generated"
        })
    except Exception as e:
        print(f"🔥 AI Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/generate-mindmap', methods=['POST'])
def generate_mindmap():
    data = request.json
    file_path = data.get('file_path')
    user_email = data.get('email', 'unknown@ssn.edu.in')
    force_refresh = data.get('forceRefresh', False)
    
    # --- START WAIT LOGIC ---
    # Give the background 'process-file' thread time to finish extracting text
    max_retries = 25
    retry_count = 0
    
    while file_path not in PROCESSED_FILES and retry_count < max_retries:
        print(f"⏳ MindMap: File {file_path} not ready. Waiting... ({retry_count + 1}/{max_retries})")
        time.sleep(1)  # Wait 1 second before checking again
        retry_count += 1

    if file_path not in PROCESSED_FILES:
        return jsonify({"error": "File text not extracted yet. Please try again in a moment."}), 400
    # --- END WAIT LOGIC ---

    # 1. Generate IDs
    file_hash = get_file_hash(file_path)
    user_id = extract_digital_id(user_email)

    # 2. CACHE CHECK
    doc_ref = db.collection('ai_content').document(file_hash)
    cached_doc = doc_ref.get()

    if cached_doc.exists and not force_refresh:
        stored_data = cached_doc.to_dict()
        if "mindmap_data" in stored_data:
            print(f"📦 Cache Hit: Found MindMap for {file_hash}")
            return jsonify({
                "mindmap": stored_data["mindmap_data"], 
                "isCached": True
            })

    # 3. AI GENERATION
    print(f"🤖 AI MindMap Generation Started for: {file_hash}")
    content = PROCESSED_FILES[file_path].get("summary") or PROCESSED_FILES[file_path]["text"][:10000]
    prompt = f"""
    Return ONLY valid JSON for a mindmap (title/children) based on this:
    {content}
    Rule: Deep nesting (5+ levels). No conversation, just JSON.
    """

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )
        raw = response.choices[0].message.content.strip()
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        
        if json_match:
            parsed = json.loads(json_match.group(0))
            
            # 4. SAVE TO FIRESTORE
            doc_ref.set({
                "mindmap_data": parsed,
                "topic_name": data.get('fileName', 'LMS Document'),
                "generated_by_user": user_id,
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True)
            
            return jsonify({
                "mindmap": parsed,
                "isCached": False
            })
            
        return jsonify({"error": "AI failed to build JSON"}), 500
    except Exception as e:
        print(f"🔥 MindMap Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    """Answers user questions based on document context"""
    data = request.json
    query, file_path = data.get('query'), data.get('file_path')
    
    if file_path not in PROCESSED_FILES:
        return jsonify({"answer": "Document not in memory. Please re-click 'Eye' button."})

    context = ""
    try:
        collection = get_file_collection(file_path)
        results = collection.query(query_texts=[query], n_results=3)
        if results.get("documents"):
            context = " ".join(results["documents"][0])
    except: pass

    if not context:
        context = PROCESSED_FILES[file_path]['text'][:4000]

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": f"Context: {context}\n\nQuestion: {query}"}],
            temperature=0
        )
        return jsonify({"answer": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"answer": f"Error: {str(e)}"}), 200
async def generate_quiz_questions(text: str):
    """Generates 5 MCQs using Llama-3 (Groq) with robust JSON extraction"""
    prompt = f"""
    Create a quiz based on the following text:
    {text[:12000]}
    
    Generate 5 Multiple Choice Questions (MCQs).
    OUTPUT ONLY A VALID JSON ARRAY. No intro, no explanation.
    FORMAT:
    [
        {{
            "question": "Question text here",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_answer": "Option A"
        }}
    ]
    """
    
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1, # Lower temperature for more stable JSON
        max_tokens=2000
    )
    
    raw_content = response.choices[0].message.content.strip()
    
    try:
        # --- ROBUST JSON EXTRACTION ---
        # This finds the actual [...] part even if the AI says "Here is your JSON:"
        json_match = re.search(r'\[\s*\{.*\}\s*\]', raw_content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(0))
        
        # Fallback to cleaning backticks
        clean_content = re.sub(r'```json|```', '', raw_content).strip()
        return json.loads(clean_content)
        
    except Exception as e:
        print(f"❌ AI JSON Parse Failed. Raw content: {raw_content[:100]}...")
        raise Exception(f"AI returned invalid format: {str(e)}")
    

# --- HELPER: GOOGLE FORM CREATOR (Modified for Smuggled Token) ---
def create_google_form_quiz(title, questions, access_token):
    """Creates the Google Form using the smuggled access token from the browser."""
    # Build service directly from token (No credentials.json needed!)
    creds = Credentials(token=access_token)
    service = build("forms", "v1", credentials=creds)
    
    # 1. Create the Form Shell
    form_body = {
        "info": {
            "title": title,
            "documentTitle": title,
        }
    }
    
    form = service.forms().create(body=form_body).execute()
    form_id = form["formId"]
    
    # 2. Build the Batch Requests List
    requests_list = []
    
    # Setting: Convert to a Quiz
    requests_list.append({
        "updateSettings": {
            "settings": { "quizSettings": { "isQuiz": True } },
            "updateMask": "quizSettings.isQuiz"
        }
    })
    
    # Loop through questions and build the JSON structure
    for index, q in enumerate(questions):
        # Clean data to ensure correct_answer matches an option exactly
        cleaned_options = [str(opt).strip() for opt in q['options']]
        correct_ans = str(q['correct_answer']).strip()
        
        # Safety fallback
        if correct_ans not in cleaned_options:
            correct_ans = cleaned_options[0]

        question_item = {
            "createItem": {
                "item": {
                    "title": q['question'],
                    "questionItem": {
                        "question": {
                            "required": True,
                            "grading": {
                                "pointValue": 1,
                                "correctAnswers": { "answers": [{"value": correct_ans}] }
                            },
                            "choiceQuestion": {
                                "type": "RADIO",
                                "options": [{"value": opt} for opt in cleaned_options],
                                "shuffle": True
                            }
                        }
                    }
                },
                "location": { "index": index }
            }
        }
        requests_list.append(question_item)
    
    # 3. Execute batch update to add all questions
    service.forms().batchUpdate(formId=form_id, body={"requests": requests_list}).execute()
    
    # Return the URI for users to take the quiz
    return form.get("responderUri")
@app.route('/generate-quiz', methods=['POST'])
def generate_quiz_endpoint():
    data = request.json
    file_path = data.get('file_path')
    access_token = data.get('access_token') 

    if file_path not in PROCESSED_FILES:
        return jsonify({"error": "No text context found. Click the Eye button first."}), 400
    
    if not access_token:
        return jsonify({"error": "Auth Error: No login token provided."}), 401
        
    try:
        text_to_use = PROCESSED_FILES[file_path]["text"][:15000]
        
        # --- SAFER ASYNC EXECUTION FOR FLASK ---
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            questions = loop.run_until_complete(generate_quiz_questions(text_to_use))
        finally:
            loop.close()
        
        pdf_name = file_path.split('/')[-1] if '/' in file_path else "Material"
        quiz_title = f"Quiz: {pdf_name}" 
        
        form_url = create_google_form_quiz(quiz_title, questions, access_token)
        
        return jsonify({"success": True, "formUrl": form_url})
        
    except Exception as e:
        print(f"🔥 Quiz Route Error: {e}")
        return jsonify({"error": str(e)}), 500
@app.route("/api/save-summary", methods=["POST"])
def save_summary():
    """
    Called when user clicks 'Save Summary'.
    Expects HTML content for high-quality formatting.
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"ok": False, "error": "No data provided"}), 400
        
        summary_json = data.get("summary")
        access_token = data.get("accessToken")
        
        # 1. Validation: We now look for 'content' (the HTML string) instead of 'summary'
        if not summary_json or not access_token:
            return jsonify({"ok": False, "error": "Missing data or access token"}), 400
        
        # Check for our new 'content' key coming from the frontend
        html_content = summary_json.get("content")
        if not html_content:
             return jsonify({"ok": False, "error": "No formatted content provided"}), 400

        # 2. Create credentials from access token
        user_tokens = {
            "access_token": access_token,
            "refresh_token": None,
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        }
        
        # Get Drive service (Ensure this helper is defined in your app)
        service = get_drive_service(user_tokens)
        
        # 3. Handle Folder Structure
        app_folder_id = get_or_create_folder(service, "LMS Summaries")
        subject_folder_id = get_or_create_folder(
            service,
            summary_json.get("subject", "General"),
            app_folder_id
        )
        
        # 4. Prepare File Metadata for Google Doc Conversion
        file_metadata = {
            'name': f"{summary_json.get('title', 'Summary')}.docx",
            'parents': [subject_folder_id],
            'mimeType': 'application/vnd.google-apps.document'  # CRITICAL: Forces conversion to Google Doc
        }
        
        # 5. Create the media object from the HTML string
        # This tells Google to interpret the HTML tags for bolding, red colors, etc.
        media = MediaIoBaseUpload(
            io.BytesIO(html_content.encode('utf-8')),
            mimetype='text/html',
            resumable=True
        )
        
        # 6. Upload and Convert
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
        
        print(f"✅ Successfully saved formatted Doc: {file.get('name')}")

        return jsonify({
            "ok": True,
            "message": "Saved to Google Drive as a formatted Doc",
            "fileId": file["id"],
            "fileName": file.get("name", ""),
            "driveLink": file["webViewLink"]
        })
        
    except Exception as e:
        print(f"🔥 Error saving summary: {str(e)}")
        return jsonify({
            "ok": False,
            "error": str(e)
        }), 500

@app.route('/api/upload-file-to-drive', methods=['POST'])
def upload_file_to_drive():
    data = request.json
    file_name = data.get('fileName')
    mime_type = data.get('mimeType')
    file_data = data.get('fileData') # Base64 string
    access_token = data.get('accessToken')
    subject_name = data.get('subject', 'General') # Get subject from frontend

    try:
        # 1. Decode base64 data
        raw_bytes = base64.b64decode(file_data)
        file_io = BytesIO(raw_bytes)

        # 2. Re-use your established credential logic
        user_tokens = {
            "access_token": access_token,
            "refresh_token": None,
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        }
        # Use the SAME helper as save_summary
        service = get_drive_service(user_tokens) 

        # 3. Handle Folder Structure (Same logic as save_summary)
        # This ensures images go into "LMS Summaries -> [Subject]"
        app_folder_id = get_or_create_folder(service, "LMS Summaries")
        subject_folder_id = get_or_create_folder(
            service,
            subject_name,
            app_folder_id
        )

        # 4. Prepare Metadata with Parent Folder
        file_metadata = {
            'name': file_name,
            'parents': [subject_folder_id] # Put it in the subject folder!
        }
        
        media = MediaIoBaseUpload(file_io, mimetype=mime_type, resumable=True)

        # 5. Create file (Binary upload, no conversion)
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()

        print(f"✅ Successfully saved Image to Drive: {file.get('name')}")

        return jsonify({
            "ok": True,
            "driveLink": file.get('webViewLink'),
            "fileId": file.get('id'),
            "fileName": file.get("name")
        })
    except Exception as e:
        print(f"🔥 Error uploading image: {str(e)}")
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/verify-drive-token", methods=["POST"])
def verify_drive_token():
    """
    Verify that the Google Drive token is valid
    """
    try:
        data = request.get_json()
        access_token = data.get("accessToken")
        
        if not access_token:
            return jsonify({"ok": False, "error": "No access token provided"}), 400
        
        # Try to create credentials and test them
        user_tokens = {
            "access_token": access_token,
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        }
        
        service = get_drive_service(user_tokens)
        
        # Test by getting drive info
        about = service.about().get(fields="user").execute()
        user = about.get("user", {})
        
        return jsonify({
            "ok": True,
            "user": {
                "email": user.get("emailAddress", ""),
                "displayName": user.get("displayName", "")
            }
        })
        
    except Exception as e:
        print(f"Token verification error: {str(e)}")
        return jsonify({
            "ok": False,
            "error": "Invalid or expired token"
        }), 401

def send_email(to_email, subject, html_body, text_body):
    """Send email via SMTP"""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"LMS Helper <{SMTP_EMAIL}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))
        
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())
        
        return True
    except Exception as e:
        print(f"Email send error: {e}")
        return False

def create_assignment_email_html(user_name: str, assignments: list,user_email, unsubscribe_token: str) -> str:
    """Create HTML email content for pending assignments"""
    assignment_rows = ""
    for idx, assignment in enumerate(assignments, 1):
        course_name = assignment.get('courseName', 'Unknown Course')
        if '---' in course_name:
            parts = course_name.split('---')
            course_name = f"{parts[0]} - {parts[1]}" if len(parts) > 1 else parts[0]
        
        due_date = assignment.get('dueDate', 'No due date')
        title = assignment.get('title') or 'Assignment'
        url = assignment.get('url', '#')
        status = assignment.get('status', 'pending')
        status_emoji = '⚠️' if status == 'overdue' else '⏰'
        submit_url = f"{BASE_URL}/api/mark-submitted?email={user_email}&id={assignment['id']}&token={unsubscribe_token}"
        assignment_rows += f"""
        <tr>
            <td style="padding: 15px; border-bottom: 1px solid #e9ecef;">
                <div style="margin-bottom: 5px;">
                    <strong style="font-size: 16px; color: #2c3e50;">{idx}. {assignment.get('title')}</strong>
                </div>
                <div style="color: #6c757d; font-size: 14px;">📚 {assignment.get('courseName')}</div>
                <div style="color: #e74c3c; font-size: 14px; margin-top: 5px;">⏰ Due: {assignment.get('dueDate')}</div>
                
                <div style="margin-top: 10px;">
                    <a href="{submit_url}" style="display: inline-block; background-color: #10b981; color: white; padding: 6px 12px; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: bold;">
                        ✅ Mark as Submitted
                    </a>
                    <a href="{assignment.get('url', '#')}" style="margin-left: 10px; color: #6366f1; text-decoration: none; font-size: 12px;">
                        View on LMS →
                    </a>
                </div>
            </td>
        </tr>

        """
    
    unsubscribe_url = f"{BASE_URL}/unsubscribe?token={unsubscribe_token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">📚 LMS Helper</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Daily Assignment Reminder</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <p style="font-size: 16px; color: #2c3e50; margin-top: 0;">
                    Dear Student! 👋
                </p>
                
                <p style="font-size: 16px; color: #2c3e50;">
                    You have <strong style="color: #e74c3c;">{len(assignments)} pending assignment(s)</strong> that need your attention.
                </p>
                
                <div style="margin: 25px 0;">
                    <table style="width: 100%; border-collapse: collapse; background: #f8f9fa; border-radius: 8px; overflow: hidden;">
                        {assignment_rows}
                    </table>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://lms.ssn.edu.in" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                              color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; 
                              font-weight: 500; font-size: 16px;">
                        Open LMS →
                    </a>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center;">
                    <a href="{unsubscribe_url}" 
                       style="display: inline-block; background-color: #6c757d; color: white; 
                              padding: 8px 20px; text-decoration: none; border-radius: 20px; 
                              font-size: 13px; margin-bottom: 10px;">
                        🔕 Stop receiving these emails
                    </a>
                    <p style="color: #6c757d; font-size: 12px; margin: 10px 0 5px 0;">
                        This is an automated reminder from LMS Helper
                    </p>
                    <p style="color: #6c757d; font-size: 12px; margin: 5px 0;">
                        Sent on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return html_content

@app.route("/api/sync-assignments", methods=["POST"])
def sync_assignments():
    """
    Sync assignments from Chrome extension to Firestore
    
    Expected JSON body:
    {
        "email": "student@ssn.edu.in",
        "name": "John Doe",
        "pendingAssignments": [...],
        "overdueAssignments": [...]
    }
    """
    try:
        data = request.get_json()
        
        email = data.get("email")
        pending = data.get("pendingAssignments", [])
        overdue = data.get("overdueAssignments", [])
        
        if not email:
            return jsonify({"error": "Email is required"}), 400
        
        print(f"📤 Syncing assignments for {email}: {len(pending)} pending, {len(overdue)} overdue")
        
        # Get or create user document
        user_ref = db.collection("users").document(email)
        user_doc = user_ref.get()
        
        # Generate unsubscribe token if new user
        if not user_doc.exists:
            unsubscribe_token = secrets.token_urlsafe(32)
            user_ref.set({
                "email": email,
                "email_notifications": True,
                "unsubscribe_token": unsubscribe_token,
                "last_sync": firestore.SERVER_TIMESTAMP,
                "created_at": firestore.SERVER_TIMESTAMP
            })
            print(f"✨ Created new user: {email}")
        else:
            # Update last sync time and name if changed
            user_ref.update({
                "last_sync": firestore.SERVER_TIMESTAMP
            })
            print(f"🔄 Updated existing user: {email}")
        
        # Combine all assignments with status
        all_assignments = []
        for assignment in pending:
            assignment["status"] = "pending"
            all_assignments.append(assignment)
        for assignment in overdue:
            assignment["status"] = "overdue"
            all_assignments.append(assignment)
        
        # Get current assignment IDs from incoming data
        current_assignment_ids = {str(a["id"]) for a in all_assignments}
        
        # Get existing assignments from Firestore
        assignments_ref = user_ref.collection("assignments")
        existing_assignments = list(assignments_ref.stream())
        existing_ids = {doc.id for doc in existing_assignments}
        
        # Delete assignments that are no longer in local storage (completed/removed)
        assignments_to_delete = existing_ids - current_assignment_ids
        for assignment_id in assignments_to_delete:
            assignments_ref.document(assignment_id).delete()
            print(f"🗑️ Deleted assignment: {assignment_id}")
        
        # Add or update assignments
        added_count = 0
        updated_count = 0
        
        for assignment in all_assignments:
            assignment_id = str(assignment["id"])
            assignment_ref = assignments_ref.document(assignment_id)
            
            assignment_data = {
                "courseName": assignment.get("courseName", "Unknown Course"),
                "dueDate": assignment.get("dueDate", "No due date"),
                "title": assignment.get("title", "Untitled Assignment"),
                "url": assignment.get("url", "#"),
                "status": assignment.get("status", "pending"),
                "lastSyncedAt": firestore.SERVER_TIMESTAMP
            }
            
            # Check if assignment exists
            if assignment_id in existing_ids:
                assignment_ref.update(assignment_data)
                updated_count += 1
            else:
                assignment_data["created_at"] = firestore.SERVER_TIMESTAMP
                assignment_ref.set(assignment_data)
                added_count += 1
        
        print(f"✅ Sync complete: {added_count} added, {updated_count} updated, {len(assignments_to_delete)} deleted")
        
        return jsonify({
            "success": True,
            "message": f"Synced {len(all_assignments)} assignments",
            "added": added_count,
            "updated": updated_count,
            "deleted": len(assignments_to_delete),
            "total": len(all_assignments)
        }), 200
        
    except Exception as e:
        print(f"❌ Sync error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/get-assignments", methods=["GET"])
def get_assignments():
    """Get all assignments for a user"""
    try:
        email = request.args.get("email")
        
        if not email:
            return jsonify({"error": "Email is required"}), 400
        
        user_ref = db.collection("users").document(email)
        assignments_ref = user_ref.collection("assignments")
        
        assignments = []
        for doc in assignments_ref.stream():
            assignment = doc.to_dict()
            assignment["id"] = doc.id
            assignments.append(assignment)
        
        return jsonify({
            "success": True,
            "assignments": assignments,
            "count": len(assignments)
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/api/mark-submitted")
def mark_submitted():
    """Marks an assignment as submitted from an email link"""
    email = request.args.get("email")
    assignment_id = request.args.get("id")
    token = request.args.get("token")

    if not email or not assignment_id or not token:
        return "Invalid Request", 400

    try:
        # Security: Verify the unsubscribe token matches the user
        user_ref = db.collection("users").document(email)
        user_doc = user_ref.get()
        
        if not user_doc.exists or user_doc.to_dict().get("unsubscribe_token") != token:
            return "Unauthorized", 401

        # Update the specific assignment status
        assignment_ref = user_ref.collection("assignments").document(assignment_id)
        assignment_ref.update({
            "status": "submitted",
            "submitted_at": firestore.SERVER_TIMESTAMP
        })

        print(f"✅ Assignment {assignment_id} marked as submitted for {email}")

        return """
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0fdf4; }
                .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
                h2 { color: #16a34a; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Done! 🎉</h2>
                <p>Assignment marked as <strong>Submitted</strong>.</p>
                <p>It will no longer appear in your reminder emails.</p>
            </div>
        </body>
        </html>
        """
    except Exception as e:
        print(f"❌ Error marking submitted: {e}")
        return "An error occurred", 500
    
def send_assignment_reminders():
    """
    Send email reminders to all users with assignments
    Call this function from a cron job or scheduler
    """
    try:
        print("🔔 Starting assignment reminder job...")
        
        users_ref = db.collection("users")
        query = users_ref.where(filter=FieldFilter("email_notifications", "==", True))
        
        sent_count = 0
        error_count = 0
        
        for user_doc in query.stream():
            try:
                user_data = user_doc.to_dict()
                user_email = user_data.get("email")
                user_name = user_data.get("name", "Student")
                unsubscribe_token = user_data.get("unsubscribe_token")
                
                if not user_email or not unsubscribe_token:
                    print(f"⚠️ Skipping user - missing email or token")
                    continue
                
                # Get user's assignments
                assignments_ref = user_doc.reference.collection("assignments")
                pending_query = assignments_ref.where(filter=FieldFilter("status", "!=", "submitted"))

                assignments = []
                for assignment_doc in pending_query.stream():
                    assignment = assignment_doc.to_dict()
                    assignment["id"] = assignment_doc.id
                    assignments.append(assignment)
                # --- END OF THE SNIPPET ---
                
                if not assignments:
                    print(f"ℹ️ No pending assignments for {user_email}, skipping email.")
                    continue
                
                # Create email content with the new link parameters
                html_content = create_assignment_email_html(user_name, assignments, user_email, unsubscribe_token)
                
                text_content = f"""
Hi {user_name}!

You have {len(assignments)} pending assignment(s):

"""
                for idx, assignment in enumerate(assignments, 1):
                    course = assignment.get('courseName', 'Unknown Course')
                    due = assignment.get('dueDate', 'No due date')
                    status = assignment.get('status', 'pending')
                    text_content += f"{idx}. [{status.upper()}] {course}\n   Due: {due}\n\n"
                
                text_content += f"""
Visit https://lms.ssn.edu.in to view and submit your assignments.

To stop receiving these emails, visit:
{BASE_URL}/unsubscribe?token={unsubscribe_token}

---
This is an automated reminder from LMS Helper
"""
                
                # Send email
                success = send_email(
                    to_email=user_email,
                    subject=f"📚 LMS Helper: {len(assignments)} Pending Assignment(s)",
                    html_body=html_content,
                    text_body=text_content
                )
                
                if success:
                    sent_count += 1
                    print(f"✅ Sent reminder to {user_email} ({len(assignments)} assignments)")
                else:
                    error_count += 1
                    print(f"❌ Failed to send to {user_email}")
                    
            except Exception as user_error:
                error_count += 1
                print(f"❌ Error processing user {user_doc.id}: {str(user_error)}")
                continue
        
        result_msg = f"Reminder job complete: {sent_count} sent, {error_count} errors"
        print(f"✅ {result_msg}")
        
        return {
            "success": True,
            "sent": sent_count,
            "errors": error_count,
            "message": result_msg
        }
        
    except Exception as e:
        error_msg = f"Reminder job failed: {str(e)}"
        print(f"❌ {error_msg}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": error_msg
        }

@app.route("/unsubscribe")
def unsubscribe():
    """Handle unsubscribe requests"""
    token = request.args.get("token")
    if not token:
        return "Invalid link", 400
    
    try:
        users_ref = db.collection("users")
        query = users_ref.where(filter=FieldFilter("unsubscribe_token", "==", token)).limit(1)
        docs = list(query.stream())
        
        if not docs:
            return "Invalid or expired link", 400
        
        docs[0].reference.update({
            "email_notifications": False,
            "unsubscribed_at": firestore.SERVER_TIMESTAMP
        })
        
        print(f"🔕 User unsubscribed: {docs[0].id}")
        
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    text-align: center;
                    max-width: 400px;
                }
                h3 {
                    color: #2c3e50;
                    margin-top: 0;
                }
                p {
                    color: #6c757d;
                }
                .emoji {
                    font-size: 48px;
                    margin-bottom: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">🔕</div>
                <h3>You're Unsubscribed</h3>
                <p>You will no longer receive assignment reminder emails from LMS Helper.</p>
                <p style="font-size: 12px; margin-top: 20px;">
                    You can always re-enable notifications from the LMS Helper extension.
                </p>
            </div>
        </body>
        </html>
        """
    except Exception as e:
        print(f"❌ Unsubscribe error: {str(e)}")
        return "An error occurred", 500

@app.route("/api/trigger-reminders", methods=["POST"])
def trigger_reminders():
    """Manually trigger reminder emails (for testing)"""
    result = send_assignment_reminders()
    return jsonify(result), 200 if result.get("success") else 500




# 4. RUN SERVER
if __name__ == '__main__':
    
    current_ip = get_lan_ip()
    print("\n" + "="*50)
    print(f"🚀 SERVER RUNNING AT: http://{current_ip}:5000")
    print(f"📡 Update your background.js BACKEND_URL to this IP!")
    print("="*50 + "\n")
    
    # 0.0.0.0 allows connection from extension
    app.run(host='0.0.0.0', port=5000, debug=True)