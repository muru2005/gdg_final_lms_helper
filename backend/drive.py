from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from googleapiclient.http import MediaFileUpload
import tempfile
import os
import re
import time
from fpdf import FPDF

def get_drive_service(user_tokens: dict):
    creds = Credentials(
        token=user_tokens["access_token"],
        token_uri=user_tokens["token_uri"],
        client_id=user_tokens["client_id"],
        scopes=["https://www.googleapis.com/auth/drive.file"]
    )

    return build("drive", "v3", credentials=creds)

def get_or_create_folder(service, name, parent_id=None):
    """Get existing folder or create new one"""
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get("files", [])

    if files:
        return files[0]["id"]

    folder_metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        folder_metadata["parents"] = [parent_id]

    folder = service.files().create(body=folder_metadata, fields="id").execute()
    return folder["id"]


def summary_json_to_pdf(summary_data):
    """
    Converts summary JSON to a clean PDF without ** or --- symbols.
    """
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # 1. Header: Title and Subject
    pdf.set_font("Arial", 'B', 16)
    pdf.cell(0, 10, f"Summary: {summary_data.get('title', 'Document')}", ln=True, align='C')
    pdf.set_font("Arial", 'I', 11)
    pdf.cell(0, 10, f"Subject: {summary_data.get('subject', 'General')}", ln=True, align='C')
    pdf.ln(5)
    
    # Draw a clean separator line
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(10)

    # 2. Content Cleaning Logic
    raw_text = summary_data.get('summary', '')

    # --- REMOVE SHITTY CHARACTERS ---
    # Remove Bold markers (**)
    clean_text = raw_text.replace("**", "")
    # Remove Horizontal line markers (--- or ***)
    clean_text = re.sub(r'[-*_]{3,}', '', clean_text)
    # Optional: Clean up list symbols like + to actual bullets
    clean_text = clean_text.replace("+ ", "• ")

    # 3. Write Content with Proper Spacing
    pdf.set_font("Arial", size=11)
    
    # Split by lines to handle headers and bullets separately
    lines = clean_text.split('\n')
    for line in lines:
        if not line.strip():
            pdf.ln(4) # Empty line spacing
            continue
            
        # Check if it looks like a heading (all caps or ending in colon)
        if line.isupper() or line.strip().endswith(':'):
            pdf.set_font("Arial", 'B', 11)
            pdf.multi_cell(0, 8, line.strip())
            pdf.set_font("Arial", size=11)
        else:
            # Regular text with 1.5 line spacing
            pdf.multi_cell(0, 7, line.strip())
            
    # Save to a temp path
    temp_filename = f"temp_summary_{int(time.time())}.pdf"
    pdf.output(temp_filename)
    return temp_filename

def upload_pdf(service, file_path, filename, parent_folder_id):
    """Upload PDF to Google Drive"""
    media = MediaFileUpload(file_path, mimetype="application/pdf")

    file_metadata = {
        "name": filename,
        "parents": [parent_folder_id]
    }

    file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id, name, webViewLink"
    ).execute()

    return file