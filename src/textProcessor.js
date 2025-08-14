export class TextProcessor {
    constructor(config) {
        this.config = config;
    }
    // Generate processing changes based on detected issues
    generateChanges(originalText, issues) {
        const changes = {};
        let processedText = originalText;
        // Process issues in priority order
        const sortedIssues = issues.sort((a, b) => b.confidence - a.confidence);
        for (const issue of sortedIssues) {
            switch (issue.type) {
                case 'auto-width':
                    changes.newAutoResize = 'HEIGHT';
                    processedText = this.removeLineBreaksJapanesePriority(processedText);
                    break;
                case 'edge-breaking':
                    processedText = this.removeLineBreaksJapanesePriority(processedText);
                    break;
                case 'soft-break':
                    processedText = this.convertSoftBreaksToHard(processedText);
                    break;
            }
        }
        // Only set newText if it's different from original
        if (processedText !== originalText) {
            changes.newText = processedText;
        }
        return changes;
    }
    // Japanese-priority line break removal
    removeLineBreaksJapanesePriority(text) {
        let result = text;
        // Split into lines for processing
        const lines = result.split('\n');
        const processedLines = [];
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            const nextLine = lines[i + 1];
            if (nextLine !== undefined) {
                // Check if we should remove the line break
                if (this.shouldRemoveLineBreak(currentLine, nextLine)) {
                    // Combine lines with appropriate spacing
                    const combined = this.combineLines(currentLine, nextLine);
                    processedLines.push(combined);
                    i++; // Skip next line as it's been combined
                }
                else {
                    processedLines.push(currentLine);
                }
            }
            else {
                processedLines.push(currentLine);
            }
        }
        result = processedLines.join('\n');
        // Additional cleanup
        result = this.normalizeSpaces(result);
        return result;
    }
    shouldRemoveLineBreak(currentLine, nextLine) {
        // Don't remove breaks if either line is empty (paragraph separation)
        if (currentLine.trim() === '' || nextLine.trim() === '') {
            return false;
        }
        // Check for exclusion patterns
        for (const pattern of this.config.excludePatterns) {
            const regex = new RegExp(pattern);
            if (regex.test(currentLine) || regex.test(nextLine)) {
                return false;
            }
        }
        // Japanese text priority rules
        const currentLineEnd = currentLine.trim().slice(-1);
        const nextLineStart = nextLine.trim().slice(0, 1);
        // Don't remove breaks after sentence-ending punctuation
        if (this.isSentenceEnding(currentLineEnd)) {
            return false;
        }
        // Don't remove breaks before bullet points or numbering
        if (this.isBulletPoint(nextLine.trim())) {
            return false;
        }
        // Japanese character handling
        if (this.isJapanese(currentLineEnd) && this.isJapanese(nextLineStart)) {
            // Generally safe to remove breaks between Japanese characters
            return true;
        }
        // Mixed language handling
        if (this.isJapanese(currentLineEnd) || this.isJapanese(nextLineStart)) {
            // Be more conservative with mixed content
            return this.isConnectableText(currentLine, nextLine);
        }
        // English/other languages
        return this.isConnectableText(currentLine, nextLine);
    }
    combineLines(line1, line2) {
        const trimmed1 = line1.replace(/\s+$/, '');
        const trimmed2 = line2.replace(/^\s+/, '');
        // Determine appropriate spacing
        const line1End = trimmed1.slice(-1);
        const line2Start = trimmed2.slice(0, 1);
        // No space needed between Japanese characters
        if (this.isJapanese(line1End) && this.isJapanese(line2Start)) {
            return trimmed1 + trimmed2;
        }
        // Add space for other combinations
        if (trimmed1 && trimmed2) {
            return trimmed1 + ' ' + trimmed2;
        }
        return trimmed1 + trimmed2;
    }
    isJapanese(char) {
        if (!char)
            return false;
        const code = char.charCodeAt(0);
        return ((code >= 0x3040 && code <= 0x309F) || // Hiragana
            (code >= 0x30A0 && code <= 0x30FF) || // Katakana
            (code >= 0x4E00 && code <= 0x9FAF) || // CJK Unified Ideographs
            (code >= 0x3400 && code <= 0x4DBF) // CJK Extension A
        );
    }
    isSentenceEnding(char) {
        const sentenceEnders = ['。', '．', '.', '!', '?', '！', '？'];
        return sentenceEnders.indexOf(char) !== -1;
    }
    isBulletPoint(line) {
        const bulletPatterns = [
            /^[•·※]/, // Common bullet characters
            /^[\d]+[.)]/, // Numbered lists
            /^[a-zA-Z][.)]/, // Lettered lists
            /^[-*+]/, // Dash/asterisk bullets
            /^[①-⑳]/ // Circled numbers
        ];
        return bulletPatterns.some(pattern => pattern.test(line));
    }
    isConnectableText(line1, line2) {
        // Simple heuristic for determining if lines can be safely connected
        const line1Trimmed = line1.trim();
        const line2Trimmed = line2.trim();
        // Don't connect if either line looks like a heading or title
        if (this.looksLikeHeading(line1Trimmed) || this.looksLikeHeading(line2Trimmed)) {
            return false;
        }
        // Don't connect very short lines (likely intentional formatting)
        if (line1Trimmed.length < 10 || line2Trimmed.length < 10) {
            return false;
        }
        return true;
    }
    looksLikeHeading(line) {
        // Simple heading detection
        if (line.length > 50)
            return false; // Too long for heading
        if (/^[A-Z\s]{3,}$/.test(line))
            return true; // ALL CAPS
        if (/^[\d]+[\.\)]\s/.test(line))
            return true; // Numbered heading
        return false;
    }
    // Convert soft breaks to hard breaks
    convertSoftBreaksToHard(text) {
        let result = text;
        for (const softBreakChar of this.config.softBreakChars) {
            // Replace soft breaks with hard line breaks
            result = result.replace(new RegExp(softBreakChar, 'g'), '\n');
        }
        return result;
    }
    // Normalize spaces
    normalizeSpaces(text) {
        // Remove trailing spaces at end of lines
        let result = text.replace(/[ \t]+$/gm, '');
        // Normalize multiple consecutive spaces to single space
        result = result.replace(/[ \t]+/g, ' ');
        // Remove spaces around Japanese punctuation
        result = result.replace(/\s*([。．、，！？])\s*/g, '$1');
        return result;
    }
    // Preview changes without applying them
    previewChanges(originalText, issues) {
        const changes = this.generateChanges(originalText, issues);
        return {
            original: originalText,
            processed: changes.newText || originalText,
            changes
        };
    }
    // Calculate text statistics for reporting
    calculateStatistics(original, processed) {
        const originalLines = original.split('\n').length;
        const processedLines = processed.split('\n').length;
        return {
            originalLines,
            processedLines,
            linesRemoved: originalLines - processedLines,
            charactersChanged: Math.abs(original.length - processed.length)
        };
    }
}
