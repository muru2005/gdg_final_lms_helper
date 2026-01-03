import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, Download, Sparkles, FileText, Mail, GitBranch, Check } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    console.log('[UI] Login clicked, requesting OAuth');

    chrome.runtime.sendMessage({ type: 'getAuthToken' }, (response) => {
      if (!response || !response.ok) {
        console.error('[UI] OAuth failed:', response?.error);
        alert('Google login failed');
        return;
      }

      const token = response.token;
      chrome.runtime.sendMessage({ type: 'getUserProfile' }, (profileRes) => {
        if (!profileRes?.ok) {
          alert('Failed to fetch user profile');
          return;
        }

        const user = {
          name: profileRes.profile.name,
          email: profileRes.profile.email,
          picture: profileRes.profile.picture
        };

        chrome.storage.local.set({ sessionToken: token, user, isLoggedIn: true }, () => {
          console.log('[UI] User stored, syncing calendar...');

          chrome.runtime.sendMessage({ type: 'SYNC_CALENDAR', token }, (syncResp) => {
            console.log('[UI] Sync finished, navigating now');
            navigate('/sync');
          });
        });
      });
    });
  };

  const features = [
    { title: 'Course Management', desc: 'View all your current and previous semester courses', icon: BookOpen },
    { title: 'Assignment Deadlines', desc: 'Track overdue and upcoming assignment deadlines', icon: Clock },
    { title: 'Batch Download', desc: 'Download course content and materials in bulk', icon: Download },
    { title: 'Slide Explanation', desc: 'Get AI-powered explanations of current slides', icon: Sparkles },
    { title: 'PDF Summarization', desc: 'Automatically summarize entire PDFs', icon: FileText },
    { title: 'Gmail Integration', desc: 'Sync announcements with your Gmail and Calendar', icon: Mail },
    { title: 'Concept Maps', desc: 'Generate interactive concept maps from your notes', icon: GitBranch }
  ];

  return (
    <div className="p-5 bg-slate-50 min-h-screen">
      {/* Hero Section */}
      <div className="text-center p-8 mb-6 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white rounded-2xl shadow-xl shadow-violet-200/50">
        <h2 className="text-2xl font-bold mb-2">Welcome to LMS Helper</h2>
        <p className="opacity-90 text-sm font-medium">Your comprehensive learning companion</p>
      </div>

      {/* Features Grid */}
      <div className="grid gap-3 mb-5">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={i}
              className="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-lg hover:border-violet-200 transition-all duration-200 group"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-violet-50 text-violet-600 group-hover:bg-violet-100 transition-colors">
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-700 mb-1 group-hover:text-violet-600 transition-colors">
                    {f.title}
                  </div>
                  <div className="text-xs text-slate-500 leading-relaxed">{f.desc}</div>
                </div>
                <div className="p-1 rounded-full bg-emerald-100 text-emerald-600">
                  <Check size={12} strokeWidth={3} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Google Sign In Button */}
      <div className='mt-5'>
        <button
          onClick={handleLogin}
          className='cursor-pointer w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md text-slate-700 font-semibold py-4 px-4 rounded-xl shadow-sm transition-all duration-200'
        >
          <img alt="Google" className="w-5 h-5" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" />
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
};

export default Home;