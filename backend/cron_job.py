#!/usr/bin/env python3
"""
LMS Helper - Assignment Reminder Cron Job

This script should be run daily via cron to send assignment reminders.

Setup:
1. Make executable: chmod +x cron_job.py
2. Add to crontab: crontab -e
3. Add line: 0 9 * * * /path/to/venv/bin/python /path/to/cron_job.py >> /var/log/lms_helper_cron.log 2>&1

The above sends reminders at 9 AM daily.
"""

import os
import sys
import requests
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:5000")

def send_reminders():
    """Trigger the reminder endpoint"""
    try:        
        response = requests.post(
            f"{BACKEND_URL}/api/trigger-reminders",
            timeout=120  # 2 minutes timeout
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                print(f"✅ Success: {result.get('sent', 0)} emails sent, {result.get('errors', 0)} errors")
                return 0
            else:
                print(f"❌ Failed: {result.get('error', 'Unknown error')}")
                return 1
        else:
            print(f"❌ HTTP Error: {response.status_code} - {response.text}")
            return 1
            
    except requests.exceptions.Timeout:
        print("❌ Request timeout - job took too long")
        return 1
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection error - could not reach {BACKEND_URL}")
        return 1
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")
        return 1

if __name__ == "__main__":
    exit_code = send_reminders()    
    sys.exit(exit_code)