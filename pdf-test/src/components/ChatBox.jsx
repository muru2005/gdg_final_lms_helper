import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { MarkdownRenderer } from '../utils/markdownParser.jsx';

const BACKEND_URL = 'http://192.168.1.6:5000';

const ChatBox = ({ isOpen, onClose, filePath }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setLoading(true);

        try {
            const response = await axios.post(`${BACKEND_URL}/chat`, {
                query: userMsg,
                file_path: filePath
            });
            setMessages(prev => [...prev, { role: 'assistant', content: response.data.answer }]);
        } catch (error) {
            console.log(error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.9 }}
                    style={{
                        position: 'fixed',
                        bottom: '30px',
                        right: '30px',
                        width: '350px',
                        height: '500px',
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        zIndex: 3000,
                        overflow: 'hidden',
                        border: '1px solid #eee'
                    }}
                >
                    {/* Header */}
                    <div style={{ padding: '15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
                        <span style={{ fontWeight: 'bold' }}>Ask AI</span>
                        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: '#fff' }}>
                        {messages.length === 0 && (
                            <div style={{ textAlign: 'center', color: '#888', marginTop: '50px' }}>
                                👋 Ask me anything about this file!
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                backgroundColor: msg.role === 'user' ? '#007AFF' : '#f8f9fa',
                                color: msg.role === 'user' ? 'white' : '#333',
                                padding: '12px 16px',
                                borderRadius: '16px',
                                maxWidth: '85%',
                                wordWrap: 'break-word',
                                borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none'
                            }}>
                                {msg.role === 'assistant' ? (
                                    <MarkdownRenderer
                                        text={msg.content}
                                        style={{
                                            fontSize: '14px',
                                            lineHeight: '1.6'
                                        }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '14px', lineHeight: '1.5' }}>{msg.content}</span>
                                )}
                            </div>
                        ))}
                        {loading && (
                            <div style={{
                                alignSelf: 'flex-start',
                                backgroundColor: '#f8f9fa',
                                padding: '12px 16px',
                                borderRadius: '16px',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: '#007AFF',
                                    animation: 'pulse 1.5s infinite'
                                }}></div>
                                <span style={{ fontSize: '14px', color: '#666' }}>AI is thinking...</span>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div style={{ padding: '15px', borderTop: '1px solid #eee' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Type a message..."
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '20px',
                                    border: '1px solid #ddd',
                                    outline: 'none',
                                    fontSize: '14px'
                                }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={loading}
                                style={{
                                    backgroundColor: '#007AFF',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '36px',
                                    height: '36px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ➝
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ChatBox;
