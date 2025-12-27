import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
const BACKEND_URL = 'http://127.0.0.1:5000';

const DataSync = () => {
  const [status, setStatus] = useState('');
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

  const syncToFirestore = async (pending, overdue, email, name) => {
    try {
      setStatus('☁️ Syncing to cloud database...');
      
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
        console.log('✅ Firestore sync:', result);
        return true;
      } else {
        console.error('❌ Sync failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
      return false;
    }
  };

  const handleSync = async () => {
    setStatus('Reading LMS Courses...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url.includes('lms.ssn.edu.in')) {
      setStatus('❌ Error: Open LMS Dashboard first!');
      return;
    }

    // First get user email from LMS page
    chrome.tabs.sendMessage(tab.id, { action: 'getUserEmail' }, async (emailResponse) => {
      let userEmail = emailResponse?.email || userInfo?.email || '';
      let userName = emailResponse?.name || userInfo?.name || 'Student';

      // Validate email
      if (!userEmail) {
        setStatus('⚠️ Could not detect email. Please ensure you are logged into LMS.');
        // Continue anyway, but won't sync to Firestore
      }

      // Store user info for later use
      if (userEmail) {
        chrome.storage.local.set({ userEmail, userName });
      }

      setStatus('📚 Extracting courses...');

      chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (courseResponse) => {
        if (courseResponse?.success) {
          setStatus('🔍 Deep scanning for assignments...');

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

              // Store locally first
              setStatus('💾 Saving locally...');
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
                // Then sync to Firestore if we have email
                if (userEmail) {
                  const syncSuccess = await syncToFirestore(pending, overdue, userEmail, userName);
                  
                  if (syncSuccess) {
                    setStatus(`✅ Complete! ${pending.length} Pending, ${overdue.length} Overdue. Email reminders enabled.`);
                  } else {
                    setStatus(`✅ Local sync OK. ${pending.length} Pending, ${overdue.length} Overdue. (Cloud sync failed)`);
                  }
                } else {
                  setStatus(`✅ Complete! ${pending.length} Pending, ${overdue.length} Overdue. (No email reminders)`);
                }
                
                setTimeout(() => navigate('/main/dashboard'), 2000);
              });
            } else {
              setStatus('❌ Error: Assignment deep scan failed.');
            }
          });
        } else {
          setStatus(`❌ Error: ${courseResponse?.error || 'Failed to extract courses'}`);
        }
      });
    });
  };
  

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 text-center">
      <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl mb-4">🔄</div>
      <h2 className="text-xl font-bold text-slate-800">Sync LMS Data</h2>
      <p className="text-sm text-slate-500 mb-6 px-4">Click below to fetch your Semester courses from the LMS website.</p>
      {userInfo && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700">
            📧 {userInfo.email}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Email reminders will be enabled
          </p>
        </div>
      )}
      <button onClick={handleSync} className="px-6 py-3 rounded-md bg-amber-500 hover:bg-amber-700 text-shadow-blue-50 font-bold text-2xl">
        Extract Now
      </button>
      
      {status && <p className="mt-4 text-xs font-medium text-purple-600">{status}</p>}
    </div>
  );
};

export default DataSync;