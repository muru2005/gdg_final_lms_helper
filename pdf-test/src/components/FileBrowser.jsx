import { useState } from 'react';
import { motion } from 'framer-motion';
import FileViewer from './FileViewer';
import { FileText, File, FileCode, Eye, Brain, AlignLeft, BookOpen } from 'lucide-react';

const FileBrowser = () => {
    const [selectedFile, setSelectedFile] = useState(null);

    const sampleFiles = [
        { path: 'C:\\Documents\\sample.pdf', name: 'sample.pdf', type: 'pdf' },
        { path: 'C:\\Documents\\notes.txt', name: 'notes.txt', type: 'txt' },
        { path: 'C:\\Documents\\research.md', name: 'research.md', type: 'md' },
        { path: 'C:\\Code\\main.py', name: 'main.py', type: 'py' },
        { path: 'C:\\Code\\app.js', name: 'app.js', type: 'js' }
    ];

    const getFileIcon = (type) => {
        const iconProps = { size: 20 };
        const icons = {
            pdf: <FileText {...iconProps} className="text-rose-500" />,
            txt: <File {...iconProps} className="text-slate-500" />,
            md: <FileText {...iconProps} className="text-blue-500" />,
            py: <FileCode {...iconProps} className="text-yellow-500" />,
            js: <FileCode {...iconProps} className="text-amber-500" />,
            default: <File {...iconProps} className="text-slate-400" />
        };
        return icons[type] || icons.default;
    };

    const FileCard = ({ file }) => {
        const [showActions, setShowActions] = useState(false);

        return (
            <motion.div
                whileHover={{ scale: 1.01 }}
                style={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    position: 'relative',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={() => setShowActions(true)}
                onMouseLeave={() => setShowActions(false)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="p-2 rounded-lg bg-slate-50">
                        {getFileIcon(file.type)}
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#334155' }}>{file.name}</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>{file.path}</p>
                    </div>
                </div>

                {showActions && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            display: 'flex',
                            gap: '4px',
                            backgroundColor: 'white',
                            padding: '4px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            border: '1px solid #e2e8f0'
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFile(file);
                            }}
                            style={{
                                padding: '6px 10px',
                                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="View & Ask AI"
                        >
                            <Eye size={12} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log('Generate mindmap for:', file.name);
                            }}
                            style={{
                                padding: '6px 10px',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Generate Mind Map"
                        >
                            <Brain size={12} />
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log('Generate summary for:', file.name);
                            }}
                            style={{
                                padding: '6px 10px',
                                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Generate Summary"
                        >
                            <AlignLeft size={12} />
                        </button>
                    </motion.div>
                )}
            </motion.div>
        );
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                    <BookOpen size={20} />
                </div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
                    LMS Helper - File Browser
                </h1>
            </div>

            <p style={{ marginBottom: '24px', color: '#64748b', fontSize: '14px' }}>
                Hover over any file to see the action buttons: View & Ask AI, Generate Mind Map, and Generate Summary
            </p>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '12px'
            }}>
                {sampleFiles.map((file, index) => (
                    <FileCard key={index} file={file} />
                ))}
            </div>

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