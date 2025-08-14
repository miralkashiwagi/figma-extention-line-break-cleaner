import { DetectedIssue, TextAnalysisResult, ProcessingConfig } from './interfaces';

export class TextAnalyzer {
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig) {
    this.config = config;
  }

  async analyzeTextNode(node: TextNode): Promise<TextAnalysisResult> {
    const issues: DetectedIssue[] = [];
    
    // Skip if node has missing fonts
    if (node.hasMissingFont) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (missing font)',
        originalText: node.characters
      };
    }

    // Skip if locked or not visible
    if (node.locked || !node.visible) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (locked or hidden)',
        originalText: node.characters
      };
    }

    const currentText = node.characters;
    
    // Skip if below minimum character threshold
    if (currentText.length < this.config.minCharacters) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (too short)',
        originalText: currentText
      };
    }

    // Auto-width detection
    if (this.config.enabledDetections.indexOf('auto-width') !== -1) {
      const autoWidthIssues = this.detectAutoWidthIssues(node);
      issues.push(...autoWidthIssues);
    }

    // Edge-breaking detection
    if (this.config.enabledDetections.indexOf('edge-breaking') !== -1) {
      const edgeBreakingIssues = this.detectEdgeBreaking(node);
      issues.push(...edgeBreakingIssues);
    }

    // Soft-break detection
    if (this.config.enabledDetections.indexOf('soft-break') !== -1) {
      const softBreakIssues = this.detectSoftBreaks(node);
      issues.push(...softBreakIssues);
    }

    // Generate estimated changes
    const estimatedChanges = this.generateEstimatedChanges(currentText, issues);

    return {
      node,
      issues,
      estimatedChanges,
      originalText: currentText
    };
  }

  private detectAutoWidthIssues(node: TextNode): DetectedIssue[] {
    const issues: DetectedIssue[] = [];
    
    try {
      // Read textAutoResize without font loading
      const currentAutoResize = node.textAutoResize;
      const currentText = node.characters;
      
      if (currentAutoResize === 'WIDTH_AND_HEIGHT' && currentText.indexOf('\n') !== -1) {
        issues.push({
          type: 'auto-width',
          confidence: 0.9,
          description: 'Auto-width text with line breaks can be converted to auto-height',
          lineNumbers: this.getLineNumbers(currentText)
        });
      }
    } catch (error) {
      // If we can't read the property, skip this detection
      console.warn('Could not read textAutoResize for node:', node.name);
    }
    
    return issues;
  }

  private detectEdgeBreaking(node: TextNode): DetectedIssue[] {
    const issues: DetectedIssue[] = [];
    
    try {
      const currentText = node.characters;
      const nodeWidth = node.width;
      
      // Check for fixed size or auto-height nodes
      const autoResize = node.textAutoResize;
      if (autoResize === 'NONE' || autoResize === 'HEIGHT') {
        const suspiciousLines = this.findEdgeBreakingLines(currentText, nodeWidth);
        
        if (suspiciousLines.length > 0) {
          issues.push({
            type: 'edge-breaking',
            confidence: 0.7, // Lower confidence due to estimation
            description: `${suspiciousLines.length} lines appear to break at container edge`,
            lineNumbers: suspiciousLines
          });
        }
      }
    } catch (error) {
      console.warn('Could not analyze edge breaking for node:', node.name);
    }
    
    return issues;
  }

  private detectSoftBreaks(node: TextNode): DetectedIssue[] {
    const issues: DetectedIssue[] = [];
    
    try {
      const currentText = node.characters;
      const paragraphSpacing = node.paragraphSpacing;
      
      if (paragraphSpacing === 0) {
        const softBreakCount = this.countSoftBreaks(currentText);
        
        if (softBreakCount > 0) {
          issues.push({
            type: 'soft-break',
            confidence: 0.8,
            description: `${softBreakCount} soft breaks can be converted to hard breaks`,
            lineNumbers: this.getSoftBreakLines(currentText)
          });
        }
      }
    } catch (error) {
      console.warn('Could not analyze soft breaks for node:', node.name);
    }
    
    return issues;
  }

  private getLineNumbers(text: string): number[] {
    const lines = text.split('\n');
    return lines.map((_, index) => index + 1).filter(lineNum => lineNum < lines.length);
  }

  private findEdgeBreakingLines(text: string, containerWidth: number): number[] {
    // This is a simplified estimation
    // In a real implementation, you'd need more sophisticated text measurement
    const lines = text.split('\n');
    const suspiciousLines: number[] = [];
    
    lines.forEach((line, index) => {
      if (line.length > 0) {
        // Rough estimation: assume average character width
        const estimatedWidth = line.length * 8; // Approximate
        const ratio = estimatedWidth / containerWidth;
        
        if (ratio >= this.config.edgeThreshold) {
          suspiciousLines.push(index + 1);
        }
      }
    });
    
    return suspiciousLines;
  }

  private countSoftBreaks(text: string): number {
    let count = 0;
    
    for (const softBreakChar of this.config.softBreakChars) {
      const occurrences = (text.match(new RegExp(softBreakChar, 'g')) || []).length;
      count += occurrences;
    }
    
    return count;
  }

  private getSoftBreakLines(text: string): number[] {
    const lines = text.split('\n');
    const softBreakLines: number[] = [];
    
    lines.forEach((line, index) => {
      for (const softBreakChar of this.config.softBreakChars) {
        if (line.includes(softBreakChar)) {
          softBreakLines.push(index + 1);
          break;
        }
      }
    });
    
    return softBreakLines;
  }

  private generateEstimatedChanges(originalText: string, issues: DetectedIssue[]): string {
    if (issues.length === 0) {
      return 'No changes needed';
    }

    const changes: string[] = [];
    
    issues.forEach(issue => {
      switch (issue.type) {
        case 'auto-width':
          changes.push('Convert to auto-height and remove line breaks');
          break;
        case 'edge-breaking':
          changes.push('Remove edge-breaking line breaks');
          break;
        case 'soft-break':
          changes.push('Convert soft breaks to hard breaks');
          break;
      }
    });
    
    return changes.join(', ');
  }

  // Batch analysis for multiple nodes
  async analyzeNodes(nodes: TextNode[]): Promise<TextAnalysisResult[]> {
    const results: TextAnalysisResult[] = [];
    
    for (const node of nodes) {
      try {
        const result = await this.analyzeTextNode(node);
        results.push(result);
      } catch (error) {
        // Add error result
        results.push({
          node,
          issues: [],
          estimatedChanges: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          originalText: node.characters || ''
        });
      }
    }
    
    return results;
  }

  // Find all text nodes in current page
  findTextNodes(): TextNode[] {
    return figma.currentPage.findAll(node => {
      return node.type === 'TEXT' && 
             !node.locked && 
             node.visible &&
             node.characters.length >= this.config.minCharacters;
    }) as TextNode[];
  }

  // Find selected text nodes
  getSelectedTextNodes(): TextNode[] {
    return figma.currentPage.selection.filter(
      node => node.type === 'TEXT'
    ) as TextNode[];
  }
}