// Line Break Cleaner - Figma Plugin for cleaning unnecessary line breaks
// This plugin helps identify and clean unnecessary line breaks in text nodes,
// with intelligent detection for Japanese and multilingual content.

import { BatchProcessor } from './src/batchProcessor';
import { 
  UIMessage, 
  ProcessingConfig, 
  TextAnalysisResult,
  ProcessingResult
} from './src/interfaces';

// Default configuration
const DEFAULT_CONFIG: ProcessingConfig = {
  minCharacters: 20,
  edgeThreshold: 0.92,
  softBreakChars: ['​', '\u200B', '&#8203;'],
  excludePatterns: [],
  enabledDetections: ['auto-width', 'edge-breaking', 'soft-break']
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
    // Save current configuration
    await saveConfig(config);
    
    // Scan current page
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
  if (isProcessing || !currentProcessor) return;
  
  isProcessing = true;
  
  try {
    const processResults = await currentProcessor.processNodes(results, onProgress);
    
    sendToUI({
      type: 'processing-complete',
      results: processResults
    });
    
    // Generate and show statistics
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
        removeLineBreaks: options.removeLineBreaks,
        normalizeSpaces: options.normalizeSpaces,
        convertToAutoHeight: options.convertToAutoHeight
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

// Handle plugin close
figma.ui.onmessage = (msg: any) => {
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// Initialize with saved config when plugin loads
loadConfig().then(config => {
  // Plugin is ready
}).catch(error => {
  console.warn('Plugin initialization warning:', error);
});
