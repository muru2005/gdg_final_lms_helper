import datetime
import re
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

app = Flask(__name__)
CORS(app)

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

if __name__ == '__main__':
    app.run(port=5000)