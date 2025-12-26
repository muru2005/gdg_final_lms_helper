/* global chrome */

const BACKEND_URL = 'http://192.168.0.2:5000';

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
  
  // --- RESTORED OAUTH & SESSION LOGIC (Verified) ---
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
      .then(profile => sendResponse({ ok: true, profile: profile }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }

  // --- AI TOOLS BRIDGE (Flask Proxy) ---
  // This handles your Summary, Mindmap, and Chat buttons
  if (['GENERATE_SUMMARY', 'GENERATE_MINDMAP', 'CHAT'].includes(msg.action)) {
    const endpoint = msg.action === 'CHAT' ? '/chat' : 
                   msg.action === 'GENERATE_SUMMARY' ? '/generate-summary' : '/generate-mindmap';
    
    fetch(`${BACKEND_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg.data)
    })
    .then(res => res.json())
    .then(data => {
      // Forward the response back to the UI in the tab
      if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, { 
              action: `RECEIVE_${msg.action}`, 
              payload: data 
          });
      }
      sendResponse({ ok: true });
    })
    .catch(err => {
      console.error("[Background] AI Fetch Error:", err);
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }

  // --- PDF SMUGGLING (Initial Trigger) ---
  if (msg.action === 'AI_TOOL_TRIGGERED' || msg.action === 'OPEN_FILE_VIEWER') {
    const fileUrl = msg.fileUrl || msg.url;
    
    // Save state so side panel can see what's open
    chrome.storage.local.set({ 
        currentFile: { 
            path: fileUrl, 
            name: msg.fileName || msg.name, 
            fileUrl: fileUrl 
        } 
    }, () => {
        // Render the integrated overlay
        if (sender.tab?.id) {
            chrome.tabs.sendMessage(sender.tab.id, { action: 'SHOW_OVERLAY' }).catch(() => {});
        }
        
        // Smuggle PDF to Flask
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
          .catch(e => console.error("[Background] Smuggling failed:", e));

        sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});