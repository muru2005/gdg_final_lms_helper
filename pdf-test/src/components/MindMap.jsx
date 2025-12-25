import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';

// REMOVED: axios and internal fetchMindMap logic
// This component now purely renders the 'data' prop handed down by AIViewer.

const MindMap = ({ data, isLoading, fileName, onClose }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    // Only run D3 logic if the data from the background script has arrived
    if (!data || !svgRef.current) return;

    const width = 1400; 
    const height = 1000;

    // Clear previous drawing to prevent overlapping
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [-width / 2, -height / 2, width, height])
      .style("user-select", "none");

    const g = svg.append("g");
    const zoom = d3.zoom()
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);
    // Initial zoom out so large maps are visible immediately
    svg.call(zoom.transform, d3.zoomIdentity.scale(0.6)); 

    const root = d3.hierarchy(data);
    root.descendants().forEach((d) => {
      d._children = d.children;
      if (d.depth > 1) d.children = null; // Auto-collapse deep levels for clarity
    });

    let i = 0;
    const tree = d3.tree().nodeSize([120, 350]); 
    const diagonal = d3.linkHorizontal().x(d => d.y).y(d => d.x);

    function update(source) {
      const nodes = root.descendants();
      const links = root.links();
      tree(root);

      const node = g.selectAll("g.node")
        .data(nodes, d => d.id || (d.id = ++i));

      const nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
        .on("click", (event, d) => {
          if (d.children) { d._children = d.children; d.children = null; } 
          else { d.children = d._children; d._children = null; }
          update(d);
        })
        .style("cursor", "pointer");

      nodeEnter.append("rect")
        .attr("class", "node-box")
        .attr("fill", "#ffffff")
        .attr("stroke-width", 2)
        .attr("rx", 10)
        .attr("ry", 10);

      const linesGroup = nodeEnter.append("g").attr("class", "text-lines");

      node.merge(nodeEnter).transition().duration(500)
        .attr("transform", d => `translate(${d.y},${d.x})`);

      g.selectAll("g.node").each(function (d) {
        const thisNode = d3.select(this);
        const lGroup = thisNode.select(".text-lines");
        lGroup.selectAll("*").remove();

        const text = d.data.title || d.data.name || "Topic";
        const words = text.split(/\s+/);
        const lineHeight = 16;
        let lines = [];
        let currentLine = [];

        words.forEach(word => {
          if ((([...currentLine, word].join(' ').length * 7 > 160) && currentLine.length > 0)) {
            lines.push(currentLine.join(' '));
            currentLine = [word];
          } else { currentLine.push(word); }
        });
        lines.push(currentLine.join(' '));

        const startY = -(lines.length - 1) * lineHeight / 2;
        let longestW = 0;

        lines.forEach((line, idx) => {
          const lineW = line.length * 7.5;
          if (lineW > longestW) longestW = lineW;
          lGroup.append("text")
            .attr("x", 0).attr("y", startY + (idx * lineHeight))
            .attr("text-anchor", "middle").attr("dy", "0.35em")
            .style("font-size", "12px").style("fill", "#1e293b").text(line);
        });

        const boxW = Math.max(longestW + 30, 120);
        const boxH = Math.max(lines.length * lineHeight + 20, 45);

        thisNode.select("rect")
          .attr("width", boxW).attr("height", boxH)
          .attr("x", -boxW / 2).attr("y", -boxH / 2)
          .attr("fill", d._children ? "#eff6ff" : "#ffffff")
          .attr("stroke", d.depth === 0 ? "#2563eb" : "#94a3b8");
      });

      const link = g.selectAll("path.link").data(links, d => d.target.id);
      const linkEnter = link.enter().insert("path", "g")
        .attr("class", "link")
        .attr("d", d => {
          const o = { x: source.x0 || 0, y: source.y0 || 0 };
          return diagonal({ source: o, target: o });
        })
        .attr("fill", "none").attr("stroke", "#cbd5e1").attr("stroke-width", 2);

      link.merge(linkEnter).transition().duration(500).attr("d", diagonal);
      nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
    }

    root.x0 = 0; root.y0 = 0;
    update(root);
  }, [data]); // RE-RUN D3 whenever the data prop updates from the background script

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={overlayStyle}
      >
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: '22px' }}>🧠 Concept Mind Map: {fileName}</h2>
          <button onClick={onClose} style={closeBtn}>
            Close Map
          </button>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={centerFlex}>
               <h3 style={{ color: '#2563eb' }}>⚡ Visualizing Concept Hierarchy...</h3>
            </div>
          ) : data ? (
            <svg ref={svgRef} width="100%" height="100%" style={{ cursor: 'move' }}></svg>
          ) : (
            <div style={centerFlex}>
                <h3 style={{ color: '#64748b' }}>Waiting for AI Data Bridge...</h3>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// --- STYLES (Z-INDEX UPDATED TO OVERTAKE PDF) ---
const overlayStyle = {
  position: 'fixed', inset: 0, 
  zIndex: 1000005, // Must be higher than FileViewer
  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
  backdropFilter: 'blur(10px)', 
  display: 'flex', flexDirection: 'column'
};

const headerStyle = { 
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '20px 40px', borderBottom: '1px solid #e2e8f0',
  backgroundColor: 'white'
};

const closeBtn = { 
  background: '#ef4444', color: 'white', border: 'none', 
  borderRadius: '8px', padding: '10px 20px', cursor: 'pointer',
  fontWeight: 'bold', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
};

const centerFlex = { 
  display: 'flex', justifyContent: 'center', 
  alignItems: 'center', height: '100%', flexDirection: 'column' 
};

export default MindMap;