# Line Break Cleaner - 詳細実装計画

## Phase 1: 基盤構築 (Foundation)

### 1-1. プロジェクト構造設計
```
src/
├── main/
│   ├── code.ts              # メインプラグインコード
│   ├── textAnalyzer.ts      # テキスト解析ロジック
│   ├── textProcessor.ts     # テキスト処理ロジック
│   ├── fontManager.ts       # フォント管理
│   └── batchProcessor.ts    # バッチ処理管理
├── ui/
│   ├── ui.html             # メインUI
│   ├── styles.css          # スタイル
│   ├── ui.js               # UI制御ロジック
│   └── components/         # UIコンポーネント
└── types/
    └── interfaces.ts       # 型定義
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
1. **フォント管理システム** (`fontManager.ts`)
   ```typescript
   class FontManager {
     async loadRequiredFonts(nodes: TextNode[]): Promise<void>
     checkMissingFonts(nodes: TextNode[]): MissingFont[]
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

3. **Auto-width → Auto-height変換**
   ```typescript
   async function convertToAutoHeight(node: TextNode): Promise<void> {
     // フォント読み込み
     // textAutoResize変更
     // テキスト処理適用
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

### 3-2. プログレス管理
- リアルタイムプログレス表示
- 処理時間推定
- キャンセル機能
- エラーハンドリング

## Phase 4: ユーザーインターフェース (UI)

### 4-1. メイン画面設計
```html
<!-- 設定セクション -->
<div class="config-section">
  <h3>検出設定</h3>
  <input type="number" id="min-chars" value="20" />
  <input type="number" id="edge-threshold" value="0.92" step="0.01" />
  <textarea id="soft-break-chars"><!-- 設定可能な改行文字 --></textarea>
</div>

<!-- 操作セクション -->
<div class="actions-section">
  <button id="scan">スキャン実行</button>
  <button id="apply-all">一括適用</button>
  <button id="cancel">キャンセル</button>
</div>

<!-- 結果表示 -->
<div class="results-section">
  <div class="progress-bar"></div>
  <div class="results-list"></div>
</div>
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

### 5-1. 安全機能実装
```typescript
class SafetyManager {
  validateBeforeProcessing(nodes: TextNode[]): ValidationResult {
    // Missing font チェック
    // レイヤーロック状態確認
    // 大容量ファイル警告
  }
  
  createUndoSnapshot(nodes: TextNode[]): UndoSnapshot {
    // 変更前状態の保存
  }
  
  applyUndo(snapshot: UndoSnapshot): void {
    // 変更の復元
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

### 2. 大容量対応
- Web Worker検討（Figma制約により制限的）
- 適切なチャンクサイズの決定

### 3. 設定の永続化
- Figma ClientStorage API使用
- ユーザー設定の保存・復元

## 実装上の重要ポイント

### フォント処理
- フォント読み込み前の処理は避ける
- Missing fontの適切な警告表示
- フォント読み込み失敗時の graceful degradation

### パフォーマンス
- 大量のテキストノード処理時のメモリ管理
- UI freezeを避ける非同期処理
- 適切なプログレス表示

### ユーザビリティ
- 分かりやすいエラーメッセージ
- 操作のキャンセル機能
- 設定の保存・復元

この計画に沿って段階的に実装を進めることで、堅牢で高性能なLine Break Cleanerプラグインを構築できます。