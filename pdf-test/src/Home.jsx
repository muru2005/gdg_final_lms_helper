import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    console.log('[UI] Login clicked, requesting OAuth');

    chrome.runtime.sendMessage(
      { type: 'getAuthToken' },
      (response) => {
        if (!response || !response.ok) {
          console.error('[UI] OAuth failed:', response?.error);
          alert('Google login failed');
          return;
        }

        const token = response.token;
        console.log('[UI] OAuth token received');

        // Optional: fetch user profile
        chrome.runtime.sendMessage(
          { type: 'getUserProfile' },
          (profileRes) => {
            if (!profileRes?.ok) {
              alert('Failed to fetch user profile');
              return;
            }

            const user = {
              name: profileRes.profile.name,
              email: profileRes.profile.email,
              picture: profileRes.profile.picture
            };

            chrome.storage.local.set(
              {
                sessionToken: token,
                user,
                isLoggedIn: true
              },
              () => {
                console.log('[UI] User stored, navigating');
                navigate('/sync');
              }
            );
          }
        );
      }
    );
  };

  const features = [
    { title: 'Course Management', desc: 'View all your current and previous semester courses in an organized manner', status: 'available' },
    { title: 'Assignment Deadlines', desc: 'Track overdue and upcoming assignment deadlines with timezone support', status: 'available' },
    { title: 'Batch Download', desc: 'Download course content, PDFs, and materials in bulk with one click', status: 'available' },
    { title: 'Slide Explanation', desc: 'Get AI-powered explanations of current slides and course content', status: 'available' },
    { title: 'PDF Summarization', desc: 'Automatically summarize entire PDFs and store them for quick access', status: 'available' },
    { title: 'Gmail Integration', desc: 'Sync announcements and reminders with your Gmail and Google Calendar', status: 'available' },
    { title: 'Concept Maps', desc: 'Generate interactive concept maps from your notes and course materials', status: 'available' },
    { title: 'Assignment Submission', desc: 'Submit assignments directly from the side panel with Google Drive integration', status: 'available' }
  ];

  return (
    <div className="p-5 bg-slate-50 min-h-screen">
      <div className="text-center p-8 mb-6 bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white rounded-xl shadow-md">
        <h2 className="text-2xl font-bold mb-2">Welcome to LMS Helper</h2>
        <p className="opacity-90 text-sm">Your comprehensive learning management companion</p>
      </div>

      <div className="grid gap-4 mb-5">
        {features.map((feature, index) => (
          <div key={index} className="bg-white border border-[#e9ecef] rounded-lg p-5 hover:shadow-lg transition-all group">
            <div className="text-base font-semibold text-slate-700 mb-2 group-hover:text-[#667eea]">
              {feature.title}
            </div>
            <div className="text-sm text-slate-500 leading-relaxed mb-3">
              {feature.desc}
            </div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
              feature.status === 'available' ? 'bg-[#d4edda] text-[#155724]' : 'bg-[#fff3cd] text-[#856404]'
            }`}>
              {feature.status === 'available' ? 'Available' : 'Coming Soon'}
            </span>
          </div>
        ))}
        
        <div className='mt-4'>
          <button 
            onClick={handleLogin} 
            className='cursor-pointer w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-4 px-4 rounded-xl transition-all shadow-sm'
          >
            <img alt="LMS" className="w-5 h-5" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"/> 
            <span>Sign in with Google</span>         
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;