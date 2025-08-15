// Line Break Cleaner - Figma Plugin for cleaning unnecessary line breaks
// This plugin helps identify and clean unnecessary line breaks in text nodes,
// with intelligent detection for Japanese and multilingual content.

// ===== CONSTANTS =====
const PROCESSING_CONSTANTS = {
  DEFAULT_FONT_SIZE: 16,
  DEFAULT_CONTAINER_WIDTH: 400,
  ANALYSIS_CHUNK_SIZE: 10,
  PROCESSING_CHUNK_SIZE: 5,
  CONFIDENCE_LEVELS: {
    AUTO_WIDTH: 0.9,
    EDGE_BREAKING: 0.8,
    SOFT_BREAK: 0.7
  },
  NOTIFICATION_TIMEOUTS: {
    COMPLETE: 3000,
    ERROR: 5000
  }
} as const;

// ===== TYPE DEFINITIONS =====
type DetectionType = 'auto-width' | 'edge-breaking' | 'soft-break';

interface DetectedIssue {
  type: DetectionType;
  confidence: number;
  description: string;
  lineNumbers?: number[];
}

interface TextAnalysisResult {
  node: TextNode;
  issues: DetectedIssue[];
  estimatedChanges: string;
  originalText: string;
}

interface ProcessingConfig {
  minCharacters: number;
  lineBreakThreshold: number;
  softBreakChars: string[];
  excludePatterns: string[];
  enabledDetections: DetectionType[];
  fontWidthMultiplier?: number;
}

interface ProcessingChanges {
  newText?: string;
  newAutoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'TRUNCATE';
}

interface ProcessingResult {
  node: TextNode;
  success: boolean;
  error?: string;
  changes?: ProcessingChanges;
}

interface ProgressUpdate {
  current: number;
  total: number;
  currentNode: string;
  progress: number;
  message: string;
}

interface UIMessage {
  type: string;
  [key: string]: any;
}

// ===== UTILITY CLASSES =====
class TextWidthCalculator {
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig) {
    this.config = config;
  }

  estimateTextWidth(text: string, fontSize: number): number {
    let totalWidth = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);

      const baseMultiplier = this.config.fontWidthMultiplier || 1.0;
      if (this.isFullWidthCharacter(charCode)) {
        totalWidth += fontSize * baseMultiplier;
      } else if (this.isHalfWidthCharacter(charCode)) {
        totalWidth += fontSize * (baseMultiplier * 0.5);
      } else {
        totalWidth += fontSize * (baseMultiplier * 0.8);
      }
    }

    return totalWidth;
  }

  private isFullWidthCharacter(charCode: number): boolean {
    return (
      (charCode >= 0x3040 && charCode <= 0x309F) || // ひらがな
      (charCode >= 0x30A0 && charCode <= 0x30FF) || // カタカナ
      (charCode >= 0x4E00 && charCode <= 0x9FAF) || // CJK統合漢字
      (charCode >= 0x3400 && charCode <= 0x4DBF) || // CJK拡張A
      (charCode >= 0xFF00 && charCode <= 0xFFEF) || // 全角英数字・記号
      (charCode >= 0x3000 && charCode <= 0x303F)    // CJK記号・句読点
    );
  }

  private isHalfWidthCharacter(charCode: number): boolean {
    return (
      (charCode >= 0x0020 && charCode <= 0x007E) || // 基本ラテン文字
      (charCode >= 0xFF61 && charCode <= 0xFF9F)    // 半角カタカナ
    );
  }
}

class RegexPatternCache {
  private cache: Map<string, RegExp> = new Map();
  private readonly maxSize: number = 10;

  getBreakPattern(softBreakChars: string[]): RegExp {
    const allBreakChars = ['\n', ...softBreakChars];
    const cacheKey = allBreakChars.join('|');

    if (!this.cache.has(cacheKey)) {
      // 正規表現の特殊文字を正しくエスケープ
      const escapedChars = allBreakChars.map(char =>
        char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      const pattern = new RegExp(`[${escapedChars.join('')}]`);
      this.cache.set(cacheKey, pattern);

      // キャッシュサイズ制限（メモリリーク防止）
      if (this.cache.size > this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    return this.cache.get(cacheKey)!;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ===== TEXT ANALYZER CLASS =====
class TextAnalyzer {
  private config: ProcessingConfig;
  private regexCache: RegexPatternCache;
  private widthCalculator: TextWidthCalculator;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.regexCache = new RegexPatternCache();
    this.widthCalculator = new TextWidthCalculator(config);
  }

  private getBreakPattern(): RegExp {
    return this.regexCache.getBreakPattern(this.config.softBreakChars);
  }

  async analyzeTextNode(node: TextNode): Promise<TextAnalysisResult> {
    const issues: DetectedIssue[] = [];

    if (node.hasMissingFont) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (missing font)',
        originalText: node.characters
      };
    }

    if (node.locked || !node.visible) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (locked or hidden)',
        originalText: node.characters
      };
    }

    const currentText = node.characters;

    if (currentText.length < this.config.minCharacters) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (too short)',
        originalText: currentText
      };
    }

    if (this.config.enabledDetections.includes('auto-width')) {
      const autoWidthIssues = this.detectAutoWidthIssues(node);
      issues.push(...autoWidthIssues);
    }

    if (this.config.enabledDetections.includes('edge-breaking')) {
      const edgeBreakingIssues = this.detectEdgeBreaking(node);
      issues.push(...edgeBreakingIssues);
    }

    if (this.config.enabledDetections.includes('soft-break')) {
      const softBreakIssues = this.detectSoftBreaks(node);
      issues.push(...softBreakIssues);
    }

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
      const currentAutoResize = node.textAutoResize;
      const currentText = node.characters;

      if ((currentAutoResize === 'NONE' || currentAutoResize === 'HEIGHT' || currentAutoResize === 'WIDTH_AND_HEIGHT') && currentText.includes('\n')) {
        issues.push({
          type: 'auto-width',
          confidence: PROCESSING_CONSTANTS.CONFIDENCE_LEVELS.AUTO_WIDTH,
          description: 'Text with line breaks can be processed',
          lineNumbers: this.getLineNumbers(currentText)
        });
      }
    } catch (error) {
      console.warn('Could not read textAutoResize for node:', node.name);
    }

    return issues;
  }

  private detectEdgeBreaking(node: TextNode): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    try {
      const currentText = node.characters;
      const nodeWidth = node.width;
      const fontSize = typeof node.fontSize === 'number' ? node.fontSize : PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE;

      const autoResize = node.textAutoResize;
      if (autoResize === 'NONE' || autoResize === 'HEIGHT') {
        const suspiciousLines = this.findEdgeBreakingLines(currentText, nodeWidth, fontSize);

        if (suspiciousLines.length > 0) {
          issues.push({
            type: 'edge-breaking',
            confidence: PROCESSING_CONSTANTS.CONFIDENCE_LEVELS.EDGE_BREAKING,
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
            confidence: PROCESSING_CONSTANTS.CONFIDENCE_LEVELS.SOFT_BREAK,
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
    const lines = text.split(this.getBreakPattern());
    return lines.map((_, index) => index + 1).filter(lineNum => lineNum < lines.length);
  }

  private findEdgeBreakingLines(text: string, containerWidth: number, fontSize: number = PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE): number[] {
    const lines = this.simulateWordWrap(text, containerWidth, fontSize);
    const suspiciousLines: number[] = [];

    lines.forEach((line, index) => {
      if (line.trim().length > 0) {
        const estimatedWidth = this.widthCalculator.estimateTextWidth(line.trim(), fontSize);
        const ratio = estimatedWidth / containerWidth;

        if (ratio >= this.config.lineBreakThreshold) {
          suspiciousLines.push(index + 1);
        }
      }
    });

    return suspiciousLines;
  }

  private countSoftBreaks(text: string): number {
    let count = 0;

    for (const softBreakChar of this.config.softBreakChars) {
      const escapedChar = softBreakChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedChar, 'g');
      const occurrences = (text.match(regex) || []).length;
      count += occurrences;
    }
    return count;
  }

  private simulateWordWrap(text: string, containerWidth: number, fontSize: number): string[] {
    const lines: string[] = [];
    const paragraphs = text.split(this.getBreakPattern());

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        lines.push('');
        continue;
      }

      const words = paragraph.split(/(\s+)/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + word;
        const estimatedWidth = this.widthCalculator.estimateTextWidth(testLine, fontSize);

        if (estimatedWidth <= containerWidth || currentLine === '') {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }

      if (currentLine !== '') {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  private getSoftBreakLines(text: string): number[] {
    const lines = text.split(this.getBreakPattern());
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
          changes.push('幅の設定＆端の改行');
          break;
        case 'edge-breaking':
          changes.push('端の改行');
          break;
        case 'soft-break':
          changes.push('ソフト改行');
          break;
      }
    });

    return changes.join(', ');
  }

  findTextNodes(ignoreMinCharacters: boolean = false): TextNode[] {
    const selection = figma.currentPage.selection;

    if (selection.length > 0) {
      const textNodes: TextNode[] = [];

      for (const selectedNode of selection) {
        if (selectedNode.type === 'TEXT') {
          const minCharCheck = ignoreMinCharacters || selectedNode.characters.length >= this.config.minCharacters;
          if (!selectedNode.locked && selectedNode.visible && minCharCheck) {
            textNodes.push(selectedNode);
          }
        } else {
          if ('findAll' in selectedNode) {
            const childTextNodes = selectedNode.findAll((node: SceneNode) => {
              if (node.type !== 'TEXT') return false;
              const textNode = node as TextNode;
              const minCharCheck = ignoreMinCharacters || textNode.characters.length >= this.config.minCharacters;
              return !textNode.locked &&
                textNode.visible &&
                minCharCheck;
            }) as TextNode[];

            textNodes.push(...childTextNodes);
          }
        }
      }

      return textNodes;
    }

    return figma.currentPage.findAll(node => {
      if (node.type !== 'TEXT') return false;
      const textNode = node as TextNode;
      const minCharCheck = ignoreMinCharacters || textNode.characters.length >= this.config.minCharacters;
      return !textNode.locked &&
        textNode.visible &&
        minCharCheck;
    }) as TextNode[];
  }

  getSelectedTextNodes(): TextNode[] {
    return figma.currentPage.selection.filter(
      node => node.type === 'TEXT' && !node.locked && node.visible
    ) as TextNode[];
  }
}//
// ===== TEXT PROCESSOR CLASS =====
class TextProcessor {
  private config: ProcessingConfig;
  private regexCache: RegexPatternCache;
  private widthCalculator: TextWidthCalculator;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.regexCache = new RegexPatternCache();
    this.widthCalculator = new TextWidthCalculator(config);
  }

  private getBreakPattern(): RegExp {
    return this.regexCache.getBreakPattern(this.config.softBreakChars);
  }

  generateChanges(originalText: string, issues: DetectedIssue[], node: TextNode): ProcessingChanges {
    const changes: ProcessingChanges = {};
    let processedText = originalText;

    const fontSize = typeof node.fontSize === 'number' ? node.fontSize : PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE;

    if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
      changes.newAutoResize = 'HEIGHT';
      processedText = this.removeLineBreaksJapanesePriority(processedText, node.width, fontSize);
    } else {
      const sortedIssues = issues.sort((a, b) => b.confidence - a.confidence);

      for (const issue of sortedIssues) {
        switch (issue.type) {
          case 'auto-width':
            changes.newAutoResize = 'HEIGHT';
            processedText = this.removeLineBreaksJapanesePriority(processedText, node.width, fontSize);
            break;
          case 'edge-breaking':
            processedText = this.removeLineBreaksJapanesePriority(processedText, node.width, fontSize);
            break;
          case 'soft-break':
            processedText = this.convertSoftBreaksToHard(processedText);
            break;
        }
      }
    }

    if (processedText !== originalText) {
      changes.newText = processedText;
    }

    return changes;
  }

  private removeLineBreaksJapanesePriority(
    text: string,
    containerWidth: number = PROCESSING_CONSTANTS.DEFAULT_CONTAINER_WIDTH,
    fontSize: number = PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE,
    ignoreMinCharacters: boolean = false
  ): string {
    if (!ignoreMinCharacters && text.length < this.config.minCharacters) {
      return text;
    }

    const lines = text.split(this.getBreakPattern());
    const shouldBreakAfter: boolean[] = [];

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const currentTrimmed = currentLine.trim();

      if (i === lines.length - 1) {
        shouldBreakAfter[i] = true;
        continue;
      }

      if (/[。．！？]$/.test(currentTrimmed)) {
        shouldBreakAfter[i] = true;
      } else {
        const estimatedWidth = this.widthCalculator.estimateTextWidth(currentTrimmed, fontSize);
        const widthRatio = estimatedWidth / containerWidth;

        if (widthRatio < this.config.lineBreakThreshold) {
          shouldBreakAfter[i] = true;
        } else {
          shouldBreakAfter[i] = false;
        }
      }
    }

    const result: string[] = [];
    let currentCombined = '';

    for (let i = 0; i < lines.length; i++) {
      if (currentCombined === '') {
        currentCombined = lines[i];
      } else {
        currentCombined = this.combineLines(currentCombined, lines[i]);
      }

      if (shouldBreakAfter[i]) {
        result.push(currentCombined);
        currentCombined = '';
      }
    }

    return result.join('\n');
  }

  private combineLines(line1: string, line2: string): string {
    const trimmed1 = line1.replace(/\s+$/, '');
    const trimmed2 = line2.replace(/^\s+/, '');

    if (!trimmed1 || !trimmed2) {
      return trimmed1 + trimmed2;
    }

    const line1End = trimmed1.slice(-1);
    const line2Start = trimmed2.slice(0, 1);

    if (this.isAlphanumeric(line1End) && this.isAlphanumeric(line2Start)) {
      return trimmed1 + ' ' + trimmed2;
    }

    return trimmed1 + trimmed2;
  }

  private isAlphanumeric(char: string): boolean {
    if (!char) return false;
    return /^[a-zA-Z0-9]$/.test(char);
  }

  private convertSoftBreaksToHard(text: string): string {
    let result = text;

    for (const softBreakChar of this.config.softBreakChars) {
      result = result.replace(new RegExp(softBreakChar, 'g'), '\n');
    }

    return result;
  }
}

// ===== FONT MANAGER CLASS =====
class FontManager {
  private loadedFonts: Set<string> = new Set();

  checkMissingFonts(nodes: TextNode[]): TextNode[] {
    return nodes.filter(node => node.hasMissingFont);
  }

  async loadNodeFonts(node: TextNode): Promise<void> {
    if (node.hasMissingFont) {
      throw new Error(`Cannot load missing font for node: ${node.name}`);
    }

    if (node.fontName !== figma.mixed) {
      await this.loadFont(node.fontName);
    } else {
      const fontNames = node.getRangeAllFontNames(0, node.characters.length);
      for (const fontName of fontNames) {
        await this.loadFont(fontName);
      }
    }
  }

  private async loadFont(fontName: FontName): Promise<void> {
    const fontKey = `${fontName.family}-${fontName.style}`;

    if (this.loadedFonts.has(fontKey)) {
      return;
    }

    try {
      await figma.loadFontAsync(fontName);
      this.loadedFonts.add(fontKey);
    } catch (error) {
      throw new Error(`Failed to load font ${fontName.family} ${fontName.style}: ${error}`);
    }
  }

  async applyChangesToNode(node: TextNode, changes: ProcessingChanges): Promise<void> {
    if (node.hasMissingFont) {
      throw new Error(`Cannot process node with missing font: ${node.name}`);
    }

    if (node.locked) {
      throw new Error(`Cannot process locked node: ${node.name}`);
    }

    await this.loadNodeFonts(node);

    try {
      if (changes.newAutoResize) {
        node.textAutoResize = changes.newAutoResize;
      }

      if (changes.newText) {
        node.characters = changes.newText;
      }

    } catch (error) {
      throw new Error(`Failed to apply changes to node ${node.name}: ${error}`);
    }
  }

  async validateNodesForProcessing(nodes: TextNode[]): Promise<{
    processable: TextNode[];
    issues: { node: TextNode; reason: string }[];
  }> {
    const processable: TextNode[] = [];
    const issues: { node: TextNode; reason: string }[] = [];

    for (const node of nodes) {
      if (node.hasMissingFont) {
        issues.push({
          node,
          reason: 'Missing font - cannot process'
        });
        continue;
      }

      if (node.locked) {
        issues.push({
          node,
          reason: 'Node is locked'
        });
        continue;
      }

      if (!node.visible) {
        issues.push({
          node,
          reason: 'Node is hidden'
        });
        continue;
      }

      processable.push(node);
    }

    return { processable, issues };
  }
}

// ===== BATCH PROCESSOR CLASS =====
class BatchProcessor {
  private isProcessing = false;
  private isCancelled = false;
  private analyzer: TextAnalyzer;
  private processor: TextProcessor;
  private fontManager: FontManager;
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.analyzer = new TextAnalyzer(config);
    this.processor = new TextProcessor(config);
    this.fontManager = new FontManager();
  }

  async analyzeNodes(
    nodes: TextNode[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<TextAnalysisResult[]> {
    this.isProcessing = true;
    this.isCancelled = false;

    const results: TextAnalysisResult[] = [];
    const CHUNK_SIZE = PROCESSING_CONSTANTS.ANALYSIS_CHUNK_SIZE;

    try {
      for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
        if (this.isCancelled) {
          break;
        }

        const chunk = nodes.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const node = chunk[j];
          const currentIndex = i + j;

          if (this.isCancelled) {
            break;
          }

          try {
            const result = await this.analyzer.analyzeTextNode(node);
            results.push(result);

            if (onProgress) {
              onProgress({
                current: currentIndex + 1,
                total: nodes.length,
                currentNode: node.name,
                progress: Math.round(((currentIndex + 1) / nodes.length) * 100),
                message: `Analyzing: ${node.name}`
              });
            }

          } catch (error) {
            results.push({
              node,
              issues: [],
              estimatedChanges: `Analysis error: ${error}`,
              originalText: node.characters || ''
            });
          }

          await this.yieldToUI();
        }
      }

    } catch (error) {
      throw new Error(`Batch analysis failed: ${error}`);
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  async processNodes(
    analysisResults: TextAnalysisResult[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<ProcessingResult[]> {
    this.isProcessing = true;
    this.isCancelled = false;

    const results: ProcessingResult[] = [];
    const nodesToProcess = analysisResults.filter(result => result.issues.length > 0);
    const CHUNK_SIZE = PROCESSING_CONSTANTS.PROCESSING_CHUNK_SIZE;

    try {
      const { processable, issues } = await this.fontManager.validateNodesForProcessing(
        nodesToProcess.map(r => r.node)
      );

      for (const issue of issues) {
        results.push({
          node: issue.node,
          success: false,
          error: issue.reason
        });
      }

      for (let i = 0; i < processable.length; i += CHUNK_SIZE) {
        if (this.isCancelled) {
          break;
        }

        const chunk = processable.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const node = chunk[j];
          const currentIndex = i + j;

          if (this.isCancelled) {
            break;
          }

          try {
            const analysisResult = analysisResults.find(r => r.node.id === node.id);
            if (!analysisResult || analysisResult.issues.length === 0) {
              continue;
            }

            const changes = this.processor.generateChanges(
              analysisResult.originalText,
              analysisResult.issues,
              node
            );

            await this.fontManager.applyChangesToNode(node, changes);

            results.push({
              node,
              success: true,
              changes
            });

            if (onProgress) {
              onProgress({
                current: currentIndex + 1,
                total: processable.length,
                currentNode: node.name,
                progress: Math.round(((currentIndex + 1) / processable.length) * 100),
                message: `Processing: ${node.name}`
              });
            }

          } catch (error) {
            results.push({
              node,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }

          await this.yieldToUI();
        }
      }

    } catch (error) {
      throw new Error(`Batch processing failed: ${error}`);
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  async scanCurrentPage(
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<TextAnalysisResult[]> {
    const allNodes = this.analyzer.findTextNodes();

    if (allNodes.length === 0) {
      figma.notify('現在のページにテキストノードが見つかりません', {
        error: true,
        timeout: PROCESSING_CONSTANTS.NOTIFICATION_TIMEOUTS.COMPLETE
      });
      throw new Error('No text nodes found in current page');
    }

    return await this.analyzeNodes(allNodes, onProgress);
  }

  async processIndividualNode(
    node: TextNode,
    forceChanges?: {
      removeLineBreaks?: boolean;
      convertSoftBreaks?: boolean;
    }
  ): Promise<ProcessingResult> {
    try {
      const { processable, issues } = await this.fontManager.validateNodesForProcessing([node]);

      if (processable.length === 0) {
        return {
          node,
          success: false,
          error: issues[0]?.reason || 'Node cannot be processed'
        };
      }

      if (forceChanges) {
        const changes: ProcessingChanges = {};
        let processedText = node.characters;

        if (forceChanges.removeLineBreaks) {
          const fontSize = typeof node.fontSize === 'number' ? node.fontSize : PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE;
          processedText = this.processor['removeLineBreaksJapanesePriority'](processedText, node.width, fontSize, true);

          if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
            changes.newAutoResize = 'HEIGHT';
          }
        }

        if (forceChanges.convertSoftBreaks) {
          processedText = this.processor['convertSoftBreaksToHard'](processedText);
        }

        if (processedText !== node.characters) {
          changes.newText = processedText;
        }

        if (Object.keys(changes).length > 0) {
          await this.fontManager.applyChangesToNode(node, changes);
          return {
            node,
            success: true,
            changes
          };
        }
      }

      return {
        node,
        success: true,
        changes: {}
      };

    } catch (error) {
      return {
        node,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  cancel(): void {
    this.isCancelled = true;
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}

// ===== DEFAULT CONFIGURATION =====
const DEFAULT_CONFIG: ProcessingConfig = {
  minCharacters: 10,
  lineBreakThreshold: 0.8,
  softBreakChars: ['\u2028'],
  excludePatterns: [],
  enabledDetections: ['auto-width', 'edge-breaking', 'soft-break'],
  fontWidthMultiplier: 1.0
};

// ===== MAIN PLUGIN LOGIC =====
let batchProcessor: BatchProcessor;
let currentResults: TextAnalysisResult[] = [];

function loadConfig(): ProcessingConfig {
  try {
    const saved = figma.clientStorage.getAsync('line-break-cleaner-config');
    return saved ? { ...DEFAULT_CONFIG, ...saved } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: ProcessingConfig): Promise<void> {
  try {
    await figma.clientStorage.setAsync('line-break-cleaner-config', config);
  } catch (error) {
    console.warn('Failed to save config:', error);
  }
}

function sendMessage(message: UIMessage): void {
  figma.ui.postMessage(message);
}

function getScanModeInfo(): { mode: string; details?: string } {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return { mode: 'ページ全体' };
  }

  const textNodes = selection.filter(node => node.type === 'TEXT').length;
  const totalNodes = selection.length;

  if (textNodes === totalNodes && textNodes === 1) {
    return { mode: '選択中のテキスト', details: '1つ' };
  } else if (textNodes === totalNodes) {
    return { mode: '選択中のテキスト', details: `${textNodes}つ` };
  } else if (textNodes > 0) {
    return { mode: '選択中の要素', details: `${textNodes}/${totalNodes}つのテキスト` };
  } else {
    return { mode: '選択中の要素内', details: 'テキストを検索' };
  }
}

function updateSelectionState(): void {
  const selection = figma.currentPage.selection;
  const selectedTextNodes = selection.filter(node => node.type === 'TEXT');

  const selectedNodeIds = currentResults
    .filter(result => selectedTextNodes.some(node => node.id === result.node.id))
    .map(result => result.node.id);

  const hasManualSelection = selectedTextNodes.length > 0;
  const manualSelectionCount = selectedTextNodes.length;

  sendMessage({
    type: 'selection-changed',
    selectedNodeIds,
    hasManualSelection,
    manualSelectionCount
  });
}

// ===== EVENT HANDLERS =====
figma.on('selectionchange', () => {
  updateSelectionState();
  sendMessage({
    type: 'scan-mode-info',
    ...getScanModeInfo()
  });
});

figma.ui.onmessage = async (msg: UIMessage) => {
  try {
    switch (msg.type) {
      case 'scan':
        await handleScan(msg.config);
        break;

      case 'apply-selected':
        await handleApplySelected(msg.config, msg.options);
        break;

      case 'select-nodes':
        handleSelectNodes(msg.nodeIds);
        break;

      case 'get-current-selection':
        updateSelectionState();
        break;

      case 'load-config':
        const config = await loadConfig();
        sendMessage({
          type: 'config-loaded',
          config
        });
        break;

      case 'get-scan-mode':
        sendMessage({
          type: 'scan-mode-info',
          ...getScanModeInfo()
        });
        break;

      case 'clear-results':
        currentResults = [];
        break;
    }
  } catch (error) {
    sendMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
};

async function handleScan(config: ProcessingConfig): Promise<void> {
  await saveConfig(config);
  batchProcessor = new BatchProcessor(config);

  try {
    currentResults = await batchProcessor.scanCurrentPage((progress) => {
      // Progress updates could be sent to UI here if needed
    });

    sendMessage({
      type: 'scan-complete',
      results: currentResults,
      scanInfo: getScanModeInfo()
    });

  } catch (error) {
    sendMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Scan failed'
    });
  }
}

async function handleApplySelected(config: ProcessingConfig, options: any): Promise<void> {
  await saveConfig(config);
  batchProcessor = new BatchProcessor(config);

  try {
    const selection = figma.currentPage.selection;
    const selectedTextNodes = selection.filter(node => node.type === 'TEXT') as TextNode[];

    let processedCount = 0;

    // Process manually selected nodes
    for (const node of selectedTextNodes) {
      const result = await batchProcessor.processIndividualNode(node, {
        removeLineBreaks: options.removeLineBreaks,
        convertSoftBreaks: options.convertSoftBreaks
      });

      if (result.success) {
        processedCount++;
      }
    }

    // Process nodes from scan results (if any are selected in UI)
    // This would require additional logic to track UI selections

    figma.notify(`${processedCount}つのテキストを処理しました`, {
      timeout: PROCESSING_CONSTANTS.NOTIFICATION_TIMEOUTS.COMPLETE
    });

  } catch (error) {
    sendMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Processing failed'
    });
  }
}

function handleSelectNodes(nodeIds: string[]): void {
  const nodes = nodeIds
    .map(id => figma.currentPage.findOne(node => node.id === id))
    .filter(node => node !== null);

  figma.currentPage.selection = nodes;

  if (nodes.length > 0) {
    // figma.viewport.scrollAndZoomIntoView(nodes);
  }
}

// ===== PLUGIN INITIALIZATION =====
figma.showUI(__html__, {
  width: 320,
  height: 600,
  themeColors: true
});

// Send initial state
(async () => {
  const config = await loadConfig();
  sendMessage({
    type: 'config-loaded',
    config
  });

  sendMessage({
    type: 'scan-mode-info',
    ...getScanModeInfo()
  });

  updateSelectionState();
})();