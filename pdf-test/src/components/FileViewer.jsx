import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Styles for text layer to prevent the "repeating text" bug
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// AUTOMATIC VERSION SYNC: Ensures library and worker always match
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const FileViewer = ({ fileUrl, fileName, onClose, onOpenSummary, onOpenMindMap, onOpenChat }) => {
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

    if (error) return <div style={errOverlay}>{error} <button onClick={onClose} style={toolBtn}>✕ Close</button></div>;

    return (
        <div style={overlayStyle} onClick={onClose}>
            {/* STICKY GLASS HEADER WITH TOOLS */}
            <div style={headerStyle} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <button onClick={onOpenSummary} style={toolBtn}>📝 Summary</button>
                    <button onClick={onOpenMindMap} style={toolBtn}>🧠 Mind Map</button>
                    <button onClick={onOpenChat} style={toolBtn}>💬 Ask AI</button>
                    
                    {/* Integrated Zoom Controls */}
                    <div style={zoomContainer}>
                        <button onClick={zoomOut} style={zoomBtn}>-</button>
                        <span style={{ color: 'white', minWidth: '45px', textAlign: 'center', fontSize: '12px' }}>
                            {Math.round(scale * 100)}%
                        </span>
                        <button onClick={zoomIn} style={zoomBtn}>+</button>
                    </div>
                </div>

                <div style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <span style={{ fontWeight: '800', fontSize: '1rem', letterSpacing: '0.5px' }}>{fileName}</span>
                    <button onClick={onClose} style={closeIcon}>✕</button>
                </div>
            </div>

            {/* SCROLLABLE CONTENT AREA */}
            <div style={pdfScrollArea} onClick={(e) => e.stopPropagation()}>
                {pdfBlob && (
                    <Document 
                        file={pdfBlob} 
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        loading={<div style={{color:'white', fontSize:'1.2rem'}}>⚡ Syncing with AI Workspace...</div>}
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

// --- GMAIL-STYLE INTEGRATED STYLES ---
const overlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.96)', zIndex: 999999, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', backdropFilter: 'blur(15px)' };
const headerStyle = { width: '100%', padding: '12px 40px', display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(255, 255, 255, 0.05)', backdropFilter: 'blur(25px)', position: 'sticky', top: 0, zIndex: 1000, borderBottom: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 30px rgba(0,0,0,0.4)' };
const toolBtn = { padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 'bold', backgroundColor: '#fff', color: '#1e293b', transition: 'all 0.2s' };
const zoomContainer = { display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2px 8px', marginLeft: '10px' };
const zoomBtn = { background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer', padding: '0 8px' };
const pdfScrollArea = { marginTop: '30px', paddingBottom: '120px' };
const pageShadow = { marginBottom: '40px', boxShadow: '0 30px 60px rgba(0,0,0,0.7)', borderRadius: '4px', overflow: 'hidden', backgroundColor: 'white' };
const closeIcon = { background: 'none', border: 'none', color: 'white', fontSize: '30px', cursor: 'pointer', opacity: '0.8' };
const errOverlay = { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: 'white', zIndex: 1000000 };

export default FileViewer;