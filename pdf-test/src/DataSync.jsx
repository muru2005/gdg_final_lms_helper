import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DataSync = () => {
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const handleSync = async () => {
    setStatus('Reading LMS Page...');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url.includes('lms.ssn.edu.in')) {
      setStatus('Error: Open LMS Dashboard first!');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'extractData' }, (response) => {
      if (response?.success) {
        chrome.storage.local.set({ 
          allCourses: response.courses,
          user: response.user 
        }, () => {
          setStatus('Sync Complete!');
          navigate('/main/dashboard');
        });
      } else {
        setStatus(`Error: ${response?.error || 'Failed to extract data'}`);
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