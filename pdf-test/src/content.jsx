/* global chrome */
import React from 'react';
import { createRoot } from 'react-dom/client';
import AIViewer from './AIViewer'; // Ensure this component is in your src folder

// 1. INTEGRATED WORKSPACE INJECTION
// This creates the "Gmail-style" container once and keeps it ready
let rootElement = document.getElementById('lms-helper-integrated-overlay');
if (!rootElement) {
    rootElement = document.createElement('div');
    rootElement.id = 'lms-helper-integrated-overlay';
    document.body.appendChild(rootElement);
}
const workspaceRoot = createRoot(rootElement);

// 2. AI BUTTON INJECTION LOGIC
const injectAIButtons = () => {
    const modules = document.querySelectorAll('.activity.modtype_resource, .activity.modtype_assign');

    modules.forEach(item => {
        if (item.querySelector('.lms-ai-btn-wrapper')) return;

        const nameContainer = item.querySelector('.activityname');
        if (!nameContainer) return;

        const btnWrapper = document.createElement('span');
        btnWrapper.className = 'lms-ai-btn-wrapper';
        
        Object.assign(btnWrapper.style, {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginLeft: '12px',
            position: 'relative',
            zIndex: '10',
            verticalAlign: 'middle'
        });

        const tools = [
            { label: '👁️', color: '#4f46e5', title: 'OPEN_FILE_VIEWER' },
            { label: '🧠', color: '#0891b2', title: 'GENERATE_MINDMAP' },
            { label: '📄', color: '#059669', title: 'GENERATE_SUMMARY' }
        ];

        tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.innerHTML = tool.label;
            btn.title = tool.title;
            
            Object.assign(btn.style, {
                backgroundColor: tool.color,
                color: 'white', border: 'none', borderRadius: '6px',
                padding: '3px 7px', fontSize: '12px', cursor: 'pointer',
                transition: 'all 0.2s ease', lineHeight: '1',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            });

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const link = item.querySelector('a.aalink')?.href;
                const rawName = item.querySelector('.instancename')?.textContent || '';
                const cleanName = rawName.replace(/File|Assignment/gi, '').trim(); 
                
                // Signal background to fetch/smuggle the file
                chrome.runtime.sendMessage({
                    action: 'AI_TOOL_TRIGGERED', 
                    fileName: cleanName,
                    fileUrl: link
                });
            };
            btnWrapper.appendChild(btn);
        });
        nameContainer.appendChild(btnWrapper);
    });
};

// 3. EXTRACTION LOGIC (Courses/Assignments)
const extractCourses = () => {
    const courses = [];
    const seenIds = new Set(); 
    const selectors = ['a[href*="/course/view.php"]', '.coursebox a', '.dashboard-card a'];
    
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(link => {
            const href = link.href;
            const courseId = href.match(/id=(\d+)/)?.[1];
            if (!courseId || seenIds.has(courseId)) return;

            let title = link.textContent.trim().replace(/\s+/g, ' ');
            if (/[A-Z]{3}\d{4}/i.test(title) || /Semester|Lab/i.test(title)) {
                seenIds.add(courseId);
                courses.push({ id: courseId, title, link: href });
            }
        });
    });
    return courses;
};

const checkIfLoggedIn = () => !!(document.querySelector('a[href*="logout"]') || document.querySelector('.usermenu'));

// 4. MESSAGE LISTENER
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // TRIGGER: SHOW THE INTEGRATED OVERLAY
    if (request.action === 'SHOW_OVERLAY') {
        console.log("[Content] Rendering Integrated Workspace...");
        workspaceRoot.render(<AIViewer />);
        sendResponse({ success: true });
    }

    if (request.action === 'extractData') {
        if (!checkIfLoggedIn()) {
            sendResponse({ success: false, error: 'Not logged in' });
        } else {
            sendResponse({ success: true, courses: extractCourses() });
        }
    }

    if (request.action === 'deepExtractAssignments') {
        const courses = extractCourses();
        const assignmentPromises = courses.map(async (course) => {
            try {
                const html = await fetch(course.link).then(res => res.text());
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return Array.from(doc.querySelectorAll('.activity.modtype_assign')).map(item => ({
                    id: item.getAttribute('data-id'),
                    title: item.getAttribute('data-activityname'),
                    courseName: course.title,
                    url: item.querySelector('a.aalink')?.href
                }));
            } catch (e) { return []; }
        });

        Promise.all(assignmentPromises).then(results => {
            sendResponse({ success: true, assignments: results.flat() });
        });
        return true; 
    }
});

// Lifecycle
setInterval(injectAIButtons, 2000);
console.log('LMS Helper: Immersive Content Script Active');