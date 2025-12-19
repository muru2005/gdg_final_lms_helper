import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ name: 'Loading...', semester: 'Sem 6' });
  const [courseCount, setCourseCount] = useState(0);

  useEffect(() => {
    // We check storage for 'user' and 'allCourses' which DataSync now provides
    chrome.storage.local.get(['user', 'allCourses'], (result) => {
      if (result.user) {
        setUser({
          name: result.user.name || 'Student',
          semester: 'Sem 6'
        });
      }
      if (result.allCourses) {
        setCourseCount(result.allCourses.length);
      }
    });
  }, []);

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