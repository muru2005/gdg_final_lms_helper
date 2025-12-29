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
    const [quizUrl, setQuizUrl] = useState(null); 
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
                console.log("🔄 [AIViewer] Switch detected. Resetting state for new file/tool...");
                
                // Clear old data immediately to prevent "zombie" content
                setSummaryData(null);
                setMindMapData(null);
                setIsProcessing(false);

                // Fetch storage again to make sure we have the latest file name/url
                chrome.storage.local.get(['currentFile'], (result) => {
                    if (result.currentFile) {
                        setCurrentFile(result.currentFile);
                    }
                    setMode(request.tool);
                });
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

    // --- 2. THE "KILL SWITCH" EFFECT ---
    // Watches for changes and triggers generation if needed
    useEffect(() => {
        if (currentFile && mode === 'SUMMARY' && !summaryData && !isProcessing) {
            startSummaryGeneration(false);
        }
        if (currentFile && mode === 'MINDMAP' && !mindMapData && !isProcessing) {
            startMindMapGeneration(false);
        }
    }, [mode, summaryData, mindMapData, currentFile]);

    // --- 3. GENERATION LOGIC ---
    const startSummaryGeneration = (force = false) => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        chrome.storage.local.get(['userProfile'], (res) => {
            chrome.runtime.sendMessage({ 
                action: 'GENERATE_SUMMARY', 
                data: { 
                    file_path: path,
                    fileName: currentFile.name,
                    email: res.userProfile?.email || "unknown@ssn.edu.in",
                    forceRefresh: force 
                } 
            });
        });
    };

    const startMindMapGeneration = (force = false) => {
        const path = currentFile?.fileUrl || currentFile?.url;
        if (!path) return;
        setIsProcessing(true);
        chrome.storage.local.get(['userProfile'], (res) => {
            chrome.runtime.sendMessage({ 
                action: 'GENERATE_MINDMAP', 
                data: { 
                    file_path: path,
                    fileName: currentFile.name,
                    email: res.userProfile?.email || "unknown@ssn.edu.in",
                    forceRefresh: force 
                } 
            });
        });
    };

    const handleClose = () => {
        setCurrentFile(null);
        setMode('VIEW');
        setSummaryData(null);
        setMindMapData(null);
        setIsProcessing(false);
        chrome.storage.local.remove(['currentFile', 'initialMode'], () => {
            const container = document.getElementById('lms-helper-integrated-overlay');
            if (container) container.style.display = 'none';
        });
    };

    if (!currentFile) return null;

    return (
        <div style={mainContainerStyle}>
            {mode === 'VIEW' ? (
               <FileViewer 
                fileUrl={currentFile.fileUrl || currentFile.url} 
                fileName={currentFile.name}
                onClose={handleClose}
                onOpenSummary={() => setMode('SUMMARY')}
                onOpenMindMap={() => setMode('MINDMAP')}
                onOpenChat={() => setChatOpen(true)}
            />
            ) : mode === 'SUMMARY' ? (
                <SummaryModal 
                    key={currentFile.path + (summaryData ? '-ready' : '-loading')}
                    isOpen={true}
                    data={summaryData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={() => startSummaryGeneration(false)} 
                    onRegenerate={() => startSummaryGeneration(true)}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            ) : mode === 'MINDMAP' ? (
                <MindMap 
                    key={currentFile.path + (mindMapData ? '-ready' : '-loading')}
                    data={mindMapData}
                    isLoading={isProcessing}
                    fileName={currentFile.name}
                    onConfirmStart={() => startMindMapGeneration(false)}
                    onRegenerate={() => startMindMapGeneration(true)}
                    onBack={() => setMode('VIEW')}
                    onClose={handleClose}
                />
            ) : null}

            {isProcessing && !summaryData && !mindMapData && (
                <div style={toastStyle}>
                    <div className="lms-loading-spinner" style={{width: '20px', height: '20px'}}></div>
                    <span>Processing Tool...</span>
                </div>
            )}
        </div>
    );
};

const mainContainerStyle = { width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, backgroundColor: '#ffffff', zIndex: 999999, display: 'flex', flexDirection: 'column' };
const toastStyle = { position: 'fixed', bottom: '20px', left: '20px', background: '#1e293b', color: 'white', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 1000000 };

export default AIViewer;