import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';

const MindMap = ({ data, fileName, onClose }) => {
    const svgRef = useRef(null);
    const containerRef = useRef(null);

    // Use state to trigger re-renders if needed, but D3 handles most DOM manipulation
    const [activeNode, setActiveNode] = useState(null);

    useEffect(() => {
        if (!data || !svgRef.current) return;

        const containerWidth = containerRef.current?.offsetWidth || window.innerWidth;
        const containerHeight = containerRef.current?.offsetHeight || window.innerHeight;
        
        // Calculate content bounds based on data depth and breadth
        const calculateTreeSize = (node, depth = 0) => {
            let maxDepth = depth;
            let nodeCount = 1;
            
            if (node.children) {
                node.children.forEach(child => {
                    const childResult = calculateTreeSize(child, depth + 1);
                    maxDepth = Math.max(maxDepth, childResult.maxDepth);
                    nodeCount += childResult.nodeCount;
                });
            }
            
            return { maxDepth, nodeCount };
        };
        
        const treeStats = calculateTreeSize(data);
        
        // Dynamic sizing based on content
        const minWidth = Math.max(800, treeStats.maxDepth * 200);
        const minHeight = Math.max(600, Math.sqrt(treeStats.nodeCount) * 100);
        
        const width = Math.max(containerWidth, minWidth);
        const height = Math.max(containerHeight, minHeight);

        // Clear previous SVG content
        d3.select(svgRef.current).selectAll("*").remove();

        const svg = d3.select(svgRef.current)
            .attr("viewBox", [-width / 2, -height / 2, width, height])
            .style("font", "14px sans-serif")
            .style("user-select", "none");

        // Zoom behavior
        const g = svg.append("g");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 8])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom);

        // Center initial view
        svg.call(zoom.transform, d3.zoomIdentity);

        // Tree Layout
        const root = d3.hierarchy(data);

        // Collapse all nodes deeper than level 2 initially
        root.descendants().forEach((d) => {
            d._children = d.children; // preserve original children
            if (d.depth > 1) d.children = null; // collapse
        });

        let i = 0;
        const duration = 500;
        // Using d3.tree for layout with better spacing
        const dx = Math.max(60, Math.min(120, height / Math.max(treeStats.nodeCount / 4, 5))); // Better vertical spacing
        const dy = Math.max(200, Math.min(350, width / Math.max(treeStats.maxDepth, 3))); // Better horizontal spacing
        
        const tree = d3.tree().nodeSize([dx, dy]);

        // Link generator (curved lines)
        const diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x);

        function update(source) {
            const nodes = root.descendants();
            const links = root.links();

            // Compute the new tree layout.
            tree(root);

            // --- Nodes ---
            const node = g.selectAll("g.node")
                .data(nodes, d => d.id || (d.id = ++i));

            // Enter any new nodes at the parent's previous position.
            const nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
                .on("click", (event, d) => {
                    if (d.children) {
                        d._children = d.children;
                        d.children = null;
                    } else {
                        d.children = d._children;
                        d._children = null;
                    }
                    update(d);
                    // Center view on click if needed (optional)
                });

            // Add Circle/Rect for Node with dynamic sizing
            nodeEnter.append("rect")
                .attr("rx", 12)
                .attr("ry", 12)
                .attr("width", 0)
                .attr("height", d => Math.max(30, Math.min(50, d.data.title.length * 0.8 + 20)))
                .attr("y", d => -Math.max(15, Math.min(25, d.data.title.length * 0.4 + 10)))
                .attr("fill", d => d._children ? "#e0f2fe" : "#ffffff")
                .attr("stroke", "#0284c7")
                .attr("stroke-width", 2);

            // Add Text with better wrapping and full text display
            nodeEnter.append("text")
                .attr("dy", "0.31em")
                .attr("x", 0)
                .attr("text-anchor", "middle")
                .style("font-size", "12px")
                .style("font-weight", d => d.depth === 0 ? "bold" : "normal")
                .style("fill", "#333")
                .text(d => d.data.title) // Show full text initially
                .clone(true).lower()
                .attr("stroke", "white")
                .attr("stroke-width", 2);

            // Transition nodes to their new position.
            const nodeUpdate = node.merge(nodeEnter).transition().duration(duration)
                .attr("transform", d => `translate(${d.y},${d.x})`);

            nodeUpdate.select("rect")
                .attr("width", d => (d.data.title.length > 20 ? 20 : d.data.title.length) * 8 + 30) // dynamic width roughly
                .attr("x", d => d.children || d._children ? -((d.data.title.length > 20 ? 20 : d.data.title.length) * 8 + 35) : -15) // adjust position based on anchor
                // A bit hacky positioning for rect, better to measure text width
                .attr("fill", d => d._children ? "#e0f2fe" : "#ffffff");

            // Better rect sizing and positioning with improved text wrapping
            g.selectAll("g.node").each(function (d) {
                const thisNode = d3.select(this);
                const textElement = thisNode.select("text").node();
                if (textElement) {
                    // Handle long text with better wrapping
                    const text = d.data.title;
                    const maxWidth = Math.min(200, Math.max(100, dy * 0.8)); // Responsive to spacing
                    const words = text.split(' ');
                    const lineHeight = 16;
                    
                    // Clear existing text
                    thisNode.selectAll("text").remove();
                    
                    // Create wrapped text with better algorithm
                    const textGroup = thisNode.append("g");
                    let lines = [];
                    let currentLine = [];
                    
                    words.forEach(word => {
                        const testLine = [...currentLine, word].join(' ');
                        // More accurate width calculation
                        const estimatedWidth = testLine.length * 6.5;
                        
                        if (estimatedWidth > maxWidth - 20 && currentLine.length > 0) {
                            lines.push(currentLine.join(' '));
                            currentLine = [word];
                        } else {
                            currentLine.push(word);
                        }
                    });
                    
                    if (currentLine.length > 0) {
                        lines.push(currentLine.join(' '));
                    }
                    
                    // Limit to 4 lines max for better readability
                    if (lines.length > 4) {
                        lines = lines.slice(0, 4);
                        const lastLine = lines[3];
                        if (lastLine.length > 15) {
                            lines[3] = lastLine.substring(0, 15) + '...';
                        } else {
                            lines[3] = lastLine + '...';
                        }
                    }
                    
                    // Add text lines with better positioning
                    const startY = -(lines.length - 1) * lineHeight / 2;
                    lines.forEach((line, i) => {
                        textGroup.append("text")
                            .attr("x", 0)
                            .attr("y", startY + i * lineHeight)
                            .attr("text-anchor", "middle")
                            .attr("dy", "0.35em")
                            .style("font-size", "11px")
                            .style("font-weight", d.depth === 0 ? "bold" : d.depth === 1 ? "600" : "normal")
                            .style("fill", d.depth === 0 ? "#1565C0" : "#333")
                            .text(line);
                    });
                    
                    // Calculate rect size with better proportions
                    const padding = 20;
                    const rectWidth = Math.max(maxWidth + 10, 90);
                    const rectHeight = Math.max(lines.length * lineHeight + padding, 40);

                    thisNode.select("rect")
                        .attr("width", rectWidth)
                        .attr("height", rectHeight)
                        .attr("x", -rectWidth / 2)
                        .attr("y", -rectHeight / 2)
                        .attr("fill", d._children ? "#E8F4FD" : "#FFFFFF")
                        .attr("stroke", d.depth === 0 ? "#1565C0" : d.depth === 1 ? "#1976D2" : "#42A5F5")
                        .attr("stroke-width", d.depth === 0 ? 3 : 2)
                        .attr("rx", 10)
                        .attr("ry", 10)
                        .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.1))");
                }
            });

            nodeUpdate.select("text")
                .style("fill-opacity", 1);

            // Transition exiting nodes to the parent's new position.
            const nodeExit = node.exit().transition().duration(duration)
                .attr("transform", d => `translate(${source.y},${source.x})`)
                .remove();

            nodeExit.select("rect")
                .attr("width", 0);

            nodeExit.select("text")
                .style("fill-opacity", 1e-6);

            // --- Links ---
            const link = g.selectAll("path.link")
                .data(links, d => d.target.id);

            // Enter any new links at the parent's previous position.
            const linkEnter = link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", d => {
                    const o = { x: source.x0 || 0, y: source.y0 || 0 };
                    return diagonal({ source: o, target: o });
                })
                .attr("fill", "none")
                .attr("stroke", "#ccc")
                .attr("stroke-width", 2);

            // Transition links to their new position.
            link.merge(linkEnter).transition().duration(duration)
                .attr("d", diagonal);

            // Transition exiting links to the parent's new position.
            link.exit().transition().duration(duration)
                .attr("d", d => {
                    const o = { x: source.x, y: source.y };
                    return diagonal({ source: o, target: o });
                })
                .remove();

            // Stash the old positions for transition.
            nodes.forEach(d => {
                d.x0 = d.x;
                d.y0 = d.y;
            });
        }

        // Initialize position
        root.x0 = height / 2;
        root.y0 = 0;

        update(root);

    }, [data]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed',
                inset: 0,
                background: '#F8F9FA', // NotebookLM background color
                zIndex: 1500,
                overflow: 'hidden'
            }}
        >
            <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
                <button
                    onClick={onClose || (() => window.location.hash = '#/')}
                    style={{
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        padding: '10px 20px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                    }}
                >
                    Back
                </button>
            </div>
            <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10 }}>
                <h2 style={{ margin: 0, color: '#333' }}>🧠 Mind Map - {fileName}</h2>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Click nodes to expand/collapse • Scroll to zoom • Drag to pan</p>
            </div>

            <svg ref={svgRef} width="100%" height="100%" style={{ cursor: 'move' }}></svg>
        </motion.div>
    );
};

export default MindMap;
