/* global chrome */
import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Target, MessageCircle, X, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

// Styles for text layer to prevent the "repeating text" bug
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// AUTOMATIC VERSION SYNC: Ensures library and worker always match
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const FileViewer = ({ fileUrl, fileName, onClose, onOpenSummary, onOpenMindMap, onOpenChat, onOpenQuiz }) => {
    const [numPages, setNumPages] = useState(null);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [scale, setScale] = useState(1.0);
    const [error, setError] = useState(null);

    // Zoom Handlers
    const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 2.0));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

    useEffect(() => {
        const loadPdf = async () => {
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error("LMS Fetch Failed");
                const blob = await response.blob();
                const localUrl = URL.createObjectURL(blob);
                setPdfBlob(localUrl);
            } catch (err) {
                console.error("PDF Load Failure:", err);
                setError("Security Block: Could not load PDF from LMS.");
            }
        };
        loadPdf();
        return () => { if (pdfBlob) URL.revokeObjectURL(pdfBlob); };
    }, [fileUrl]);

    if (error) return (
        <div style={errOverlay}>
            {error}
            <button onClick={onClose} style={toolBtn}>
                <X size={14} />
                Close
            </button>
        </div>
    );

    return (
        <div style={overlayStyle} onClick={onClose}>
            {/* STICKY GLASS HEADER WITH TOOLS */}
            <div style={headerStyle} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>

                    {/* TRIGGER: This button now correctly calls onOpenQuiz from AIViewer */}
                    <button onClick={onOpenQuiz} style={toolBtn}>
                        <Target size={14} />
                        Quiz
                    </button>
                    <button onClick={onOpenChat} style={toolBtn}>
                        <MessageCircle size={14} />
                        Ask AI
                    </button>

                    {/* Integrated Zoom Controls */}
                    <div style={zoomContainer}>
                        <button onClick={zoomOut} style={zoomBtn}>
                            <ZoomOut size={16} />
                        </button>
                        <span style={{ color: 'white', minWidth: '45px', textAlign: 'center', fontSize: '12px', fontWeight: 500 }}>
                            {Math.round(scale * 100)}%
                        </span>
                        <button onClick={zoomIn} style={zoomBtn}>
                            <ZoomIn size={16} />
                        </button>
                    </div>
                </div>

                <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px', letterSpacing: '0.3px' }}>{fileName}</span>
                    <button onClick={onClose} style={closeIcon}>
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* SCROLLABLE CONTENT AREA */}
            <div style={pdfScrollArea} onClick={(e) => e.stopPropagation()}>

                {pdfBlob && (
                    <Document
                        file={pdfBlob}
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        loading={
                            <div style={{ color: 'white', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Loader2 size={18} className="animate-spin" />
                                Syncing with AI Workspace...
                            </div>
                        }
                    >
                        {Array.from(new Array(numPages), (_, i) => (
                            <div key={i} style={pageShadow}>
                                <Page
                                    pageNumber={i + 1}
                                    scale={scale}
                                    width={Math.min(window.innerWidth * 0.85, 950)}
                                    renderTextLayer={true} // Enabled for text selection
                                    renderAnnotationLayer={false} // Disabled to prevent ghost text
                                />
                            </div>
                        ))}
                    </Document>
                )}
            </div>
        </div>
    );
};

// --- MODERN STYLES ---
const overlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.96)', zIndex: 999999, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', backdropFilter: 'blur(15px)' };
const headerStyle = { width: '100%', padding: '12px 30px', display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.7)', position: 'sticky', top: 0, zIndex: 1000, borderBottom: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 30px rgba(0,0,0,0.4)' };
const toolBtn = { padding: '8px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '12px', backgroundColor: '#fff', color: '#1e293b', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' };
const zoomContainer = { display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '4px 8px', marginLeft: '10px' };
const zoomBtn = { background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', opacity: 0.8, transition: 'opacity 0.2s' };
const pdfScrollArea = { marginTop: '30px', paddingBottom: '120px' };
const pageShadow = { marginBottom: '40px', boxShadow: '0 30px 60px rgba(0,0,0,0.7)', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'white' };
const closeIcon = { background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.8, display: 'flex', alignItems: 'center', padding: '4px' };
const errOverlay = { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: 'white', zIndex: 1000000, gap: '16px' };

export default FileViewer;