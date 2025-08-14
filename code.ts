// Line Break Cleaner - Figma Plugin for cleaning unnecessary line breaks
// This plugin helps identify and clean unnecessary line breaks in text nodes,
// with intelligent detection for Japanese and multilingual content.

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
  lineBreakThreshold: number; // 改行処理閾値（コンテナ幅比率 0.0-1.0）- 検出と削除の両方で使用
  softBreakChars: string[];
  excludePatterns: string[];
  enabledDetections: DetectionType[];
  fontWidthMultiplier?: number; // フォント幅係数（デフォルト: 1.0）
}

interface ProcessingChanges {
  newText?: string;
  newAutoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'TRUNCATE';
}

interface ValidationResult {
  valid: boolean;
  issues: string[];
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

// ===== TEXT ANALYZER CLASS =====
class TextAnalyzer {
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig) {
    this.config = config;
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

    if (this.config.enabledDetections.indexOf('auto-width') !== -1) {
      const autoWidthIssues = this.detectAutoWidthIssues(node);
      issues.push(...autoWidthIssues);
    }

    if (this.config.enabledDetections.indexOf('edge-breaking') !== -1) {
      const edgeBreakingIssues = this.detectEdgeBreaking(node);
      issues.push(...edgeBreakingIssues);
    }

    if (this.config.enabledDetections.indexOf('soft-break') !== -1) {
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

      // 固定サイズ（NONE）またはauto-heightのテキストで改行があるもの
      if ((currentAutoResize === 'NONE' || currentAutoResize === 'HEIGHT' || currentAutoResize === 'WIDTH_AND_HEIGHT') && currentText.indexOf('\n') !== -1) {
        issues.push({
          type: 'auto-width',
          confidence: 0.9,
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
      const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;

      const autoResize = node.textAutoResize;
      if (autoResize === 'NONE' || autoResize === 'HEIGHT') {
        const suspiciousLines = this.findEdgeBreakingLines(currentText, nodeWidth, fontSize);

        if (suspiciousLines.length > 0) {
          issues.push({
            type: 'edge-breaking',
            confidence: 0.7,
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
    // 通常改行とソフト改行の両方で分割
    const allBreakChars = ['\n', ...this.config.softBreakChars];
    const breakPattern = new RegExp(`[${allBreakChars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`);
    const lines = text.split(breakPattern);
    return lines.map((_, index) => index + 1).filter(lineNum => lineNum < lines.length);
  }

  private findEdgeBreakingLines(text: string, containerWidth: number, fontSize: number = 16): number[] {
    // 自動改行を考慮した行分割
    const lines = this.simulateWordWrap(text, containerWidth, fontSize);

    const suspiciousLines: number[] = [];

    lines.forEach((line, index) => {
      if (line.trim().length > 0) {
        const estimatedWidth = this.estimateTextWidth(line.trim(), fontSize);
        const ratio = estimatedWidth / containerWidth;


        if (ratio >= this.config.lineBreakThreshold) {
          suspiciousLines.push(index + 1);
        }
      }
    });

    return suspiciousLines;
  }

  private estimateTextWidth(text: string, fontSize: number): number {
    let totalWidth = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);

      // 文字種別による幅の推定（実測値 878px/55文字/16px ≈ 0.998 に基づく）
      const baseMultiplier = this.config.fontWidthMultiplier || 1.0;
      if (this.isFullWidthCharacter(charCode)) {
        // 全角文字（日本語、中国語、韓国語、全角記号など）
        totalWidth += fontSize * baseMultiplier; // 設定可能な係数
      } else if (this.isHalfWidthCharacter(charCode)) {
        // 半角文字（英数字、記号）
        totalWidth += fontSize * (baseMultiplier * 0.5); // 半角は全角の約半分
      } else {
        // その他の文字（デフォルト）
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

  // 自動改行をシミュレートして実際の表示行を取得
  private simulateWordWrap(text: string, containerWidth: number, fontSize: number): string[] {
    const lines: string[] = [];

    // 通常改行とソフト改行の両方で分割
    const allBreakChars = ['\n', ...this.config.softBreakChars];
    const breakPattern = new RegExp(`[${allBreakChars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`);
    const paragraphs = text.split(breakPattern);

    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        lines.push('');
        continue;
      }

      const words = paragraph.split(/(\s+)/); // スペースも保持
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + word;
        const estimatedWidth = this.estimateTextWidth(testLine, fontSize);

        if (estimatedWidth <= containerWidth || currentLine === '') {
          currentLine = testLine;
        } else {
          // 現在行を追加して新しい行を開始
          lines.push(currentLine);
          currentLine = word;
        }
      }

      // 最後の行を追加
      if (currentLine !== '') {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  private getSoftBreakLines(text: string): number[] {
    // 通常改行とソフト改行の両方で分割
    const allBreakChars = ['\n', ...this.config.softBreakChars];
    const breakPattern = new RegExp(`[${allBreakChars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`);
    const lines = text.split(breakPattern);
    const softBreakLines: number[] = [];

    lines.forEach((line, index) => {
      for (const softBreakChar of this.config.softBreakChars) {
        if (line.indexOf(softBreakChar) !== -1) {
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
    // 選択されたノードがある場合、その中のテキストノードを検索
    const selection = figma.currentPage.selection;

    if (selection.length > 0) {
      const textNodes: TextNode[] = [];

      for (const selectedNode of selection) {
        if (selectedNode.type === 'TEXT') {
          // 選択されたノード自体がテキストノードの場合
          const minCharCheck = ignoreMinCharacters || selectedNode.characters.length >= this.config.minCharacters;
          if (!selectedNode.locked && selectedNode.visible && minCharCheck) {
            textNodes.push(selectedNode);
          }
        } else {
          // 選択されたノード内のテキストノードを検索
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

    // 選択がない場合は現在のページ全体を検索
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
}

// ===== TEXT PROCESSOR CLASS =====
class TextProcessor {
  private config: ProcessingConfig;

  constructor(config: ProcessingConfig) {
    this.config = config;
  }

  generateChanges(originalText: string, issues: DetectedIssue[], node: TextNode): ProcessingChanges {
    const changes: ProcessingChanges = {};
    let processedText = originalText;

    const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;

    // WIDTH_AND_HEIGHTノードの場合は必ずAuto-height変換
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

  private removeLineBreaksJapanesePriority(text: string, containerWidth: number = 500, fontSize: number = 16, ignoreMinCharacters: boolean = false): string {
    // 最小文字数チェック（手動選択時は無視）
    if (!ignoreMinCharacters && text.length < this.config.minCharacters) {
      return text; // そのまま返す
    }

    // 通常改行とソフト改行の両方で分割
    const allBreakChars = ['\n', ...this.config.softBreakChars];
    const breakPattern = new RegExp(`[${allBreakChars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`);
    const lines = text.split(breakPattern);

    const shouldBreakAfter: boolean[] = [];

    // 各行について、その後で改行すべきかを判定
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const currentTrimmed = currentLine.trim();


      // 最後の行は常にbreak
      if (i === lines.length - 1) {
        shouldBreakAfter[i] = true;
        continue;
      }

      // 句読点で終わる場合はbreak
      if (/[。．！？]$/.test(currentTrimmed)) {
        shouldBreakAfter[i] = true;
      } else {
        // 幅判定を追加：コンテナ幅に対する比率が閾値未満の場合は改行を保持
        const estimatedWidth = this.estimateTextWidth(currentTrimmed, fontSize);
        const widthRatio = estimatedWidth / containerWidth;

        if (widthRatio < this.config.lineBreakThreshold) {
          shouldBreakAfter[i] = true;
        } else {
          shouldBreakAfter[i] = false;
        }
      }
    }

    // 判定結果に基づいて行を結合
    const result: string[] = [];
    let currentCombined = '';

    for (let i = 0; i < lines.length; i++) {
      if (currentCombined === '') {
        currentCombined = lines[i];
      } else {
        currentCombined = this.combineLines(currentCombined, lines[i]);
      }

      // この行の後でbreakする場合
      if (shouldBreakAfter[i]) {
        result.push(currentCombined);
        currentCombined = '';
      }
    }

    return result.join('\n');
  }

  private shouldRemoveLineBreak(currentLine: string, nextLine: string, containerWidth: number, fontSize: number = 16): boolean {
    const currentTrimmed = currentLine.trim();
    const nextTrimmed = nextLine.trim();

    // 空行の場合は保持
    if (currentTrimmed === '' || nextTrimmed === '') {
      return false;
    }

    // より正確な文字幅推定を使用
    const estimatedWidth = this.estimateTextWidth(currentTrimmed, fontSize);
    const widthRatio = estimatedWidth / containerWidth;

    if (widthRatio < this.config.lineBreakThreshold) {
      return false;
    }

    // === 例外条件（改行を保持する場合）===

    // 1. 次行が箇条書きの場合は保持
    if (this.isBulletPoint(nextTrimmed)) {
      return false;
    }


    // 2. 現在行が句読点で終わる場合（文の終わり）は改行を保持
    if (/[。．！？]$/.test(currentTrimmed)) {
      return false;
    }

    // 3. 次行が英大文字で始まる場合（新しい文）は保持
    if (/^[A-Z]/.test(nextTrimmed)) {
      return false;
    }

    // === 上記例外以外はすべて改行削除対象 ===
    return true;
  }

  private combineLines(line1: string, line2: string): string {
    const trimmed1 = line1.replace(/\s+$/, '');
    const trimmed2 = line2.replace(/^\s+/, '');

    // 空行の場合はそのまま結合
    if (!trimmed1 || !trimmed2) {
      return trimmed1 + trimmed2;
    }

    const line1End = trimmed1.slice(-1);
    const line2Start = trimmed2.slice(0, 1);

    // 日本語文字同士の場合はスペースなしで結合
    if (this.isJapanese(line1End) && this.isJapanese(line2Start)) {
      return trimmed1 + trimmed2;
    }

    // その他の場合はスペースを入れて結合
    return trimmed1 + ' ' + trimmed2;
  }

  private isJapanese(char: string): boolean {
    if (!char) return false;
    const code = char.charCodeAt(0);

    return (
      (code >= 0x3040 && code <= 0x309F) ||
      (code >= 0x30A0 && code <= 0x30FF) ||
      (code >= 0x4E00 && code <= 0x9FAF) ||
      (code >= 0x3400 && code <= 0x4DBF)
    );
  }


  private isBulletPoint(line: string): boolean {
    const bulletPatterns = [
      /^[•·※]/,
      /^[\d]+[.)]/,
      /^[a-zA-Z][.)]/,
      /^[-*+]/,
      /^[①-⑳]/
    ];

    return bulletPatterns.some(pattern => pattern.test(line));
  }


  private looksLikeHeading(line: string): boolean {
    if (line.length > 50) return false;
    if (/^[A-Z\s]{3,}$/.test(line)) return true;
    if (/^[\d]+[\.\)]\s/.test(line)) return true;

    return false;
  }

  private convertSoftBreaksToHard(text: string): string {
    let result = text;

    for (const softBreakChar of this.config.softBreakChars) {
      result = result.replace(new RegExp(softBreakChar, 'g'), '\n');
    }

    return result;
  }


  private estimateTextWidth(text: string, fontSize: number): number {
    let totalWidth = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);

      // 文字種別による幅の推定（実測値 878px/55文字/16px ≈ 0.998 に基づく）
      const baseMultiplier = this.config.fontWidthMultiplier || 1.0;
      if (this.isFullWidthCharacter(charCode)) {
        // 全角文字（日本語、中国語、韓国語、全角記号など）
        totalWidth += fontSize * baseMultiplier; // 設定可能な係数
      } else if (this.isHalfWidthCharacter(charCode)) {
        // 半角文字（英数字、記号）
        totalWidth += fontSize * (baseMultiplier * 0.5); // 半角は全角の約半分
      } else {
        // その他の文字（デフォルト）
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
    const CHUNK_SIZE = 50;

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
    const CHUNK_SIZE = 25;

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
      figma.notify('現在のページにテキストノードが見つかりません', { error: true });
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
        const changes: any = {};
        let processedText = node.characters;

        if (forceChanges.removeLineBreaks) {
          const fontSize = typeof node.fontSize === 'number' ? node.fontSize : 16;
          processedText = this.processor['removeLineBreaksJapanesePriority'](processedText, node.width, fontSize, true);

          // auto-width要素は自動的にauto-heightに変換
          if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
            changes.newAutoResize = 'HEIGHT';
          }
        }

        // ソフト改行変換を改行除去の後に実行
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
        } else {
          return {
            node,
            success: true,
            changes: {}
          };
        }
      }

      const analysisResult = await this.analyzer.analyzeTextNode(node);

      if (analysisResult.issues.length === 0) {
        return {
          node,
          success: true,
          changes: {}
        };
      }

      const changes = this.processor.generateChanges(
        analysisResult.originalText,
        analysisResult.issues,
        node
      );

      await this.fontManager.applyChangesToNode(node, changes);

      return {
        node,
        success: true,
        changes
      };

    } catch (error) {
      return {
        node,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  cancel(): void {
    this.isCancelled = true;
  }

  generateStatistics(results: ProcessingResult[]): {
    totalProcessed: number;
    successful: number;
    failed: number;
    errorSummary: { [key: string]: number };
  } {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    const errorSummary: { [key: string]: number } = {};
    results.filter(r => !r.success).forEach(r => {
      const errorType = r.error || 'Unknown error';
      errorSummary[errorType] = (errorSummary[errorType] || 0) + 1;
    });

    return {
      totalProcessed: results.length,
      successful,
      failed,
      errorSummary
    };
  }

  private async yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1));
  }
}

// ===== MAIN PLUGIN CODE =====

// Default configuration
const DEFAULT_CONFIG: ProcessingConfig = {
  minCharacters: 20,
  lineBreakThreshold: 0.9, // コンテナ幅＊%以上の行で改行処理（検出・削除）
  softBreakChars: ['\u2028'],
  excludePatterns: [],
  enabledDetections: ['auto-width', 'edge-breaking', 'soft-break'],
  fontWidthMultiplier: 1.0 // 実測値に基づく初期値
};

// Initialize plugin
figma.showUI(__html__, {
  width: 320,
  height: 600,
  title: 'Line Break Cleaner'
});

// Global state
let currentProcessor: BatchProcessor | null = null;
let isProcessing = false;
let scannedNodeIds: Set<string> = new Set();

// Load saved configuration
async function loadConfig(): Promise<ProcessingConfig> {
  try {
    const savedConfig = await figma.clientStorage.getAsync('line-break-cleaner-config');
    return savedConfig ? { ...DEFAULT_CONFIG, ...savedConfig } : DEFAULT_CONFIG;
  } catch (error) {
    console.warn('Could not load saved config:', error);
    return DEFAULT_CONFIG;
  }
}

// Save configuration
async function saveConfig(config: ProcessingConfig): Promise<void> {
  try {
    await figma.clientStorage.setAsync('line-break-cleaner-config', config);
  } catch (error) {
    console.warn('Could not save config:', error);
  }
}

// Send message to UI
function sendToUI(message: any): void {
  figma.ui.postMessage(message);
}

// Progress callback for batch operations
function onProgress(progress: any): void {
  sendToUI({
    type: 'progress-update',
    progress: progress.progress,
    message: progress.message,
    currentNode: progress.currentNode
  });
}

// Handle scan operation
async function handleScan(config: ProcessingConfig): Promise<void> {
  const selection = figma.currentPage.selection;

  if (isProcessing) {
    return;
  }

  isProcessing = true;
  currentProcessor = new BatchProcessor(config);

  try {
    await saveConfig(config);
    const results = await currentProcessor.scanCurrentPage(onProgress);

    // スキャンしたノードIDを記録
    scannedNodeIds.clear();
    results.forEach(result => {
      scannedNodeIds.add(result.node.id);
    });


    // 選択範囲の情報を含めて結果を送信
    const selection = figma.currentPage.selection;
    const scanInfo = selection.length > 0
      ? `選択範囲内 (${selection.length}個のノード)`
      : 'ページ全体';

    sendToUI({
      type: 'scan-complete',
      results: results,
      scanInfo: scanInfo
    });

    // スキャン完了後、現在の選択状態を同期
    handleGetCurrentSelection();

  } catch (error) {
    sendToUI({
      type: 'error',
      message: error instanceof Error ? error.message : 'Scan failed'
    });
  } finally {
    isProcessing = false;
  }
}

// Handle apply all operation
async function handleApplyAll(results: TextAnalysisResult[]): Promise<void> {

  if (isProcessing || !currentProcessor) {
    return;
  }

  isProcessing = true;

  try {
    const processResults = await currentProcessor.processNodes(results, onProgress);

    sendToUI({
      type: 'processing-complete',
      results: processResults
    });

    const stats = currentProcessor.generateStatistics(processResults);
    if (stats.failed > 0) {
      sendToUI({
        type: 'warning',
        message: `${stats.failed} nodes failed to process. Check for missing fonts or locked layers.`
      });
    }

  } catch (error) {
    sendToUI({
      type: 'error',
      message: error instanceof Error ? error.message : 'Processing failed'
    });
  } finally {
    isProcessing = false;
  }
}

// Handle apply selected operation
async function handleApplySelected(config: ProcessingConfig, options: any): Promise<void> {
  if (isProcessing) return;

  isProcessing = true;
  currentProcessor = new BatchProcessor(config);

  try {
    const selectedNodes = figma.currentPage.selection.filter(
      node => node.type === 'TEXT'
    ) as TextNode[];

    if (selectedNodes.length === 0) {
      figma.notify('テキストノードが選択されていません', { error: true });
      return;
    }

    const processResults: ProcessingResult[] = [];

    for (let i = 0; i < selectedNodes.length; i++) {
      const node = selectedNodes[i];

      onProgress({
        current: i + 1,
        total: selectedNodes.length,
        currentNode: node.name,
        progress: Math.round(((i + 1) / selectedNodes.length) * 100),
        message: `Processing: ${node.name}`
      });

      const result = await currentProcessor.processIndividualNode(node, {
        removeLineBreaks: options.removeLineBreaks,
        convertSoftBreaks: options.convertSoftBreaks
      });

      processResults.push(result);
    }

    // 成功メッセージを表示
    const successCount = processResults.filter(r => r.success).length;
    const failCount = processResults.filter(r => !r.success).length;

    if (successCount > 0) {
      figma.notify(`${successCount}個のテキストノードを処理しました`, { timeout: 3000 });
    }

    if (failCount > 0) {
      figma.notify(`${failCount}個のノードで処理に失敗しました`, { error: true });
    }

    sendToUI({
      type: 'processing-complete',
      results: processResults
    });

  } catch (error) {
    sendToUI({
      type: 'error',
      message: error instanceof Error ? error.message : 'Selected processing failed'
    });
  } finally {
    isProcessing = false;
  }
}

// Handle node selection
async function handleSelectNodes(nodeIds: string[]): Promise<void> {
  try {

    // ノードIDから実際のノードオブジェクトを取得
    const nodesToSelect: SceneNode[] = [];

    for (const nodeId of nodeIds) {
      try {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node && node.type === 'TEXT') {
          nodesToSelect.push(node);
        } else {
          console.warn('ノードがテキストではない:', nodeId, node?.type);
        }
      } catch (nodeError) {
        console.warn('ノードが見つからない:', nodeId, nodeError);
      }
    }

    // Figmaで選択（空の配列でも実行して選択解除）
    figma.currentPage.selection = nodesToSelect;

    if (nodesToSelect.length > 0) {
    }

  } catch (error) {
    console.error('ノード選択エラー:', error);
  }
}

// Get current selection (only for scanned nodes)
function handleGetCurrentSelection(): void {
  const selection = figma.currentPage.selection;
  
  // スキャン結果にあるノードの選択状態
  const scannedSelectedNodeIds = selection
    .filter(node => node.type === 'TEXT' && scannedNodeIds.has(node.id))
    .map(node => node.id);

  // 手動選択されたテキストノード（スキャン結果にないもの）
  const manualSelectedTextNodes = selection
    .filter(node => node.type === 'TEXT' && !scannedNodeIds.has(node.id));

  // UIに選択状態を通知（スキャン結果のノード + 手動選択の情報）
  sendToUI({
    type: 'selection-changed',
    selectedNodeIds: scannedSelectedNodeIds,
    hasManualSelection: manualSelectedTextNodes.length > 0,
    manualSelectionCount: manualSelectedTextNodes.length
  });
}

function handleGetScanMode(): void {
  try {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      sendToUI({
        type: 'scan-mode-info',
        mode: 'ページ全体',
        details: null
      });
    } else {
      const nodeTypes = selection.map(node => {
        switch (node.type) {
          case 'FRAME': return 'フレーム';
          case 'SECTION': return 'セクション';
          case 'GROUP': return 'グループ';
          case 'TEXT': return 'テキスト';
          case 'COMPONENT': return 'コンポーネント';
          case 'INSTANCE': return 'インスタンス';
          default: return node.type;
        }
      });

      const uniqueTypes = [...new Set(nodeTypes)];
      const typeText = uniqueTypes.length === 1
        ? uniqueTypes[0]
        : '複数タイプ';

      sendToUI({
        type: 'scan-mode-info',
        mode: '選択範囲内',
        details: `${selection.length}個の${typeText}`
      });
    }
  } catch (error) {
    console.error('スキャンモード取得エラー:', error);
    sendToUI({
      type: 'scan-mode-info',
      mode: 'ページ全体',
      details: null
    });
  }
}

function handleClearResults(): void {
  // スキャンしたノードIDをクリア
  scannedNodeIds.clear();

  // 処理状態をリセット
  isProcessing = false;
  currentProcessor = null;

  // Figmaの選択もクリア
  figma.currentPage.selection = [];


}

// Handle cancel operation
function handleCancel(): void {

  if (currentProcessor) {
    currentProcessor.cancel();
  }

  isProcessing = false;

  sendToUI({
    type: 'cancelled'
  });

}

// Message handler from UI
figma.ui.onmessage = async (msg: UIMessage) => {

  try {
    switch (msg.type) {
      case 'scan':
        await handleScan(msg.config || DEFAULT_CONFIG);
        break;

      case 'apply-all':
        await handleApplyAll(msg.results);
        break;

      case 'apply-selected':
        await handleApplySelected(msg.config || DEFAULT_CONFIG, msg.options);
        break;

      case 'select-nodes':
        await handleSelectNodes(msg.nodeIds);
        break;

      case 'get-current-selection':
        handleGetCurrentSelection();
        break;

      case 'load-config':
        const currentConfig = await loadConfig();
        sendToUI({
          type: 'config-loaded',
          config: currentConfig
        });
        break;

      case 'get-scan-mode':
        handleGetScanMode();
        break;

      case 'clear-results':
        handleClearResults();
        break;

      case 'cancel':
        handleCancel();
        break;

      default:
        console.warn('Unknown message type:', msg.type);
    }
  } catch (error) {
    sendToUI({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
    isProcessing = false;
  }
};

// Selection change listener - 常に選択状態を監視
figma.on('selectionchange', () => {
  // 選択状態を常に監視（スキャン結果の有無に関わらず）
  handleGetCurrentSelection();
  
  // スキャンモード情報を自動更新
  handleGetScanMode();
});

// Initialize with saved config when plugin loads
loadConfig().then(config => {
  // Plugin is ready
}).catch(error => {
  console.warn('Plugin initialization warning:', error);
});