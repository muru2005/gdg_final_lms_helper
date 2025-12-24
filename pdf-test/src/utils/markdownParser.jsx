// Utility function to parse markdown-like formatting
export const parseMarkdown = (text) => {
  if (!text) return [];
  
  const lines = text.split('\n');
  const elements = [];
  
  lines.forEach((line, index) => {
    if (line.trim() === '') {
      elements.push({ type: 'br', key: `br-${index}` });
      return;
    }
    
    // Parse the line for formatting - handle overlapping patterns better
    let content = line;
    const parts = [];
    
    // Process bold first, then italic to avoid conflicts
    const processFormatting = (text) => {
      const result = [];
      let remaining = text;
      
      // Split by bold patterns first
      const boldRegex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(text)) !== null) {
        // Add text before bold
        if (match.index > lastIndex) {
          const beforeText = text.substring(lastIndex, match.index);
          result.push({ type: 'text', content: beforeText });
        }
        
        // Add bold text
        result.push({ type: 'bold', content: match[1] });
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < text.length) {
        result.push({ type: 'text', content: text.substring(lastIndex) });
      }
      
      // Now process italic in non-bold parts
      const finalResult = [];
      result.forEach(part => {
        if (part.type === 'text') {
          const italicRegex = /\*(.*?)\*/g;
          let lastIdx = 0;
          let italicMatch;
          
          while ((italicMatch = italicRegex.exec(part.content)) !== null) {
            if (italicMatch.index > lastIdx) {
              finalResult.push({ type: 'text', content: part.content.substring(lastIdx, italicMatch.index) });
            }
            finalResult.push({ type: 'italic', content: italicMatch[1] });
            lastIdx = italicMatch.index + italicMatch[0].length;
          }
          
          if (lastIdx < part.content.length) {
            finalResult.push({ type: 'text', content: part.content.substring(lastIdx) });
          }
        } else {
          finalResult.push(part);
        }
      });
      
      return finalResult.filter(part => part.content && part.content.trim() !== '');
    };
    
    const processedParts = processFormatting(content);
    
    elements.push({
      type: 'line',
      parts: processedParts.length > 0 ? processedParts : [{ type: 'text', content: content }],
      key: `line-${index}`,
      isMainBullet: content.includes('•'),
      isSubBullet: content.includes('◦') || content.includes('▪'),
      indent: content.search(/\S/)
    });
  });
  
  return elements;
};

// Component to render parsed markdown
export const MarkdownRenderer = ({ text, style = {} }) => {
  const elements = parseMarkdown(text);
  
  return (
    <div style={style}>
      {elements.map(element => {
        if (element.type === 'br') {
          return <br key={element.key} />;
        }
        
        if (element.type === 'line') {
          const lineStyle = {
            marginBottom: '8px',
            lineHeight: '1.6',
            paddingLeft: `${Math.max(0, element.indent - 4) * 8}px`,
            fontSize: element.isMainBullet ? '16px' : element.isSubBullet ? '15px' : '15px',
            fontWeight: element.isMainBullet ? '500' : 'normal'
          };
          
          return (
            <div key={element.key} style={lineStyle}>
              {element.parts.map((part, partIndex) => {
                const key = `${element.key}-part-${partIndex}`;
                
                switch (part.type) {
                  case 'bold':
                    return <strong key={key} style={{ fontWeight: '700', color: '#1a1a1a' }}>{part.content}</strong>;
                  case 'italic':
                    return <em key={key} style={{ fontStyle: 'italic', color: '#2563eb' }}>{part.content}</em>;
                  case 'underline':
                    return <u key={key} style={{ textDecoration: 'underline', color: '#dc2626' }}>{part.content}</u>;
                  default:
                    return <span key={key}>{part.content}</span>;
                }
              })}
            </div>
          );
        }
        
        return null;
      })}
    </div>
  );
};