/* global chrome */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import { MarkdownRenderer } from '../utils/markdownParser.jsx';

const SummaryModal = ({ isOpen, data, isLoading, fileName, onConfirmStart, onRegenerate, onClose }) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const [isSavingToDrive, setIsSavingToDrive] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setSaveStatus(null);
            
            // If data arrives from cache, we automatically confirm so the user sees the content
            if (data) {
                setHasConfirmed(true);
            } else if (!isLoading) {
                // Only reset confirmation if we aren't currently in a loading state
                setHasConfirmed(false);
            }
        }
    }, [isOpen, fileName, data, isLoading]);

    const handleYesClick = () => {
        setHasConfirmed(true);
        onConfirmStart(); 
    };

    // --- YOUR DRIVE LOGIC (NOT TOUCHED) ---
    const cleanMarkdownForDocs = (text) => {
        if (!text) return "";
        return text
            .split('\n')
            .map(line => {
                let cleaned = line.trim();
                cleaned = cleaned.replace(/[\*]{1,3}\s?|\s?[\*]{1,3}/g, ''); 
                cleaned = cleaned.replace(/[:]{1,}\s?[\*]{1,}/g, ':');
                if (cleaned.startsWith('+') || cleaned.startsWith('-')) return `<li>${cleaned.substring(1).trim()}</li>`;
                if (cleaned.length > 3 && (cleaned.toUpperCase() === cleaned || cleaned.endsWith(':'))) return `<p style="margin-top:15px; margin-bottom:5px;"><b>${cleaned}</b></p>`;
                return cleaned;
            })
            .join('\n')
            .replace(/(<li>.*?<\/li>)/gms, '<ul style="margin-bottom:10px;">$1</ul>')
            .replace(/\*\*/g, '')
            .replace(/\n/g, '<br/>');
    };

    const handleShareToDrive = async () => {
        if (!data) return;
        try {
            setIsSavingToDrive(true);
            chrome.storage.local.get(['sessionToken'], async (res) => {
                if (!res.sessionToken) {
                    setSaveStatus({ type: 'error', message: 'Log in via side-panel first.' });
                    setIsSavingToDrive(false);
                    return;
                }
                const title = fileName ? fileName.replace(/\.(pdf|docx?|txt)$/i, '') : 'Summary';
                const subject = prompt('Enter subject:', 'General');
                if (!subject) { setIsSavingToDrive(false); return; }
                const cleanBody = cleanMarkdownForDocs(data);
                const formattedHtml = `<html><body><h1>${title}</h1><p><b>Subject:</b> ${subject}</p><div>${cleanBody}</div></body></html>`;
                const response = await fetch('http://192.168.0.3:5000/api/save-summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ summary: { title, subject, content: formattedHtml }, accessToken: res.sessionToken })
                });
                const result = await response.json();
                if (response.ok && result.ok) {
                    setSaveStatus({ type: 'success', message: '✅ Saved to Drive!' });
                    if (confirm('Saved! Open in Google Drive?')) window.open(result.driveLink, '_blank');
                }
                setIsSavingToDrive(false);
            });
        } catch (e) {
            setSaveStatus({ type: 'error', message: e.message });
            setIsSavingToDrive(false);
        }
    };

    const handleDownload = () => {
        if (!data) return;
        const doc = new jsPDF();
        const cleanText = data.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
        const lines = cleanText.split('\n');
        let y = 20;
        doc.setFontSize(18);
        doc.text("Document Summary", 105, y, { align: "center" });
        y += 25;
        doc.setFontSize(11);
        lines.forEach(line => {
            const wrappedLines = doc.splitTextToSize(line, 180);
            wrappedLines.forEach(wl => {
                if (y > 280) { doc.addPage(); y = 20; }
                doc.text(wl, 15, y);
                y += 6;
            });
        });
        doc.save(`${fileName || 'document'}-summary.pdf`);
    };

    if (!isOpen) return null;

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={headerStyle}>
                    <h2 style={{margin: 0}}>✨ Summary Workspace</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {data && !isLoading && (
                            <>
                                <button onClick={handleShareToDrive} disabled={isSavingToDrive} style={driveBtn}>
                                    {isSavingToDrive ? '⏳ Saving...' : '☁️ Drive'}
                                </button>
                                <button onClick={handleDownload} style={pdfBtn}>📄 PDF</button>
                            </>
                        )}
                        <button onClick={onClose} style={backBtn}>← Back</button>
                    </div>
                </div>

                <div style={contentArea}>
                    {/* ENHANCED PRIORITY LOGIC */}
                    {isLoading && data ? (
                        /* CASE 1: REGENERATING (Has old data, loading fresh one) */
                        <div style={centerBox}>
                            <div className="lms-loading-spinner" style={spinnerStyle}></div>
                            <h3 style={{marginTop: '20px'}}>Llama-3 is re-architecting insights...</h3>
                            <p style={{color: '#64748b'}}>Bypassing cache for a fresh perspective.</p>
                        </div>
                    ) : isLoading && hasConfirmed ? (
                        /* CASE 2: USER CLICKED 'YES' (First time generation) */
                        <div style={centerBox}>
                            <div className="lms-loading-spinner" style={spinnerStyle}></div>
                            <h3 style={{marginTop: '20px'}}>Architecting your summary...</h3>
                            <p style={{color: '#64748b'}}>Llama-3 is analyzing the document for the first time.</p>
                        </div>
                    ) : isLoading ? (
                        /* CASE 3: SILENT BACKGROUND CHECK (Checking Firestore) */
                        <div style={centerBox}>
                            <div className="lms-loading-spinner" style={spinnerStyle}></div>
                            <h3 style={{marginTop: '20px'}}>Checking Firestore cache...</h3>
                        </div>
                    ) : data ? (
                        /* CASE 4: DISPLAY DATA */
                        <div style={paperStyle}>
                            <MarkdownRenderer text={data} />
                        </div>
                    ) : (
                        /* CASE 5: SHOW PROMPT (Default state for new files) */
                        <div style={centerBox}>
                            <div style={{fontSize: '60px'}}>📄</div>
                            <h2 style={{fontSize: '24px'}}>Generate summary for "{fileName}"?</h2>
                            <button onClick={handleYesClick} style={bigBtn}>Yes, Generate Now</button>
                        </div>
                    )}
                </div>

                <div style={footerStyle}>
                    <div style={{ color: saveStatus?.type === 'error' ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                        {saveStatus?.message || '💡 AI Assistant Ready'}
                    </div>
                    {data && !isLoading && (
                        <button onClick={() => onRegenerate(true)} style={regenBtn}>🔄 Regenerate</button>
                    )}
                </div>
            </div>
        </div>
    );
};

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' };
const modalStyle = { background: '#f1f5f9', width: '94%', height: '90vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', padding: '25px', overflow: 'hidden' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' };
const contentArea = { flex: 1, overflowY: 'auto', padding: '20px' };
const paperStyle = { background: 'white', padding: '60px', borderRadius: '4px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', maxWidth: '850px', margin: '0 auto', width: '100%', minHeight: '100%', color: '#1e293b' };
const centerBox = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' };
const footerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '15px', borderTop: '1px solid #e2e8f0' };
const bigBtn = { padding: '16px 40px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '18px' };
const driveBtn = { background: '#10b981', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const pdfBtn = { background: '#6366f1', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const backBtn = { background: 'white', border: '1px solid #e2e8f0', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const regenBtn = { background: 'white', border: '1px solid #e2e8f0', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' };
const spinnerStyle = { width: '50px', height: '50px', border: '5px solid #e2e8f0', borderTop: '5px solid #6366f1', borderRadius: '50%', animation: 'lms-spin 1s linear infinite' };

export default SummaryModal;