// src/utils/analytics.js

export const trackEvent = (eventName, params = {}) => {
    console.log(`📡 Sending track request to background: ${eventName}`);
    
    // We send a one-time message to the background script
    chrome.runtime.sendMessage({
        action: 'TRACK_EVENT',
        payload: {
            name: eventName,
            params: params
        }
    });
};