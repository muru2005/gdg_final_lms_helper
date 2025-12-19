/* LMS Helper Content Script
  This script runs directly on lms.ssn.edu.in
*/

(() => {
  // Prevent multiple injections
  if (window.lmsHelperInjected) return;
  window.lmsHelperInjected = true;

  console.log('LMS Helper: Content script active on', window.location.href);

  // --- 1. EXTRACTION FUNCTIONS (Your existing logic) ---

  const extractCourses = () => {
    const courses = [];
    const selectors = [
      'a[href*="/course/view.php"]', 'a[href*="course/view"]',
      '.coursebox a', '.course-listitem a', '.dashboard-card a',
      '.block_myoverview a', '.course-title a'
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(link => {
        const href = link.href;
        if (!href || !href.includes('course')) return;
        
        let title = link.textContent.trim();
        if (title.length > 2 && !courses.some(c => c.title === title)) {
          const courseId = href.match(/id=(\d+)/)?.[1] || '';
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
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      if (!checkIfLoggedIn()) {
        sendResponse({ success: false, error: 'Not logged in to LMS' });
        return;
      }
      sendResponse({
        success: true,
        courses: extractCourses(),
        url: window.location.href
      });
    }

    if (request.action === 'extractCourseMaterials') {
      sendResponse({
        success: true,
        materials: extractCourseMaterials(),
      });
    }
    return true; 
  });
})();