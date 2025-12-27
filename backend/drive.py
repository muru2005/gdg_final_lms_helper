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


def summary_json_to_pdf(summary_json: dict) -> str:
    """
    Convert summary JSON to PDF and return path
    """
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    
    # Create PDF with better formatting
    c = canvas.Canvas(temp_file.name, pagesize=A4)
    width, height = A4
    
    # Set up fonts
    c.setFont("Helvetica-Bold", 16)
    y = height - 40
    
    # # Title
    # c.drawString(40, y, "Summary")
    # y -= 30
    
    # Title
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Title:")
    c.setFont("Helvetica", 12)
    c.drawString(100, y, summary_json['title'])
    y -= 20
    
    # Subject
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Subject:")
    c.setFont("Helvetica", 12)
    c.drawString(100, y, summary_json['subject'])
    y -= 20
    
    # Date
    from datetime import datetime
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Date:")
    c.setFont("Helvetica", 12)
    c.drawString(100, y, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    y -= 30
    
    # Summary content
    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Summary:")
    y -= 20
    
    c.setFont("Helvetica", 11)
    
    # Split summary into lines to fit page width
    summary_text = summary_json['summary']
    max_width = width - 80  # margins
    
    # Wrap text
    lines = []
    words = summary_text.split()
    current_line = []
    
    for word in words:
        test_line = ' '.join(current_line + [word])
        if c.stringWidth(test_line, "Helvetica", 11) < max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]
    
    if current_line:
        lines.append(' '.join(current_line))
    
    # Draw lines
    for line in lines:
        if y < 40:  # New page if needed
            c.showPage()
            c.setFont("Helvetica", 11)
            y = height - 40
        c.drawString(40, y, line)
        y -= 15
    
    c.save()
    return temp_file.name

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