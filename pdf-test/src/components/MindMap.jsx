/* global chrome */
import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';

const MindMap = ({ data, isLoading, fileName, onConfirmStart, onRegenerate, onClose }) => {
    const svgRef = useRef(null);
    const [hasConfirmed, setHasConfirmed] = useState(false);
    const [isSavingToDrive, setIsSavingToDrive] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);

    useEffect(() => {
        if (!data) setHasConfirmed(false);
        else setHasConfirmed(true);
    }, [fileName, data]);

    const handleYesClick = () => {
        setHasConfirmed(true);
        onConfirmStart(); 
    };

    // --- 1. D3 RENDERING LOGIC ---
    useEffect(() => {
        if (!data || !svgRef.current || !hasConfirmed || isLoading) return;
        const width = 1400; 
        const height = 1000;
        d3.select(svgRef.current).selectAll("*").remove();
        
        const svg = d3.select(svgRef.current)
            .attr("viewBox", [-width / 2, -height / 2, width, height]);
        
        const g = svg.append("g");
        const zoom = d3.zoom().scaleExtent([0.1, 8]).on("zoom", (e) => g.attr("transform", e.transform));
        
        svg.call(zoom).call(zoom.transform, d3.zoomIdentity.scale(0.6)); 

        const root = d3.hierarchy(data);
        root.descendants().forEach(d => { 
            d._children = d.children; 
            if (d.depth > 1) d.children = null; 
        });

        let i = 0;
        const tree = d3.tree().nodeSize([120, 350]);
        const diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x);

        function update(source) {
            const nodes = root.descendants();
            const links = root.links();
            tree(root);
            
            const node = g.selectAll("g.node").data(nodes, d => d.id || (d.id = ++i));
            const nodeEnter = node.enter().append("g").attr("class", "node")
                .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
                .on("click", (e, d) => {
                    if (d.children) { d._children = d.children; d.children = null; } 
                    else { d.children = d._children; d._children = null; }
                    update(d);
                }).style("cursor", "pointer");

            nodeEnter.append("rect").attr("rx", 10).attr("ry", 10).attr("fill", "#fff").attr("stroke-width", 2);
            const lGroup = nodeEnter.append("g").attr("class", "text-lines");
            
            node.merge(nodeEnter).transition().duration(500).attr("transform", d => `translate(${d.y},${d.x})`);

            g.selectAll("g.node").each(function(d) {
                const el = d3.select(this);
                const txtGroup = el.select(".text-lines");
                txtGroup.selectAll("*").remove();
                const text = d.data.title || d.data.name || "Topic";
                const words = text.split(/\s+/);
                let lines = [], cur = [];
                words.forEach(w => {
                    if (([...cur, w].join(' ').length * 7 > 160) && cur.length > 0) { lines.push(cur.join(' ')); cur = [w]; }
                    else cur.push(w);
                });
                lines.push(cur.join(' '));
                const startY = -(lines.length - 1) * 16 / 2;
                let maxW = 0;
                lines.forEach((l, idx) => {
                    const w = l.length * 7.5; if (w > maxW) maxW = w;
                    txtGroup.append("text").attr("x", 0).attr("y", startY + (idx * 16))
                        .attr("text-anchor", "middle").style("font-size", "12px").text(l);
                });
                const bw = Math.max(maxW + 30, 120), bh = Math.max(lines.length * 16 + 20, 45);
                el.select("rect").attr("width", bw).attr("height", bh).attr("x", -bw/2).attr("y", -bh/2)
                    .attr("fill", d._children ? "#eff6ff" : "#fff").attr("stroke", d.depth === 0 ? "#2563eb" : "#94a3b8");
            });

            const link = g.selectAll("path.link").data(links, d => d.target.id);
            const linkEnter = link.enter().insert("path", "g").attr("class", "link")
                .attr("fill", "none").attr("stroke", "#cbd5e1").attr("stroke-width", 2);
            link.merge(linkEnter).transition().duration(500).attr("d", diagonal);
            nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
        }
        root.x0 = 0; root.y0 = 0;
        update(root);
    }, [data, hasConfirmed, isLoading]);

    // --- 2. ENHANCED SVG EXPORT LOGIC ---
    const getSvgData = () => {
    const originalSvg = svgRef.current;
    if (!originalSvg) return null;

    // 1. Clone the current state (including all expanded nodes)
    const clonedSvg = originalSvg.cloneNode(true);

    // 2. Add SVG Namespace for external compatibility
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    
    // 3. Force a massive canvas size to prevent "cutoff" of expanded branches
    clonedSvg.removeAttribute("viewBox");
    clonedSvg.setAttribute("width", "3000"); 
    clonedSvg.setAttribute("height", "2400");

    // 4. Inject a Solid White Background
    // This fixes the "blank/gray" screen issue in Drive previews
    const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute("fill", "white");
    clonedSvg.insertBefore(background, clonedSvg.firstChild);

    // 5. MASTER ALIGNMENT:
    // We move the center of the tree to (1500, 1200) so nodes can expand 
    // freely in all directions without hitting the "negative space" border
    const g = clonedSvg.querySelector("g");
    if (g) {
        g.setAttribute("transform", "translate(1500, 1200) scale(0.6)");
    }

    const svgString = new XMLSerializer().serializeToString(clonedSvg);
    return btoa(unescape(encodeURIComponent(svgString)));
};
    const handleDownloadLocal = () => {
        const base64Data = getSvgData();
        if (!base64Data) return;
        const link = document.createElement("a");
        link.href = `data:image/svg+xml;base64,${base64Data}`;
        link.download = `${fileName}-full-map.svg`;
        link.click();
    };

    // --- 3. PROXY-BASED DRIVE UPLOAD (Bypasses Fetch Errors) ---
    const handleSaveToDrive = async () => {
        try {
            setIsSavingToDrive(true);
            setSaveStatus({ type: 'progress', message: 'Architecting High-Res SVG...' });
            
            const base64Data = getSvgData();
            if (!base64Data) {
                setIsSavingToDrive(false);
                return;
            }

            chrome.storage.local.get(['sessionToken'], (res) => {
                const subject = prompt('Course/Subject Name:', 'General') || 'General';
                
                // Communicate with background.js proxy to bypass CORS/Network security
                chrome.runtime.sendMessage({
                    action: 'UPLOAD_TO_DRIVE_PROXY',
                    data: {
                        fileName: `${fileName}-map.svg`,
                        mimeType: 'image/svg+xml',
                        fileData: base64Data, 
                        accessToken: res.sessionToken,
                        subject: subject
                    }
                }, (response) => {
                    if (response && response.ok) {
                        setSaveStatus({ type: 'success', message: '✅ SVG Stored Successfully!' });
                        if (confirm('SVG Saved! Open in Google Drive?')) {
                            window.open(response.driveLink, '_blank');
                        }
                    } else {
                        setSaveStatus({ type: 'error', message: `❌ Error: ${response?.error || 'Upload failed'}` });
                    }
                    setIsSavingToDrive(false);
                });
            });
        } catch (e) { 
            setSaveStatus({ type: 'error', message: '❌ Communication Error' });
            setIsSavingToDrive(false); 
        }
    };

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={overlayStyle}>
                <div style={headerStyle}>
                    <h2 style={{ margin: 0 }}>🧠 MindMap Workspace</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {data && !isLoading && (
                            <>
                                <button onClick={handleDownloadLocal} style={localBtn}>📥 Download Full SVG</button>
                                <button onClick={handleSaveToDrive} disabled={isSavingToDrive} style={driveBtn}>
                                    {isSavingToDrive ? '⏳ Saving...' : '📂 Save Full SVG to Drive'}
                                </button>
                            </>
                        )}
                        <button onClick={onClose} style={backBtn}>← Back</button>
                    </div>
                </div>

                <div style={mapContainer}>
                    {!hasConfirmed ? (
                        <div style={centerFlex}>
                            <div style={{fontSize: '60px'}}>🧠</div>
                            <h2>Generate Mind Map for "{fileName}"?</h2>
                            <button onClick={handleYesClick} style={bigBtn}>Yes, Generate Now</button>
                        </div>
                    ) : isLoading ? (
                        <div style={centerFlex}><div className="lms-loading-spinner" style={spinnerStyle}></div><h3>Architecting Knowledge Tree...</h3></div>
                    ) : (
                        <svg ref={svgRef} width="100%" height="100%" style={{cursor: 'move'}}></svg>
                    )}
                </div>

                <div style={footerStyle}>
                    <div style={{color: saveStatus?.type === 'error' ? 'red' : '#64748b', fontSize: '13px', fontWeight: 'bold'}}>
                        {saveStatus?.message || '💡 Export captures the FULL map centered on a white background.'}
                    </div>
                    {data && !isLoading && <button onClick={onRegenerate} style={backBtn}>🔄 Regenerate</button>}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

// --- STYLES (MATCHING INTEGRATED UI) ---
const overlayStyle = { position: 'fixed', inset: 0, zIndex: 1000005, backgroundColor: 'white', display: 'flex', flexDirection: 'column' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', padding: '15px 30px', borderBottom: '1px solid #e2e8f0', background: 'white' };
const footerStyle = { display: 'flex', justifyContent: 'space-between', padding: '15px 30px', borderTop: '1px solid #e2e8f0', background: 'white' };
const mapContainer = { flex: 1, position: 'relative', overflow: 'hidden', background: '#f8fafc' };
const centerFlex = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', flexDirection: 'column' };
const bigBtn = { padding: '16px 40px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' };
const driveBtn = { background: '#22c55e', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' };
const localBtn = { background: '#6366f1', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' };
const backBtn = { background: 'white', border: '1px solid #ddd', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' };
const spinnerStyle = { width: '50px', height: '50px', border: '5px solid #e2e8f0', borderTop: '5px solid #6366f1', borderRadius: '50%' };

export default MindMap;