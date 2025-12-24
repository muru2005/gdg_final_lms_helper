import requests
import json
import time

BASE_URL = "http://localhost:5000"

def test_endpoint(name, method, endpoint, data=None):
    print(f"\n--- Testing {name} [{method} {endpoint}] ---")
    url = f"{BASE_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url)
        else:
            headers = {'Content-Type': 'application/json'}
            response = requests.post(url, json=data, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        try:
            print(f"Response: {response.json()}")
        except:
            print(f"Response (Text): {response.text[:200]}...")
            
        if response.status_code in [200, 201]:
            print("✅ SUCCESS")
            return True
        else:
            print("❌ FAILED")
            return False
    except Exception as e:
        print(f"❌ CONNECTION ERROR: {e}")
        return False

def run_tests():
    print("Wait for server to be ready...")
    # Health Check (might be 404 if I haven't added it yet, but let's see)
    test_endpoint("Root Health Check", "GET", "/")

    # Test Summary Generation
    summary_payload = {"text": "This is a simple test document to verify the summary generation endpoint works correctly."}
    test_endpoint("Generate Summary", "POST", "/generate-summary", summary_payload)

    # Test Mindmap Generation
    mindmap_payload = {"summary": "Main Concept\n- Detail A\n- Detail B"}
    test_endpoint("Generate Mindmap", "POST", "/generate-mindmap", mindmap_payload)

    # Test Calendar Sync (Mock Token)
    calendar_payload = {"token": "mock_token"}
    test_endpoint("Sync Calendar", "POST", "/sync-calendar", calendar_payload)

if __name__ == "__main__":
    run_tests()
