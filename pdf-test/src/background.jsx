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
