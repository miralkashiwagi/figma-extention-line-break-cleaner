# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Figma plugin called "Line Break Cleaner" built with TypeScript. The plugin automatically detects and cleans unnecessary line breaks in Japanese and multilingual text nodes, with intelligent detection algorithms for different text layout scenarios. Features a tabbed interface with scan-based workflow and manual selection tools.

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

## Plugin Functionality

### Core Features

1. **Auto-width Text Cleaning**: Always-enabled detection of auto-width text nodes with unnecessary line breaks and converts them to auto-height
2. **Right-edge Line Break Detection**: Identifies line breaks that occur at the edge of text containers using visual word wrap simulation
3. **Soft Break Conversion**: Converts soft line breaks (LSEP \u2028) to hard breaks when selected
4. **Manual Selection Tools**: Allows users to manually clean selected text nodes with configurable options

### Detection Algorithms

**Auto-width Detection (Always Enabled):**
- Targets `textAutoResize: "WIDTH"` nodes
- Minimum character threshold (default: 20)
- Converts to `textAutoResize: "HEIGHT"`
- Applies line break removal policy

**Right-edge Breaking Detection:**
- Works on fixed size or auto-height nodes
- Uses word wrap simulation to detect visual line breaks (not just \n characters)
- Calculates line width ratio vs container width using font metrics
- Configurable threshold (default: 0.8)
- Properly handles word wrapping in Japanese and multilingual text

**Soft Break Handling:**
- Detects and converts LSEP characters (\u2028) to normal line breaks (\n)
- User-configurable soft break character set
- Optional conversion during both scan and manual operations

### Current UI Design

**Tabbed Interface:**
- **操作 (Operations) Tab**: Scan execution, results display, manual tools
- **設定 (Settings) Tab**: Detection configuration, thresholds, soft break characters

**Scan-based Workflow:**
1. Configure detection settings in Settings tab
2. Run scan to detect problematic text nodes
3. View results as selectable list showing text content preview
4. Select individual nodes or use "すべて選択" (select all)
5. Apply changes to selected nodes only

**Manual Tools:**
- Process currently selected Figma nodes
- Independent checkboxes for line break removal and soft break conversion
- Bypasses scan process for direct application

## Architecture

The plugin follows Figma's standard plugin architecture:

- **Main plugin code**: `code.ts` (compiles to `code.js`)
  - Text node analysis and processing logic
  - Word wrap simulation for accurate line break detection
  - Font loading and text metrics calculation
  - Figma API interactions for text manipulation

- **UI code**: `ui.html`
  - Tabbed interface with operations and settings panels
  - Scan results displayed as selectable list with text content preview
  - Bidirectional selection sync between UI and Figma canvas
  - Configuration controls for detection thresholds and soft break characters

- **Text Processing Logic**:
  - Line break removal with sentence boundary protection
  - Word wrap simulation using font metrics
  - Soft break character detection and conversion
  - Visual line break analysis vs explicit line break characters

## Key UI Components

1. **Detection Configuration (Settings Tab)**
   - Minimum character count threshold
   - Right-edge breaking ratio threshold (0.1-1.0)
   - Font width multiplier for estimation tuning
   - User-editable soft break character textarea
   - Detection type toggles (right-edge, soft break)

2. **Scan Results Interface (Operations Tab)**
   - Results displayed as clickable list items with checkboxes
   - Text content preview (50 characters) instead of node names
   - "すべて選択" and "選択解除" buttons for bulk selection
   - Bidirectional selection sync with Figma canvas

3. **Manual Tools (Operations Tab)**
   - "選択中のノードに適用" button for direct processing
   - Independent checkboxes for line break removal and soft break conversion
   - Works on current Figma selection without scanning

## Technical Implementation Details

### Word Wrap Simulation
- `simulateWordWrap()` method accurately detects visual line breaks
- Splits text into words while preserving spaces
- Calculates estimated width using font metrics and character type detection
- Breaks lines when estimated width exceeds container width
- Returns array of visually accurate lines for right-edge detection

### Selection Synchronization
- UI selection changes automatically update Figma canvas selection
- Figma selection changes reflected in UI when nodes are in scan results
- Selection state preserved during scan operations
- Efficient tracking using Set data structure

### Font Metrics and Text Width Estimation
- Character-specific width estimation for Japanese and Latin characters
- Configurable font width multiplier for fine-tuning
- Proper handling of different font sizes and families
- Accurate estimation crucial for right-edge breaking detection

## TypeScript Configuration

- Target: ES6
- Strict mode enabled
- Figma plugin typings included via `@figma/plugin-typings`
- Code must be compiled before the plugin can run in Figma

## Important Implementation Notes

### Core Processing Requirements
- Text processing requires font loading before manipulation
- Auto-width to auto-height conversion may cause layout shifts
- Line width calculations use word wrap simulation for accuracy
- All text operations should be undoable
- Missing fonts must be handled gracefully with user warnings

### Current UI State Management
- No progress display or cancellation functionality (removed)
- Simple scan → select → apply workflow
- Results state cleared on each new scan
- Selection state synchronized between UI and Figma
- Manual tools operate independently of scan results

### Technical Considerations
- Word wrap simulation critical for accurate line break detection
- Visual line breaks vs explicit \n characters properly differentiated
- Soft break characters (LSEP) handled with Unicode escaping
- Font metrics estimation tunable via UI multiplier setting
- Right-edge threshold adjustable for testing and user preference