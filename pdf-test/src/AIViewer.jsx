/* global chrome */
import React, { useState, useEffect } from 'react';
import FileViewer from './components/FileViewer';
import SummaryModal from './components/SummaryModal';
import MindMap from './components/MindMap';
import ChatBox from './components/ChatBox';
import QuizModal from './components/QuizModal';

const AIViewer = () => {
    // Modes: 'VIEW', 'SUMMARY', 'MINDMAP', 'QUIZ'
    const [mode, setMode] = useState('VIEW'); 
    const [currentFile, setCurrentFile] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    
    // AI Data States
    const [summaryData, setSummaryData] = useState(null);
    const [mindMapData, setMindMapData] = useState(null);
    const [quizUrl, setQuizUrl] = useState(null); // URL for the generated Google Form
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        // 1. Initial Load: Sync file and mode from storage
        chrome.storage.local.get(['currentFile', 'initialMode'], (result) => {
            if (result.currentFile) {
                setCurrentFile(result.currentFile);
                const startMode = result.initialMode || 'VIEW';
                setMode(startMode);
                
                if (startMode === 'SUMMARY') setSummaryData(null);
                if (startMode === 'MINDMAP') setMindMapData(null);
                if (startMode === 'QUIZ') setQuizUrl(null);
            }
        });

        // 2. Message Listener: Catch AI responses from background.js
        const messageListener = (request) => {
            if (request.action === 'AI_TOOL_TRIGGERED') {
                setMode(request.tool);
                if (request.tool === 'SUMMARY') setSummaryData(null); 
                if (request.tool === 'MINDMAP') setMindMapData(null);
                if (request.tool === 'QUIZ') setQuizUrl(null);
            }
            
            if (request.action === 'RECEIVE_GENERATE_SUMMARY') {
                setSummaryData(request.payload.summary);
                setIsProcessing(false);
            }
            
            if (request.action === 'RECEIVE_GENERATE_MINDMAP') {
                setMindMapData(request.payload);
                setIsProcessing(false);
            }

            // --- QUIZ RESPONSE HANDLER ---
            if (request.action === 'RECEIVE_GENERATE_QUIZ') {
                if (request.payload.formUrl) {
                    setQuizUrl(request.payload.formUrl);
                    setIsProcessing(false);
                    // Automatically open in new tab if possible
                    window.open(request.payload.formUrl, '_blank');
                } else {
                    setIsProcessing(false);
                    alert("Quiz Error: " + (request.payload.error || "Generation failed"));
                }
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    // --- LOGIC: TRIGGERING THE AI TOOLS ---

    const startSummaryGeneration = () => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        setSummaryData(null); 
        chrome.runtime.sendMessage({ action: 'GENERATE_SUMMARY', data: { file_path: path } });
    };

    const startMindMapGeneration = () => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        setMindMapData(null);
        chrome.runtime.sendMessage({ action: 'GENERATE_MINDMAP', data: { file_path: path } });
    };

    // --- NEW: START QUIZ GENERATION ---
    const startQuizGeneration = () => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;

        setIsProcessing(true);
        setQuizUrl(null);

        // Fetch sessionToken for Google Form authentication
        chrome.storage.local.get(['sessionToken'], (res) => {
            if (!res.sessionToken) {
                setIsProcessing(false);
                alert("Auth Error: Please log in via the side-panel first.");
                return;
            }

            chrome.runtime.sendMessage({ 
                action: 'GENERATE_QUIZ', 
                data: { 
                    file_path: path,
                    access_token: res.sessionToken 
                } 
            });
        });
    };

    const handleClose = () => {
        setCurrentFile(null);
        chrome.storage.local.remove(['currentFile', 'initialMode']);
        const container = document.getElementById('lms-helper-integrated-overlay');
        if (container) container.style.display = 'none';
    };

    if (!currentFile) return null;

    return (
        <div style={mainContainerStyle}>
            <style>
                {`
                    @keyframes lms-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .lms-loading-spinner { 
                        width: 40px; height: 40px; 
                        border: 4px solid #f3f3f3; 
                        border-top: 4px solid #6366f1; 
                        border-radius: 50%; 
                        animation: lms-spin 1s linear infinite; 
                    }
                `}
            </style>

            {/* CONDITIONAL RENDER: Hides components not in current mode */}
            {mode === 'VIEW' ? (
               <FileViewer 
                fileUrl={currentFile.fileUrl || currentFile.url} 
                fileName={currentFile.name}
                onClose={handleClose}
                onOpenSummary={() => setMode('SUMMARY')}
                onOpenMindMap={() => setMode('MINDMAP')}
                onOpenQuiz={() => setMode('QUIZ')} 
                onOpenChat={() => setChatOpen(true)}
            />
            ) : mode === 'SUMMARY' ? (
                <SummaryModal 
                    isOpen={true}
                    data={summaryData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={startSummaryGeneration} 
                    onRegenerate={startSummaryGeneration}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            ) : mode === 'QUIZ' ? (
                <QuizModal 
                    isOpen={true}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    quizUrl={quizUrl}
                    onConfirmStart={startQuizGeneration} // <--- WIRED TO LOGIC
                    onClose={() => setMode('VIEW')}
                />
            ) : mode === 'MINDMAP' ? (
                <MindMap 
                    data={mindMapData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={startMindMapGeneration}
                    onRegenerate={startMindMapGeneration}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            ) : null}

            {/* FLOATING CHAT */}
            {mode === 'VIEW' && (
                <ChatBox 
                    isOpen={chatOpen} 
                    filePath={currentFile.fileUrl || currentFile.url} 
                    onClose={() => setChatOpen(false)} 
                />
            )}

            {/* GLOBAL LOADING TOAST */}
            {isProcessing && (
                <div style={toastStyle}>
                    <div className="lms-loading-spinner" style={{width: '20px', height: '20px', borderThickness: '2px'}}></div>
                    <span style={{fontWeight: 'bold'}}>Llama-3 is architecting insights...</span>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const mainContainerStyle = { width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, backgroundColor: '#ffffff', zIndex: 999999, display: 'flex', flexDirection: 'column' };
const toastStyle = { position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#1e293b', color: 'white', padding: '14px 28px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', zIndex: 1000005, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' };

export default AIViewer;