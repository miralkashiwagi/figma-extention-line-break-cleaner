import { ProcessingChanges } from './interfaces';

export class FontManager {
  private loadedFonts: Set<string> = new Set();

  // Check for missing fonts in text nodes
  checkMissingFonts(nodes: TextNode[]): TextNode[] {
    return nodes.filter(node => node.hasMissingFont);
  }

  // Load fonts required for a single text node
  async loadNodeFonts(node: TextNode): Promise<void> {
    if (node.hasMissingFont) {
      throw new Error(`Cannot load missing font for node: ${node.name}`);
    }

    if (node.fontName !== figma.mixed) {
      // Single font
      await this.loadFont(node.fontName);
    } else {
      // Mixed fonts - get all fonts used in the node
      const fontNames = node.getRangeAllFontNames(0, node.characters.length);
      for (const fontName of fontNames) {
        await this.loadFont(fontName);
      }
    }
  }

  // Load a specific font
  private async loadFont(fontName: FontName): Promise<void> {
    const fontKey = `${fontName.family}-${fontName.style}`;
    
    if (this.loadedFonts.has(fontKey)) {
      // Font already loaded
      return;
    }

    try {
      await figma.loadFontAsync(fontName);
      this.loadedFonts.add(fontKey);
    } catch (error) {
      throw new Error(`Failed to load font ${fontName.family} ${fontName.style}: ${error}`);
    }
  }

  // Apply changes to a text node (with proper font loading)
  async applyChangesToNode(node: TextNode, changes: ProcessingChanges): Promise<void> {
    // Validate node state
    if (node.hasMissingFont) {
      throw new Error(`Cannot process node with missing font: ${node.name}`);
    }

    if (node.locked) {
      throw new Error(`Cannot process locked node: ${node.name}`);
    }

    // Load required fonts
    await this.loadNodeFonts(node);

    // Apply changes in correct order
    try {
      // 1. Change textAutoResize first if needed
      if (changes.newAutoResize) {
        node.textAutoResize = changes.newAutoResize;
      }

      // 2. Change text content
      if (changes.newText) {
        node.characters = changes.newText;
      }

    } catch (error) {
      throw new Error(`Failed to apply changes to node ${node.name}: ${error}`);
    }
  }

  // Batch font loading for multiple nodes
  async loadBatchFonts(nodes: TextNode[]): Promise<{
    successful: TextNode[];
    failed: { node: TextNode; error: string }[];
  }> {
    const successful: TextNode[] = [];
    const failed: { node: TextNode; error: string }[] = [];

    for (const node of nodes) {
      try {
        await this.loadNodeFonts(node);
        successful.push(node);
      } catch (error) {
        failed.push({
          node,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { successful, failed };
  }

  // Get font information for a node (for display purposes)
  getNodeFontInfo(node: TextNode): {
    fontNames: FontName[];
    hasMissingFont: boolean;
    isLoadable: boolean;
  } {
    const fontNames: FontName[] = [];
    
    if (node.fontName !== figma.mixed) {
      fontNames.push(node.fontName);
    } else {
      try {
        const allFonts = node.getRangeAllFontNames(0, node.characters.length);
        fontNames.push(...allFonts);
      } catch (error) {
        // Could not get font names
      }
    }

    return {
      fontNames,
      hasMissingFont: node.hasMissingFont,
      isLoadable: !node.hasMissingFont && fontNames.length > 0
    };
  }

  // Estimate text width (simplified version using character count)
  estimateTextWidth(text: string, fontSize: number, fontName?: FontName): number {
    // This is a very rough estimation
    // In a real implementation, you might use Canvas API or more sophisticated methods
    
    let avgCharWidth = fontSize * 0.6; // Rough approximation
    
    // Adjust for font family if available
    if (fontName) {
      if (fontName.family.toLowerCase().includes('mono')) {
        avgCharWidth = fontSize * 0.6; // Monospace
      } else if (fontName.style.toLowerCase().includes('condensed')) {
        avgCharWidth = fontSize * 0.5; // Condensed
      } else if (fontName.style.toLowerCase().includes('expanded')) {
        avgCharWidth = fontSize * 0.7; // Expanded
      }
    }

    // Count characters, giving different weights to different character types
    let totalWidth = 0;
    for (const char of text) {
      const code = char.charCodeAt(0);
      
      if (code >= 0x4E00 && code <= 0x9FAF) {
        // CJK characters are typically wider
        totalWidth += avgCharWidth * 1.2;
      } else if (char === 'i' || char === 'l' || char === 'I') {
        // Narrow characters
        totalWidth += avgCharWidth * 0.4;
      } else if (char === 'w' || char === 'W' || char === 'm' || char === 'M') {
        // Wide characters
        totalWidth += avgCharWidth * 1.2;
      } else if (char === ' ') {
        // Spaces
        totalWidth += avgCharWidth * 0.3;
      } else {
        // Regular characters
        totalWidth += avgCharWidth;
      }
    }

    return Math.round(totalWidth);
  }

  // Check if fonts can be loaded for processing
  async validateNodesForProcessing(nodes: TextNode[]): Promise<{
    processable: TextNode[];
    issues: { node: TextNode; reason: string }[];
  }> {
    const processable: TextNode[] = [];
    const issues: { node: TextNode; reason: string }[] = [];

    for (const node of nodes) {
      // Check for missing fonts
      if (node.hasMissingFont) {
        issues.push({
          node,
          reason: 'Missing font - cannot process'
        });
        continue;
      }

      // Check if locked
      if (node.locked) {
        issues.push({
          node,
          reason: 'Node is locked'
        });
        continue;
      }

      // Check if visible
      if (!node.visible) {
        issues.push({
          node,
          reason: 'Node is hidden'
        });
        continue;
      }

      // Try to get font information
      try {
        const fontInfo = this.getNodeFontInfo(node);
        if (!fontInfo.isLoadable) {
          issues.push({
            node,
            reason: 'Cannot determine font information'
          });
          continue;
        }
      } catch (error) {
        issues.push({
          node,
          reason: `Font validation error: ${error}`
        });
        continue;
      }

      processable.push(node);
    }

    return { processable, issues };
  }

  // Clear font cache (useful for memory management)
  clearFontCache(): void {
    this.loadedFonts.clear();
  }

  // Get cache statistics
  getCacheStats(): {
    loadedFontsCount: number;
    loadedFonts: string[];
  } {
    return {
      loadedFontsCount: this.loadedFonts.size,
      loadedFonts: Array.from(this.loadedFonts)
    };
  }
}