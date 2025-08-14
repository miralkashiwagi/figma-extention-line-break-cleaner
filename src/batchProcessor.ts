import { 
  TextAnalysisResult, 
  ProcessingResult, 
  ProcessingConfig, 
  ProgressUpdate 
} from './interfaces';
import { TextAnalyzer } from './textAnalyzer';
import { TextProcessor } from './textProcessor';
import { FontManager } from './fontManager';

export class BatchProcessor {
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

  // Batch analysis (no font loading required)
  async analyzeNodes(
    nodes: TextNode[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<TextAnalysisResult[]> {
    this.isProcessing = true;
    this.isCancelled = false;

    const results: TextAnalysisResult[] = [];
    const CHUNK_SIZE = 50; // Process in chunks for UI responsiveness

    try {
      for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
        if (this.isCancelled) {
          break;
        }

        const chunk = nodes.slice(i, i + CHUNK_SIZE);
        
        // Process chunk
        for (let j = 0; j < chunk.length; j++) {
          const node = chunk[j];
          const currentIndex = i + j;
          
          if (this.isCancelled) {
            break;
          }

          try {
            const result = await this.analyzer.analyzeTextNode(node);
            results.push(result);

            // Report progress
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
            // Add error result
            results.push({
              node,
              issues: [],
              estimatedChanges: `Analysis error: ${error}`,
              originalText: node.characters || ''
            });
          }

          // Yield to UI
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

  // Batch processing (with font loading)
  async processNodes(
    analysisResults: TextAnalysisResult[],
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<ProcessingResult[]> {
    this.isProcessing = true;
    this.isCancelled = false;

    const results: ProcessingResult[] = [];
    const nodesToProcess = analysisResults.filter(result => result.issues.length > 0);
    const CHUNK_SIZE = 25; // Smaller chunks for processing (font loading is expensive)

    try {
      // First, validate nodes for processing
      const { processable, issues } = await this.fontManager.validateNodesForProcessing(
        nodesToProcess.map(r => r.node)
      );

      // Add validation failures to results
      for (const issue of issues) {
        results.push({
          node: issue.node,
          success: false,
          error: issue.reason
        });
      }

      // Process valid nodes
      for (let i = 0; i < processable.length; i += CHUNK_SIZE) {
        if (this.isCancelled) {
          break;
        }

        const chunk = processable.slice(i, i + CHUNK_SIZE);
        
        // Process chunk
        for (let j = 0; j < chunk.length; j++) {
          const node = chunk[j];
          const currentIndex = i + j;
          
          if (this.isCancelled) {
            break;
          }

          try {
            // Find the analysis result for this node
            const analysisResult = analysisResults.find(r => r.node.id === node.id);
            if (!analysisResult || analysisResult.issues.length === 0) {
              continue;
            }

            // Generate changes
            const changes = this.processor.generateChanges(
              analysisResult.originalText,
              analysisResult.issues
            );

            // Apply changes
            await this.fontManager.applyChangesToNode(node, changes);

            results.push({
              node,
              success: true,
              changes
            });

            // Report progress
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

          // Yield to UI more frequently during processing
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

  // Process selected nodes only
  async processSelectedNodes(
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<{
    analysisResults: TextAnalysisResult[];
    processResults: ProcessingResult[];
  }> {
    const selectedNodes = this.analyzer.getSelectedTextNodes();
    
    if (selectedNodes.length === 0) {
      throw new Error('No text nodes selected');
    }

    // Analyze first
    const analysisResults = await this.analyzeNodes(selectedNodes, onProgress);
    
    // Then process
    const processResults = await this.processNodes(analysisResults, onProgress);

    return { analysisResults, processResults };
  }

  // Scan all nodes in current page
  async scanCurrentPage(
    onProgress?: (progress: ProgressUpdate) => void
  ): Promise<TextAnalysisResult[]> {
    const allNodes = this.analyzer.findTextNodes();
    
    if (allNodes.length === 0) {
      throw new Error('No text nodes found in current page');
    }

    return await this.analyzeNodes(allNodes, onProgress);
  }

  // Cancel current operation
  cancel(): void {
    this.isCancelled = true;
  }

  // Check if currently processing
  isRunning(): boolean {
    return this.isProcessing;
  }

  // Get processing statistics
  generateStatistics(results: ProcessingResult[]): {
    totalProcessed: number;
    successful: number;
    failed: number;
    errorSummary: { [key: string]: number };
  } {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    // Count error types
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

  // Update configuration
  updateConfig(newConfig: ProcessingConfig): void {
    this.config = newConfig;
    this.analyzer = new TextAnalyzer(newConfig);
    this.processor = new TextProcessor(newConfig);
  }

  // Yield control to UI (important for Figma plugin responsiveness)
  private async yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1));
  }

  // Process individual node (for manual selection tools)
  async processIndividualNode(
    node: TextNode,
    forceChanges?: {
      removeLineBreaks?: boolean;
      normalizeSpaces?: boolean;
      convertToAutoHeight?: boolean;
    }
  ): Promise<ProcessingResult> {
    try {
      // Validate node
      const { processable, issues } = await this.fontManager.validateNodesForProcessing([node]);
      
      if (processable.length === 0) {
        return {
          node,
          success: false,
          error: issues[0]?.reason || 'Node cannot be processed'
        };
      }

      // If forceChanges is provided, create manual changes
      if (forceChanges) {
        const changes: any = {};
        let processedText = node.characters;

        if (forceChanges.removeLineBreaks) {
          processedText = this.processor['removeLineBreaksJapanesePriority'](processedText);
        }

        if (forceChanges.normalizeSpaces) {
          processedText = this.processor['normalizeSpaces'](processedText);
        }

        if (forceChanges.convertToAutoHeight) {
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
        } else {
          return {
            node,
            success: true,
            changes: {}
          };
        }
      }

      // Otherwise, analyze and process normally
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
        analysisResult.issues
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
}