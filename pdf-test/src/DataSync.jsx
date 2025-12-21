import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DataSync = () => {
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const handleSync = async () => {
  setStatus('Reading LMS Courses...');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url.includes('lms.ssn.edu.in')) {
    setStatus('Error: Open LMS Dashboard first!');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (courseResponse) => {
    if (courseResponse?.success) {
      setStatus('Deep Scanning for Assignments...');

      chrome.tabs.sendMessage(tab.id, { action: 'deepExtractAssignments' }, (assignResponse) => {
        if (assignResponse?.success) {
          const allFetched = courseResponse.courses;
          const rawAllUnfinished = assignResponse.assignments;
          
          const now = new Date();
          const currentyearcode = now.getFullYear() % 100;
          const targetyearplusone = (currentyearcode + 1).toString();
          const targetyear = (currentyearcode).toString();

          const getCourseYear = (title) => {
            const match = title.match(/[A-Z]{3}(\d{2})\d{2}/i);
            return match ? match[1] : null;
          };

          let filteredResults = allFetched.filter(course => getCourseYear(course.title) === targetyearplusone);
          if (filteredResults.length === 0) {
            filteredResults = allFetched.filter(course => getCourseYear(course.title) === targetyear);
          }

          const currentCourseTitles = new Set(filteredResults.map(c => c.title));
          
          // --- NEW: Split logic for Pending vs Overdue ---
          const pending = [];
          const overdue = [];

          rawAllUnfinished.forEach(assign => {
            if (currentCourseTitles.has(assign.courseName)) {
              const dueDateObj = new Date(assign.dueDate);
              
              // If current time is greater than due date, it's overdue
              if (now > dueDateObj) {
                overdue.push(assign);
              } else {
                pending.push(assign);
              }
            }
          });

          const lmsStats = {
            currentCount: filteredResults.length,
            totalCount: allFetched.length,
            overdueCount: overdue.length, // Only the past-due ones
            pendingCount: pending.length, // Only the upcoming ones
            semester: 6 
          };

          chrome.storage.local.set({ 
            allCourses: allFetched,
            currentSemesterCourses: filteredResults,
            pendingAssignments: pending,
            overdueAssignments: overdue,
            lmsStats: lmsStats,
            lastSync: now.toLocaleString()
          }, () => {
            setStatus(`Sync Complete! ${pending.length} Pending, ${overdue.length} Overdue.`);
            setTimeout(() => navigate('/main/dashboard'), 1500);
          });
        } else {
          setStatus('Error: Assignment deep scan failed.');
        }
      });
    } else {
      setStatus(`Error: ${courseResponse?.error || 'Failed to extract courses'}`);
    }
  });
};
  

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 text-center">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl mb-4">🔄</div>
      <h2 className="text-xl font-bold text-slate-800">Sync LMS Data</h2>
      <p className="text-sm text-slate-500 mb-6 px-4">Click below to fetch your Semester courses from the LMS website.</p>
      
      <button onClick={handleSync} className="px-6 py-3 rounded-md bg-amber-500 hover:bg-amber-700 text-shadow-blue-50 font-bold text-2xl">
        Extract Now
      </button>
      
      {status && <p className="mt-4 text-xs font-medium text-purple-600">{status}</p>}
    </div>
  );
};

export default DataSync;