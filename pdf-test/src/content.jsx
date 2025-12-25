/* global chrome */
import React from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
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

// --- NEW DOWNLOAD MANAGER LOGIC FROM HERE ---

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

      let type = 'unknown';
      if (module.classList.contains('modtype_resource')) {
        if (link.href.includes('.pdf')) type = 'pdf';
        else if (link.href.includes('.ppt')) type = 'ppt';
        else type = 'file';
      } else if (module.classList.contains('modtype_folder')) {
        type = 'folder';
      } else if (module.classList.contains('modtype_assign')) {
        type = 'assignment';
      } else if (module.classList.contains('modtype_quiz')) {
        type = 'quiz';
      }

      const completionEl = module.querySelector('.completioninfo') || module.querySelector('[data-region="completion-info"]');
      let isDone = false;

      if (completionEl) {
        const button = completionEl.querySelector('button');
        if (button) {
          isDone = button.innerText.includes('Done');
        } else {
          isDone = completionEl.querySelector('.fa-check') !== null;
        }
      }

      const rawName = link.querySelector('.instancename')?.firstChild?.textContent || link.textContent;
      const name = rawName.trim();

      materials.push({
        name: name,
        url: link.href,
        type: type,
        isDone: isDone
      });
    });

    if (materials.length > 0) {
      units.push({ title, materials, materialCount: materials.length });
    }
  });

  return units;
};

const downloadAndZip = async (selectedUnits) => {
  const zip = new JSZip();
  const courseTitle = document.querySelector('.page-header-headings h1')?.textContent.trim() || 'Course_Content';
  const folder = zip.folder(courseTitle);

  let totalFiles = 0;
  let processedFiles = 0;

  selectedUnits.forEach(unit => totalFiles += unit.materials.length);

  if (totalFiles === 0) {
    alert("No files to download.");
    return;
  }

  const btn = document.getElementById('lms-helper-download-btn');
  const originalText = btn.innerText;
  btn.innerText = `Preparing... (0/${totalFiles})`;

  for (const unit of selectedUnits) {
    const unitFolder = folder.folder(unit.title);

    for (const material of unit.materials) {
      try {
        if (!material.url) continue;

        let fetchUrl = material.url;
        if (fetchUrl.includes('mod/resource/view.php')) {
          fetchUrl += '&redirect=1';
        }

        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`Failed to fetch`);

        const blob = await response.blob();

        let extension = '';
        const contentType = response.headers.get('content-type');
        if (contentType) {
          if (contentType.includes('pdf')) extension = '.pdf';
          else if (contentType.includes('powerpoint')) extension = '.pptx';
          else if (contentType.includes('word')) extension = '.docx';
          else if (contentType.includes('image/jpeg')) extension = '.jpg';
          else if (contentType.includes('image/png')) extension = '.png';
          else if (contentType.includes('text/plain')) extension = '.txt';
        }

        if (!extension && !material.name.includes('.')) {
          extension = '.html';
        }

        let filename = material.name.replace(/[^a-z0-9]/gi, '_').trim();
        if (!filename.endsWith(extension)) filename += extension;

        unitFolder.file(filename, blob);

      } catch (err) {
        console.error(`Failed to download ${material.name}:`, err);
        unitFolder.file(`${material.name}_ERROR.txt`, `Error: ${err.message}`);
      }

      processedFiles++;
      btn.innerText = `Zipping... (${processedFiles}/${totalFiles})`;
    }
  }

  btn.innerText = "Generating ZIP...";
  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, `${courseTitle}.zip`);
  btn.innerText = originalText;
};

const createModal = (units) => {
  const existingModal = document.getElementById('lms-helper-modal');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '10000', display: 'flex',
    justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(2px)'
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    backgroundColor: 'white', padding: '24px', borderRadius: '12px',
    width: '400px', maxWidth: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  });

  const header = document.createElement('div');
  header.style.marginBottom = '16px';
  header.innerHTML = `<h2 style="margin:0; font-size:1.25rem; font-weight:600; color:#111;">Download Content</h2><p style="margin:4px 0 0; color:#666; font-size:0.9rem;">Select units to extract</p>`;

  const listContainer = document.createElement('div');
  Object.assign(listContainer.style, {
    maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', border: '1px solid #eee', borderRadius: '6px'
  });

  const toggleAllDiv = document.createElement('div');
  Object.assign(toggleAllDiv.style, { padding: '10px 12px', borderBottom: '1px solid #eee', backgroundColor: '#f9fafb', fontWeight: '500', fontSize: '14px', display: 'flex', alignItems: 'center' });
  const toggleAllCheckbox = document.createElement('input');
  toggleAllCheckbox.type = 'checkbox';
  toggleAllCheckbox.checked = true;
  toggleAllCheckbox.style.marginRight = '10px';
  toggleAllDiv.appendChild(toggleAllCheckbox);
  toggleAllDiv.appendChild(document.createTextNode('Select All'));
  listContainer.appendChild(toggleAllDiv);

  const checkboxes = [];

  units.forEach((unit, index) => {
    const row = document.createElement('div');
    Object.assign(row.style, { padding: '10px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', fontSize: '14px' });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.style.marginRight = '10px';
    cb.dataset.index = index;

    const label = document.createElement('span');
    label.textContent = `${unit.title} (${unit.materialCount} items)`;

    row.appendChild(cb);
    row.appendChild(label);
    listContainer.appendChild(row);
    checkboxes.push(cb);
  });

  modal.appendChild(header);
  modal.appendChild(listContainer);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '10px';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  Object.assign(cancelBtn.style, {
    padding: '8px 16px', borderRadius: '6px', border: '1px solid #ddd', backgroundColor: 'white', cursor: 'pointer'
  });
  cancelBtn.onclick = () => overlay.remove();

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Download & Zip';
  Object.assign(confirmBtn.style, {
    padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#0f6cbf', color: 'white', cursor: 'pointer', fontWeight: '500'
  });

  toggleAllCheckbox.onchange = (e) => {
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  };

  confirmBtn.onclick = () => {
    const selectedIndices = checkboxes.filter(cb => cb.checked).map(cb => parseInt(cb.dataset.index));
    if (selectedIndices.length === 0) {
      alert('Please select at least one unit.');
      return;
    }
    const selectedData = units.filter((_, idx) => selectedIndices.includes(idx));
    downloadAndZip(selectedData);
    overlay.remove();
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
};

const injectDownloadButton = () => {
  const headerContainer = document.querySelector('.header-actions-container') || document.querySelector('.page-header-headings');
  if (!headerContainer || document.getElementById('lms-helper-download-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'lms-helper-download-btn';
  btn.innerText = "📥 Download Manager";
  btn.className = "btn btn-primary";

  Object.assign(btn.style, {
    marginLeft: '15px', fontWeight: '600', backgroundColor: '#0f6cbf',
    color: 'white', border: 'none', padding: '8px 16px',
    borderRadius: '5px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  });

  btn.onclick = (e) => {
    e.preventDefault();
    const allData = extractCourseMaterials();
    if (allData.length === 0) {
      alert('No downloadable content found on this page.');
      return;
    }
    createModal(allData);
  };

  headerContainer.appendChild(btn);
};

// --- END DOWNLOAD MANAGER LOGIC ---

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
setInterval(() => {
  injectAIButtons();
  injectDownloadButton(); // Call our new injector
}, 2000);

console.log('LMS Helper: Immersive Content Script Active');