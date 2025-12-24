import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import { MarkdownRenderer } from '../utils/markdownParser.jsx';

const SummaryModal = ({ isOpen, onClose, summary, fileName, isLoading }) => {
    const contentRef = useRef(null);

    const handleDownload = () => {
        if (!summary) return;
        const doc = new jsPDF();

        // Convert markdown formatting to plain text for PDF
        const convertMarkdownToText = (text) => {
            return text
                .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markers
                .replace(/\*(.*?)\*/g, '$1')     // Remove italic markers
                .replace(/__(.*?)__/g, '$1')     // Remove underline markers
                .replace(/•/g, '• ')             // Ensure bullet spacing
                .replace(/◦/g, '  ◦ ')           // Ensure sub-bullet spacing
                .replace(/▪/g, '  ▪ ');
        };

        const cleanText = convertMarkdownToText(summary);
        
        // Split text to fit page with better formatting
        const lines = cleanText.split('\n');
        const pageWidth = 180;
        const pageHeight = 280;
        let y = 20;
        
        // Title
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text("Document Summary", 105, y, { align: "center" });
        y += 15;
        
        // Add a line separator
        doc.setLineWidth(0.5);
        doc.line(15, y, 195, y);
        y += 10;
        
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        
        lines.forEach(line => {
            if (line.trim() === '') {
                y += 4; // Small space for empty lines
                return;
            }
            
            // Check if it's a main heading (contains bold markers in original)
            const isHeading = summary.includes(`**${line.trim()}**`) || 
                             line.includes('Main Topics') || 
                             line.includes('Key Concepts') || 
                             line.includes('Important Facts') || 
                             line.includes('Conclusions') || 
                             line.includes('Additional Details');
            
            if (isHeading) {
                if (y > 30) y += 8; // Extra space before headings
                doc.setFont(undefined, 'bold');
                doc.setFontSize(12);
            } else if (line.trim().startsWith('•')) {
                doc.setFont(undefined, 'normal');
                doc.setFontSize(10);
            } else {
                doc.setFont(undefined, 'normal');
                doc.setFontSize(11);
            }
            
            // Split long lines
            const wrappedLines = doc.splitTextToSize(line, pageWidth);
            
            wrappedLines.forEach(wrappedLine => {
                if (y > pageHeight) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(wrappedLine, 15, y);
                y += isHeading ? 8 : 6;
            });
        });

        doc.save("document-summary.pdf");
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        backdropFilter: 'blur(5px)'
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '16px',
                            padding: '32px',
                            width: '95%',
                            maxWidth: '1000px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid #f0f0f0', paddingBottom: '16px' }}>
                            <h2 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                ✨ <span style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Summary - {fileName}</span>
                            </h2>
                            <button
                                onClick={onClose || (() => window.location.hash = '#/')}
                                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}
                            >
                                ← Back
                            </button>
                        </div>

                        <div style={{ 
                            flex: 1, 
                            overflowY: 'auto', 
                            paddingRight: '16px', 
                            lineHeight: '1.8', 
                            color: '#2d3748',
                            fontSize: '16px',
                            background: '#fafafa',
                            borderRadius: '12px',
                            padding: '24px',
                            border: '1px solid #e2e8f0'
                        }}>
                            {isLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column' }}>
                                    <div className="loader" style={{ fontSize: '18px', color: '#667eea', fontWeight: '600' }}>🔄 Generating Comprehensive Summary...</div>
                                    <div style={{ marginTop: '12px', fontSize: '14px', color: '#718096' }}>This may take a moment for detailed analysis</div>
                                </div>
                            ) : (
                                <MarkdownRenderer 
                                    text={summary} 
                                    style={{ 
                                        fontSize: '16px',
                                        lineHeight: '1.8'
                                    }} 
                                />
                            )}
                        </div>

                        {!isLoading && summary && (
                            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '14px', color: '#718096' }}>
                                    💡 Tip: Use Ctrl+F to search within the summary
                                </div>
                                <button
                                    onClick={handleDownload}
                                    style={{
                                        padding: '12px 24px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        color: 'white',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease',
                                        fontSize: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
                                    }}
                                    onMouseOver={(e) => e.target.style.transform = 'translateY(-2px)'}
                                    onMouseOut={(e) => e.target.style.transform = 'translateY(0px)'}
                                >
                                    📄 Download PDF
                                </button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SummaryModal;
