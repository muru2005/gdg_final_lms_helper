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
from chromadb.utils import embedding_functions
from dotenv import load_dotenv
import asyncio
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES = ["https://www.googleapis.com/auth/forms.body"]
# 1. INITIALIZATION
load_dotenv()
app = Flask(__name__)

# Enable CORS for Chrome Extension and Local Dev
CORS(app, origins=["*"], supports_credentials=True)

# AI Setup
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# ChromaDB Setup
CHROMA_PATH = ".chromadb"
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

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

# --- API ROUTES ---

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

@app.route('/generate-summary', methods=['POST'])
def generate_summary():
    """Generates an extensive academic summary"""
    data = request.json
    file_path = data.get('file_path')
    
    if file_path not in PROCESSED_FILES:
        return jsonify({"error": "Process file first"}), 400

    if PROCESSED_FILES[file_path].get("summary"):
        return jsonify({"summary": PROCESSED_FILES[file_path]["summary"]})

    text_to_use = PROCESSED_FILES[file_path]["text"][:12000] 
    prompt = f"Summarize this document with bold headings and detailed bullets:\n\n{text_to_use}"
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )
        summary = response.choices[0].message.content
        PROCESSED_FILES[file_path]["summary"] = summary
        return jsonify({"summary": summary})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/generate-mindmap', methods=['POST'])
def generate_mindmap():
    """Generates a deep hierarchical JSON mind map"""
    data = request.json
    file_path = data.get('file_path')
    
    if file_path not in PROCESSED_FILES:
        return jsonify({"error": "Process file first"}), 400

    if PROCESSED_FILES[file_path].get("mindmap"):
        return jsonify(PROCESSED_FILES[file_path]["mindmap"])

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
            PROCESSED_FILES[file_path]["mindmap"] = parsed
            return jsonify(parsed)
        return jsonify({"error": "AI failed to build JSON"}), 500
    except Exception as e:
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
# 4. RUN SERVER
if __name__ == '__main__':
    current_ip = get_lan_ip()
    print("\n" + "="*50)
    print(f"🚀 SERVER RUNNING AT: http://{current_ip}:5000")
    print(f"📡 Update your background.js BACKEND_URL to this IP!")
    print("="*50 + "\n")
    
    # 0.0.0.0 allows connection from extension
    app.run(host='0.0.0.0', port=5000, debug=True)