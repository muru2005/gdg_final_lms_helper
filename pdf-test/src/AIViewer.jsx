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
    
    // AI Data States: These hold the results from your Flask 200 responses
    const [summaryData, setSummaryData] = useState(null);
    const [mindMapData, setMindMapData] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        // 1. Initial Load: Get the file data saved by the background script
        chrome.storage.local.get(['currentFile'], (result) => {
            if (result.currentFile) setCurrentFile(result.currentFile);
        });

        // 2. THE DATA BRIDGE: Listens for AI results pushed from background.jsx
        const messageListener = (request) => {
            if (request.action === 'RECEIVE_GENERATE_SUMMARY') {
                console.log("[AIViewer] Summary Payload Received:", request.payload);
                setSummaryData(request.payload.summary); // Update state for SummaryModal
                setIsProcessing(false);
            }
            if (request.action === 'RECEIVE_GENERATE_MINDMAP') {
                console.log("[AIViewer] MindMap Payload Received:", request.payload);
                setMindMapData(request.payload); // Update state for MindMap
                setIsProcessing(false);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    // Cleanup storage and local state when the viewer is closed
    const handleClose = () => {
        setCurrentFile(null);
        setSummaryData(null);
        setMindMapData(null);
        chrome.storage.local.remove('currentFile');
    };

    // --- TOOL TRIGGER HANDLERS: Tells background to call Flask ---

    const triggerSummary = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setSummaryData(null); // Reset old data
        setIsProcessing(true);
        setShowSummary(true);
        chrome.runtime.sendMessage({ 
            action: 'GENERATE_SUMMARY', 
            data: { file_path: filePath } 
        });
    };

    const triggerMindMap = () => {
        const filePath = currentFile.fileUrl || currentFile.url;
        setMindMapData(null); // Reset old data
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
            {/* 1. BASE LAYER: High-end PDF Viewer */}
            <FileViewer 
                fileUrl={filePath} 
                fileName={currentFile.name}
                onOpenSummary={triggerSummary}
                onOpenMindMap={triggerMindMap}
                onOpenChat={() => setChatOpen(true)}
                onClose={handleClose}
            />

            {/* 2. SUMMARY MODAL: Receives summaryData prop */}
            <SummaryModal 
                isOpen={showSummary} 
                data={summaryData} 
                isLoading={isProcessing && !summaryData}
                fileName={currentFile.name}
                onClose={() => setShowSummary(false)} 
            />

            {/* 3. MIND MAP: Uses D3 to render mindMapData prop */}
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

            {/* 4. CHAT BOX: Direct communication for Ask AI */}
            <ChatBox 
                isOpen={chatOpen} 
                filePath={filePath} 
                onClose={() => setChatOpen(false)} 
            />

            {/* 5. GLOBAL LOADER: Visible while AI is thinking */}
            {isProcessing && (
                <div style={toastStyle}>
                    <div style={spinnerStyle}></div>
                    <span style={{fontWeight: 'bold'}}>Llama-3 is architecting insights...</span>
                </div>
            )}
        </div>
    );
};

// --- STYLES (Verified Z-Index Stack) ---
const mainContainerStyle = { 
    width: '100vw', height: '100vh', 
    position: 'relative', 
    zIndex: 999999 // Base for the entire overlay workspace
};

const toastStyle = {
    position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
    backgroundColor: '#1e293b', color: 'white', padding: '14px 28px',
    borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '15px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)', 
    zIndex: 1000005, // Higher than individual tool buttons
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(10px)'
};

const spinnerStyle = {
    width: '20px', height: '20px', 
    border: '3px solid rgba(255,255,255,0.2)',
    borderTop: '3px solid #6366f1', 
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
};

export default AIViewer;