/* global chrome */
import React, { useState, useEffect } from 'react';

/**
 * QuizModal handles the interactive flow for generating AI quizzes.
 * It transitions from a Confirmation screen -> Loading spinner -> Success link.
 */
const QuizModal = ({ isOpen, isLoading, fileName, quizUrl, onConfirmStart, onClose }) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);

    // Reset the confirmation state whenever a new file is targeted or modal is reopened
    useEffect(() => {
        if (isOpen && !quizUrl) {
            setHasConfirmed(false);
        }
    }, [isOpen, fileName, quizUrl]);

    if (!isOpen) return null;

    // Trigger the parent's startQuizGeneration logic
    const handleGenerate = () => {
        setHasConfirmed(true);
        onConfirmStart(); 
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                {/* HEADER SECTION */}
                <div style={headerStyle}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🎯 AI Quiz Generator
                    </h2>
                    <button onClick={onClose} style={backBtn}>✕</button>
                </div>

                {/* DYNAMIC CONTENT AREA */}
                <div style={contentArea}>
                    {!hasConfirmed && !quizUrl ? (
                        /* STEP 1: PRE-GENERATION CONFIRMATION */
                        <div style={centerBox}>
                            <div style={{ fontSize: '60px', marginBottom: '10px' }}>🎯</div>
                            <h2 style={{ fontSize: '22px', color: '#1e293b' }}>Test your knowledge?</h2>
                            <p style={{ color: '#64748b', marginBottom: '25px', lineHeight: '1.5' }}>
                                Llama-3 will analyze <b>"{fileName}"</b> and create a 
                                custom Google Form quiz for you.
                            </p>
                            <button onClick={handleGenerate} style={bigBtn}>Start Generating</button>
                        </div>
                    ) : isLoading ? (
                        /* STEP 2: ACTIVE AI GENERATION */
                        <div style={centerBox}>
                            <div className="lms-loading-spinner" style={spinnerStyle}></div>
                            <h3 style={{ marginTop: '20px', color: '#6366f1' }}>Building your Quiz...</h3>
                            <p style={{ color: '#94a3b8' }}>
                                Analyzing content, architecting questions, and <br/> 
                                publishing your Google Form.
                            </p>
                        </div>
                    ) : quizUrl ? (
                        /* STEP 3: SUCCESS & EXTERNAL LINK */
                        <div style={centerBox}>
                            <div style={{ fontSize: '60px', marginBottom: '10px' }}>🚀</div>
                            <h2 style={{ fontSize: '22px', color: '#1e293b' }}>Your Quiz is Ready!</h2>
                            <p style={{ marginBottom: '30px', color: '#64748b' }}>
                                The quiz has been published to Google Forms. <br/> 
                                You can view your score immediately after submission.
                            </p>
                            
                            <a href={quizUrl} target="_blank" rel="noopener noreferrer" style={formBtn}>
                                Take the Quiz Now
                            </a>
                            <button onClick={onClose} style={dismissBtn}>Close Workspace</button>
                        </div>
                    ) : null}
                </div>

                {/* FOOTER INFO */}
                <div style={footerStyle}>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                        💡 Pro-tip: Quizzes are also saved to your "LMS Summaries" Drive folder.
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- STYLES (MODERN & MINIMALIST) ---
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1000010, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' };
const modalStyle = { background: '#ffffff', width: '90%', maxWidth: '500px', borderRadius: '24px', display: 'flex', flexDirection: 'column', padding: '30px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '1px solid #e2e8f0' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' };
const contentArea = { padding: '40px 10px', textAlign: 'center' };
const footerStyle = { borderTop: '1px solid #f1f5f9', paddingTop: '15px', textAlign: 'center' };
const centerBox = { display: 'flex', flexDirection: 'column', alignItems: 'center' };

const bigBtn = { padding: '14px 40px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)' };
const formBtn = { padding: '16px 32px', background: '#673ab7', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'none', fontSize: '16px', boxShadow: '0 4px 15px rgba(103, 58, 183, 0.3)', marginBottom: '15px' };
const backBtn = { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8', fontWeight: 'bold' };
const dismissBtn = { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' };
const spinnerStyle = { width: '45px', height: '45px', border: '5px solid #f3f3f3', borderTop: '5px solid #6366f1', borderRadius: '50%' };

export default QuizModal;