import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
const BACKEND_URL = 'http://127.0.0.1:5000';
const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ name: 'Loading...', semester: 'Sem 6' });
  const [courseCount, setCourseCount] = useState(0);
  const [isRefreshing, setIsRefreshing]=useState(false);
  const fetchLocalData = () => {
    chrome.storage.local.get(['user', 'allCourses', 'userName'], (result) => {
      setUser({
        name: result.user?.name || 'Student',
        semester: 'Sem 6'
      });
      if (result.allCourses) {
        setCourseCount(result.allCourses.length);
      }
    });
  };

  useEffect(() => {
    fetchLocalData();
  }, []);
  const syncToFirestore = async (pending, overdue, email, name) => {
    try {
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
      return result.success;
    } catch (error) {
      console.error('❌ Firestore sync error:', error);
      return false;
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url.includes('lms.ssn.edu.in')) {
      alert('Please open the LMS Dashboard tab first!');
      setIsRefreshing(false);
      return;
    }

    // --- START DATA SYNC LOGIC (Copied from DataSync) ---
    chrome.tabs.sendMessage(tab.id, { action: 'getUserEmail' }, async (emailResponse) => {
      const userEmail = emailResponse?.email || '';
      const userName = emailResponse?.name || 'Student';

      chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (courseResponse) => {
        if (courseResponse?.success) {
          chrome.tabs.sendMessage(tab.id, { action: 'deepExtractAssignments' }, async (assignResponse) => {
            if (assignResponse?.success) {
              const allFetched = courseResponse.courses;
              const rawAllUnfinished = assignResponse.assignments;
              const now = new Date();
              
              // Filtering logic
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
                  if (now > dueDateObj) overdue.push(assign);
                  else pending.push(assign);
                }
              });

              // Saving to Storage
              chrome.storage.local.set({ 
                allCourses: allFetched,
                currentSemesterCourses: filteredResults,
                pendingAssignments: pending,
                overdueAssignments: overdue,
                userEmail: userEmail,
                userName: userName,
                lastSync: now.toLocaleString()
              }, async () => {
                // Cloud Sync
                if (userEmail) {
                  await syncToFirestore(pending, overdue, userEmail, userName);
                }
                
                fetchLocalData(); // Update the Header UI
                setIsRefreshing(false);
                alert('Sync Complete!');
              });
            } else {
              setIsRefreshing(false);
            }
          });
        } else {
          setIsRefreshing(false);
        }
      });
    });
  };
  const handleLogout = () => {
    chrome.storage.local.clear(() => {
      navigate('/');
    });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <div className='bg-gradient-to-r from-[#6a5af9] to-[#8c7cfd] p-6 text-white shadow-lg'>
        <div className='flex flex-row justify-between items-center'>
          <div>
            <h1 className='text-xl font-bold tracking-tight'>{user.name}</h1>
            <p className='text-xs font-bold opacity-90'>{user.semester} • {courseCount} Courses</p>
          </div>
          <button 
            onClick={handleLogout} 
            className='px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors font-bold text-sm border border-white/30'
          >
            Logout
          </button>
         
        </div>
      </div>
      <div className='flex flex-row justify-center align items-center'>
       <button  onClick={handleRefresh} className=' h-[50px] w-[80px]  text-center px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-200 transition-colors font-bold text-sm border border-white/30'>Refresh</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <Outlet /> 
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => navigate('/main/dashboard')}
          className={`flex flex-col items-center gap-1 ${location.pathname.includes('dashboard') ? 'text-[#6a5af9]' : 'text-slate-400'}`}
        >
          <span className="text-xl">📊</span>
          <span className="text-[10px] font-bold">Dashboard</span>
        </button>
        
        <button 
          onClick={() => navigate('/main/courses')}
          className={`flex flex-col items-center gap-1 ${location.pathname.includes('courses') ? 'text-[#6a5af9]' : 'text-slate-400'}`}
        >
          <span className="text-xl">📚</span>
          <span className="text-[10px] font-bold">Courses</span>
        </button>
      </div>
    </div>
  );
};

export default MainLayout;