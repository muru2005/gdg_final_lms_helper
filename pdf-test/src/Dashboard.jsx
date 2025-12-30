import React, { useEffect, useState } from 'react';
import { TrendingUp, Clock, AlertTriangle, GraduationCap, ExternalLink, CheckCircle2 } from 'lucide-react';

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

  const statCards = [
    { value: Stats.currentCount, label: 'Active Courses', icon: TrendingUp, gradient: 'from-violet-500 to-purple-600' },
    { value: Stats.totalCount, label: 'Total Courses', icon: GraduationCap, gradient: 'from-blue-500 to-indigo-600' },
    { value: Stats.overdueCount, label: 'Overdue', icon: AlertTriangle, gradient: 'from-rose-500 to-pink-600' },
    { value: Stats.semester, label: 'Semester', icon: Clock, gradient: 'from-emerald-500 to-teal-600' },
  ];

  return (
    <div className='min-h-screen font-sans text-slate-900'>
      {/* Stats Grid */}
      <div className='grid grid-cols-2 gap-3 mb-6'>
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`bg-gradient-to-br ${stat.gradient} p-4 rounded-2xl flex flex-col items-center justify-center text-white shadow-lg shadow-slate-200`}
            >
              <Icon size={20} className="opacity-80 mb-1" />
              <h1 className='text-2xl font-bold'>{stat.value}</h1>
              <p className='text-[10px] font-medium opacity-90 tracking-wide'>{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Overdue Assignments */}
      <div className='mb-6'>
        <h3 className='text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest flex items-center gap-2'>
          <AlertTriangle size={14} />
          Overdue Assignments
        </h3>
        {overdueAssignments.length > 0 ? (
          <div className='space-y-2.5'>
            {overdueAssignments.map((task, index) => (
              <a
                key={index}
                href={task.url}
                target="_blank"
                rel="noreferrer"
                className="block p-4 rounded-xl bg-white border border-slate-100 hover:border-rose-200 hover:shadow-lg hover:shadow-rose-100/50 transition-all duration-200 group"
              >
                <div className='flex flex-col gap-1'>
                  <p className='text-sm font-semibold text-rose-600'>
                    {task.courseName?.split('---')[1] || "Assignment"}
                  </p>
                  <p className='text-xs text-slate-600'>{task.title}</p>
                  <div className='flex justify-between items-center mt-2'>
                    <p className='text-[10px] text-slate-400 font-mono'>Due: {task.dueDate}</p>
                    <span className='flex items-center gap-1 text-[10px] font-semibold text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity'>
                      View <ExternalLink size={10} />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className='flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200'>
            <CheckCircle2 size={32} className="text-emerald-400 mb-2" />
            <p className='text-sm font-semibold text-slate-400'>All caught up!</p>
            <p className='text-xs text-slate-300'>No overdue assignments</p>
          </div>
        )}
      </div>

      {/* Pending Assignments */}
      <div>
        <h3 className='text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest flex items-center gap-2'>
          <Clock size={14} />
          Pending Assignments
        </h3>
        {pendingAssignments.length > 0 ? (
          <div className='space-y-2.5'>
            {pendingAssignments.map((task, index) => (
              <a
                key={index}
                href={task.url}
                target="_blank"
                rel="noreferrer"
                className="block p-4 rounded-xl bg-white border border-slate-100 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-100/50 transition-all duration-200 group"
              >
                <div className='flex flex-col gap-1'>
                  <p className='text-sm font-semibold text-slate-700'>
                    {task.courseName?.split('---')[1] || "Assignment"}
                  </p>
                  <p className='text-xs text-slate-500'>{task.title}</p>
                  <div className='flex justify-between items-center mt-2'>
                    <p className='text-[10px] text-slate-400 font-mono'>Due: {task.dueDate}</p>
                    <span className='flex items-center gap-1 text-[10px] font-semibold text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity'>
                      View <ExternalLink size={10} />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className='flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200'>
            <CheckCircle2 size={32} className="text-emerald-400 mb-2" />
            <p className='text-sm font-semibold text-slate-400'>All caught up!</p>
            <p className='text-xs text-slate-300'>No pending assignments</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;