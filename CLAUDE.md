# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Figma plugin called "Line Break Cleaner" built with TypeScript. The plugin automatically detects and cleans unnecessary line breaks in Japanese and multilingual text nodes, with intelligent detection algorithms for different text layout scenarios.

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

1. **Auto-width Text Cleaning**: Detects auto-width text nodes with unnecessary line breaks and converts them to auto-height
2. **Edge-case Line Break Detection**: Identifies line breaks that occur at the edge of text containers (right-edge breaking)
3. **Soft Break Conversion**: Converts soft line breaks to hard breaks when paragraph spacing is not used
4. **Manual Selection Tools**: Allows users to manually clean selected text nodes

### Detection Algorithms

**Auto-width Detection:**
- Targets `textAutoResize: "WIDTH"` nodes
- Minimum character threshold (default: 20)
- Converts to `textAutoResize: "HEIGHT"`
- Applies Japanese-priority line break removal policy

**Edge-breaking Detection:**
- Works on fixed size or auto-height nodes
- Calculates line width ratio vs container width
- Configurable threshold (default: 0.92)

**Soft Break Handling:**
- Detects nodes with `paragraphSpacing: 0`
- Identifies soft break candidate characters
- Converts soft breaks to hard breaks (`\n`)

### Safety Features

- Missing font warnings and auto-skip
- Undo support for all operations
- Layout change warnings (auto-width → auto-height conversion)
- Exclusion rules for bullet points, addresses, lyrics, etc.
- Batch processing with progress indication and timeout settings
- Cancellable operations with split processing for large files

## Architecture

The plugin follows Figma's standard plugin architecture:

- **Main plugin code**: `code.ts` (compiles to `code.js`)
  - Text node analysis and processing logic
  - Font loading and text metrics calculation
  - Figma API interactions for text manipulation

- **UI code**: `ui.html`
  - Detection configuration interface
  - Results display and individual node controls
  - Batch operation controls (scan/apply/undo)
  - Safety toggles and options

- **Text Processing Logic**:
  - Japanese-priority line break removal
  - Space normalization algorithms
  - Line width estimation calculations
  - Soft break character detection

## Key UI Components

1. **Detection Configuration**
   - Character count thresholds
   - Edge-breaking ratio settings
   - Soft break character set configuration (user-editable)
   - Safety feature toggles

2. **Results Interface**
   - Detected nodes list with jump/apply/exclude options
   - Preview of changes before application
   - Individual node controls

3. **Batch Operations**
   - Scan execution with progress indication
   - Bulk apply/undo operations
   - Cancellable processing for large datasets
   - Split processing to maintain UI responsiveness

4. **Manual Tools**
   - Selected node processing
   - Custom line break removal options
   - Advanced text cleaning controls

## TypeScript Configuration

- Target: ES6
- Strict mode enabled
- Figma plugin typings included via `@figma/plugin-typings`
- Code must be compiled before the plugin can run in Figma

## Important Implementation Notes

### Core Processing Requirements
- Text processing requires font loading before manipulation
- Auto-width to auto-height conversion may cause layout shifts
- Line width calculations are estimations and may have false positives
- All text operations should be undoable
- Missing fonts must be handled gracefully with user warnings

### Performance & UX Requirements
- Implement batch processing with timeout settings to prevent UI freezing
- Large file processing must be split into chunks with progress indication
- All operations should be cancellable by user
- Soft break character sets must be user-configurable via UI
- Edge-breaking threshold (0.92) should be adjustable for user testing and tuning

### Technical Considerations
- Process text nodes in batches to maintain UI responsiveness
- Implement proper async/await patterns for font loading
- Use requestAnimationFrame or similar for UI updates during processing
- Provide clear feedback on processing status and estimated time remaining