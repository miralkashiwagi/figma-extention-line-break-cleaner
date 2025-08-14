# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Figma plugin called "Line Break Cleaner" built with TypeScript. The plugin automatically detects and cleans unnecessary line breaks in Japanese and multilingual text nodes, with intelligent detection algorithms for different text layout scenarios. Features a tabbed interface with unified scan/apply workflow and intelligent selection-based processing.

## Development Commands

**Build the plugin:**
```bash
npm run build
```

**Watch mode for development:**
```bash
npm run watch
```

**Linting:**
```bash
npm run lint
npm run lint:fix
```

## Current Plugin Architecture

### Core Features

1. **Automatic Scope Detection**: Plugin automatically detects whether to process selected nodes or entire page
2. **Auto-width Text Processing**: Always-enabled processing of auto-width text nodes, converts to auto-height
3. **Visual Line Break Detection**: Uses word wrap simulation to detect actual visual line breaks, not just \n characters
4. **Soft Break Conversion**: Detects and converts LSEP (\u2028) and other soft break characters to normal line breaks
5. **Unified Apply Interface**: Single interface for both scan-based and direct application modes

### Detection Algorithms

**Auto-width Detection (Always Active):**
- Processes all `textAutoResize: "WIDTH"`, `"WIDTH_AND_HEIGHT"`, and fixed-size nodes with line breaks
- Minimum character threshold (default: 20, configurable)
- Automatically converts to `textAutoResize: "HEIGHT"`
- Applies intelligent line break removal

**Visual Line Break Detection:**
- Uses `simulateWordWrap()` to detect where lines actually break in Figma
- Accounts for word wrapping, not just explicit \n characters
- Calculates line width ratio vs container width using font metrics
- Configurable threshold (default: 0.8) for edge-breaking detection
- Handles Japanese, English, and mixed-language text accurately

**Soft Break Processing:**
- Auto-detects LSEP (\u2028), PSEP (\u2029), ZWSP (\u8203), BOM (\u65279) characters
- User-configurable soft break character set in textarea
- Converts soft breaks to normal line breaks (\n) when enabled
- Works in both scan and direct application modes

### Current UI Design

**Unified Operations Interface:**
- **"スキャン or 選択に適用"** section combines scan and direct application
- Real-time scan mode display: shows "ページ全体" or "選択範囲内 (Nタイプ)"
- **"適用内容"** checkboxes control what processing to apply:
  - 改行除去 (Line break removal)
  - ソフト改行は改行に変換 (Convert soft breaks to hard breaks)

**Intelligent Workflow:**
1. Plugin automatically detects current selection state
2. "スキャン実行" processes page/selection based on current context
3. Results show as selectable list with text content preview (50 chars)
4. "選択中のノードに適用" bypasses scan, processes current selection directly
5. "検出をクリア" clears results and resets state

**Settings Panel:**
- Configurable detection thresholds and character limits
- Soft break character textarea with Unicode auto-detection
- Detection type toggles (right-edge breaking, soft break detection)
- Font width multiplier for text width calculation tuning

### Advanced Features

**Selection Management:**
- Bidirectional sync between UI selection and Figma canvas
- Selection state preserved during operations
- Clear selection controls ("選択解除", "すべて選択")
- Auto-focus selected nodes in Figma interface

**Configuration Persistence:**
- Settings automatically saved using `figma.clientStorage`
- Configuration loaded on plugin startup
- Defaults restored if saved config corrupted

**Smart Processing:**
- Character-aware text width estimation (full-width vs half-width)
- Sentence boundary protection (preserves breaks after 。！？)
- Bullet point detection and preservation
- Font loading and validation before text manipulation

## Technical Implementation Details

### Word Wrap Simulation Engine
- `simulateWordWrap()` replicates Figma's text wrapping behavior
- Splits text by both explicit breaks (\n) and soft breaks (LSEP, etc.)
- Word-by-word width calculation using font metrics
- Handles mixed Japanese/English text correctly
- Critical for accurate right-edge breaking detection

### Text Processing Pipeline
```typescript
1. Font validation and loading
2. Word wrap simulation for visual line detection
3. Line-by-line analysis for break conditions:
   - Sentence endings (句読点)
   - Width ratio vs threshold
   - Bullet points and special cases
4. Intelligent line combination with proper spacing
5. Optional soft break conversion
6. TextNode property updates (characters, textAutoResize)
```

### Selection and Scope Management
- `findTextNodes()` method handles both page-wide and selection-based scanning
- Automatic detection of selection state for UI display
- `scannedNodeIds` Set tracks which nodes are in current result set
- Selection sync only active when scan results exist (performance optimization)

## TypeScript Configuration

- Target: ES6
- Strict mode enabled
- Figma plugin typings via `@figma/plugin-typings`
- Code must be compiled before plugin execution

## Important Implementation Details

### Processing Requirements
- Font loading required before any text manipulation
- Auto-width → auto-height conversion may cause layout shifts (user should be warned)
- Visual line break detection requires word wrap simulation
- All operations support undo via Figma's built-in history
- Missing/locked fonts handled gracefully with error reporting

### Performance Optimizations
- Chunked processing (50 nodes for analysis, 25 for processing) prevents UI freezing
- `yieldToUI()` provides breathing room during batch operations
- Selection monitoring only active when scan results exist
- Configuration caching reduces repeated storage access

### Current UI State Management
- No progress bars or cancel functionality (simplified UX)
- Real-time scan mode indication based on selection
- Automatic state cleanup on "検出をクリア"
- Persistent configuration across plugin sessions

### Critical Technical Considerations
- Word wrap simulation is essential for accurate detection
- Font metrics must account for character types (CJK vs Latin)
- Soft break characters need proper Unicode escaping in regex
- Selection sync must be efficient (uses Set operations)
- Configuration defaults must handle missing or corrupted saved data