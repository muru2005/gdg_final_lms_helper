import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Cloud, BookOpen, Search, HardDrive, Mail, Download } from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:5000';

const DataSync = () => {
  const [status, setStatus] = useState('');
  const [statusIcon, setStatusIcon] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'getUserProfile' }, (response) => {
      if (response?.ok) {
        setUserInfo(response.profile);
        console.log('User profile loaded:', response.profile);
      }
    });
  }, []);

  const updateStatus = (message, icon = null) => {
    setStatus(message);
    setStatusIcon(icon);
  };

  const syncToFirestore = async (pending, overdue, email, name) => {
    try {
      updateStatus('Syncing to cloud database...', Cloud);

      const response = await fetch(`${BACKEND_URL}/api/sync-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          name: name,
          pendingAssignments: pending,
          overdueAssignments: overdue
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('Firestore sync:', result);
        return true;
      } else {
        console.error('Sync failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Sync error:', error);
      return false;
    }
  };

  const handleSync = async () => {
    updateStatus('Reading LMS Courses...', BookOpen);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url.includes('lms.ssn.edu.in')) {
      updateStatus('Error: Open LMS Dashboard first!', null);
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getUserEmail' }, async (emailResponse) => {
      let userEmail = emailResponse?.email || userInfo?.email || '';
      let userName = emailResponse?.name || userInfo?.name || 'Student';

      if (!userEmail) {
        updateStatus('Could not detect email. Please ensure you are logged into LMS.', null);
      }

      if (userEmail) {
        chrome.storage.local.set({ userEmail, userName });
      }

      updateStatus('Extracting courses...', BookOpen);

      chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (courseResponse) => {
        if (courseResponse?.success) {
          updateStatus('Deep scanning for assignments...', Search);

          chrome.tabs.sendMessage(tab.id, { action: 'deepExtractAssignments' }, async (assignResponse) => {
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

              const pending = [];
              const overdue = [];

              rawAllUnfinished.forEach(assign => {
                if (currentCourseTitles.has(assign.courseName)) {
                  const dueDateObj = new Date(assign.dueDate);

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
                overdueCount: overdue.length,
                pendingCount: pending.length,
                semester: 6
              };

              updateStatus('Saving locally...', HardDrive);
              console.log('Storing data:', {
                allCourses: allFetched,
                currentSemesterCourses: filteredResults,
                pendingAssignments: pending,
                overdueAssignments: overdue,
                lmsStats: lmsStats,
                userEmail: userEmail,
                userName: userName
              });

              chrome.storage.local.set({
                allCourses: allFetched,
                currentSemesterCourses: filteredResults,
                pendingAssignments: pending,
                overdueAssignments: overdue,
                lmsStats: lmsStats,
                lastSync: now.toLocaleString(),
                userEmail: userEmail,
                userName: userName
              }, async () => {
                if (userEmail) {
                  const syncSuccess = await syncToFirestore(pending, overdue, userEmail, userName);

                  if (syncSuccess) {
                    updateStatus(`Complete! ${pending.length} Pending, ${overdue.length} Overdue. Email reminders enabled.`, null);
                  } else {
                    updateStatus(`Local sync OK. ${pending.length} Pending, ${overdue.length} Overdue. (Cloud sync failed)`, null);
                  }
                } else {
                  updateStatus(`Complete! ${pending.length} Pending, ${overdue.length} Overdue. (No email reminders)`, null);
                }

                setTimeout(() => navigate('/main/dashboard'), 2000);
              });
            } else {
              updateStatus('Error: Assignment deep scan failed.', null);
            }
          });
        } else {
          updateStatus(`Error: ${courseResponse?.error || 'Failed to extract courses'}`, null);
        }
      });
    });
  };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 text-center">
      {/* Sync Icon */}
      <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-100 rounded-2xl flex items-center justify-center text-violet-600 mb-4 shadow-lg shadow-violet-100">
        <RefreshCw size={28} />
      </div>

      <h2 className="text-xl font-bold text-slate-800">Sync LMS Data</h2>
      <p className="text-sm text-slate-500 mb-6 px-4 max-w-xs">
        Click below to fetch your Semester courses from the LMS website.
      </p>

      {/* User Info Card */}
      {userInfo && (
        <div className="mb-5 p-4 bg-white rounded-xl border border-slate-100 shadow-sm w-full max-w-xs">
          <div className="flex items-center gap-2 text-slate-600 text-sm">
            <Mail size={14} />
            <span className="font-medium">{userInfo.email}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Email reminders will be enabled
          </p>
        </div>
      )}

      {/* Sync Button */}
      <button
        onClick={handleSync}
        className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-semibold text-base shadow-lg shadow-violet-200 transition-all duration-200 flex items-center gap-2"
      >
        <Download size={18} />
        Extract Now
      </button>

      {/* Status Message */}
      {status && (
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-violet-600">
          {statusIcon && React.createElement(statusIcon, { size: 14, className: 'animate-pulse' })}
          <span>{status}</span>
        </div>
      )}
    </div>
  );
};

export default DataSync;