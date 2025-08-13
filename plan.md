# Line Break Cleaner - 詳細実装計画

## Phase 1: 基盤構築 (Foundation)

### 1-1. プロジェクト構造設計（Figma Plugin仕様準拠）
```
├── code.ts                 # メインプラグインコード（Figma必須構造）
├── ui.html                 # プラグインUI（Figma必須構造）
├── src/                    # 実装ロジック分割
│   ├── textAnalyzer.ts     # テキスト解析ロジック
│   ├── textProcessor.ts    # テキスト処理ロジック
│   ├── fontManager.ts      # フォント管理
│   ├── batchProcessor.ts   # バッチ処理管理
│   └── interfaces.ts       # 型定義
├── manifest.json           # プラグインマニフェスト
├── package.json            # 依存関係・ビルド設定
└── tsconfig.json           # TypeScript設定
```

### 1-2. 型定義とインターfaces
```typescript
// 基本型定義
interface TextAnalysisResult {
  node: TextNode;
  issues: DetectedIssue[];
  estimatedChanges: string;
}

interface DetectedIssue {
  type: 'auto-width' | 'edge-breaking' | 'soft-break';
  confidence: number;
  description: string;
  lineNumbers: number[];
}

interface ProcessingConfig {
  minCharacters: number;
  edgeThreshold: number;
  softBreakChars: string[];
  excludePatterns: string[];
  enabledDetections: DetectionType[];
}
```

## Phase 2: コア機能実装 (Core Features)

### 2-1. テキスト解析エンジン
**実装順序:**
1. **基本テキストノード検出** (`textAnalyzer.ts`)
   - ページ内全テキストノード取得
   - フィルタリング（文字数、レイヤー名など）
   
2. **Auto-width検出ロジック**
   ```typescript
   function detectAutoWidthIssues(node: TextNode): DetectedIssue[] {
     // textAutoResize === "WIDTH" をチェック
     // 文字数閾値チェック
     // 改行文字の存在チェック
   }
   ```

3. **Edge-breaking検出ロジック**
   ```typescript
   function detectEdgeBreaking(node: TextNode): DetectedIssue[] {
     // 行ごとの推定幅計算
     // コンテナ幅との比較
     // 閾値チェック
   }
   ```

4. **Soft-break検出ロジック**
   ```typescript
   function detectSoftBreaks(node: TextNode): DetectedIssue[] {
     // paragraphSpacing チェック
     // ソフト改行文字検出
     // 変換候補特定
   }
   ```

### 2-2. テキスト処理エンジン
**実装順序:**
1. **フォント管理システム** (`fontManager.ts`) - **Figma API準拠**
   ```typescript
   class FontManager {
     // Figma API: figma.loadFontAsync() を使用
     async loadRequiredFonts(nodes: TextNode[]): Promise<void> {
       for (const node of nodes) {
         if (node.fontName !== figma.mixed) {
           await figma.loadFontAsync(node.fontName);
         } else {
           // 混在フォントの場合: getRangeAllFontNames使用
           const fontNames = node.getRangeAllFontNames(0, node.characters.length);
           for (const fontName of fontNames) {
             await figma.loadFontAsync(fontName);
           }
         }
       }
     }
     
     // Figma API: hasMissingFont プロパティ使用
     checkMissingFonts(nodes: TextNode[]): TextNode[] {
       return nodes.filter(node => node.hasMissingFont);
     }
     
     // Canvas APIでの実測（Figma Plugin環境制限あり）
     estimateTextWidth(text: string, fontSize: number, fontName: string): number
   }
   ```

2. **日本語優先改行除去**
   ```typescript
   function removeLineBreaksJapanesePriority(text: string): string {
     // 句読点前後の改行処理
     // 日本語文字間の改行除去
     // 英数字境界の改行保持
   }
   ```

3. **Auto-width → Auto-height変換** - **Figma API準拠**
   ```typescript
   async function convertToAutoHeight(node: TextNode): Promise<void> {
     // 1. Missing fontチェック（Figma API必須）
     if (node.hasMissingFont) {
       throw new Error(`Missing font in node: ${node.name}`);
     }
     
     // 2. フォント読み込み（Figma API必須）
     if (node.fontName !== figma.mixed) {
       await figma.loadFontAsync(node.fontName);
     } else {
       const fontNames = node.getRangeAllFontNames(0, node.characters.length);
       for (const fontName of fontNames) {
         await figma.loadFontAsync(fontName);
       }
     }
     
     // 3. textAutoResize変更（Figma API）
     node.textAutoResize = "HEIGHT";
     
     // 4. テキスト処理適用
     const processedText = removeLineBreaksJapanesePriority(node.characters);
     node.characters = processedText;
   }
   ```

## Phase 3: バッチ処理システム (Batch Processing)

### 3-1. 非同期処理フレームワーク
```typescript
class BatchProcessor {
  private isProcessing = false;
  private isCancelled = false;
  
  async processBatch(
    nodes: TextNode[], 
    config: ProcessingConfig,
    onProgress: (progress: number, current: string) => void
  ): Promise<ProcessingResult[]> {
    // チャンク分割処理
    // プログレス更新
    // キャンセル チェック
    // タイムアウト管理
  }
  
  cancel(): void {
    this.isCancelled = true;
  }
}
```

### 3-2. プログレス管理（Figma Plugin制約考慮）
```typescript
// Figma Pluginでは figma.ui.postMessage でUI更新
class ProgressManager {
  updateProgress(current: number, total: number, currentNode: string) {
    figma.ui.postMessage({
      type: 'progress-update',
      progress: Math.round((current / total) * 100),
      currentNode,
      message: `Processing ${current}/${total}: ${currentNode}`
    });
  }
  
  // Figma Plugin環境では setTimeout/setInterval 使用可
  async processWithYield(callback: () => Promise<void>): Promise<void> {
    await callback();
    // UI更新のための短い遅延
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

## Phase 4: ユーザーインターフェース (UI)

### 4-1. メイン画面設計（Figma Plugin UI仕様）
```html
<!-- ui.html - Figma Plugin必須ファイル -->
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Figma Plugin UI推奨スタイル */
    body { font-family: 'Inter', sans-serif; margin: 16px; }
    button { background: #18A0FB; color: white; border: none; padding: 8px 16px; }
  </style>
</head>
<body>
  <!-- 設定セクション -->
  <div class="config-section">
    <h3>検出設定</h3>
    <label>最小文字数: <input type="number" id="min-chars" value="20" /></label>
    <label>右端閾値: <input type="number" id="edge-threshold" value="0.92" step="0.01" /></label>
    <label>ソフト改行文字: 
      <textarea id="soft-break-chars" rows="3">​\u200B&#8203;</textarea>
    </label>
  </div>

  <!-- 操作セクション -->
  <div class="actions-section">
    <button id="scan">スキャン実行</button>
    <button id="apply-all">一括適用</button>
    <button id="cancel">キャンセル</button>
  </div>

  <!-- 結果表示 -->
  <div class="results-section">
    <div class="progress-bar" style="display:none;">
      <div class="progress-fill"></div>
      <span class="progress-text"></span>
    </div>
    <div class="results-list"></div>
  </div>

  <script>
    // Figma Plugin UI通信: parent.postMessage使用
    document.getElementById('scan').onclick = () => {
      parent.postMessage({ pluginMessage: { type: 'scan' } }, '*');
    };
    
    // プラグイン側からのメッセージ受信
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      if (msg.type === 'progress-update') {
        updateProgress(msg.progress, msg.message);
      }
    };
  </script>
</body>
</html>
```

### 4-2. 結果表示とコントロール
- 検出結果リスト
- 個別ノードプレビュー
- ジャンプ機能
- 除外設定

### 4-3. 手動選択ツール
```html
<div class="manual-tools">
  <h3>選択中のノード</h3>
  <button id="apply-selected">選択に適用</button>
  <div class="manual-options">
    <label><input type="checkbox" id="remove-line-breaks">改行除去</label>
    <label><input type="checkbox" id="normalize-spaces">スペース正規化</label>
  </div>
</div>
```

## Phase 5: 安全機能とエラーハンドリング

### 5-1. 安全機能実装（Figma API準拠）
```typescript
class SafetyManager {
  validateBeforeProcessing(nodes: TextNode[]): ValidationResult {
    const issues: string[] = [];
    
    // Missing font チェック（Figma API）
    const missingFontNodes = nodes.filter(node => node.hasMissingFont);
    if (missingFontNodes.length > 0) {
      issues.push(`Missing fonts in ${missingFontNodes.length} nodes`);
    }
    
    // レイヤーロック状態確認（Figma API）
    const lockedNodes = nodes.filter(node => node.locked);
    if (lockedNodes.length > 0) {
      issues.push(`Locked layers: ${lockedNodes.length} nodes`);
    }
    
    // 大容量ファイル警告
    if (nodes.length > 1000) {
      issues.push(`Large dataset warning: ${nodes.length} nodes`);
    }
    
    return { valid: issues.length === 0, issues };
  }
  
  // Figma Plugin: figma.currentPage.selection で元に戻す
  createUndoSnapshot(): void {
    // Figmaの標準Undo機能を活用
    // プラグイン処理は自動的にUndoスタックに追加される
  }
}
```

### 5-2. エラーハンドリング
- フォント読み込みエラー
- メモリ不足対応
- タイムアウト処理
- ユーザーフレンドリーなエラーメッセージ

## Phase 6: 最適化とテスト

### 6-1. パフォーマンス最適化
- 処理の並列化
- メモリ使用量最適化
- UI応答性の向上
- キャッシュ機能

### 6-2. テストケース作成
- 各種テキストパターンでのテスト
- 大容量ファイルでの性能テスト
- エラーケースのテスト
- ブラウザ互換性テスト

## 実装スケジュール

| Phase | 期間 | 主要タスク |
|-------|------|-----------|
| Phase 1 | 1-2日 | プロジェクト構造、型定義 |
| Phase 2 | 3-4日 | コア機能実装 |
| Phase 3 | 2-3日 | バッチ処理システム |
| Phase 4 | 2-3日 | UI実装 |
| Phase 5 | 1-2日 | 安全機能 |
| Phase 6 | 1-2日 | 最適化、テスト |

## 技術的考慮事項

### 1. フォント計算の精度向上
- Canvas APIを使用した実測ベースの幅計算
- フォールバック機能

### 2. 大容量対応（Figma Plugin制約）
- ❌ Web Worker使用不可（Figma Plugin環境制限）
- ✅ setTimeout/setIntervalによる処理分割
- ✅ 適切なチャンクサイズの決定（推奨：50-100ノード/チャンク）
- ✅ figma.ui.postMessageでのプログレス更新

### 3. 設定の永続化（Figma API）
```typescript
// Figma ClientStorage API使用
await figma.clientStorage.setAsync('line-break-cleaner-config', {
  minCharacters: 20,
  edgeThreshold: 0.92,
  softBreakChars: ['​', '\u200B', '&#8203;']
});

const config = await figma.clientStorage.getAsync('line-break-cleaner-config');
```

## Figma Plugin実装上の重要ポイント

### フォント処理（Figma API制約）
```typescript
// ✅ 正しい実装
async function processTextNode(node: TextNode) {
  if (node.hasMissingFont) {
    figma.ui.postMessage({ type: 'warning', message: `Skipping node with missing font: ${node.name}` });
    return;
  }
  
  // 必須：フォント読み込み
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
  } else {
    const fonts = node.getRangeAllFontNames(0, node.characters.length);
    for (const font of fonts) {
      await figma.loadFontAsync(font);
    }
  }
  
  // テキスト変更
  node.characters = processedText;
}
```

### パフォーマンス（Figma Plugin環境）
```typescript
// ✅ 推奨：チャンク処理
async function processBatch(nodes: TextNode[]) {
  const CHUNK_SIZE = 50; // Figma推奨
  
  for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
    const chunk = nodes.slice(i, i + CHUNK_SIZE);
    
    for (const node of chunk) {
      await processTextNode(node);
    }
    
    // UI更新とプログレス表示
    figma.ui.postMessage({ 
      type: 'progress', 
      value: Math.round((i / nodes.length) * 100) 
    });
    
    // UI応答性確保
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

### UI通信（Figma Plugin必須パターン）
```typescript
// code.ts（メインプラグイン）
figma.showUI(__html__, { width: 300, height: 500 });

figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'scan':
      const nodes = figma.currentPage.findAll(n => n.type === 'TEXT') as TextNode[];
      await processBatch(nodes);
      break;
    case 'cancel':
      // キャンセル処理
      break;
  }
};

// ui.html（UI側）
parent.postMessage({ pluginMessage: { type: 'scan' } }, '*');

window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  // プログレス更新など
};
```

### ノード検索とフィルタリング（Figma API）
```typescript
// ✅ 効率的なノード検索
const textNodes = figma.currentPage.findAll(node => {
  return node.type === 'TEXT' && 
         !node.locked && 
         node.visible &&
         node.characters.length >= minCharacters;
}) as TextNode[];

// 選択中のノードのみ処理する場合
const selectedTextNodes = figma.currentPage.selection.filter(
  node => node.type === 'TEXT'
) as TextNode[];
```

この計画はFigma Plugin APIの制約と推奨事項に完全準拠しており、実装時の技術的問題を最小化します。