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

            const handleAction = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); 

                const aalink = item.querySelector('a.aalink');
                const link = aalink?.href;
                const cleanName = item.querySelector('.instancename')?.textContent.replace(/File|Assignment/gi, '').trim(); 

                console.log(`[UI] Hijacked click for ${tool.action}. Preventing redirect...`);

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

            btn.addEventListener('click', handleAction, true);
            btn.addEventListener('mousedown', (e) => e.stopPropagation());
            btnWrapper.appendChild(btn);
        });
        nameContainer.appendChild(btnWrapper);
    });
};

// --- START DOWNLOADER LOGIC ---

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
            } catch (err) {
                console.error(`Failed: ${material.name}`, err);
            }
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
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.gap = '10px';

    const cancel = document.createElement('button');
    cancel.innerText = 'Cancel';
    cancel.onclick = () => overlay.remove();

    const go = document.createElement('button');
    go.innerText = 'Download ZIP';
    Object.assign(go.style, { backgroundColor: '#0f6cbf', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer' });
    
    go.onclick = () => {
        const selected = units.filter((_, i) => modal.querySelector(`#unit-${i}`).checked);
        if (selected.length) downloadAndZip(selected);
        overlay.remove();
    };

    btnContainer.appendChild(cancel);
    btnContainer.appendChild(go);
    modal.appendChild(btnContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
};

const injectDownloadButton = () => {
    const header = document.querySelector('.page-header-headings') || document.querySelector('.header-actions-container');
    if (!header || document.getElementById('lms-helper-download-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'lms-helper-download-btn';
    btn.innerText = "📥 Download Manager";
    Object.assign(btn.style, {
        marginLeft: '15px', backgroundColor: '#0f6cbf', color: 'white', border: 'none', 
        padding: '8px 16px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
    });

    btn.onclick = () => {
        const data = extractCourseMaterials();
        if (data.length) createDownloadModal(data);
        else alert("No materials found on this page.");
    };
    header.appendChild(btn);
};

// --- END DOWNLOADER LOGIC ---

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

// 4. DEEP SCAN
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
        return true; 
    }
});

setInterval(() => {
    injectAIButtons();
    injectDownloadButton();
}, 2000);