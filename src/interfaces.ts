// Type definitions for Line Break Cleaner Plugin

export type DetectionType = 'auto-width' | 'edge-breaking' | 'soft-break';

export interface DetectedIssue {
  type: DetectionType;
  confidence: number;
  description: string;
  lineNumbers?: number[];
}

export interface TextAnalysisResult {
  node: TextNode;
  issues: DetectedIssue[];
  estimatedChanges: string;
  originalText: string;
}

export interface ProcessingConfig {
  minCharacters: number;
  edgeThreshold: number;
  softBreakChars: string[];
  excludePatterns: string[];
  enabledDetections: DetectionType[];
}

export interface ProcessingChanges {
  newText?: string;
  newAutoResize?: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'TRUNCATE';
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export interface ProcessingResult {
  node: TextNode;
  success: boolean;
  error?: string;
  changes?: ProcessingChanges;
}

export interface ProgressUpdate {
  current: number;
  total: number;
  currentNode: string;
  progress: number;
  message: string;
}

// UI Message types
export interface UIMessage {
  type: string;
  [key: string]: any;
}

export interface ScanMessage extends UIMessage {
  type: 'scan';
}

export interface ApplyMessage extends UIMessage {
  type: 'apply' | 'apply-all';
  nodeId?: string;
}

export interface CancelMessage extends UIMessage {
  type: 'cancel';
}

export interface ProgressMessage extends UIMessage {
  type: 'progress-update';
  progress: number;
  currentNode: string;
  message: string;
}

export interface ResultMessage extends UIMessage {
  type: 'scan-results';
  results: TextAnalysisResult[];
}

export interface ErrorMessage extends UIMessage {
  type: 'error';
  message: string;
}

export interface WarningMessage extends UIMessage {
  type: 'warning';
  message: string;
}