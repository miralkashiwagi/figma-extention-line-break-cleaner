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
    const lines = text.split('\n');
    return lines.map((_, index) => index + 1).filter(lineNum => lineNum < lines.length);
  }

  private findEdgeBreakingLines(text: string, containerWidth: number, fontSize: number = 16): number[] {
    const lines = text.split('\n');
    const suspiciousLines: number[] = [];
    
    lines.forEach((line, index) => {
      if (line.trim().length > 0) {
        const estimatedWidth = this.estimateTextWidth(line.trim(), fontSize);
        const ratio = estimatedWidth / containerWidth;
        
        console.log(`幅判定: "${line.trim().substring(0, 20)}..." (${line.trim().length}文字) 
      フォント:${fontSize}px 推定幅:${estimatedWidth.toFixed(0)}px コンテナ:${containerWidth}px 
      比率:${ratio.toFixed(2)} 閾値:${this.config.lineBreakThreshold} 
      結果:${ratio >= this.config.lineBreakThreshold ? '結合対象' : '保持'}`);
        
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

  findTextNodes(): TextNode[] {
    return figma.currentPage.findAll(node => {
      return node.type === 'TEXT' && 
             !node.locked && 
             node.visible &&
             node.characters.length >= this.config.minCharacters;
    }) as TextNode[];
  }

  getSelectedTextNodes(): TextNode[] {
    return figma.currentPage.selection.filter(
      node => node.type === 'TEXT'
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

  private removeLineBreaksJapanesePriority(text: string, containerWidth: number = 500, fontSize: number = 16): string {
    // 最小文字数チェック
    if (text.length < this.config.minCharacters) {
      console.log(`テキストが短すぎます (${text.length}文字 < ${this.config.minCharacters}文字) - 処理をスキップ`);
      return text; // そのまま返す
    }
    
    const lines = text.split('\n');
    const shouldBreakAfter: boolean[] = [];
    
    // 各行について、その後で改行すべきかを判定
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      const currentTrimmed = currentLine.trim();
      
      console.log(`行${i + 1}評価: "${currentTrimmed}"`);
      
      // 最後の行は常にbreak
      if (i === lines.length - 1) {
        shouldBreakAfter[i] = true;
        console.log(`→ 最後の行: break`);
        continue;
      }
      
      // 句読点で終わる場合はbreak
      if (/[。．！？]$/.test(currentTrimmed)) {
        shouldBreakAfter[i] = true;
        console.log(`→ 句読点で終わる: break`);
      } else {
        shouldBreakAfter[i] = false;
        console.log(`→ 句読点なし: continue`);
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
        console.log(`結合完了: "${currentCombined.trim()}"`);
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
    
    console.log(`幅判定: "${currentTrimmed.substring(0, 20)}..." (${currentTrimmed.length}文字) 
      フォント:${fontSize}px 推定幅:${estimatedWidth.toFixed(0)}px コンテナ:${containerWidth}px 
      比率:${widthRatio.toFixed(2)} 閾値:${this.config.lineBreakThreshold} 
      結果:${widthRatio >= this.config.lineBreakThreshold ? '結合対象' : '保持'}`);
    
    if (widthRatio < this.config.lineBreakThreshold) {
      console.log(`判定結果: 改行保持 (幅が閾値未満)`);
      return false;
    }

    // === 例外条件（改行を保持する場合）===
    
    // 1. 次行が箇条書きの場合は保持
    if (this.isBulletPoint(nextTrimmed)) {
      return false;
    }


    console.log("currentTrimmed:", currentTrimmed);
      console.log("句読点で終わる？:",/[。．！？]$/.test(currentTrimmed));

    // 2. 現在行が句読点で終わる場合（文の終わり）は改行を保持
    if (/[。．！？]$/.test(currentTrimmed)) {
      console.log(`判定結果: 改行保持 (句読点で終わる)`);
      return false;
    }

    // 3. 次行が英大文字で始まる場合（新しい文）は保持
    if (/^[A-Z]/.test(nextTrimmed)) {
      return false;
    }

    // === 上記例外以外はすべて改行削除対象 ===
    console.log(`判定結果: 改行削除対象 (幅条件満たし、例外なし)`);
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
      throw new Error('No text nodes found in current page');
    }

    return await this.analyzeNodes(allNodes, onProgress);
  }

  async processIndividualNode(
    node: TextNode,
    forceChanges?: {
      removeLineBreaks?: boolean;
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
          processedText = this.processor['removeLineBreaksJapanesePriority'](processedText, node.width, fontSize);
          
          // auto-width要素は自動的にauto-heightに変換
          if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
            console.log('auto-width要素をauto-heightに変換');
            changes.newAutoResize = 'HEIGHT';
          }
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
  lineBreakThreshold: 0.4, // コンテナ幅40%以上の行で改行処理（検出・削除）
  softBreakChars: ['​', '\u200B', '&#8203;'],
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
  if (isProcessing) return;
  
  isProcessing = true;
  currentProcessor = new BatchProcessor(config);
  
  try {
    await saveConfig(config);
    const results = await currentProcessor.scanCurrentPage(onProgress);
    
    sendToUI({
      type: 'scan-complete',
      results: results
    });
    
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
  console.log('=== 一括適用開始 ===');
  console.log('受信した結果数:', results.length);
  console.log('現在処理中:', isProcessing);
  console.log('プロセッサ存在:', !!currentProcessor);
  
  if (isProcessing || !currentProcessor) {
    console.log('処理をスキップ - 既に処理中またはプロセッサなし');
    return;
  }
  
  isProcessing = true;
  console.log('処理開始');
  
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
      throw new Error('No text nodes selected');
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
        removeLineBreaks: options.removeLineBreaks
      });
      
      processResults.push(result);
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
    console.log('選択するノードID:', nodeIds);
    
    // ノードIDから実際のノードオブジェクトを取得
    const nodesToSelect: SceneNode[] = [];
    
    for (const nodeId of nodeIds) {
      try {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node && node.type === 'TEXT') {
          nodesToSelect.push(node);
          console.log('ノード選択:', node.name || 'Unnamed', node.id);
        } else {
          console.warn('ノードがテキストではない:', nodeId, node?.type);
        }
      } catch (nodeError) {
        console.warn('ノードが見つからない:', nodeId, nodeError);
      }
    }
    
    // Figmaで選択
    if (nodesToSelect.length > 0) {
      figma.currentPage.selection = nodesToSelect;
      
      // 最初のノードにズーム
      if (nodesToSelect.length === 1) {
        figma.viewport.scrollAndZoomIntoView([nodesToSelect[0]]);
      }
      
      console.log(`${nodesToSelect.length}個のノードを選択しました`);
    } else {
      console.warn('選択可能なノードがありませんでした');
    }
    
  } catch (error) {
    console.error('ノード選択エラー:', error);
  }
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
  console.log('=== 受信メッセージ ===');
  console.log('タイプ:', msg.type);
  console.log('メッセージ内容:', msg);
  
  try {
    switch (msg.type) {
      case 'scan':
        console.log('スキャン処理開始');
        await handleScan(msg.config || DEFAULT_CONFIG);
        break;
        
      case 'apply-all':
        console.log('一括適用処理開始');
        await handleApplyAll(msg.results);
        break;
        
      case 'apply-selected':
        await handleApplySelected(msg.config || DEFAULT_CONFIG, msg.options);
        break;
        
      case 'select-nodes':
        console.log('ノード選択要求:', msg.nodeIds);
        await handleSelectNodes(msg.nodeIds);
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

// Initialize with saved config when plugin loads
loadConfig().then(config => {
  // Plugin is ready
}).catch(error => {
  console.warn('Plugin initialization warning:', error);
});