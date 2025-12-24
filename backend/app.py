import datetime
import re
import os
import json
import uuid
import shutil
from typing import List, Optional
from flask import Flask, request, jsonify
from flask_cors import CORS
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from pydantic import BaseModel
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from groq import Groq
import chromadb
from chromadb.utils import embedding_functions

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173", "chrome-extension://*", "https://lms.ssn.edu.in"], supports_credentials=True)

# Groq Client
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY not found in environment variables.")
    client = None
else:
    client = Groq(api_key=GROQ_API_KEY)

# ChromaDB Setup
CHROMA_PATH = ".chromadb"
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

# Storage for processed files
PROCESSED_FILES = {}

# --- Helper Functions ---

def extract_text_from_file(file_path: str) -> str:
    """Extract text from various file types"""
    try:
        if file_path.lower().endswith('.pdf'):
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text
        elif file_path.lower().endswith(('.txt', '.md')):
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        else:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        return f"Error extracting text: {str(e)}"

def split_text(text: str, chunk_size=1000, overlap=200):
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start += chunk_size - overlap
    return chunks

def get_file_collection(file_path: str):
    """Get or create collection for specific file"""
    file_id = file_path.replace('\\', '_').replace('/', '_').replace(':', '')
    collection_name = f"file_{file_id}"
    
    try:
        collection = chroma_client.get_collection(
            name=collection_name,
            embedding_function=embedding_function
        )
    except:
        collection = chroma_client.create_collection(
            name=collection_name,
            embedding_function=embedding_function
        )
    
    return collection

def get_google_services(token):
    creds = Credentials(token)
    return build('calendar', 'v3', credentials=creds), build('gmail', 'v1', credentials=creds)

def parse_dd_mm_yyyy(date_str):
    return datetime.datetime.strptime(date_str.strip(), "%d-%m-%Y").date()

def delete_existing_event(service, summary, date_str):
    """Finds and deletes any existing event with this summary on this date."""
    target_date = parse_dd_mm_yyyy(date_str)
    t_min = datetime.datetime.combine(target_date, datetime.time.min).isoformat() + 'Z'
    t_max = datetime.datetime.combine(target_date, datetime.time.max).isoformat() + 'Z'
    
    events_result = service.events().list(
        calendarId='primary', timeMin=t_min, timeMax=t_max, 
        singleEvents=True, q=summary
    ).execute()
    
    events = events_result.get('items', [])
    for event in events:
        if event['summary'] == summary:
            service.events().delete(calendarId='primary', eventId=event['id']).execute()
            print(f"Demo: Wiped existing {summary} on {date_str}")

def create_event_body(summary, start_str, end_str=None, description=""):
    start_date = parse_dd_mm_yyyy(start_str)
    if end_str:
        end_date = parse_dd_mm_yyyy(end_str) + datetime.timedelta(days=1)
    else:
        end_date = start_date + datetime.timedelta(days=1)

    return {
        'summary': summary,
        'description': description,
        'start': {'date': start_date.isoformat(), 'timeZone': 'Asia/Kolkata'},
        'end': {'date': end_date.isoformat(), 'timeZone': 'Asia/Kolkata'},
    }

@app.route('/sync-calendar', methods=['POST'])
def sync_calendar():
    data = request.json
    token = data.get('token')
    if not token: return jsonify({"ok": False, "error": "No token"}), 400

    try:
        cal_service, gmail_service = get_google_services(token)
        today = datetime.date.today()
        stats = {"circulars_synced": 0, "academic_events_refreshed": 0}

        # 1. REFRESH GMAIL CIRCULARS
        query = 'from:principalsoffice@ssn.edu.in newer_than:7d'
        results = gmail_service.users().messages().list(userId='me', q=query).execute()
        for msg in results.get('messages', []):
            msg_data = gmail_service.users().messages().get(userId='me', id=msg['id']).execute()
            content = msg_data.get('snippet', '')
            match = re.search(r'(working day|holiday) on (\d{2}-\d{2}-\d{4})', content, re.IGNORECASE)
            
            if match:
                e_type, d_str = match.group(1).title(), match.group(2)
                summary = f"SSN: {e_type}"
                if parse_dd_mm_yyyy(d_str) >= today:
                    # Wipe then Re-insert for the Demo
                    delete_existing_event(cal_service, summary, d_str)
                    body = create_event_body(summary, d_str, description="Sync from Principal email")
                    cal_service.events().insert(calendarId='primary', body=body).execute()
                    stats["circulars_synced"] += 1

        # 2. REFRESH FIXED ACADEMIC SCHEDULE
        academic_events = [
            {"summary": "CAT-1 Exams", "start": "30-01-2026", "end": "06-02-2026"},
            {"summary": "CAT-2 Exams", "start": "17-03-2026", "end": "24-03-2026"},
            {"summary": "Last Working Day", "start": "09-04-2026", "end": None}
        ]

        for event in academic_events:
            # Wipe then Re-insert for the Demo
            delete_existing_event(cal_service, event['summary'], event['start'])
            body = create_event_body(event['summary'], event['start'], event['end'])
            cal_service.events().insert(calendarId='primary', body=body).execute()
            stats["academic_events_refreshed"] += 1

        return jsonify({"ok": True, "message": "Demo Refresh Complete!", "details": stats})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# --- File Processing Endpoints ---

@app.route('/process-file', methods=['POST'])
def process_file():
    """Process any file for AI operations"""
    data = request.json
    file_path = data.get('file_path')
    file_content = data.get('file_content')
    
    # Handle direct content or file path
    if file_content:
        text = file_content
    elif file_path and os.path.exists(file_path):
        text = extract_text_from_file(file_path)
    else:
        return jsonify({"error": "No file content or valid file path provided"}), 400
    
    # Use file_path as key, or generate one for content
    storage_key = file_path or f"content_{hash(file_content)}"
    
    # Store in processed files
    PROCESSED_FILES[storage_key] = {
        "text": text,
        "summary": None,
        "mindmap": None
    }
    
    # Create RAG collection for this file
    collection = get_file_collection(storage_key)
    chunks = split_text(text)
    
    if chunks:
        try:
            collection.delete(where={})
        except:
            pass
            
        collection.add(
            documents=chunks,
            ids=[f"chunk_{uuid.uuid4()}" for _ in range(len(chunks))]
        )
    
    return jsonify({
        "message": "File processed successfully",
        "storage_key": storage_key,
        "text_length": len(text)
    })

@app.before_request
def log_request_info():
    print(f"Request: {request.method} {request.url}")
    print(f"Headers: {dict(request.headers)}")
    if request.is_json:
        print(f"JSON Data: {request.get_json()}")

@app.route('/generate-summary', methods=['POST'])
def generate_summary():
    """Generate summary for file or text"""
    data = request.json
    file_path = data.get('file_path')
    text = data.get('text', '')
    print(f"Received generate-summary request. Text length: {len(text) if text else 0}")
    
    if file_path:
        if file_path in PROCESSED_FILES and PROCESSED_FILES[file_path]["summary"]:
            return jsonify({"summary": PROCESSED_FILES[file_path]["summary"], "cached": True})
        
        if file_path not in PROCESSED_FILES:
            process_file_result = process_file()
            if process_file_result[1] != 200:
                return process_file_result
        
        text_to_use = PROCESSED_FILES[file_path]["text"]
    else:
        text_to_use = text
    
    if not text_to_use:
        return jsonify({"error": "No text provided or file found."}), 400

    if not client:
        return jsonify({"error": "Groq client not initialized (check API Key)."}), 500

    prompt = f"""
    Analyze and create a comprehensive, detailed summary of this document:

    {text_to_use[:15000]} 

    Provide an EXTENSIVE summary with:
    • **Main Topics and Themes** - List all major subjects covered
    • **Key Concepts and Definitions** - Define important terms and concepts
    • **Important Facts and Findings** - Detail significant information and data
    • **Conclusions or Recommendations** - Summarize final thoughts and suggestions
    • **Additional Details** - Include supporting information and context

    FORMAT REQUIREMENTS:
    - Use **bold** for all headings and important terms
    - Use *italic* for emphasis on key points
    - Use bullet points (•) and sub-bullets (◦) for organization
    - Make it comprehensive and detailed - don't summarize too much
    - Include specific examples and details from the document
    - Structure with clear hierarchy using indentation
    
    Make the summary as detailed and comprehensive as possible while maintaining readability.
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000
        )
        
        summary = response.choices[0].message.content
        
        if file_path and file_path in PROCESSED_FILES:
            PROCESSED_FILES[file_path]["summary"] = summary
        
        return jsonify({"summary": summary, "cached": False})
    except Exception as e:
        return jsonify({"error": f"Error generating summary: {str(e)}"}), 500

@app.route('/generate-mindmap', methods=['POST'])
def generate_mindmap():
    data = request.json
    summary_text = data.get('summary')
    
    if not client:
        return jsonify({"error": "Groq client not initialized."}), 500
        
    prompt = f"""
    Create a COMPREHENSIVE, DEEP mind map JSON structure from this content:
    
    {summary_text}
    
    GOAL: Capture the full depth (5-6 levels deep) of the content. Do NOT simplify.
    
    RULES:
    1. Structure must be recursive. Use "title" for the node text and "children" for sub-nodes.
    2. Do NOT use specific keys like "topics", "subtopics", or "details". ALWAYS use "children".
    3. The "title" should contain the actual content/concept (e.g., "Velocity = Distance / Time").
    4. Ensure NO node has an empty title.
    5. Maximize depth. Break down complex concepts into smaller child nodes. Level 5 or 6 is encouraged.
    
    OUTPUT JSON FORMAT:
    {{
      "title": "Main Root Title",
      "children": [
        {{
          "title": "Major Concept",
          "children": [
            {{
              "title": "Sub-concept",
              "children": [
                {{ "title": "Detail 1", "children": [] }}
              ]
            }}
          ]
        }}
      ]
    }}
    
    Return ONLY valid JSON. Do not include markdown formatting like ```json.
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4000
        )
        
        content = response.choices[0].message.content.strip()
        
        if '```json' in content:
            content = content.split('```json')[1].split('```')[0]
        elif '```' in content:
            content = content.split('```')[1].split('```')[0]
        
        parsed = json.loads(content)
        return jsonify(parsed)
        
    except Exception as e:
        return jsonify({
            "title": "Error Generating Map",
            "children": [
                {
                    "title": "Could not parse JSON", 
                    "children": [{"title": str(e), "children": []}]
                }
            ]
        })

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    query = data.get('query')
    file_path = data.get('file_path')
    
    if not client:
        return jsonify({"error": "Groq client not initialized."}), 500
        
    retrieved_docs = ""
    
    if file_path and file_path in PROCESSED_FILES:
        try:
            collection = get_file_collection(file_path)
            results = collection.query(query_texts=[query], n_results=3)
            retrieved_docs = " ".join(results["documents"][0]) if results["documents"] else ""
        except Exception:
            retrieved_docs = ""

    final_prompt = f"""
    You are a specialized AI assistant for document analysis. Your role is to help users understand and analyze the uploaded document.
    
    IMPORTANT INSTRUCTIONS:
    - ONLY answer questions related to the document content provided in the context
    - If the user asks general questions like "hi", "hello", "what is your name", or anything unrelated to the document, politely redirect them to ask about the document
    - For document-related questions, provide clear, structured answers using the context
    
    Context from document:
    {retrieved_docs}

    User Question: {query}
    
    RESPONSE RULES:
    - If question is about the document: Provide detailed answer using **bold** for key terms, *italic* for emphasis, bullet points (•) for main points, sub-bullets (◦) for details
    - If question is NOT about the document: Say "I'm here to help you understand the uploaded document. Please ask me questions about the document content, such as key concepts, definitions, or specific topics covered."
    
    Answer:
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": final_prompt}],
            max_tokens=800,
            temperature=0,
        )
        return jsonify({"answer": response.choices[0].message.content})
    except Exception as e:
        return jsonify({"error": f"Error in chat: {str(e)}"}), 500

@app.route('/file-status/<path:file_path>', methods=['GET'])
def get_file_status(file_path):
    """Check if file has been processed and what's available"""
    if file_path in PROCESSED_FILES:
        return jsonify({
            "processed": True,
            "has_summary": PROCESSED_FILES[file_path]["summary"] is not None,
            "has_mindmap": PROCESSED_FILES[file_path]["mindmap"] is not None
        })
    return jsonify({"processed": False, "has_summary": False, "has_mindmap": False})

@app.route('/test', methods=['GET', 'POST'])
def test_endpoint():
    return jsonify({"status": "Backend is working", "method": request.method})

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "LMS Helper Backend"})

if __name__ == '__main__':
    print("Starting Flask Server on port 5000...")
    print("Registered Routes:")
    print(app.url_map)
    app.run(host='0.0.0.0', port=5000, debug=True)