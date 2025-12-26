/* global chrome */
import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import FileViewer from './components/FileViewer';
import SummaryModal from './components/SummaryModal';
import MindMap from './components/MindMap';
import ChatBox from './components/ChatBox';

const AIViewer = () => {
    const [currentFile, setCurrentFile] = useState(null);
    const [showSummary, setShowSummary] = useState(false);
    const [showMindMap, setShowMindMap] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    
    // Quiz States
    const [quizUrl, setQuizUrl] = useState(null);
    const [showQuizModal, setShowQuizModal] = useState(false);
    
    // AI Data States
    const [summaryData, setSummaryData] = useState(null);
    const [mindMapData, setMindMapData] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        chrome.storage.local.get(['currentFile'], (result) => {
            if (result.currentFile) {
                console.log("[AIViewer] Loading File:", result.currentFile.name);
                setCurrentFile(result.currentFile);
            }
        });

        const messageListener = (request) => {
            if (request.action === 'RECEIVE_GENERATE_SUMMARY') {
                setSummaryData(request.payload.summary);
                setIsProcessing(false);
            }
            if (request.action === 'RECEIVE_GENERATE_MINDMAP') {
                setMindMapData(request.payload);
                setIsProcessing(false);
            }
            if (request.action === 'RECEIVE_GENERATE_QUIZ') {
                // Only open and show if the backend actually returned a URL
                if (request.payload.formUrl) {
                    console.log("[AIViewer] Quiz Created:", request.payload.formUrl);
                    setQuizUrl(request.payload.formUrl);
                    setIsProcessing(false);
                    setShowQuizModal(true);
                    window.open(request.payload.formUrl, '_blank');
                } else {
                    setIsProcessing(false);
                    alert("Backend Error: " + (request.payload.error || "Failed to generate quiz"));
                }
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    const handleClose = () => {
        setCurrentFile(null);
        setSummaryData(null);
        setMindMapData(null);
        setQuizUrl(null);
        setIsProcessing(false);
        chrome.storage.local.remove('currentFile');
        const container = document.getElementById('lms-helper-integrated-overlay');
        if (container) container.style.display = 'none';
    };

    // --- TOOL TRIGGER HANDLERS ---

    const triggerSummary = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setSummaryData(null); 
        setIsProcessing(true);
        setShowSummary(true);
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_SUMMARY', 
            data: { file_path: filePath } 
        });
    };

    const triggerMindMap = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setMindMapData(null); 
        setIsProcessing(true);
        setShowMindMap(true);
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_MINDMAP', 
            data: { file_path: filePath } 
        });
    };

    // UPDATED: Smuggles the token from storage to the backend
    const triggerQuiz = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setIsProcessing(true);

        chrome.storage.local.get(['sessionToken'], (res) => {
            if (!res.sessionToken) {
                setIsProcessing(false);
                alert("Auth Error: Please log in via the extension side-panel first.");
                return;
            }

            console.log("[AIViewer] Smuggling token for Quiz generation...");
            chrome.runtime.sendMessage({ 
                action: 'GENERATE_QUIZ', 
                data: { 
                    file_path: filePath,
                    access_token: res.sessionToken // Pass the browser token to Flask
                } 
            });
        });
    };

    if (!currentFile) return null;
    const filePath = currentFile.fileUrl || currentFile.url;

    return (
        <div style={mainContainerStyle}>
            <style>
                {`
                    @keyframes lms-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .lms-loading-spinner { animation: lms-spin 0.8s linear infinite; }
                `}
            </style>

            <FileViewer 
                fileUrl={filePath} 
                fileName={currentFile.name}
                onOpenSummary={triggerSummary}
                onOpenMindMap={triggerMindMap}
                onOpenQuiz={triggerQuiz}
                onOpenChat={() => setChatOpen(true)}
                onClose={handleClose}
            />

            <SummaryModal 
                isOpen={showSummary} 
                data={summaryData} 
                isLoading={isProcessing && !summaryData}
                fileName={currentFile.name}
                onClose={() => setShowSummary(false)} 
            />

            <AnimatePresence>
                {showMindMap && (
                    <MindMap 
                        data={mindMapData} 
                        isLoading={isProcessing && !mindMapData}
                        fileName={currentFile.name}
                        onClose={() => setShowMindMap(false)} 
                    />
                )}
            </AnimatePresence>

            {showQuizModal && (
                <div style={quizOverlayStyle} onClick={() => setShowQuizModal(false)}>
                    <div onClick={(e) => e.stopPropagation()} style={quizModalStyle}>
                        <h2 style={{ marginTop: 0 }}>🎯 Quiz Generated!</h2>
                        <p>Your AI-powered Google Form Quiz is ready.</p>
                        <a href={quizUrl} target="_blank" rel="noopener noreferrer" style={quizLinkButtonStyle}>
                            Open Google Form
                        </a>
                        <button onClick={() => setShowQuizModal(false)} style={quizCloseButtonStyle}>Dismiss</button>
                    </div>
                </div>
            )}

            <ChatBox isOpen={chatOpen} filePath={filePath} onClose={() => setChatOpen(false)} />

            {isProcessing && (
                <div style={toastStyle}>
                    <div className="lms-loading-spinner" style={spinnerStyle}></div>
                    <span style={{fontWeight: 'bold'}}>Llama-3 is architecting insights...</span>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const mainContainerStyle = { width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, backgroundColor: '#f8fafc', zIndex: 999999 };
const toastStyle = { position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#1e293b', color: 'white', padding: '14px 28px', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', zIndex: 1000005, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' };
const spinnerStyle = { width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid #6366f1', borderRadius: '50%' };
const quizOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12000, backdropFilter: 'blur(4px)' };
const quizModalStyle = { backgroundColor: 'white', padding: '40px', borderRadius: '24px', textAlign: 'center', maxWidth: '450px', width: '90%', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' };
const quizLinkButtonStyle = { display: 'inline-block', marginTop: '20px', padding: '12px 24px', backgroundColor: '#673ab7', color: 'white', textDecoration: 'none', borderRadius: '12px', fontWeight: 'bold' };
const quizCloseButtonStyle = { display: 'block', margin: '20px auto 0', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', textDecoration: 'underline' };

export default AIViewer;