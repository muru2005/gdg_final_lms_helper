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
    
    // AI Data States: Results from your Flask server
    const [summaryData, setSummaryData] = useState(null);
    const [mindMapData, setMindMapData] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        // 1. Initial Load: Get the file data saved by background.jsx
        chrome.storage.local.get(['currentFile'], (result) => {
            if (result.currentFile) {
                console.log("[AIViewer] Loading File:", result.currentFile.name);
                setCurrentFile(result.currentFile);
            }
        });

        // 2. THE DATA BRIDGE: Listen for Flask results pushed from background.jsx
        const messageListener = (request) => {
            if (request.action === 'RECEIVE_GENERATE_SUMMARY') {
                console.log("[AIViewer] Summary Received");
                setSummaryData(request.payload.summary);
                setIsProcessing(false);
            }
            if (request.action === 'RECEIVE_GENERATE_MINDMAP') {
                console.log("[AIViewer] MindMap Received");
                setMindMapData(request.payload);
                setIsProcessing(false);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        
        // Cleanup listener on unmount
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    // 3. CLOSE HANDLER: Wipes state and hides the overlay
    const handleClose = () => {
        setCurrentFile(null);
        setSummaryData(null);
        setMindMapData(null);
        setIsProcessing(false);
        chrome.storage.local.remove('currentFile');

        // Force hide the physical container injected by content.jsx
        const container = document.getElementById('lms-helper-integrated-overlay');
        if (container) {
            container.style.display = 'none';
        }
    };

    // --- TOOL TRIGGER HANDLERS ---

    const triggerSummary = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setSummaryData(null); // Clear old results
        setIsProcessing(true);
        setShowSummary(true);
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_SUMMARY', 
            data: { file_path: filePath } 
        });
    };

    const triggerMindMap = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setMindMapData(null); // Clear old results
        setIsProcessing(true);
        setShowMindMap(true);
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_MINDMAP', 
            data: { file_path: filePath } 
        });
    };

    if (!currentFile) return null;

    const filePath = currentFile.fileUrl || currentFile.url;

    return (
        <div style={mainContainerStyle}>
            {/* Global Animation Styles */}
            <style>
                {`
                    @keyframes lms-spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .lms-loading-spinner {
                        animation: lms-spin 0.8s linear infinite;
                    }
                `}
            </style>

            {/* 1. BASE LAYER: High-end PDF Viewer */}
            <FileViewer 
                fileUrl={filePath} 
                fileName={currentFile.name}
                onOpenSummary={triggerSummary}
                onOpenMindMap={triggerMindMap}
                onOpenChat={() => setChatOpen(true)}
                onClose={handleClose}
            />

            {/* 2. SUMMARY MODAL */}
            <SummaryModal 
                isOpen={showSummary} 
                data={summaryData} 
                isLoading={isProcessing && !summaryData}
                fileName={currentFile.name}
                onClose={() => setShowSummary(false)} 
            />

            {/* 3. MIND MAP */}
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

            {/* 4. CHAT BOX */}
            <ChatBox 
                isOpen={chatOpen} 
                filePath={filePath} 
                onClose={() => setChatOpen(false)} 
            />

            {/* 5. GLOBAL TOAST LOADER */}
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
const mainContainerStyle = { 
    width: '100vw', 
    height: '100vh', 
    position: 'fixed',
    top: 0,
    left: 0,
    backgroundColor: '#f8fafc',
    zIndex: 999999 
};

const toastStyle = {
    position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
    backgroundColor: '#1e293b', color: 'white', padding: '14px 28px',
    borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '15px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)', 
    zIndex: 1000005, 
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(10px)'
};

const spinnerStyle = {
    width: '20px', height: '20px', 
    border: '3px solid rgba(255,255,255,0.2)',
    borderTop: '3px solid #6366f1', 
    borderRadius: '50%'
};

export default AIViewer;