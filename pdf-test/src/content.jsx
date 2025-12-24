/* LMS Helper Content Script
  This script runs directly on lms.ssn.edu.in
*/
const injectAIButtons = () => {
  // 1. Target both Resources and Assignments
  const modules = document.querySelectorAll('.activity.modtype_resource, .activity.modtype_assign');

  modules.forEach(item => {
    // Prevent duplicate buttons
    if (item.querySelector('.lms-ai-btn-wrapper')) return;

    // 2. Find the activity name container
    const nameContainer = item.querySelector('.activityname');
    if (!nameContainer) return;

    // 3. Create the button wrapper
    const btnWrapper = document.createElement('span');
    btnWrapper.className = 'lms-ai-btn-wrapper';

    // Inline styles for side-by-side alignment
    Object.assign(btnWrapper.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      marginLeft: '12px',
      position: 'relative', // Sits on top of the stretched-link
      zIndex: '10',
      verticalAlign: 'middle'
    });

    // Tool configuration
    const tools = [
      { label: '👁️', color: '#4f46e5', title: 'Quick View' },
      { label: '🧠', color: '#0891b2', title: 'Mindmap' },
      { label: '📄', color: '#059669', title: 'Summarize' }
    ];

    tools.forEach(tool => {
      const btn = document.createElement('button');
      btn.innerHTML = tool.label;
      btn.title = tool.title;

      // Inline Styles mimicking Tailwind
      Object.assign(btn.style, {
        backgroundColor: tool.color,
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '3px 7px',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        lineHeight: '1',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
      });

      // Interactive hover effect
      btn.onmouseover = () => {
        btn.style.transform = 'translateY(-1px)';
        btn.style.filter = 'brightness(1.1)';
      };
      btn.onmouseout = () => {
        btn.style.transform = 'translateY(0)';
        btn.style.filter = 'brightness(1)';
      };

      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const link = item.querySelector('a.aalink')?.href;
        const rawName = item.querySelector('.instancename')?.textContent || '';
        const cleanName = rawName.replace(/File|Assignment/gi, '').trim();

        // Handle different tools
        if (tool.title === 'Quick View') {
          await handleQuickView(link, cleanName);
        } else if (tool.title === 'Mindmap') {
          await handleMindmap(link, cleanName);
        } else if (tool.title === 'Summarize') {
          await handleSummarize(link, cleanName);
        }
      };

      btnWrapper.appendChild(btn);
    });

    // 4. Append to the title container
    nameContainer.appendChild(btnWrapper);
  });
};

// AI Tool Handlers
const handleQuickView = async (fileUrl, fileName) => {
  console.log('[Content] Handling Quick View:', fileName, fileUrl);
  try {
    console.log('[Content] Sending OPEN_FILE_VIEWER message to background');
    chrome.runtime.sendMessage({
      action: 'OPEN_FILE_VIEWER',
      filePath: `lms_${Date.now()}`,
      fileName: fileName,
      fileUrl: fileUrl
    }, (response) => {
      console.log('[Content] Received response for OPEN_FILE_VIEWER:', response);
      if (chrome.runtime.lastError) {
        console.error('[Content] Runtime error:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('[Content] Quick View error:', error);
    alert('Error opening file viewer');
  }
};

const handleMindmap = async (fileUrl, fileName) => {
  console.log('[Content] Handling Mindmap:', fileName, fileUrl);
  try {
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'lms-ai-loading';
    loadingDiv.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000; text-align: center;
        `;
    loadingDiv.innerHTML = '<div>🧠 Generating Mind Map...</div><div style="margin-top: 10px; font-size: 12px; color: #666;">This may take a moment</div>';
    document.body.appendChild(loadingDiv);

    console.log('[Content] Fetching file content...');
    // Download file content (Allowed because strictly same-origin or CORS enabled on resource)
    const response = await fetch(fileUrl);
    const text = await response.text();
    console.log('[Content] File content fetched. Length:', text.length);

    console.log('[Content] Sending GENERATE_MINDMAP message to background...');
    chrome.runtime.sendMessage({
      action: 'GENERATE_MINDMAP',
      text: text,
      fileName: fileName
    }, (response) => {
      console.log('[Content] Background response:', response);
      const loading = document.getElementById('lms-ai-loading');
      if (loading) document.body.removeChild(loading);

      if (chrome.runtime.lastError) {
        console.error('[Content] Runtime Error:', chrome.runtime.lastError);
        alert('Error: ' + chrome.runtime.lastError.message);
      } else if (response && !response.ok) {
        console.error('[Content] Background Error:', response.error);
        alert('Error generating mindmap: ' + response.error);
      }
    });

  } catch (error) {
    console.error('[Content] Mindmap error:', error);
    const loading = document.getElementById('lms-ai-loading');
    if (loading) document.body.removeChild(loading);
    alert('Error fetching file: ' + error.message);
  }
};

const handleSummarize = async (fileUrl, fileName) => {
  console.log('[Content] Handling Summarize:', fileName, fileUrl);
  try {
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'lms-ai-loading-sum';
    loadingDiv.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000; text-align: center;
        `;
    loadingDiv.innerHTML = '<div>📄 Generating Summary...</div><div style="margin-top: 10px; font-size: 12px; color: #666;">Analyzing document content</div>';
    document.body.appendChild(loadingDiv);

    console.log('[Content] Fetching file content...');
    const response = await fetch(fileUrl);
    const text = await response.text();
    console.log('[Content] File content fetched. Length:', text.length);

    console.log('[Content] Sending GENERATE_SUMMARY message to background...');
    chrome.runtime.sendMessage({
      action: 'GENERATE_SUMMARY',
      text: text,
      fileName: fileName
    }, (response) => {
      console.log('[Content] Background response:', response);
      const loading = document.getElementById('lms-ai-loading-sum');
      if (loading) document.body.removeChild(loading);

      if (chrome.runtime.lastError) {
        console.error('[Content] Runtime Error:', chrome.runtime.lastError);
        alert('Error: ' + chrome.runtime.lastError.message);
      } else if (response && !response.ok) {
        console.error('[Content] Background Error:', response.error);
        alert('Error generating summary: ' + response.error);
      }
    });

  } catch (error) {
    console.error('[Content] Summary error:', error);
    const loading = document.getElementById('lms-ai-loading-sum');
    if (loading) document.body.removeChild(loading);
    alert('Error fetching file: ' + error.message);
  }
};

// Check for new elements every 2 seconds
setInterval(injectAIButtons, 2000);
(() => {
  // Prevent multiple injections
  if (window.lmsHelperInjected) return;
  window.lmsHelperInjected = true;

  console.log('LMS Helper: Content script active on', window.location.href);

  // Add CORS headers for local development
  if (window.location.hostname === 'localhost') {
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      if (args[1]) {
        args[1].mode = 'cors';
      }
      return originalFetch.apply(this, args);
    };
  }

  // --- 1. EXTRACTION FUNCTIONS (Your existing logic) ---
  const extractCourses = () => {
    const courses = [];
    const seenIds = new Set();

    const selectors = [
      'a[href*="/course/view.php"]', 'a[href*="course/view"]',
      '.coursebox a', '.course-listitem a', '.dashboard-card a',
      '.block_myoverview a', '.course-title a'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(link => {
        const href = link.href;
        if (!href || !href.includes('course')) return;

        const courseId = href.match(/id=(\d+)/)?.[1];
        if (!courseId || seenIds.has(courseId)) return;

        let title = link.textContent.trim().replace(/\s+/g, ' ');

        // --- EXPANDED FILTER LOGIC ---
        // 1. Matches codes with underscores/dashes (UHS2241_HR1 or 2023-2024)
        const hasCourseCode = /[A-Z]{3}\d{4}[_]?[A-Z0-9]*/i.test(title) || /[0-9]{4}-[0-9]{4}/.test(title);

        // 2. Matches Semester/Training indicators (IV Sem, CDC Training)
        const isTrainingOrSem = /(?:I|V|X|L|M){1,3}\s?Sem|CDC|Training|Placement/i.test(title);

        // 3. Keep standard academic keywords
        const isAcademic = /[0-9]/.test(title) || /Semester|Edition|Lab|Project/i.test(title);

        // Validation: Include if it matches your specific training/code patterns
        if (hasCourseCode || isTrainingOrSem || isAcademic) {
          seenIds.add(courseId);
          courses.push({ id: courseId, title, link: href });
        }
      });
    });
    return courses;
  };

  const extractCourseMaterials = () => {
    const units = [];
    const sections = document.querySelectorAll('li.section.main');

    sections.forEach((section) => {
      const titleEl = section.querySelector('.sectionname span') || section.querySelector('h3.sectionname');
      const title = titleEl?.textContent.trim();
      if (!title || title === 'General') return;

      const materials = [];
      section.querySelectorAll('.activity, .resource').forEach(element => {
        const link = element.querySelector('a[href]');
        if (!link) return;

        let type = 'file';
        if (link.href.includes('.pdf')) type = 'pdf';
        else if (link.href.includes('.ppt')) type = 'ppt';

        materials.push({
          name: link.textContent.trim().replace(/\s+/g, ' '),
          url: link.href,
          type: type,
          icon: type === 'pdf' ? '📄' : '📁'
        });
      });

      if (materials.length > 0) {
        units.push({ title, materials, materialCount: materials.length });
      }
    });
    return units;
  };

  const checkIfLoggedIn = () => !!(document.querySelector('a[href*="logout"]') || document.querySelector('.usermenu'));

  // --- 2. MESSAGE LISTENER ---
  // This connects the content script to your React Side Panel
  // --- 2. MESSAGE LISTENER ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      if (!checkIfLoggedIn()) {
        sendResponse({ success: false, error: 'Not logged in to LMS' });
        return;
      }
      sendResponse({ success: true, courses: extractCourses() });
    }

    if (request.action === 'deepExtractAssignments') {
      const courses = extractCourses();

      const assignmentPromises = courses.map(async (course) => {
        try {
          const html = await fetch(course.link).then(res => res.text());
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

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
              title: item.getAttribute('data-activityname'),
              courseName: course.title,
              url: item.querySelector('a.aalink')?.href,
              dueDate: dueDate
            };
          });
        } catch (e) { return []; }
      });

      Promise.all(assignmentPromises).then(results => {
        sendResponse({ success: true, assignments: results.flat() });
      });
      return true;
    }
  });

})();