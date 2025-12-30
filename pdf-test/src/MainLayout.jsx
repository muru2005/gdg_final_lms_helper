import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, RefreshCw, LogOut } from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:5000';

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ name: 'Loading...', semester: 'Sem 6' });
  const [courseCount, setCourseCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      console.error('Firestore sync error:', error);
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

              chrome.storage.local.set({
                allCourses: allFetched,
                currentSemesterCourses: filteredResults,
                pendingAssignments: pending,
                overdueAssignments: overdue,
                userEmail: userEmail,
                userName: userName,
                lastSync: now.toLocaleString()
              }, async () => {
                if (userEmail) {
                  await syncToFirestore(pending, overdue, userEmail, userName);
                }

                fetchLocalData();
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

  const navItems = [
    { path: '/main/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/main/courses', label: 'Courses', icon: BookOpen },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className='bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-5 text-white shadow-xl'>
        <div className='flex flex-row justify-between items-center'>
          <div>
            <h1 className='text-lg font-semibold tracking-tight'>{user.name}</h1>
            <p className='text-xs font-medium opacity-80 mt-0.5'>{user.semester} • {courseCount} Courses</p>
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className='p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all duration-200 border border-white/20 backdrop-blur-sm disabled:opacity-50'
              title="Refresh Data"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleLogout}
              className='p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-all duration-200 border border-white/20 backdrop-blur-sm'
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <Outlet />
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-200/50 px-6 py-3 flex justify-around items-center shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.includes(item.path.split('/').pop());
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all duration-200 ${isActive
                  ? 'text-violet-600 bg-violet-50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MainLayout;