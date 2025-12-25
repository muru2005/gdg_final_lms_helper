/* global chrome */
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownRenderer } from '../utils/markdownParser.jsx';

const ChatBox = ({ isOpen, onClose, filePath }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    // 1. AUTO-SCROLL TO BOTTOM
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // 2. MESSAGE LISTENER: Catch AI answers from the background script
    useEffect(() => {
        const messageListener = (request) => {
            if (request.action === 'RECEIVE_CHAT') {
                setMessages(prev => [...prev, { role: 'assistant', content: request.payload.answer }]);
                setLoading(false);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);
        return () => chrome.runtime.onMessage.removeListener(messageListener);
    }, []);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        // 3. SEND TO BACKGROUND BRIDGE
        // Instead of axios, we ask the background script to talk to Flask
        chrome.runtime.sendMessage({ 
            action: 'CHAT', 
            data: { 
                query: userMsg,
                file_path: filePath 
            } 
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.9 }}
                    style={chatContainerStyle}
                >
                    <div style={headerStyle}>
                        <span style={{ fontWeight: 'bold' }}>💬 Ask PDF AI</span>
                        <button onClick={onClose} style={closeIconStyle}>✕</button>
                    </div>

                    <div ref={scrollRef} style={chatAreaStyle}>
                        {messages.length === 0 && (
                            <div style={welcomeTextStyle}>
                                👋 I've read this document. Ask me anything!
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                ...bubbleStyle,
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                backgroundColor: msg.role === 'user' ? '#007AFF' : '#f1f5f9',
                                color: msg.role === 'user' ? 'white' : '#1e293b',
                            }}>
                                {msg.role === 'assistant' ? (
                                    <MarkdownRenderer text={msg.content} style={{ fontSize: '13px' }} />
                                ) : (
                                    <span>{msg.content}</span>
                                )}
                            </div>
                        ))}
                        {loading && <div style={loaderStyle}>Thinking...</div>}
                    </div>

                    <div style={inputAreaStyle}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text" value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Query this file..."
                                style={inputFieldStyle}
                            />
                            <button onClick={handleSend} style={sendBtnStyle}>➝</button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// --- STYLES (MATCHING YOUR MODERN UI) ---
const chatContainerStyle = {
    position: 'fixed', bottom: '30px', right: '30px',
    width: '380px', height: '550px', backgroundColor: 'white',
    borderRadius: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column', zIndex: 1000020, // Highest layer
    overflow: 'hidden', border: '1px solid #e2e8f0'
};

const headerStyle = { padding: '18px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' };
const closeIconStyle = { border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' };
const chatAreaStyle = { flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', backgroundColor: '#fff' };
const welcomeTextStyle = { textAlign: 'center', color: '#94a3b8', marginTop: '60px', fontSize: '14px' };
const bubbleStyle = { padding: '12px 18px', borderRadius: '18px', maxWidth: '85%', fontSize: '14px', lineHeight: '1.5', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
const loaderStyle = { fontSize: '12px', color: '#6366f1', paddingLeft: '5px', fontWeight: 'bold' };
const inputAreaStyle = { padding: '15px 20px', borderTop: '1px solid #f1f5f9', backgroundColor: '#fff' };
const inputFieldStyle = { flex: 1, padding: '12px 18px', borderRadius: '25px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px' };
const sendBtnStyle = { backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' };

export default ChatBox;