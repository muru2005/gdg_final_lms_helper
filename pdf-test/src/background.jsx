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
});