// Line Break Cleaner - Figma Plugin for cleaning unnecessary line breaks
// This plugin helps identify and clean unnecessary line breaks in text nodes,
// with intelligent detection for Japanese and multilingual content.

// ===== CONSTANTS =====
const PROCESSING_CONSTANTS = {
  DEFAULT_FONT_SIZE: 16,
  DEFAULT_CONTAINER_WIDTH: 400,
  CHUNK_SIZE: 20,

  NOTIFICATION_TIMEOUTS: {
    COMPLETE: 3000,
    ERROR: 5000
  }
} as const;

// ===== TYPE DEFINITIONS =====

interface DetectedIssue {
  type: 'auto-width' | 'edge-breaking' | 'soft-break';
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



interface UIMessage {
  type: string;
  [key: string]: unknown;
}

// ===== UTILITY CLASSES =====
class SharedUtilities {
  private regexCache: RegexPatternCache;
  private widthCalculator: TextWidthCalculator;

  constructor(config: ProcessingConfig) {
    this.regexCache = new RegexPatternCache();
    this.widthCalculator = new TextWidthCalculator(config);
  }

  getBreakPattern(softBreakChars: string[]): RegExp {
    return this.regexCache.getBreakPattern(softBreakChars);
  }

  estimateTextWidth(text: string, fontSize: number): number {
    return this.widthCalculator.estimateTextWidth(text, fontSize);
  }

  static getFontSize(node: TextNode): number {
    return typeof node.fontSize === 'number' ? node.fontSize : PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE;
  }
}

class TextWidthCalculator {
  public config: ProcessingConfig;
  private measurementCache: Map<string, number> = new Map();
  private characterWidthCache: Map<string, number> = new Map();

  // キャッシュサイズの定数
  private static readonly CACHE_LIMITS = {
    MEASUREMENT: 500,  // テキスト全体のキャッシュ
    CHARACTER: 200     // 個別文字のキャッシュ（より小さく）
  } as const;

  // 正規表現は文字コードベース判定に置き換えたため削除

  // 文字コード定数（可読性と保守性向上）
  private static readonly CHAR_CODES = {
    // 数字
    DIGIT_0: 48, DIGIT_9: 57, DIGIT_1: 49,
    // 大文字
    UPPER_A: 65, UPPER_Z: 90, UPPER_I: 73, UPPER_M: 77, UPPER_W: 87,
    // 小文字
    LOWER_A: 97, LOWER_Z: 122, LOWER_I: 105, LOWER_L: 108,
    LOWER_T: 116, LOWER_F: 102, LOWER_M: 109, LOWER_W: 119,
    // 記号
    SPACE: 32, EXCLAMATION: 33, DOT: 46, COMMA: 44, COLON: 58,
    SEMICOLON: 59, HYPHEN: 45, PAREN_OPEN: 40, PAREN_CLOSE: 41,
    AT: 64, PERCENT: 37, AMPERSAND: 38
  } as const;

  // 最小限の特殊文字テーブル（文字コード・Unicode範囲判定でカバーできない例外のみ）
  private static readonly CHARACTER_WIDTH_MAP: ReadonlyMap<string, number> = new Map([
    // 特殊記号・通貨（高精度が必要な文字のみ）
    ['€', 0.6], ['£', 0.5], ['¥', 0.6], ['©', 0.7], ['®', 0.7], ['™', 0.7],
    ['°', 0.35], ['±', 0.5], ['×', 0.5], ['÷', 0.5], ['≠', 0.5], ['≤', 0.5], ['≥', 0.5],
    ['…', 0.7], ['–', 0.4], ['—', 0.7], ['\u2018', 0.2], ['\u2019', 0.2], ['\u201C', 0.35], ['\u201D', 0.35],
    ['•', 0.3], ['‰', 0.9], ['§', 0.5], ['¶', 0.5], ['†', 0.4], ['‡', 0.4]
  ]);

  constructor(config: ProcessingConfig) {
    this.config = config;
  }

  estimateTextWidth(text: string, fontSize: number): number {
    // 効率的なキャッシュキー生成（短いテキストのみキャッシュ）
    if (text.length <= 100) { // 長いテキストはキャッシュしない
      const cacheKey = `${text}_${fontSize}`;
      const cached = this.measurementCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    let totalWidth = 0;

    // 実際の文字幅に基づく計算
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charWidth = this.measureActualCharacterWidth(char, fontSize);
      totalWidth += charWidth;
    }

    // 効率的なキャッシュ管理（短いテキストのみ）
    if (text.length <= 100) {
      const cacheKey = `${text}_${fontSize}`;
      this.addToCache(this.measurementCache, cacheKey, totalWidth, TextWidthCalculator.CACHE_LIMITS.MEASUREMENT);
    }

    // デバッグモードでのみログ出力
    if (this.shouldDebugLog(text)) {
      this.logTextAnalysis(text, totalWidth, fontSize);
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

  private isWideLatinCharacter(char: string): boolean {
    // 幅広のラテン文字
    return /[MWQOCDG@%&ABDEFHKNPRSUVXYZ]/.test(char);
  }

  private isNarrowLatinCharacter(charCode: number): boolean {
    // 狭いラテン文字
    const char = String.fromCharCode(charCode);
    return /[iltjfI1|!.,;/()[\]]/.test(char);
  }

  private isPunctuation(charCode: number): boolean {
    // 句読点・記号類
    const char = String.fromCharCode(charCode);
    return /[！？。、，．：；「」『』（）【】〈〉《》〔〕［］｛｝]/.test(char);
  }

  private getCharacterBreakdown(text: string, fontSize: number): string {
    let fullWidth = 0, halfWidth = 0, wide = 0, narrow = 0, other = 0;
    let totalMeasuredWidth = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      const measuredWidth = this.measureActualCharacterWidth(char, fontSize);
      totalMeasuredWidth += measuredWidth;

      if (this.isFullWidthCharacter(charCode)) {
        fullWidth++;
      } else if (measuredWidth < fontSize * 0.3) {
        narrow++; // 実測で狭い文字
      } else if (measuredWidth > fontSize * 0.7) {
        wide++; // 実測で幅広い文字
      } else if (this.isHalfWidthCharacter(charCode)) {
        halfWidth++;
      } else {
        other++;
      }
    }

    return `全角:${fullWidth} 半角:${halfWidth} 幅広:${wide} 狭い:${narrow} その他:${other} (実測合計:${totalMeasuredWidth.toFixed(1)}px)`;
  }

  // デバッグログの条件判定
  private shouldDebugLog(text: string): boolean {
    // デバッグモードの判定（本番では false に設定）
    const DEBUG_MODE = false; // 開発時は true に変更
    return DEBUG_MODE && text.length > 10;
  }

  // デバッグ情報の出力
  private logTextAnalysis(text: string, totalWidth: number, fontSize: number): void {
    const breakdown = this.getCharacterBreakdown(text, fontSize);
    const halfWidthChars = this.getHalfWidthCharacters(text);

    console.log(`テキスト: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    console.log(`計算幅: ${totalWidth}px (${breakdown})`);

    if (halfWidthChars.length > 0) {
      console.log(`半角文字: "${halfWidthChars}"`);
    }
  }

  private getHalfWidthCharacters(text: string): string {
    // 効率的な文字列構築（配列結合を使用）
    const halfWidthChars: string[] = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charCode = char.charCodeAt(0);
      if (this.isHalfWidthCharacter(charCode)) {
        halfWidthChars.push(char);
      }
    }
    return halfWidthChars.join('');
  }

  // 実際の文字幅を測定（文字幅テーブルベース）
  private measureActualCharacterWidth(char: string, fontSize: number): number {
    const cacheKey = `${char}_${fontSize}`;
    if (this.characterWidthCache.has(cacheKey)) {
      return this.characterWidthCache.get(cacheKey)!;
    }

    // Figmaプラグイン環境ではDOM APIが使用できないため、
    // 文字幅テーブルベースの計算を使用
    const width = this.getFallbackCharacterWidth(char, fontSize);

    // 効率的なキャッシュ管理
    this.addToCache(this.characterWidthCache, cacheKey, width, TextWidthCalculator.CACHE_LIMITS.CHARACTER);

    return width;
  }

  // 効率的な文字幅計算
  private getFallbackCharacterWidth(char: string, fontSize: number): number {
    const charCode = char.charCodeAt(0);
    const baseMultiplier = this.config.fontWidthMultiplier || 1.0;

    // 全角文字の処理（最も頻繁なケース）
    if (this.isFullWidthCharacter(charCode)) {
      // 日本語句読点は通常の全角文字より若干狭い
      const multiplier = this.isPunctuation(charCode) ? 0.95 : 1.0;
      // baseMultiplierで全体的な調整を行う（UI設定の「フォント幅係数」）
      return fontSize * baseMultiplier * multiplier;
    }

    // 特殊文字テーブルから取得（例外的な幅のみ）
    const specialWidth = TextWidthCalculator.CHARACTER_WIDTH_MAP.get(char);
    if (specialWidth !== undefined) {
      return fontSize * baseMultiplier * specialWidth;
    }

    // 効率的な推定処理（大部分の文字）
    return fontSize * baseMultiplier * this.estimateUnknownCharacterWidth(char, charCode);
  }

  // 高速Unicode範囲判定
  private estimateUnknownCharacterWidth(char: string, charCode: number): number {
    // 基本ラテン文字範囲（最頻出）
    if (charCode <= 0x007E) {
      return charCode >= 0x0020 ? this.estimateLatinCharacterWidth(char) : 0.53;
    }

    // 高頻度範囲の早期判定
    if (charCode <= 0x00FF) return 0.58;  // ラテン1補助
    if (charCode <= 0x017F) return 0.58;  // ラテン拡張A

    // 特殊記号範囲（低頻度）
    if (charCode >= 0x2000) {
      if (charCode <= 0x206F) return 0.43;  // 一般句読点
      if (charCode >= 0x20A0 && charCode <= 0x20CF) return 0.63;  // 通貨記号
      if (charCode >= 0x2100 && charCode <= 0x214F) return 0.73;  // 文字様記号
    }

    // デフォルト値
    return 0.53;
  }

  // 超高速文字幅推定（文字コードベース、定数使用で可読性向上）
  private estimateLatinCharacterWidth(char: string): number {
    const charCode = char.charCodeAt(0);
    const { CHAR_CODES } = TextWidthCalculator;

    // 数字の高速判定
    if (charCode >= CHAR_CODES.DIGIT_0 && charCode <= CHAR_CODES.DIGIT_9) {
      return charCode === CHAR_CODES.DIGIT_1 ? 0.32 : 0.53;
    }

    // 大文字の高速判定
    if (charCode >= CHAR_CODES.UPPER_A && charCode <= CHAR_CODES.UPPER_Z) {
      if (charCode === CHAR_CODES.UPPER_M || charCode === CHAR_CODES.UPPER_W) return 0.85;
      if (charCode === CHAR_CODES.UPPER_I) return 0.32;
      return 0.68;
    }

    // 小文字の高速判定
    if (charCode >= CHAR_CODES.LOWER_A && charCode <= CHAR_CODES.LOWER_Z) {
      if (charCode === CHAR_CODES.LOWER_I || charCode === CHAR_CODES.LOWER_L) return 0.27;
      if (charCode === CHAR_CODES.LOWER_T || charCode === CHAR_CODES.LOWER_F) return 0.37;
      if (charCode === CHAR_CODES.LOWER_M || charCode === CHAR_CODES.LOWER_W) return 0.75;
      return 0.53;
    }

    // 基本記号の高速判定
    switch (charCode) {
      case CHAR_CODES.SPACE: return 0.27;
      case CHAR_CODES.EXCLAMATION: return 0.25;
      case CHAR_CODES.DOT: return 0.27;
      case CHAR_CODES.COMMA: return 0.27;
      case CHAR_CODES.COLON: return 0.27;
      case CHAR_CODES.SEMICOLON: return 0.27;
      case CHAR_CODES.HYPHEN: return 0.37;
      case CHAR_CODES.PAREN_OPEN: case CHAR_CODES.PAREN_CLOSE: return 0.3;
      case CHAR_CODES.AT: return 0.8;
      case CHAR_CODES.PERCENT: return 0.75;
      case CHAR_CODES.AMPERSAND: return 0.65;
      default: return 0.48;
    }
  }

  // 効率的なキャッシュ管理（LRU的な動作）
  private addToCache(cache: Map<string, number>, key: string, value: number, limit: number): void {
    if (cache.size >= limit) {
      // 最も古いエントリを削除
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
    cache.set(key, value);
  }

  // キャッシュクリア（メモリ管理用）
  public clearCaches(): void {
    this.measurementCache.clear();
    this.characterWidthCache.clear();
  }

  // キャッシュ統計（デバッグ用）
  public getCacheStats(): { measurement: number; character: number } {
    return {
      measurement: this.measurementCache.size,
      character: this.characterWidthCache.size
    };
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
}

// ===== TEXT ANALYZER CLASS =====
class TextAnalyzer {
  private config: ProcessingConfig;
  private utils: SharedUtilities;

  constructor(config: ProcessingConfig, utils: SharedUtilities) {
    this.config = config;
    this.utils = utils;
  }

  private getBreakPattern(): RegExp {
    return this.utils.getBreakPattern(this.config.softBreakChars);
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

    // 改行文字やソフト改行文字を含まないテキストは除外
    if (!this.hasBreakCharacters(currentText)) {
      return {
        node,
        issues: [],
        estimatedChanges: 'Skipped (no line breaks)',
        originalText: currentText
      };
    }

    const autoWidthIssues = this.detectAutoWidthIssues(node);
    issues.push(...autoWidthIssues);

    const edgeBreakingIssues = this.detectEdgeBreaking(node);
    issues.push(...edgeBreakingIssues);

    const softBreakIssues = this.detectSoftBreaks(node);
    issues.push(...softBreakIssues);

    const estimatedChanges = this.generateEstimatedChanges(issues);

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

      // WIDTH_AND_HEIGHTのテキストのみをauto-width問題として検出
      if (currentAutoResize === 'WIDTH_AND_HEIGHT' && currentText.includes('\n')) {
        issues.push({
          type: 'auto-width'
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
      const fontSize = SharedUtilities.getFontSize(node);

      const autoResize = node.textAutoResize;
      if (autoResize === 'NONE' || autoResize === 'HEIGHT') {
        const suspiciousLines = this.findEdgeBreakingLines(currentText, nodeWidth, fontSize);

        if (suspiciousLines.length > 0) {
          issues.push({
            type: 'edge-breaking'
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
            type: 'soft-break'
          });
        }
      }
    } catch (error) {
      console.warn('Could not analyze soft breaks for node:', node.name);
    }

    return issues;
  }



  private findEdgeBreakingLines(text: string, containerWidth: number, fontSize: number = PROCESSING_CONSTANTS.DEFAULT_FONT_SIZE): number[] {
    const lines = this.simulateWordWrap(text, containerWidth, fontSize);
    const suspiciousLines: number[] = [];

    lines.forEach((line, index) => {
      if (line.trim().length > 0) {
        const estimatedWidth = this.utils.estimateTextWidth(line.trim(), fontSize);
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
    // 分析時は全ての改行文字（通常の改行とソフト改行）を考慮する
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
        const estimatedWidth = this.utils.estimateTextWidth(testLine, fontSize);

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



  private generateEstimatedChanges(issues: DetectedIssue[]): string {
    if (issues.length === 0) {
      return 'No changes needed';
    }

    const changeTypes = new Set<string>();

    issues.forEach(issue => {
      switch (issue.type) {
        case 'auto-width':
          changeTypes.add('幅＆改行');
          break;
        case 'edge-breaking':
          changeTypes.add('改行');
          break;
        case 'soft-break':
          changeTypes.add('ソフト改行');
          break;
      }
    });

    return Array.from(changeTypes).join(', ');
  }

  private hasBreakCharacters(text: string): boolean {
    // 通常の改行文字をチェック
    if (text.includes('\n')) {
      return true;
    }

    // ソフト改行文字をチェック
    for (const softBreakChar of this.config.softBreakChars) {
      if (text.includes(softBreakChar)) {
        return true;
      }
    }

    return false;
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
}//
// ===== TEXT PROCESSOR CLASS =====
class TextProcessor {
  private config: ProcessingConfig;
  private utils: SharedUtilities;

  constructor(config: ProcessingConfig, utils: SharedUtilities) {
    this.config = config;
    this.utils = utils;
  }

  private getBreakPattern(): RegExp {
    return this.utils.getBreakPattern(this.config.softBreakChars);
  }

  generateChanges(originalText: string, issues: DetectedIssue[], node: TextNode): ProcessingChanges {
    const changes: ProcessingChanges = {};
    let processedText = originalText;

    const fontSize = SharedUtilities.getFontSize(node);

    if (node.textAutoResize === 'WIDTH_AND_HEIGHT') {
      changes.newAutoResize = 'HEIGHT';
      processedText = this.removeLineBreaksJapanesePriority(processedText, node.width, fontSize);
    } else {
      for (const issue of issues) {
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

    // 通常の改行文字（\n）のみを処理対象とする
    // ソフト改行文字は元のまま保持し、convertSoftBreaksオプションで別途処理される
    const lines = text.split('\n');
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
        const estimatedWidth = this.utils.estimateTextWidth(currentTrimmed, fontSize);
        const widthRatio = estimatedWidth / containerWidth;

        if (widthRatio >= this.config.lineBreakThreshold) {
          shouldBreakAfter[i] = false;  // 幅が閾値以上なら改行を削除
        } else {
          shouldBreakAfter[i] = true;   // 幅が閾値未満なら改行を保持
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

  // パブリックメソッド：外部からの直接処理用
  public processTextDirectly(
    text: string,
    containerWidth: number,
    fontSize: number,
    options: {
      removeLineBreaks?: boolean;
      convertSoftBreaks?: boolean;
    }
  ): string {
    let processedText = text;

    if (options.removeLineBreaks) {
      processedText = this.removeLineBreaksJapanesePriority(processedText, containerWidth, fontSize, true);
    }

    if (options.convertSoftBreaks) {
      processedText = this.convertSoftBreaksToHard(processedText);
    }

    return processedText;
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
  private analyzer: TextAnalyzer;
  private processor: TextProcessor;
  private fontManager: FontManager;
  private config: ProcessingConfig;
  private utils: SharedUtilities;

  constructor(config: ProcessingConfig) {
    this.config = config;
    this.utils = new SharedUtilities(config);
    this.analyzer = new TextAnalyzer(config, this.utils);
    this.processor = new TextProcessor(config, this.utils);
    this.fontManager = new FontManager();
  }

  async analyzeNodes(
    nodes: TextNode[]
  ): Promise<TextAnalysisResult[]> {
    this.isProcessing = true;

    const results: TextAnalysisResult[] = [];
    const CHUNK_SIZE = PROCESSING_CONSTANTS.CHUNK_SIZE;

    try {
      for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
        const chunk = nodes.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const node = chunk[j];
          const _currentIndex = i + j;

          try {
            const result = await this.analyzer.analyzeTextNode(node);
            results.push(result);

          } catch (error) {
            results.push({
              node,
              issues: [],
              estimatedChanges: `Analysis error: ${error}`,
              originalText: node.characters || ''
            });
          }
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
    analysisResults: TextAnalysisResult[]
  ): Promise<ProcessingResult[]> {
    this.isProcessing = true;

    const results: ProcessingResult[] = [];
    const nodesToProcess = analysisResults.filter(result => result.issues.length > 0);
    const CHUNK_SIZE = PROCESSING_CONSTANTS.CHUNK_SIZE;

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
        const chunk = processable.slice(i, i + CHUNK_SIZE);

        for (let j = 0; j < chunk.length; j++) {
          const node = chunk[j];
          const _currentIndex = i + j;

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

          } catch (error) {
            results.push({
              node,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

    } catch (error) {
      throw new Error(`Batch processing failed: ${error}`);
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  async scanCurrentPage(): Promise<TextAnalysisResult[]> {
    const allNodes = this.analyzer.findTextNodes();

    return await this.analyzeNodes(allNodes);
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

        const fontSize = SharedUtilities.getFontSize(node);
        processedText = this.processor.processTextDirectly(processedText, node.width, fontSize, forceChanges);

        if (forceChanges.removeLineBreaks && node.textAutoResize === 'WIDTH_AND_HEIGHT') {
          changes.newAutoResize = 'HEIGHT';
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





}

// ===== DEFAULT CONFIGURATION =====
const DEFAULT_CONFIG: ProcessingConfig = {
  minCharacters: 20,
  lineBreakThreshold: 0.95,
  softBreakChars: ['\u2028'],
  fontWidthMultiplier: 1.0
};

// ===== MAIN PLUGIN LOGIC =====
let batchProcessor: BatchProcessor | null = null;
let currentResults: TextAnalysisResult[] = [];
let currentConfig: ProcessingConfig | null = null;

async function loadConfig(): Promise<ProcessingConfig> {
  try {
    const saved = await figma.clientStorage.getAsync('line-break-cleaner-config');
    if (!saved) return DEFAULT_CONFIG;

    // 有効な値のみをマージ（falsyな値はデフォルト値を使用）
    return {
      minCharacters: (typeof saved.minCharacters === 'number' && saved.minCharacters > 0)
        ? saved.minCharacters : DEFAULT_CONFIG.minCharacters,
      lineBreakThreshold: (typeof saved.lineBreakThreshold === 'number' && saved.lineBreakThreshold > 0)
        ? saved.lineBreakThreshold : DEFAULT_CONFIG.lineBreakThreshold,
      fontWidthMultiplier: (typeof saved.fontWidthMultiplier === 'number' && saved.fontWidthMultiplier > 0)
        ? saved.fontWidthMultiplier : DEFAULT_CONFIG.fontWidthMultiplier,
      softBreakChars: (Array.isArray(saved.softBreakChars) && saved.softBreakChars.length > 0)
        ? saved.softBreakChars : DEFAULT_CONFIG.softBreakChars
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(config: ProcessingConfig): Promise<void> {
  try {
    // UI から受け取った設定をデフォルト値とマージして保存
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    await figma.clientStorage.setAsync('line-break-cleaner-config', mergedConfig);
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
        await handleScan(msg.config as ProcessingConfig);
        break;

      case 'apply-selected':
        await handleApplySelected(msg.config as ProcessingConfig, msg.options as {
          removeLineBreaks?: boolean;
          convertSoftBreaks?: boolean;
          selectedNodeIds?: string[];
        });
        break;

      case 'select-nodes':
        handleSelectNodes(msg.nodeIds as string[]);
        break;

      case 'get-current-selection':
        updateSelectionState();
        break;

      case 'load-config': {
        const config = await loadConfig();
        sendMessage({
          type: 'config-loaded',
          config
        });
        break;
      }

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

function isConfigChanged(oldConfig: ProcessingConfig | null, newConfig: ProcessingConfig): boolean {
  if (!oldConfig) return true;

  return (
    oldConfig.minCharacters !== newConfig.minCharacters ||
    oldConfig.lineBreakThreshold !== newConfig.lineBreakThreshold ||
    oldConfig.fontWidthMultiplier !== newConfig.fontWidthMultiplier ||
    oldConfig.softBreakChars.length !== newConfig.softBreakChars.length ||
    oldConfig.softBreakChars.some((char, i) => char !== newConfig.softBreakChars[i])
  );
}

function getBatchProcessor(config: ProcessingConfig): BatchProcessor {
  // 設定が変更された場合のみ新しいインスタンスを作成
  if (!batchProcessor || isConfigChanged(currentConfig, config)) {
    batchProcessor = new BatchProcessor(config);
    currentConfig = { ...config };
  }
  return batchProcessor;
}

async function handleScan(config: ProcessingConfig): Promise<void> {
  await saveConfig(config);
  const processor = getBatchProcessor(config);

  try {
    currentResults = await processor.scanCurrentPage();

    // スキャン完了通知
    const issuesFound = currentResults.filter(r => r.issues && r.issues.length > 0).length;
    if (issuesFound > 0) {
      figma.notify(`スキャン完了: ${issuesFound}つのテキストを検出`, {
        timeout: PROCESSING_CONSTANTS.NOTIFICATION_TIMEOUTS.COMPLETE
      });
    } else {
      figma.notify('スキャン完了: 対象となるテキストは見つかりませんでした', {
        timeout: PROCESSING_CONSTANTS.NOTIFICATION_TIMEOUTS.COMPLETE
      });
    }

    sendMessage({
      type: 'scan-complete',
      results: currentResults,
      scanInfo: getScanModeInfo()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Scan failed';
    figma.notify(`スキャンエラー: ${errorMessage}`, {
      error: true,
      timeout: PROCESSING_CONSTANTS.NOTIFICATION_TIMEOUTS.ERROR
    });

    sendMessage({
      type: 'error',
      message: errorMessage
    });
  }
}

async function handleApplySelected(config: ProcessingConfig, options: {
  removeLineBreaks?: boolean;
  convertSoftBreaks?: boolean;
  selectedNodeIds?: string[];
}): Promise<void> {
  await saveConfig(config);
  const processor = getBatchProcessor(config);

  try {
    const selection = figma.currentPage.selection;
    const selectedTextNodes = selection.filter(node => node.type === 'TEXT') as TextNode[];

    // スキャン結果からUIで選択されたノードも取得
    // （この情報はUI側から送信される必要があるため、現在は空配列）
    const scanSelectedNodeIds = options.selectedNodeIds || [];
    const scanSelectedNodes = scanSelectedNodeIds
      .map((id: string) => figma.currentPage.findOne(node => node.id === id && node.type === 'TEXT'))
      .filter((node: SceneNode | null) => node !== null) as TextNode[];

    // 重複を除去して全処理対象ノードを取得
    const allNodesToProcess = new Map<string, TextNode>();

    // 手動選択されたノード
    selectedTextNodes.forEach(node => {
      allNodesToProcess.set(node.id, node);
    });

    // スキャン結果から選択されたノード
    scanSelectedNodes.forEach(node => {
      allNodesToProcess.set(node.id, node);
    });

    const totalNodes = allNodesToProcess.size;
    let processedCount = 0;

    if (totalNodes === 0) {
      sendMessage({
        type: 'warning',
        message: 'クリーニング対象のテキストが選択されていません'
      });
      return;
    }

    // UI側にクリーニング開始を通知
    sendMessage({
      type: 'processing-start',
      count: totalNodes
    });

    // 全ノードをユーザーオプションに従って処理
    for (const node of allNodesToProcess.values()) {
      const result = await processor.processIndividualNode(node, {
        removeLineBreaks: options.removeLineBreaks,
        convertSoftBreaks: options.convertSoftBreaks
      });

      if (result.success) {
        processedCount++;
      }
    }

    figma.notify(`クリーニング完了！${processedCount}つのテキストを処理しました`, {
      timeout: PROCESSING_CONSTANTS.NOTIFICATION_TIMEOUTS.COMPLETE
    });

    // UI側にクリーニング完了を通知
    sendMessage({
      type: 'processing-complete',
      processedCount: processedCount
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
  height: 600
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