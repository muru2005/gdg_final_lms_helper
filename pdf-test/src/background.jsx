/* global chrome */

// Ensure this IP matches your current local machine IP running the Flask server
const BACKEND_URL = 'http://192.168.0.3:5000';

// 1. SIDE PANEL SETUP
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => console.log("SidePanel Setup Done"));
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id })
    .catch((error) => console.error("SidePanel Open Error:", error));
});

// 2. MAIN MESSAGE LISTENER
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  
  // --- OAUTH & SESSION LOGIC ---
  if (msg.type === 'getAuthToken') {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, token: token });
      }
    });
    return true; 
  }

  if (msg.type === 'getUserProfile') {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (!token) { 
        sendResponse({ ok: false, error: 'Not authenticated' }); 
        return; 
      }
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(profile => {
        // Save profile to local storage so AIViewer can access the email for Digital ID
        chrome.storage.local.set({ userProfile: profile });
        sendResponse({ ok: true, profile: profile });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }
  if (msg.type === 'SYNC_CALENDAR') {
    console.log('[Background] Starting Calendar Sync...');
    fetch(`${BACKEND_URL}/sync-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: msg.token }) // Forwarding OAuth token to Flask
    })
    .then(res => res.json())
    .then(data => {
        console.log('[Background] Sync Response:', data);
        sendResponse(data); 
    })
    .catch(err => {
        console.error('[Background] Sync Fetch Error:', err);
        sendResponse({ ok: false, error: err.message });
    });
    return true; // Keeps channel open for async response
  }
  // --- DRIVE UPLOAD PROXY ---
  if (msg.action === 'UPLOAD_TO_DRIVE_PROXY') {
    fetch(`${BACKEND_URL}/api/upload-file-to-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.data)
    })
    .then(res => res.json())
    .then(data => sendResponse(data))
    .catch(err => {
        console.error("[Background] Drive Proxy Error:", err);
        sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
  if (msg.action === 'TRACK_EVENT') {
    const { name, params } = msg.payload;

    // Use chrome.storage to pull the email for the Digital ID
    chrome.storage.local.get(['userProfile'], (res) => {
        const userEmail = res.userProfile?.email || "anonymous";

        fetch(`${BACKEND_URL}/track-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                params: params,
                email: userEmail // Forward the email to Flask for GA4 ClientID
            })
        })
        .then(res => console.log("[Background] Analytics Sent:", name))
        .catch(err => console.error("[Background] Analytics Error:", err));
    });

    // Send instant success to the UI so it doesn't wait
    sendResponse({ ok: true });
    return true; 
  }
  // --- NEW: SAVE SUMMARY TO DRIVE PROXY (RESTORES CONNECTIVITY) ---
  if (msg.action === 'SAVE_SUMMARY_TO_DRIVE') {
    fetch(`${BACKEND_URL}/api/save-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.data)
    })
    .then(res => res.json())
    .then(data => sendResponse(data))
    .catch(err => {
        console.error("[Background] Save Summary Proxy Error:", err);
        sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  // --- AI TOOLS BRIDGE (Flask Proxy with Cache Awareness) ---
  if (['GENERATE_SUMMARY', 'GENERATE_MINDMAP', 'CHAT', 'GENERATE_QUIZ'].includes(msg.action)) {
    const endpointMap = {
        'CHAT': '/chat',
        'GENERATE_SUMMARY': '/generate-summary',
        'GENERATE_MINDMAP': '/generate-mindmap',
        'GENERATE_QUIZ': '/generate-quiz'
    };
    
    const endpoint = endpointMap[msg.action];
    
    fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg.data)
    })
    .then(res => res.json())
    .then(data => {
      // If the backend says 'isCached: true', the UI will know it was instant
      if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, { 
              action: `RECEIVE_${msg.action}`, 
              payload: data 
          });
      }
      sendResponse({ ok: true });
    })
    .catch(err => {
      console.error(`[Background] ${msg.action} Fetch Error:`, err);
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  // --- PDF SMUGGLING & OVERLAY TRIGGER ---
  if (msg.action === 'AI_TOOL_TRIGGERED' || msg.action === 'OPEN_FILE_VIEWER') {
    const fileUrl = msg.fileUrl || msg.url;
    const toolMode = msg.tool || 'VIEW'; 
    
    chrome.storage.local.set({ 
        currentFile: { 
            path: fileUrl, 
            name: msg.fileName || msg.name, 
            fileUrl: fileUrl 
        },
        initialMode: toolMode 
    }, () => {
        // Notify Content Script to show the overlay
        if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, { action: 'SHOW_OVERLAY' });
            
            // Sync the internal state of AIViewer if it's already open
            chrome.tabs.sendMessage(sender.tab.id, { 
                action: 'AI_TOOL_TRIGGERED', 
                tool: toolMode,
                fileUrl: fileUrl
            });
        }
        
        // Smuggle PDF to Flask for processing/vectorization
        fetch(fileUrl)
          .then(res => res.arrayBuffer())
          .then(buffer => {
              const base64Data = btoa(new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), ''));
              return fetch(`${BACKEND_URL}/process-file`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ file_path: fileUrl, pdf_data: base64Data })
              });
          })
          .then(res => res.json())
          .then(res => console.log("[Background] File Smuggled:", res.message))
          .catch(e => console.error("[Background] Smuggling failed:", e));

        sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});