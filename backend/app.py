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

# 4. RUN SERVER
if __name__ == '__main__':
    current_ip = get_lan_ip()
    print("\n" + "="*50)
    print(f"🚀 SERVER RUNNING AT: http://{current_ip}:5000")
    print(f"📡 Update your background.js BACKEND_URL to this IP!")
    print("="*50 + "\n")
    
    # 0.0.0.0 allows connection from extension
    app.run(host='0.0.0.0', port=5000, debug=True)