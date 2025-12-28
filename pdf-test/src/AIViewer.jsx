/* global chrome */
import React, { useState, useEffect } from 'react';
import FileViewer from './components/FileViewer';
import SummaryModal from './components/SummaryModal'; // This is your Summary Workspace
import MindMap from './components/MindMap';
import ChatBox from './components/ChatBox';
import QuizModal from './components/QuizModal'
const AIViewer = () => {
    // Modes: 'VIEW', 'SUMMARY', 'MINDMAP'
    const [mode, setMode] = useState('VIEW'); 
    const [currentFile, setCurrentFile] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    
    // AI Data States
    const [summaryData, setSummaryData] = useState(null);
    const [mindMapData, setMindMapData] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        // 1. Initial Load: Check if we opened via a specific button from LMS
        chrome.storage.local.get(['currentFile', 'initialMode'], (result) => {
            if (result.currentFile) {
                setCurrentFile(result.currentFile);
                const startMode = result.initialMode || 'VIEW';
                setMode(startMode);
                
                // If the user clicked Summary/Mindmap, we reset data to trigger the "Ask" prompt
                if (startMode === 'SUMMARY') setSummaryData(null);
                if (startMode === 'MINDMAP') setMindMapData(null);
            }
        });

        // 2. Listen for Mode Switches (Buttons clicked while workspace is open)
        const messageListener = (request) => {
            if (request.action === 'AI_TOOL_TRIGGERED') {
                console.log("[Viewer] Received instruction to switch to:", request.tool);
                setMode(request.tool); // Immediately hides current view
                if (request.tool === 'SUMMARY') setSummaryData(null); 
                if (request.tool === 'MINDMAP') setMindMapData(null);
            }
            
            if (request.action === 'RECEIVE_GENERATE_SUMMARY') {
                setSummaryData(request.payload.summary);
                setIsProcessing(false);
            }
            
            if (request.action === 'RECEIVE_GENERATE_MINDMAP') {
                setMindMapData(request.payload);
                setIsProcessing(false);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    // --- LOGIC: TRIGGERING THE AI (CALLED AFTER USER SAYS "YES") ---

    const startSummaryGeneration = () => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;

        console.log("[AIViewer] User confirmed. Starting Summary AI...");
        setIsProcessing(true);
        setSummaryData(null); // Clear any old data
        
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_SUMMARY', 
            data: { file_path: path } 
        });
    };

    const startMindMapGeneration = () => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;

        console.log("[AIViewer] User confirmed. Starting MindMap AI...");
        setIsProcessing(true);
        setMindMapData(null);

        chrome.runtime.sendMessage({ 
            action: 'GENERATE_MINDMAP', 
            data: { file_path: path } 
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

            {/* THE CRITICAL LOGIC: 
                We use a ternary/conditional block to ensure only ONE 
                component exists at a time. This kills the PDF viewer 
                the moment you switch to Summary.
            */}
            {mode === 'VIEW' ? (
               <FileViewer 
                fileUrl={currentFile.fileUrl || currentFile.url} 
                fileName={currentFile.name}
                onClose={handleClose}
                // --- ADD THESE PROPS ---
                onOpenQuiz={() => setMode('QUIZ')} 
                onOpenChat={() => setChatOpen(true)}
            />
            ) : mode === 'SUMMARY' ? (
                <SummaryModal 
                    isOpen={true}
                    data={summaryData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={startSummaryGeneration} // Prop to trigger the "Yes" logic
                    onRegenerate={startSummaryGeneration}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            ) : mode === 'QUIZ' ? (
            /* Ensure you have a Quiz component or mode handled here */
            <QuizModal 
                fileName={currentFile.name}
                onBack={() => setMode('VIEW')}
                onClose={handleClose}
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

            {/* FLOATING ASK AI: Only visible in standard PDF view mode */}
            {mode === 'VIEW' && (
                <ChatBox 
                    isOpen={chatOpen} 
                    filePath={currentFile.fileUrl || currentFile.url} 
                    onClose={() => setChatOpen(false)} 
                />
            )}

            {/* GLOBAL LOADER TOAST: Only shows while AI is active */}
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

const mainContainerStyle = { 
    width: '100vw', 
    height: '100vh', 
    position: 'fixed', 
    top: 0, 
    left: 0, 
    backgroundColor: '#ffffff', 
    zIndex: 999999,
    display: 'flex',
    flexDirection: 'column'
};

const contentWrapperStyle = {
    flex: 1,
    position: 'relative',
    overflow: 'hidden'
};

const toastStyle = { 
    position: 'fixed', 
    bottom: '40px', 
    left: '50%', 
    transform: 'translateX(-50%)', 
    backgroundColor: '#1e293b', 
    color: 'white', 
    padding: '14px 28px', 
    borderRadius: '50px', 
    display: 'flex', 
    alignItems: 'center', 
    gap: '15px', 
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)', 
    zIndex: 1000005, 
    border: '1px solid rgba(255,255,255,0.1)', 
    backdropFilter: 'blur(10px)' 
};

export default AIViewer;