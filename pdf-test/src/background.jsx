/**
 * Background Service Worker
 * This script runs in the browser background and handles side panel behavior
 * and session management.
 */

// 1. Set up Side Panel behavior
// This ensures that clicking the extension icon opens the panel instead of a popup
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("SidePanel Behavior Error:", error));
});

// 2. Handle Action Click
// Specifically opens the side panel for the active tab when the icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id })
    .catch((error) => console.error("SidePanel Open Error:", error));
});

// Backend base URL (LAN address to avoid localhost conflicts during development)
const BACKEND_URL = 'http://192.168.1.6:5000';

// Pending notifications map -> { notifId: { tabId } }
const pendingNotifications = {};

// Open side panel when user clicks the notification (this provides the required user gesture)
chrome.notifications.onClicked.addListener((notifId) => {
  try {
    const info = pendingNotifications[notifId];
    // Open a popup window when notification clicked (user gesture)
    const popupUrl = chrome.runtime.getURL('index.html#/ai?popup=1');
    chrome.windows.create({ url: popupUrl, type: 'popup', width: 1100, height: 800 }).catch(err => console.error('Popup open error:', err));
  } catch (e) {
    console.error('Notification click handler error:', e);
  }
  delete pendingNotifications[notifId];
});

// 3. Session & Token Management
// Listens for messages from your React components (like Home.jsx or DataSync.jsx)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Store OAuth Token or Session Data
  if (msg && msg.type === 'storeToken') {
    chrome.storage.local.set({
      sessionToken: msg.token,
      user: msg.user
    }, () => {
      console.log('Session stored successfully');
      sendResponse({ ok: true });
    });
    return true; // Keeps the message channel open for async response
  }

  // Clear Session Data (Logout)
  if (msg && msg.type === 'clearToken') {
    chrome.storage.local.remove(['sessionToken', 'user'], () => {
      console.log('Session cleared');
      sendResponse({ ok: true });
    });
    return true; // Keeps the message channel open for async response
  }
  // Handle OAuth token request - THIS IS THE IMPORTANT ONE
  if (msg && msg.type === 'getAuthToken') {
    console.log('[Background] OAuth token requested');

    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] OAuth error:', chrome.runtime.lastError);
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError.message
        });
      } else if (!token) {
        console.error('[Background] No token returned');
        sendResponse({
          ok: false,
          error: 'No token returned from OAuth'
        });
      } else {
        console.log('[Background] OAuth token obtained successfully');
        sendResponse({
          ok: true,
          token: token
        });
      }
    });

    return true; // Keep channel open for async response
  }

  // Handle OAuth token removal
  if (msg && msg.type === 'removeAuthToken') {
    console.log('[Background] Removing OAuth token');

    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token: token }, () => {
          console.log('[Background] Token removed');
          sendResponse({ ok: true });
        });
      } else {
        console.log('[Background] No token to remove');
        sendResponse({ ok: true });
      }
    });

    return true; // Keep channel open for async response
  }

  // Get user profile
  if (msg && msg.type === 'getUserProfile') {
    console.log('[Background] Getting user profile');

    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error('[Background] Not authenticated:', chrome.runtime.lastError);
        sendResponse({ ok: false, error: 'Not authenticated' });
        return;
      }

      console.log('[Background] Fetching user info from Google');
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(profile => {
          console.log('[Background] User profile obtained');
          sendResponse({ ok: true, profile: profile });
        })
        .catch(err => {
          console.error('[Background] Profile fetch error:', err);
          sendResponse({ ok: false, error: err.message });
        });
    });

    return true; // Keep channel open for async response
  }

  // Handle calendar sync requests from UI: background performs the POST to avoid UI navigation
  if (msg && msg.type === 'SYNC_CALENDAR') {
    console.log('[Background] SYNC_CALENDAR requested');
    const token = msg.token;

    fetch(`${BACKEND_URL}/sync-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          console.log('[Background] Sync success', data.details || '');
          sendResponse({ ok: true, details: data.details });
        } else {
          console.error('[Background] Sync backend error:', data.error);
          sendResponse({ ok: false, error: data.error });
        }
      })
      .catch(err => {
        console.error('[Background] Network error during sync:', err);
        sendResponse({ ok: false, error: err.message });
      });

    return true; // keep message channel open
  }

  // Handle file viewer opening
  if (msg && msg.action === 'OPEN_FILE_VIEWER') {
    console.log('[Background] Opening file viewer for:', msg.fileName);
    chrome.storage.local.set({
      currentFile: {
        path: msg.filePath,
        name: msg.fileName,
        url: msg.fileUrl,
        mode: 'viewer'
      }
    });
    // Open a popup window for viewer instead of sidePanel
    const popupUrl = chrome.runtime.getURL('index.html#/ai?popup=1');
    chrome.windows.create({ url: popupUrl, type: 'popup', width: 1100, height: 800 }, (win) => {
      console.log('[Background] Opened viewer popup', win && win.id);
    });
    sendResponse({ ok: true });
    return true;
  }

  // Handle mindmap generation (received from content script)
  if (msg && msg.action === 'GENERATE_MINDMAP') {
    console.log('[Background] Received GENERATE_MINDMAP request');
    console.log('[Background] Payload:', { fileName: msg.fileName, textLength: msg.text ? msg.text.length : 0 });

    // Backend base URL (use LAN IP to avoid localhost conflicts)
    const BACKEND_URL = 'http://192.168.1.6:5000';

    // 1. Generate Summary
    fetch(`${BACKEND_URL}/generate-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg.text })
    })
      .then(async response => {
        if (!response.ok) {
          const errText = await response.text();
          console.error(`[Background] Summary Endpoint Error: ${response.status}`, errText);
          throw new Error(`Summary generation failed: ${response.status} ${errText}`);
        }
        return response.json();
      })
      .then(summaryData => {
        console.log('[Background] Summary generated, requesting mindmap...');
        // 2. Generate Mindmap
        return fetch(`${BACKEND_URL}/generate-mindmap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: summaryData.summary })
        });
      })
      .then(async response => {
        if (!response.ok) {
          const errText = await response.text();
          console.error(`[Background] Mindmap Endpoint Error: ${response.status}`, errText);
          throw new Error(`Mindmap generation failed: ${response.status} ${errText}`);
        }
        return response.json();
      })
      .then(mindmapData => {
        console.log('[Background] Mindmap generated successfully');
        // 3. Store and notify user to open (click notification => user gesture)
        const notifId = `lms-mindmap-${Date.now()}`;
        chrome.storage.local.set({
          currentFile: {
            name: msg.fileName,
            mindmapData: mindmapData,
            mode: 'mindmap'
          }
        }, () => {
          // remember tabId so click can open sidePanel in correct tab
          pendingNotifications[notifId] = { tabId: sender?.tab?.id };
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('vite.svg'),
            title: 'LMS Helper — Mindmap Ready',
            message: `${msg.fileName || 'Document'} mindmap is ready. Click to open.`
          });
          sendResponse({ ok: true });
        });
      })
      .catch(error => {
        console.error('[Background] Error generating mindmap:', error);
        sendResponse({ ok: false, error: error.message });
      });

    return true; // Keep channel open
  }

  // Handle summary generation (received from content script)
  if (msg && msg.action === 'GENERATE_SUMMARY') {
    console.log('[Background] Received GENERATE_SUMMARY request');
    console.log('[Background] Payload:', { fileName: msg.fileName, textLength: msg.text ? msg.text.length : 0 });

    const BACKEND_URL = 'http://192.168.1.6:5000';

    fetch(`${BACKEND_URL}/generate-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: msg.text })
    })
      .then(async response => {
        if (!response.ok) {
          const errText = await response.text();
          console.error(`[Background] Summary Endpoint Error: ${response.status}`, errText);
          throw new Error(`Summary generation failed: ${response.status} ${errText}`);
        }
        return response.json();
      })
      .then(summaryData => {
        console.log('[Background] Summary generated successfully');
        // Store and notify user to open (click notification => user gesture)
        const notifId = `lms-summary-${Date.now()}`;
        chrome.storage.local.set({
          currentFile: {
            name: msg.fileName,
            summary: summaryData.summary,
            mode: 'summary'
          }
        }, () => {
          pendingNotifications[notifId] = { tabId: sender?.tab?.id };
          chrome.notifications.create(notifId, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('vite.svg'),
            title: 'LMS Helper — Summary Ready',
            message: `${msg.fileName || 'Document'} summary is ready. Click to open.`
          });
          sendResponse({ ok: true });
        });
      })
      .catch(error => {
        console.error('[Background] Error generating summary:', error);
        sendResponse({ ok: false, error: error.message });
      });

    return true; // Keep channel open
  }

  // If we get here, unknown message type
  console.warn('[Background] Unknown message type:', msg.type);
  return false;
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Browser started, service worker active');
});

// Log when service worker is activated
self.addEventListener('activate', (event) => {
  console.log('[Background] Service worker activated');
});

console.log('[Background] Service worker initialized');
