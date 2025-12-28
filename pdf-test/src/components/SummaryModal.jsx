/* global chrome */
import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import { MarkdownRenderer } from '../utils/markdownParser.jsx';

// REMOVED: axios and internal useEffect fetch logic
// This component now purely DISPLAYS data passed from the AIViewer parent.

const SummaryModal = ({ isOpen, onClose, data, isLoading, fileName }) => {
    const contentRef = useRef(null);
    const [isSavingToDrive, setIsSavingToDrive] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    // --- PDF DOWNLOAD LOGIC ---
    const handleDownload = () => {
        if (!data) return;
        const doc = new jsPDF();

        const convertMarkdownToText = (text) => {
            return text
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1')
                .replace(/__(.*?)__/g, '$1')
                .replace(/•/g, '• ')
                .replace(/◦/g, '  ◦ ')
                .replace(/▪/g, '  ▪ ');
        };

        const cleanText = convertMarkdownToText(data);
        const lines = cleanText.split('\n');
        const pageWidth = 180;
        const pageHeight = 280;
        let y = 20;
        
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text("Document Summary", 105, y, { align: "center" });
        y += 15;
        
        doc.setLineWidth(0.5);
        doc.line(15, y, 195, y);
        y += 10;
        
        lines.forEach(line => {
            if (line.trim() === '') { y += 4; return; }
            const isHeading = line.trim().startsWith('#') || line.toUpperCase() === line.trim();
            
            if (isHeading) {
                if (y > 30) y += 8;
                doc.setFont(undefined, 'bold');
                doc.setFontSize(12);
            } else {
                doc.setFont(undefined, 'normal');
                doc.setFontSize(11);
            }
            
            const wrappedLines = doc.splitTextToSize(line.replace(/^#+\s*/, ''), pageWidth);
            wrappedLines.forEach(wrappedLine => {
                if (y > pageHeight) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(wrappedLine, 15, y);
                y += isHeading ? 8 : 6;
            });
        });

        doc.save(`${fileName || 'document'}-summary.pdf`);
    };
    const handleShareToDrive = async () => {
        if (!data) return;

        try {
            setIsSavingToDrive(true);
            setSaveStatus(null);

            // Get the access token from Chrome storage
            chrome.storage.local.get(['sessionToken'], async (res) => {
                if (!res.sessionToken) {
                    setSaveStatus({
                        type: 'error',
                        message: 'Please log in via the extension side-panel first.'
                    });
                    setIsSavingToDrive(false);
                    return;
                }

                // Extract title from fileName (remove extension)
                const title = fileName 
                    ? fileName.replace(/\.(pdf|docx?|txt)$/i, '') 
                    : 'Document Summary';

                // Prompt user for subject
                const subject = prompt(
                    'Enter the subject/course name for this summary:',
                    'General'
                );

                if (!subject) {
                    setSaveStatus({
                        type: 'error',
                        message: 'Subject is required to save to Drive.'
                    });
                    setIsSavingToDrive(false);
                    return;
                }

                const cleanMarkdownForDocs = (text) => {
                    if (!text) return "";

    return text
        .split('\n')
        .map(line => {
            let cleaned = line.trim();

            // 1. Aggressively remove nested stars like * ** or **:* or *:
            // This targets specifically what you see in your provided images
            cleaned = cleaned.replace(/[\*]{1,3}\s?|\s?[\*]{1,3}/g, ''); 
            cleaned = cleaned.replace(/[:]{1,}\s?[\*]{1,}/g, ':');

            // 2. Remove stray '+' or '-' used as bullets and prep them for <li>
            if (cleaned.startsWith('+') || cleaned.startsWith('-')) {
                return `<li>${cleaned.substring(1).trim()}</li>`;
            }

            // 3. Detect major section headers (all caps or ending in colon) 
            // and wrap them in bold tags manually
            if (cleaned.length > 3 && (cleaned.toUpperCase() === cleaned || cleaned.endsWith(':'))) {
                return `<p style="margin-top:15px; margin-bottom:5px;"><b>${cleaned}</b></p>`;
            }

            return cleaned;
        })
        .join('\n')
        // 4. Group adjacent <li> tags into a proper <ul> for Google Doc bullets
        .replace(/(<li>.*?<\/li>)/gms, '<ul style="margin-bottom:10px;">$1</ul>')
        // 5. Final cleanup of any remaining Markdown bold remnants
        .replace(/\*\*/g, '')
        // 6. Convert newlines to breaks for proper spacing
        .replace(/\n/g, '<br/>');
};

    const cleanBody = cleanMarkdownForDocs(data);
                const formattedHtml = `
    <html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; }
        h1 { color: #d32f2f; padding-bottom: 10px; font-size: 22pt; }
        p { margin-bottom: 8px; }
        li { margin-bottom: 4px; list-style-type: disc; }
        b { color: #000; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <p><strong>Subject:</strong> ${subject}</p>
    
    <div class="content">
        ${cleanBody} 
    </div>
</body>
</html>`;    
                // Prepare the payload
     const payload = {
                    summary: {
                        title: title,
                        subject: subject.trim(),
                        content:formattedHtml
                    },
                    accessToken: res.sessionToken
                };

                console.log('[SummaryModal] Saving to Drive...', { title, subject });

                // Call the backend endpoint
                const response = await fetch('http://localhost:5000/api/save-summary', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (response.ok && result.ok) {
                    setSaveStatus({
                        type: 'success',
                        message: `✅ Saved to Google Drive: ${result.fileName || 'Summary'}`
                    });
                    console.log('[SummaryModal] Drive link:', result.driveLink);
                    await navigator.clipboard.writeText(result.driveLink);
                    alert("Drive link copied to clipboard!");
                    // Optionally open the Drive link
                    if (result.driveLink) {
                        setTimeout(() => {
                            if (confirm('Open the file in Google Drive?')) {
                                window.open(result.driveLink, '_blank');
                            }
                        }, 1000);
                    }
                } else {
                    throw new Error(result.error || 'Failed to save to Drive');
                }

                setIsSavingToDrive(false);
            });

        } catch (error) {
            console.error('[SummaryModal] Drive save error:', error);
            setSaveStatus({
                type: 'error',
                message: `❌ Error: ${error.message}`
            });
            setIsSavingToDrive(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={overlayStyle}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        style={modalStyle}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* HEADER SECTION */}
                        <div style={headerStyle}>
                            <h2 style={titleStyle}>
                                ✨ <span style={gradientText}>
                                    Summary: {fileName?.substring(0, 40) || 'Document'}
                                </span>
                            </h2>
                            <button onClick={onClose} style={backBtn}>← Back</button>
                        </div>

                        {/* CONTENT SECTION */}
                        <div style={contentArea}>
                            {isLoading ? (
                                <div style={loadingWrapper}>
                                    <div style={loadingText}>🔄 Generating Comprehensive Summary...</div>
                                    <div style={subText}>Bypassing security and extracting insights via Llama-3</div>
                                    <div className="pulse-loader"></div>
                                </div>
                            ) : data ? (
                                <MarkdownRenderer text={data} />
                            ) : (
                                <div style={loadingText}>Waiting for data synchronization...</div>
                            )}
                        </div>

                        {/* STATUS MESSAGE */}
                        {saveStatus && (
                            <div style={{
                                ...statusMessageStyle,
                                backgroundColor: saveStatus.type === 'success' ? '#d4edda' : '#f8d7da',
                                color: saveStatus.type === 'success' ? '#155724' : '#721c24',
                                borderColor: saveStatus.type === 'success' ? '#c3e6cb' : '#f5c6cb'
                            }}>
                                {saveStatus.message}
                            </div>
                        )}

                        {/* FOOTER SECTION */}
                        {!isLoading && data && (
                            <div style={footerStyle}>
                                <div style={{ fontSize: '14px', color: '#a0aec0' }}>💡 Generated by AI Copilot</div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button 
                                        onClick={handleShareToDrive} 
                                        style={{
                                            ...driveBtn,
                                            opacity: isSavingToDrive ? 0.6 : 1,
                                            cursor: isSavingToDrive ? 'not-allowed' : 'pointer'
                                        }}
                                        disabled={isSavingToDrive}
                                    >
                                        {isSavingToDrive ? '⏳ Saving...' : '📂 Share to Drive'}
                                    </button>
                                    <button onClick={handleDownload} style={downloadBtn}>
                                        📄 Download PDF
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// --- STYLES (ENHANCED FOR HIGH-DENSITY VISUALS) ---
const overlayStyle = { 
    position: 'fixed', inset: 0, 
    backgroundColor: 'rgba(0, 0, 0, 0.75)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', 
    zIndex: 1000010, // Must be higher than PDF Viewer
    backdropFilter: 'blur(12px)' 
};

const modalStyle = { 
    backgroundColor: 'white', borderRadius: '24px', padding: '35px', 
    width: '92%', maxWidth: '950px', maxHeight: '85vh', 
    display: 'flex', flexDirection: 'column', 
    boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)', 
    overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)'
};

const headerStyle = { 
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
    marginBottom: '24px', borderBottom: '2px solid #f1f5f9', paddingBottom: '20px' 
};

const titleStyle = { fontSize: '24px', fontWeight: '800', margin: 0, color: '#0f172a' };

const gradientText = { 
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', 
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' 
};

const backBtn = { 
    background: '#f1f5f9', border: '1px solid #e2e8f0', 
    borderRadius: '10px', padding: '10px 20px', 
    cursor: 'pointer', fontWeight: '700', color: '#475569',
    transition: 'all 0.2s'
};

const contentArea = { 
    flex: 1, overflowY: 'auto', background: '#ffffff', 
    borderRadius: '16px', padding: '15px', border: '1px solid #f1f5f9' 
};

const footerStyle = { 
    marginTop: '24px', display: 'flex', justifyContent: 'space-between', 
    alignItems: 'center', paddingTop: '20px', borderTop: '1px solid #f1f5f9' 
};

const downloadBtn = { 
    padding: '14px 30px', borderRadius: '14px', border: 'none', 
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
    color: 'white', fontWeight: '800', cursor: 'pointer', 
    boxShadow: '0 10px 20px rgba(99, 102, 241, 0.4)' 
};

const driveBtn = { 
    padding: '14px 30px', borderRadius: '14px', border: 'none', 
    background: 'linear-gradient(135deg, #34A853 0%, #0F9D58 100%)', 
    color: 'white', fontWeight: '800', cursor: 'pointer', 
    boxShadow: '0 10px 20px rgba(52, 168, 83, 0.4)',
    transition: 'all 0.2s'
};

const statusMessageStyle = {
    marginTop: '16px',
    padding: '12px 20px',
    borderRadius: '10px',
    border: '1px solid',
    fontSize: '14px',
    fontWeight: '600',
    textAlign: 'center'
};

const loadingWrapper = { 
    display: 'flex', justifyContent: 'center', alignItems: 'center', 
    height: '350px', flexDirection: 'column', gap: '15px' 
};

const loadingText = { fontSize: '20px', color: '#6366f1', fontWeight: '800' };

const subText = { fontSize: '15px', color: '#64748b', textAlign: 'center', maxWidth: '400px' };

export default SummaryModal;