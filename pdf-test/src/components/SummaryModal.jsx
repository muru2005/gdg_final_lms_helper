/* global chrome */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import { MarkdownRenderer } from '../utils/markdownParser.jsx';
import { Sparkles, Cloud, FileText, RefreshCw, Lightbulb, ArrowLeft, Loader2 } from 'lucide-react';

const SummaryModal = ({ isOpen, data, isLoading, fileName, onConfirmStart, onRegenerate, onClose }) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const [isSavingToDrive, setIsSavingToDrive] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setSaveStatus(null);

            if (data) {
                setHasConfirmed(true);
            } else if (!isLoading) {
                setHasConfirmed(false);
            }
        }
    }, [isOpen, fileName, data, isLoading]);

    const handleYesClick = () => {
        setHasConfirmed(true);
        onConfirmStart();
    };

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
            setSaveStatus({ type: 'progress', message: 'Relaying to background script...' });

            chrome.storage.local.get(['sessionToken'], (res) => {
                if (!res.sessionToken) {
                    setSaveStatus({ type: 'error', message: 'Log in via side-panel first.' });
                    setIsSavingToDrive(false);
                    return;
                }

                const title = fileName ? fileName.replace(/\.(pdf|docx?|txt)$/i, '') : 'Summary';
                const subject = prompt('Enter subject:', '');
                if (!subject) { setIsSavingToDrive(false); return; }

                const cleanBody = cleanMarkdownForDocs(data);
                const formattedHtml = `<html><body><h1>${title}</h1><p><b>Subject:</b> ${subject}</p><div>${cleanBody.slice(1)}</div></body></html>`;

                chrome.runtime.sendMessage({
                    action: 'SAVE_SUMMARY_TO_DRIVE',
                    data: {
                        summary: { title, subject, content: formattedHtml },
                        accessToken: res.sessionToken
                    }
                }, (response) => {
                    if (response && response.ok) {
                        setSaveStatus({ type: 'success', message: 'Saved to Drive!' });
                        if (confirm('Saved! Open in Google Drive?')) window.open(response.driveLink, '_blank');
                    } else {
                        setSaveStatus({ type: 'error', message: response?.error || 'Upload failed' });
                    }
                    setIsSavingToDrive(false);
                });
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
        doc.text(lines[0], 105, y, { align: "center" });
        y += 25;
        doc.setFontSize(11);
        lines.slice(1).forEach(line => {
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
                    <div className="flex items-center gap-2">
                        <Sparkles size={20} className="text-violet-600" />
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Summary Workspace</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {data && !isLoading && (
                            <>
                                <button onClick={handleShareToDrive} disabled={isSavingToDrive} style={driveBtn}>
                                    <Cloud size={14} />
                                    {isSavingToDrive ? 'Saving...' : 'Drive'}
                                </button>
                                <button onClick={handleDownload} style={pdfBtn}>
                                    <FileText size={14} />
                                    PDF
                                </button>
                            </>
                        )}
                        <button onClick={onClose} style={backBtn}>
                            <ArrowLeft size={14} />
                            Back
                        </button>
                    </div>
                </div>

                <div style={contentArea}>
                    {isLoading && data ? (
                        <div style={centerBox}>
                            <Loader2 size={40} className="animate-spin text-violet-600" />
                            <h3 style={{ marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>Llama-3 is re-architecting insights...</h3>
                            <p style={{ color: '#64748b', fontSize: '14px' }}>Bypassing cache for a fresh perspective.</p>
                        </div>
                    ) : isLoading && hasConfirmed ? (
                        <div style={centerBox}>
                            <Loader2 size={40} className="animate-spin text-violet-600" />
                            <h3 style={{ marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>Architecting your summary...</h3>
                            <p style={{ color: '#64748b', fontSize: '14px' }}>Llama-3 is analyzing the document for the first time.</p>
                        </div>
                    ) : isLoading ? (
                        <div style={centerBox}>
                            <Loader2 size={40} className="animate-spin text-violet-600" />
                            <h3 style={{ marginTop: '20px', fontSize: '16px', fontWeight: 600 }}>Checking Firestore cache...</h3>
                        </div>
                    ) : data ? (
                        <div style={paperStyle}>
                            <MarkdownRenderer text={data} />
                        </div>
                    ) : (
                        <div style={centerBox}>
                            <FileText size={48} className="text-slate-300" />
                            <h2 style={{ fontSize: '18px', marginTop: '16px', fontWeight: 600 }}>Generate summary for "{fileName}"?</h2>
                            <button onClick={handleYesClick} style={bigBtn}>Yes, Generate Now</button>
                        </div>
                    )}
                </div>

                <div style={footerStyle}>
                    <div className="flex items-center gap-2" style={{ color: saveStatus?.type === 'error' ? '#ef4444' : saveStatus?.type === 'success' ? '#10b981' : '#64748b', fontWeight: 500, fontSize: '13px' }}>
                        {!saveStatus && <Lightbulb size={14} />}
                        {saveStatus?.message || 'AI Assistant Ready'}
                    </div>
                    {data && !isLoading && (
                        <button onClick={() => onRegenerate(true)} style={regenBtn}>
                            <RefreshCw size={14} />
                            Regenerate
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' };
const modalStyle = { background: '#f8fafc', width: '94%', height: '90vh', borderRadius: '20px', display: 'flex', flexDirection: 'column', padding: '20px', overflow: 'hidden' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' };
const contentArea = { flex: 1, overflowY: 'auto', padding: '20px' };
const paperStyle = { background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', maxWidth: '850px', margin: '0 auto', width: '100%', minHeight: '100%', color: '#1e293b' };
const centerBox = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' };
const footerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '15px', borderTop: '1px solid #e2e8f0' };
const bigBtn = { padding: '14px 32px', background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', marginTop: '16px' };
const driveBtn = { background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' };
const pdfBtn = { background: 'linear-gradient(135deg, #7c3aed, #6366f1)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' };
const backBtn = { background: 'white', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' };
const regenBtn = { background: 'white', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' };

export default SummaryModal;