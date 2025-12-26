/* global chrome */
import React from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import AIViewer from './AIViewer'; 

// 1. INTEGRATED WORKSPACE INJECTION
let rootElement = document.getElementById('lms-helper-integrated-overlay');
if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'lms-helper-integrated-overlay';
    document.body.appendChild(rootElement);
}
const workspaceRoot = createRoot(rootElement);

// HELPER: Safe messaging to prevent "Port Closed" crashes
const safeSendMessage = (msg, callback) => {
    if (chrome.runtime?.id) {
        chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) return; 
            if (callback) callback(res);
        });
    }
};

// 2. AI BUTTON INJECTION
const injectAIButtons = () => {
    const modules = document.querySelectorAll('.activity.modtype_resource, .activity.modtype_assign');

    modules.forEach(item => {
        if (item.querySelector('.lms-ai-btn-wrapper')) return;

        const nameContainer = item.querySelector('.activityname');
        if (!nameContainer) return;

        const btnWrapper = document.createElement('span');
        btnWrapper.className = 'lms-ai-btn-wrapper';
        Object.assign(btnWrapper.style, {
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            marginLeft: '12px', position: 'relative', zIndex: '9999'
        });

        const tools = [
            { label: '👁️', color: '#4f46e5', action: 'OPEN_FILE_VIEWER' },
            { label: '🧠', color: '#0891b2', action: 'GENERATE_MINDMAP' },
            { label: '📄', color: '#059669', action: 'GENERATE_SUMMARY' }
        ];

        tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.innerHTML = tool.label;
            btn.title = tool.action;
            Object.assign(btn.style, {
                backgroundColor: tool.color, color: 'white', border: 'none', 
                borderRadius: '6px', padding: '3px 7px', fontSize: '12px', 
                cursor: 'pointer', zIndex: '10000'
            });

            // FIX: We use 'mousedown' and 'click' with stopPropagation to kill the LMS link behavior
            const handleAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // Kills other listeners on the same button

                const aalink = item.querySelector('a.aalink');
                const link = aalink?.href;
                const cleanName = item.querySelector('.instancename')?.textContent.replace(/File|Assignment/gi, '').trim(); 

                console.log(`[UI] Hijacked click for ${tool.action}. Preventing redirect...`);

                // STEP 1: Process file
                safeSendMessage({
                    action: 'AI_TOOL_TRIGGERED', 
                    fileName: cleanName,
                    fileUrl: link
                }, (response) => {
                    if (response?.ok && (tool.action === 'GENERATE_SUMMARY' || tool.action === 'GENERATE_MINDMAP')) {
                        setTimeout(() => {
                            safeSendMessage({
                                action: tool.action, 
                                data: { file_path: link }
                            });
                        }, 1200); 
                    }
                });
            };

            btn.addEventListener('click', handleAction, true); // True = Capture phase (we go first!)
            btn.addEventListener('mousedown', (e) => e.stopPropagation()); // Prevents Moodle from tracking the click
            
            btnWrapper.appendChild(btn);
        });
        nameContainer.appendChild(btnWrapper);
    });
};

// 3. EXTRACTION LOGIC
const extractCourses = () => {
    const courses = [];
    const seenIds = new Set();
    document.querySelectorAll('a[href*="/course/view.php"]').forEach(link => {
        const id = link.href.match(/id=(\d+)/)?.[1];
        if (id && !seenIds.has(id)) {
            seenIds.add(id);
            courses.push({ id, title: link.textContent.trim(), link: link.href });
        }
    });
    return courses;
};

// 4. DEEP SCAN (Fixed: Now handles errors without crashing)
const performDeepScan = async (sendResponse) => {
    const courses = extractCourses();
    try {
        const results = await Promise.all(courses.map(async (course) => {
            try {
                const html = await fetch(course.link).then(res => res.text());
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return Array.from(doc.querySelectorAll('.activity.modtype_assign')).map(item => ({
                    title: item.querySelector('.instancename')?.textContent.trim(),
                    courseName: course.title,
                    url: item.querySelector('a.aalink')?.href
                }));
            } catch (e) { return []; }
        }));
        sendResponse({ success: true, assignments: results.flat() });
    } catch (e) {
        sendResponse({ success: false, error: "Scan failed" });
    }
};

// 5. MESSAGE LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SHOW_OVERLAY') {
        chrome.storage.local.get(['currentFile'], (result) => {
            if (result.currentFile) {
                if (rootElement) rootElement.style.display = 'block';
                // Unique key + Date.now() forces a fresh start every time
                workspaceRoot.render(<AIViewer key={result.currentFile.path + Date.now()} />);
                sendResponse({ ok: true });
            }
        });
        return true; 
    }

    if (request.action === 'extractData') {
        sendResponse({ success: true, courses: extractCourses() });
    }

    if (request.action === 'deepExtractAssignments') {
        performDeepScan(sendResponse);
        return true; // Keep port open for multiple fetches
    }
});

setInterval(injectAIButtons, 2000);