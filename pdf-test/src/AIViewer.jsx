/* global chrome */
import React, { useState, useEffect } from 'react';
import FileViewer from './components/FileViewer';
import SummaryModal from './components/SummaryModal';
import MindMap from './components/MindMap';
import ChatBox from './components/ChatBox';
import QuizModal from './components/QuizModal';

const AIViewer = () => {
    const [mode, setMode] = useState('VIEW'); 
    const [currentFile, setCurrentFile] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    
    const [summaryData, setSummaryData] = useState(null);
    const [mindMapData, setMindMapData] = useState(null);
    const [quizUrl, setQuizUrl] = useState(null); // Added state for Quiz URL
    const [isProcessing, setIsProcessing] = useState(false);

    // --- 1. INITIAL SYNC & MESSAGE LISTENER ---
    useEffect(() => {
        const syncFromStorage = () => {
            chrome.storage.local.get(['currentFile', 'initialMode'], (result) => {
                if (result.currentFile) {
                    setCurrentFile(result.currentFile);
                    setMode(result.initialMode || 'VIEW');
                }
            });
        };

        syncFromStorage();

        const messageListener = (request) => {
            if (request.action === 'AI_TOOL_TRIGGERED') {
                console.log("🔄 [AIViewer] Switch detected. Resetting state...");
                setSummaryData(null);
                setMindMapData(null);
                setQuizUrl(null); // Reset quiz for new files
                setIsProcessing(false);

                chrome.storage.local.get(['currentFile'], (result) => {
                    if (result.currentFile) setCurrentFile(result.currentFile);
                    setMode(request.tool);
                });
            }
            
            if (request.action === 'RECEIVE_GENERATE_SUMMARY') {
                setSummaryData(request.payload.summary);
                setIsProcessing(false);
            }
            
            if (request.action === 'RECEIVE_GENERATE_MINDMAP') {
                const data = request.payload.mindmap || request.payload;
                setMindMapData(data);
                setIsProcessing(false);
            }

            // --- ADDED: Handle Quiz Response ---
            if (request.action === 'RECEIVE_GENERATE_QUIZ') {
               console.log("📥 Quiz Received:", request.payload);
    
    // FIX: Change 'quiz_url' to 'formUrl' to match your Flask backend
    if (request.payload.formUrl) {
        setQuizUrl(request.payload.formUrl);
    } else if (request.payload.quiz_url) {
        setQuizUrl(request.payload.quiz_url);
    }
    
    setIsProcessing(false);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    // --- 2. AUTOMATIC CACHE CHECK EFFECT ---
    useEffect(() => {
        if (currentFile && mode === 'SUMMARY' && !summaryData && !isProcessing) {
            startSummaryGeneration(false);
        }
        if (currentFile && mode === 'MINDMAP' && !mindMapData && !isProcessing) {
            startMindMapGeneration(false);
        }
        // ADDED: Automatic Trigger for Quiz
        if (currentFile && mode === 'QUIZ' && !quizUrl && !isProcessing) {
            startQuizGeneration(false);
        }
    }, [mode, summaryData, mindMapData, quizUrl, currentFile]);

    // --- 3. GENERATION LOGIC ---
    const startQuizGeneration = (force = false) => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        chrome.storage.local.get(['userProfile', 'sessionToken'], (res) => {
        console.log("🔑 Quiz Debug: Token exists?", !!res.sessionToken);
        
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_QUIZ', 
            data: { 
                file_path: path,
                fileName: currentFile.name,
                email: res.userProfile?.email || "unknown@ssn.edu.in",
                access_token: res.sessionToken, // Now this will have the actual token
                forceRefresh: force 
            } 
        });
    });
    };

    const startSummaryGeneration = (force = false) => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        chrome.storage.local.get(['userProfile'], (res) => {
            chrome.runtime.sendMessage({ action: 'GENERATE_SUMMARY', data: { file_path: path, fileName: currentFile.name, email: res.userProfile?.email || "unknown@ssn.edu.in", forceRefresh: force } });
        });
    };

    const startMindMapGeneration = (force = false) => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        chrome.storage.local.get(['userProfile'], (res) => {
            chrome.runtime.sendMessage({ action: 'GENERATE_MINDMAP', data: { file_path: path, fileName: currentFile.name, email: res.userProfile?.email || "unknown@ssn.edu.in", forceRefresh: force } });
        });
    };

    const handleClose = () => {
        setCurrentFile(null);
        setMode('VIEW');
        setIsProcessing(false);
        chrome.storage.local.remove(['currentFile', 'initialMode'], () => {
            const container = document.getElementById('lms-helper-integrated-overlay');
            if (container) container.style.display = 'none';
        });
    };

    if (!currentFile) return null;

    const currentUrl = currentFile.fileUrl || currentFile.url;

    return (
        <div style={mainContainerStyle}>
            {mode === 'VIEW' && (
               <FileViewer 
                fileUrl={currentUrl} 
                fileName={currentFile.name}
                onClose={handleClose}
                onOpenSummary={() => setMode('SUMMARY')}
                onOpenMindMap={() => setMode('MINDMAP')}
                onOpenQuiz={() => setMode('QUIZ')} // PDF Viewer Button Trigger
                onOpenChat={() => setChatOpen(true)}
            />
            )}

            {mode === 'SUMMARY' && (
                <SummaryModal 
                    key={currentUrl + (summaryData ? '-ready' : '-loading')}
                    isOpen={true}
                    data={summaryData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={() => startSummaryGeneration(false)} 
                    onRegenerate={() => startSummaryGeneration(true)}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            )}

            {mode === 'MINDMAP' && (
                <MindMap 
                    key={currentUrl + (mindMapData ? '-ready' : '-loading')}
                    data={mindMapData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={() => startMindMapGeneration(false)}
                    onRegenerate={() => startMindMapGeneration(true)}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            )}

            {/* --- UPDATED QUIZ MODAL --- */}
            {mode === 'QUIZ' && (
                <QuizModal
                    isOpen={true}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    quizUrl={quizUrl}
                    onConfirmStart={() => startQuizGeneration(false)}
                    onClose={() => setMode('VIEW')}
                />
            )}

            <ChatBox 
                isOpen={chatOpen} 
                onClose={() => setChatOpen(false)}
                fileUrl={currentUrl}
                fileName={currentFile.name}
            />

            {/* Global Loader Toast */}
            {isProcessing && !summaryData && !mindMapData && !quizUrl && (
                <div style={toastStyle}>
                    <div className="lms-loading-spinner" style={{width: '20px', height: '20px'}}></div>
                    <span>Checking Knowledge Base...</span>
                </div>
            )}
        </div>
    );
};

const mainContainerStyle = { width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, backgroundColor: '#ffffff', zIndex: 999999, display: 'flex', flexDirection: 'column' };
const toastStyle = { position: 'fixed', bottom: '20px', left: '20px', background: '#1e293b', color: 'white', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 1000000 };

export default AIViewer;