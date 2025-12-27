import React, { useEffect, useState } from 'react';

const Dashboard = () => {
  const [Stats, setStats] = useState({ currentCount: 0, totalCount: 0, pendingCount: 0, overdueCount: 0, semester: 6 });
  const [overdueAssignments, setOverdueAssignments] = useState([]);
  const [pendingAssignments, setPendingAssignments] = useState([]);

  useEffect(() => {
    chrome.storage.local.get(['lmsStats', 'overdueAssignments', 'pendingAssignments'], (result) => {
      if (result.lmsStats) {
        setStats(result.lmsStats);
      }
      if (result.overdueAssignments) {
        setOverdueAssignments(result.overdueAssignments);
      }
      if (result.pendingAssignments) {
        setPendingAssignments(result.pendingAssignments);
      }
    });
  }, []);

  return (
    <div className='p-4 bg-slate-50 min-h-screen font-sans text-slate-900'>
      <div className='grid grid-cols-2 gap-4 mb-6'>
        <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center text-white'>
          <h1 className='text-2xl font-bold'>{Stats.currentCount}</h1>
          <p className='text-xs opacity-90'>Current Courses</p>
        </div>
        <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center text-white'>
          <h1 className='text-2xl font-bold'>{Stats.totalCount}</h1>
          <p className='text-xs opacity-90'>Total Courses</p>
        </div>
        <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center text-white'>
          <h1 className='text-2xl font-bold'>{Stats.overdueCount}</h1>
          <p className='text-xs opacity-90'>Overdue Tasks</p>
        </div>
        <div className='bg-indigo-600 p-5 rounded-2xl flex flex-col items-center justify-center text-white'>
          <h1 className='text-2xl font-bold'>{Stats.semester}</h1>
          <p className='text-xs opacity-90'>Semester</p>
        </div>
      </div>

      <div className='p-2'>
        <h3 className='text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider'>Overdue Assignments</h3>
        {overdueAssignments.length > 0 ? (
          <div className='space-y-3'>
            {overdueAssignments.map((task, index) => (
              /* Use parentheses () here for implicit return */
              <a
                key={index}
                href={task.url}
                target="_blank"
                rel="noreferrer"
                className="block p-4 rounded-xl border border-red-100 bg-white hover:border-red-300 hover:bg-red-50 transition-all shadow-sm"
              >
                <div className='flex flex-col gap-1'>
                  <p className='text-sm font-bold text-red-600'>
                    {task.courseName?.split('---')[1] || "Assignment"}
                  </p>
                  <p className='text-xs text-slate-600 font-medium'>{task.title}</p>
                  <div className='flex justify-between items-center mt-2'>
                    <p className='text-[10px] text-slate-400 font-mono'>Due: {task.dueDate}</p>
                    <span className='text-[10px] font-bold text-indigo-500'>VIEW →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className='flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200'>
            <p className='text-lg font-bold text-slate-300'>All caught up!</p>
            <p className='text-xs text-slate-400'>No overdue assignments found.</p>
          </div>
        )}
      </div>
      <div className='p-2'>
        <h3 className='text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider'>Pending Assignments</h3>
        {pendingAssignments.length > 0 ? (
          <div className='space-y-3'>
            {pendingAssignments.map((task, index) => (
              /* Use parentheses () here for implicit return */
              <a
                key={index}
                href={task.url}
                target="_blank"
                rel="noreferrer"
                className="block p-4 rounded-xl border border-red-100 bg-white hover:border-red-300 hover:bg-red-50 transition-all shadow-sm"
              >
                <div className='flex flex-col gap-1'>
                  <p className='text-sm font-bold text-black-600'>
                    {task.courseName?.split('---')[1] || "Assignment"}
                  </p>
                  <p className='text-xs text-slate-600 font-medium'>{task.title}</p>
                  <div className='flex justify-between items-center mt-2'>
                    <p className='text-[10px] text-slate-400 font-mono'>Due: {task.dueDate}</p>
                    <span className='text-[10px] font-bold text-indigo-500'>VIEW →</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className='flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200'>
            <p className='text-lg font-bold text-slate-300'>All caught up!</p>
            <p className='text-xs text-slate-400'>No pending assignments found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;