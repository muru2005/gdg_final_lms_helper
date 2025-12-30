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
    Object.assign(rootElement.style, {
        display: 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 999999
    });
    document.body.appendChild(rootElement);
}
const workspaceRoot = createRoot(rootElement);

// HELPER: Safe messaging
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

        // SVG icons for modern look (inline since this runs in page context)
        const svgIcons = {
            eye: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
            brain: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>',
            file: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>'
        };
        const tools = [
            { label: svgIcons.eye, color: '#7c3aed', action: 'OPEN_FILE_VIEWER', tool: 'VIEW', title: 'View' },
            { label: svgIcons.brain, color: '#0891b2', action: 'GENERATE_MINDMAP', tool: 'MINDMAP', title: 'Mind Map' },
            { label: svgIcons.file, color: '#059669', action: 'GENERATE_SUMMARY', tool: 'SUMMARY', title: 'Summary' }
        ];

        tools.forEach(tool => {
            const btn = document.createElement('button');
            btn.innerHTML = tool.label;
            btn.title = tool.title;
            Object.assign(btn.style, {
                backgroundColor: tool.color, color: 'white', border: 'none',
                borderRadius: '6px', padding: '5px 8px', fontSize: '12px',
                cursor: 'pointer', zIndex: '10000', display: 'flex', alignItems: 'center'
            });

            const handleAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const aalink = item.querySelector('a.aalink');
                const link = aalink?.href;
                const cleanName = item.querySelector('.instancename')?.textContent.replace(/File|Assignment/gi, '').trim();

                safeSendMessage({
                    action: 'AI_TOOL_TRIGGERED',
                    tool: tool.tool,
                    fileName: cleanName,
                    fileUrl: link
                });
            };

            btn.addEventListener('click', handleAction, true);
            btn.addEventListener('mousedown', (e) => e.stopPropagation());
            btnWrapper.appendChild(btn);
        });
        nameContainer.appendChild(btnWrapper);
    });
};

// --- DOWNLOADER LOGIC ---
const extractCourseMaterials = () => {
    const units = [];
    const sections = document.querySelectorAll('li.section.main');
    sections.forEach((section) => {
        const titleEl = section.querySelector('.sectionname');
        const title = titleEl?.textContent.trim() || "Untitled Section";
        if (title === 'General') return;
        const materials = [];
        const modules = section.querySelectorAll('.activity.modtype_resource, .activity.modtype_folder, .activity.modtype_assign, .activity.modtype_quiz');
        modules.forEach(module => {
            const link = module.querySelector('a.aalink');
            if (!link) return;
            let type = 'file';
            if (module.classList.contains('modtype_folder')) type = 'folder';
            else if (module.classList.contains('modtype_assign')) type = 'assignment';
            else if (module.classList.contains('modtype_quiz')) type = 'quiz';
            const rawName = link.querySelector('.instancename')?.firstChild?.textContent || link.textContent;
            materials.push({ name: rawName.trim(), url: link.href, type });
        });
        if (materials.length > 0) units.push({ title, materials, materialCount: materials.length });
    });
    return units;
};

const downloadAndZip = async (selectedUnits) => {
    const zip = new JSZip();
    const courseTitle = document.querySelector('.page-header-headings h1')?.textContent.trim() || 'Course_Content';
    const folder = zip.folder(courseTitle);
    const btn = document.getElementById('lms-helper-download-btn');
    const originalText = btn.innerText;

    for (const unit of selectedUnits) {
        const unitFolder = folder.folder(unit.title);
        for (const material of unit.materials) {
            try {
                let fetchUrl = material.url;
                if (fetchUrl.includes('mod/resource/view.php')) fetchUrl += '&redirect=1';
                const response = await fetch(fetchUrl);
                const blob = await response.blob();
                let extension = '.pdf';
                const contentType = response.headers.get('content-type');
                if (contentType?.includes('powerpoint')) extension = '.pptx';
                else if (contentType?.includes('word')) extension = '.docx';
                let filename = material.name.replace(/[^a-z0-9]/gi, '_').trim();
                if (!filename.endsWith(extension)) filename += extension;
                unitFolder.file(filename, blob);
            } catch (err) { console.error(`Failed: ${material.name}`, err); }
        }
    }
    btn.innerText = "Generating ZIP...";
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${courseTitle}.zip`);
    btn.innerText = originalText;
};

const createDownloadModal = (units) => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '20000',
        display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)'
    });
    const modal = document.createElement('div');
    Object.assign(modal.style, { backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' });
    modal.innerHTML = `<h3 style="margin-top:0">Download Manager</h3><p>Select units to ZIP</p><div id="units-list" style="max-height:200px; overflow-y:auto; border:1px solid #eee; margin-bottom:15px;"></div>`;
    const list = modal.querySelector('#units-list');
    units.forEach((unit, i) => {
        const item = document.createElement('div');
        item.style.padding = '8px';
        item.innerHTML = `<input type="checkbox" checked id="unit-${i}"> <label for="unit-${i}">${unit.title}</label>`;
        list.appendChild(item);
    });
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex'; btnContainer.style.justifyContent = 'flex-end'; btnContainer.style.gap = '10px';
    const cancel = document.createElement('button'); cancel.innerText = 'Cancel'; cancel.onclick = () => overlay.remove();
    const go = document.createElement('button'); go.innerText = 'Download ZIP';
    Object.assign(go.style, { backgroundColor: '#0f6cbf', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' });
    go.onclick = () => {
        const selected = units.filter((_, i) => modal.querySelector(`#unit-${i}`).checked);
        if (selected.length) downloadAndZip(selected);
        overlay.remove();
    };
    btnContainer.appendChild(cancel); btnContainer.appendChild(go);
    modal.appendChild(btnContainer); overlay.appendChild(modal);
    document.body.appendChild(overlay);
};

const injectDownloadButton = () => {
    const header = document.querySelector('.page-header-headings') || document.querySelector('.header-actions-container');
    if (!header || document.getElementById('lms-helper-download-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'lms-helper-download-btn';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> Download Manager';
    Object.assign(btn.style, { marginLeft: '15px', backgroundColor: '#7c3aed', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', display: 'inline-flex', alignItems: 'center' });
    btn.onclick = () => {
        const data = extractCourseMaterials();
        if (data.length) createDownloadModal(data);
        else alert("No materials found on this page.");
    };
    header.appendChild(btn);
};

// --- DATA EXTRACTION ---
const extractUserEmail = () => {
    try {
        const bodyText = document.body.innerHTML;
        const ssnEmailMatch = bodyText.match(/([\w.-]+@ssn\.edu\.in)/);
        if (ssnEmailMatch) return { email: ssnEmailMatch[1], name: getUserName() };
        return { email: 'student@ssn.edu.in', name: getUserName() };
    } catch (e) { return { email: '', name: '' }; }
};

const getUserName = () => {
    const nameElement = document.querySelector('.usertext .text, .username, [data-username], .user-name');
    return nameElement ? nameElement.textContent.trim() : 'Student';
};

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

// --- DEEP ASSIGNMENT EXTRACTION ---
const performDeepScan = async (sendResponse) => {
    const courses = extractCourses();
    try {
        const results = await Promise.all(courses.map(async (course) => {
            try {
                const html = await fetch(course.link).then(res => res.text());
                const doc = new DOMParser().parseFromString(html, 'text/html');

                const assigns = Array.from(doc.querySelectorAll('.activity.modtype_assign'));

                return assigns.filter(item => {
                    const doneBtn = item.querySelector('button.btn-success');
                    const isDone = doneBtn?.textContent.trim().includes('Done') || !!item.querySelector('.fa-check');
                    return !isDone;
                }).map(item => {
                    const dateElements = item.querySelectorAll('[data-region="activity-dates"] div');
                    let dueDate = "No date found";
                    dateElements.forEach(el => {
                        if (el.textContent.includes('Due:')) {
                            dueDate = el.textContent.replace('Due:', '').trim();
                        }
                    });

                    return {
                        id: item.getAttribute('data-id'),
                        title: item.querySelector('.instancename')?.textContent.trim() || item.getAttribute('data-activityname'),
                        courseName: course.title,
                        url: item.querySelector('a.aalink')?.href,
                        dueDate: dueDate
                    };
                });
            } catch (e) { return []; }
        }));
        sendResponse({ success: true, assignments: results.flat() });
    } catch (e) {
        sendResponse({ success: false, error: "Scan failed" });
    }
};

// --- MESSAGE LISTENER ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SHOW_OVERLAY') {
        if (rootElement) rootElement.style.display = 'block';

        chrome.storage.local.get(['currentFile'], (result) => {
            if (result.currentFile) {
                workspaceRoot.render(
                    <AIViewer key={result.currentFile.path + Date.now()} />
                );
                sendResponse({ success: true });
            }
        });
        return true;
    }

    if (request.action === 'getUserEmail') {
        sendResponse(extractUserEmail());
        return true;
    }

    if (request.action === 'extractData') {
        sendResponse({ success: true, courses: extractCourses() });
    }

    if (request.action === 'deepExtractAssignments') {
        performDeepScan(sendResponse);
        return true;
    }
});

// Lifecycle
setInterval(() => {
    injectAIButtons();
    injectDownloadButton();
}, 2000);