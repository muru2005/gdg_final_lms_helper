import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import ChatBox from './ChatBox';
import { Document, Page, pdfjs } from "react-pdf";
import { jsPDF } from "jspdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

const BACKEND_URL = 'http://192.168.1.6:5000';

const FileViewer = ({ filePath, fileName, fileUrl, onClose, popupMode }) => {
    const [numPages, setNumPages] = useState(null);
    const [showChat, setShowChat] = useState(true);
    const [loading, setLoading] = useState({ summary: false, mindmap: false });
    const [showConfirm, setShowConfirm] = useState({ type: '', show: false });

    // View State
    const [currentView, setCurrentView] = useState('file'); // 'file', 'summary', 'mindmap'
    const [generatedPdfs, setGeneratedPdfs] = useState({ summary: null, mindmap: null });

    // Store original file URL
    const [modalFileUrl, setModalFileUrl] = useState(null);

    useEffect(() => {
        if (fileUrl) {
            setModalFileUrl(fileUrl);
        }
    }, [fileUrl]);

    // Helper to generate PDF from text (Summary)
    const generateSummaryPdf = (text) => {
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text("Document Summary", 20, 20);

        doc.setFontSize(12);
        const splitText = doc.splitTextToSize(text, 170);
        let y = 30;

        splitText.forEach(line => {
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            doc.text(line, 20, y);
            y += 7;
        });

        return doc.output('bloburl');
    };

    // Helper to generate PDF from JSON MindMap
    const generateMindMapPdf = (data) => {
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text("Mind Map Outline", 20, 20);

        doc.setFontSize(11);
        let y = 30;

        const renderNode = (node, level = 0) => {
            if (!node) return;

            if (y > 280) {
                doc.addPage();
                y = 20;
            }

            const indent = 20 + (level * 10);
            const prefix = level === 0 ? "• " : "◦ ";
            const text = `${prefix}${node.title}`;

            // Handle long text wrapping
            const maxLineWidth = 170 - (level * 10);
            const splitLines = doc.splitTextToSize(text, maxLineWidth);

            splitLines.forEach((line, idx) => {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                const xPos = idx === 0 ? indent : indent + 5;
                doc.text(line, xPos, y);
                y += 6;
            });

            if (node.children && node.children.length > 0) {
                node.children.forEach(child => renderNode(child, level + 1));
            }
        };

        if (data.title) {
            renderNode(data, 0);
        }

        return doc.output('bloburl');
    };

    const handleSummary = async () => {
        // If we already have it, just switch view
        if (generatedPdfs.summary) {
            setCurrentView('summary');
            return;
        }
        setShowConfirm({ type: 'summary', show: true });
    };

    const handleMindMap = async () => {
        // If we already have it, just switch view
        if (generatedPdfs.mindmap) {
            setCurrentView('mindmap');
            return;
        }
        setShowConfirm({ type: 'mindmap', show: true });
    };

    const handleOriginalFile = () => {
        setCurrentView('file');
    }

    const generateContent = async () => {
        const type = showConfirm.type;
        setLoading({ ...loading, [type]: true });
        setShowConfirm({ type: '', show: false });

        try {
            let content = '';
            if (fileUrl) {
                const response = await fetch(fileUrl);
                content = await response.text();
            }

            // 1. Generate Summary first (needed for both)
            let summaryText = '';
            // We optimize by checking if we have summary, but for simplicity let's just hit the endpoint if needed
            // Actually, let's reuse the summary endpoint logic
            const summaryResponse = await axios.post(`${BACKEND_URL}/generate-summary`, {
                text: content,
                file_path: filePath // Optional, helps with caching
            });
            summaryText = summaryResponse.data.summary;

            if (type === 'summary') {
                const url = generateSummaryPdf(summaryText);
                setGeneratedPdfs(prev => ({ ...prev, summary: url }));
                setCurrentView('summary');
            } else if (type === 'mindmap') {
                // 2. Generate Mindmap from summary
                const mmResponse = await axios.post(`${BACKEND_URL}/generate-mindmap`, {
                    summary: summaryText
                });
                const url = generateMindMapPdf(mmResponse.data);
                setGeneratedPdfs(prev => ({ ...prev, mindmap: url }));
                setCurrentView('mindmap');
            }

        } catch (error) {
            console.error(`Error generating ${type}:`, error);
        } finally {
            setLoading({ ...loading, [type]: false });
        }
    };

    // Determine which URL to show
    const getDisplayUrl = () => {
        switch (currentView) {
            case 'summary': return generatedPdfs.summary;
            case 'mindmap': return generatedPdfs.mindmap;
            default: return modalFileUrl;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 1000,
                overflowY: "auto",
                backdropFilter: "blur(3px)",
                padding: '40px'
            }}
        >
            <div style={{ width: '100%', maxWidth: '1280px', display: 'flex', flexDirection: 'column', height: '90vh' }}>

                {/* Header Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'white',
                    padding: '15px 25px',
                    borderRadius: '12px 12px 0 0',
                    borderBottom: '1px solid #e2e8f0'
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                            {currentView === 'file' ? fileName : currentView === 'summary' ? `Summary: ${fileName}` : `Mind Map: ${fileName}`}
                        </h2>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleOriginalFile}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: currentView === 'file' ? '#3b82f6' : '#f3f4f6',
                                color: currentView === 'file' ? 'white' : '#374151',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '500'
                            }}
                        >
                            📄 Original
                        </button>
                        <button
                            onClick={handleSummary}
                            disabled={loading.summary}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: currentView === 'summary' ? '#8B5CF6' : (loading.summary ? '#e5e7eb' : '#f3f4f6'),
                                color: currentView === 'summary' ? 'white' : '#374151',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: loading.summary ? 'wait' : 'pointer',
                                fontWeight: '500'
                            }}
                        >
                            {loading.summary ? '⏳ Generating...' : '📝 Summary'}
                        </button>
                        <button
                            onClick={handleMindMap}
                            disabled={loading.mindmap}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: currentView === 'mindmap' ? '#10B981' : (loading.mindmap ? '#e5e7eb' : '#f3f4f6'),
                                color: currentView === 'mindmap' ? 'white' : '#374151',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: loading.mindmap ? 'wait' : 'pointer',
                                fontWeight: '500'
                            }}
                        >
                            {loading.mindmap ? '⏳ Generating...' : '🧠 Mind Map'}
                        </button>
                    </div>

                    <button
                        onClick={onClose || (() => window.location.hash = '#/')}
                        style={{
                            color: '#6b7280',
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            marginLeft: '20px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* PDF Viewer Container */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        flex: 1,
                        backgroundColor: '#525659',
                        overflow: 'auto',
                        display: 'flex',
                        justifyContent: 'center',
                        borderRadius: '0 0 12px 12px',
                        padding: '20px'
                    }}
                >
                    <Document
                        file={getDisplayUrl()}
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        onLoadError={(error) => console.error("PDF Load Error:", error)}
                        loading={<div style={{ color: 'white' }}>Loading Document...</div>}
                    >
                        {Array.from(new Array(numPages), (_, index) => (
                            <div key={index} style={{ marginBottom: "15px", boxShadow: "0 5px 15px rgba(0,0,0,0.5)" }}>
                                <Page pageNumber={index + 1} width={800} renderTextLayer={false} renderAnnotationLayer={false} />
                            </div>
                        ))}
                    </Document>
                </div>
            </div>

            {/* Confirmation Modal */}
            {showConfirm.show && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2500
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '24px',
                        borderRadius: '12px',
                        maxWidth: '400px',
                        textAlign: 'center'
                    }}>
                        <h3>Generate {showConfirm.type === 'summary' ? 'Summary' : 'Mind Map'}?</h3>
                        <p style={{ color: '#666', margin: '16px 0' }}>
                            This will analyze the file and generate a {showConfirm.type} PDF. This may take a moment.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setShowConfirm({ type: '', show: false })}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#6B7280',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={generateContent}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: '#007AFF',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                }}
                            >
                                Generate
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Component - Always visible on top */}
            <ChatBox
                isOpen={showChat}
                onClose={() => setShowChat(false)}
                filePath={filePath}
            />
        </motion.div>
    );
};

export default FileViewer;