import { useState } from 'react';
import { motion } from 'framer-motion';
import FileViewer from './FileViewer';

const FileBrowser = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    
    // Sample files - in real implementation, this would come from file system or API
    const sampleFiles = [
        { path: 'C:\\Documents\\sample.pdf', name: 'sample.pdf', type: 'pdf' },
        { path: 'C:\\Documents\\notes.txt', name: 'notes.txt', type: 'txt' },
        { path: 'C:\\Documents\\research.md', name: 'research.md', type: 'md' },
        { path: 'C:\\Code\\main.py', name: 'main.py', type: 'py' },
        { path: 'C:\\Code\\app.js', name: 'app.js', type: 'js' }
    ];

    const getFileIcon = (type) => {
        const icons = {
            pdf: '📄',
            txt: '📝',
            md: '📋',
            py: '🐍',
            js: '⚡',
            default: '📁'
        };
        return icons[type] || icons.default;
    };

    const FileCard = ({ file }) => {
        const [showActions, setShowActions] = useState(false);

        return (
            <motion.div
                whileHover={{ scale: 1.02 }}
                style={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    position: 'relative',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={() => setShowActions(true)}
                onMouseLeave={() => setShowActions(false)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>{getFileIcon(file.type)}</span>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>{file.name}</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>{file.path}</p>
                    </div>
                </div>

                {/* Three Action Buttons */}
                {showActions && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            display: 'flex',
                            gap: '4px',
                            backgroundColor: 'rgba(255,255,255,0.95)',
                            padding: '4px',
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFile(file);
                            }}
                            style={{
                                padding: '6px 10px',
                                backgroundColor: '#007AFF',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}
                            title="View & Ask AI"
                        >
                            👁️
                        </button>
                        
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // Handle mindmap generation
                                console.log('Generate mindmap for:', file.name);
                            }}
                            style={{
                                padding: '6px 10px',
                                backgroundColor: '#10B981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}
                            title="Generate Mind Map"
                        >
                            🧠
                        </button>
                        
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                // Handle summary generation
                                console.log('Generate summary for:', file.name);
                            }}
                            style={{
                                padding: '6px 10px',
                                backgroundColor: '#8B5CF6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}
                            title="Generate Summary"
                        >
                            📝
                        </button>
                    </motion.div>
                )}
            </motion.div>
        );
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: '24px', fontSize: '28px', fontWeight: 'bold' }}>
                📚 LMS Helper - File Browser
            </h1>
            
            <p style={{ marginBottom: '32px', color: '#666', fontSize: '16px' }}>
                Hover over any file to see the three action buttons: View & Ask AI, Generate Mind Map, and Generate Summary
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px'
            }}>
                {sampleFiles.map((file, index) => (
                    <FileCard key={index} file={file} />
                ))}
            </div>

            {/* File Viewer Modal */}
            {selectedFile && (
                <FileViewer
                    filePath={selectedFile.path}
                    fileName={selectedFile.name}
                    onClose={() => setSelectedFile(null)}
                />
            )}
        </div>
    );
};

export default FileBrowser;