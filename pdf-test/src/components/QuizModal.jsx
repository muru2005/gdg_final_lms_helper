/* global chrome */
import React, { useState, useEffect } from 'react';

const QuizModal = ({ isOpen, isLoading, fileName, quizUrl, onConfirmStart, onClose }) => {
    const [hasConfirmed, setHasConfirmed] = useState(false);

    useEffect(() => {
        if (isOpen && !quizUrl) setHasConfirmed(false);
    }, [isOpen, fileName, quizUrl]);

    if (!isOpen) return null;

    const handleGenerate = () => {
        setHasConfirmed(true);
        onConfirmStart(); 
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0 }}>🎯 AI Quiz Generator</h2>
                    <button onClick={onClose} style={backBtn}>✕</button>
                </div>

                <div style={contentArea}>
                    {!hasConfirmed && !quizUrl ? (
                        /* STEP 1: PRE-GENERATION */
                        <div style={centerBox}>
                            <div style={{ fontSize: '60px' }}>🎯</div>
                            <h2 style={{ fontSize: '22px' }}>Test your knowledge?</h2>
                            <p style={{ color: '#64748b', marginBottom: '25px' }}>
                                Generate a custom Google Form quiz based on <br/>
                                <b>"{fileName}"</b>
                            </p>
                            <button onClick={handleGenerate} style={bigBtn}>Start Generating</button>
                        </div>
                    ) : isLoading ? (
                        /* STEP 2: LOADING */
                        <div style={centerBox}>
                            <div className="lms-loading-spinner" style={spinnerStyle}></div>
                            <h3 style={{ marginTop: '20px', color: '#6366f1' }}>Building your Quiz...</h3>
                            <p style={{ color: '#94a3b8' }}>Analyzing content and creating form links.</p>
                        </div>
                    ) : quizUrl ? (
                        /* STEP 3: READY TO TAKE */
                        <div style={centerBox}>
                            <div style={{ fontSize: '60px' }}>🚀</div>
                            <h2 style={{ fontSize: '22px' }}>Your Quiz is Ready!</h2>
                            <p style={{ marginBottom: '30px', color: '#64748b' }}>
                                Click below to open the form. You can view your <br/> 
                                score immediately after submitting.
                            </p>
                            
                            <a href={quizUrl} target="_blank" rel="noopener noreferrer" style={formBtn}>
                                Take the Quiz Now
                            </a>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

// --- MINIMALIST STYLES ---
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 1000010, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' };
const modalStyle = { background: '#ffffff', width: '90%', maxWidth: '500px', borderRadius: '24px', display: 'flex', flexDirection: 'column', padding: '30px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' };
const contentArea = { padding: '40px 10px', textAlign: 'center' };
const centerBox = { display: 'flex', flexDirection: 'column', alignItems: 'center' };
const bigBtn = { padding: '14px 30px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' };
const formBtn = { padding: '16px 32px', background: '#673ab7', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'none', fontSize: '16px', boxShadow: '0 4px 15px rgba(103, 58, 183, 0.3)' };
const backBtn = { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' };
const spinnerStyle = { width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #6366f1', borderRadius: '50%' };

export default QuizModal;