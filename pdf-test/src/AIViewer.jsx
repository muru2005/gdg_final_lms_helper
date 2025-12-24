import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FileViewer from './components/FileViewer';
import MindMap from './components/MindMap';
import SummaryModal from './components/SummaryModal';

const AIViewer = () => {
  const [currentFile, setCurrentFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    chrome.storage.local.get(['currentFile'], (result) => {
      if (result.currentFile) {
        setCurrentFile(result.currentFile);
      } else {
        navigate('/');
      }
      setLoading(false);
    });
  }, [navigate]);

  const handleClose = () => {
    chrome.storage.local.remove(['currentFile']);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentFile) {
    return (
      <div className="p-5 text-center">
        <h2 className="text-xl font-bold mb-4">No AI Task Active</h2>
        <p className="text-gray-600">Click on the AI buttons (👁️ 🧠 📄) next to files in your LMS to use AI features.</p>
        <button 
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go Home
        </button>
      </div>
    );
  }

  // Detect popup mode via URL flag set by background when opening popup window
  const isPopup = typeof window !== 'undefined' && window.location && window.location.href.includes('popup=1');

  if (currentFile.mode === 'viewer') {
    return <FileViewer popupMode={isPopup} filePath={currentFile.path} fileName={currentFile.name} fileUrl={currentFile.url} onClose={handleClose} />;
  } else if (currentFile.mode === 'mindmap') {
    return <MindMap data={currentFile.mindmapData} fileName={currentFile.name} onClose={handleClose} />;
  } else if (currentFile.mode === 'summary') {
    return <SummaryModal summary={currentFile.summary} fileName={currentFile.name} isOpen={true} onClose={handleClose} />;
  }

  return null;
};

export default AIViewer;