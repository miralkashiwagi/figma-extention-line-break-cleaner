// ソフト改行分割のテストコード

function testSoftBreakSplitting() {
    // テスト用のテキスト（実際のソフト改行文字を含む）
    const testText = `ソフト改行の検出処理テスト専用 この前後の改行はソフト改行 この行の後の改行は通常改行
それでは確認どうぞ！！`;

    console.log('=== オリジナルテキスト ===');
    console.log('Text:', JSON.stringify(testText));
    console.log('Length:', testText.length);
    
    // 文字コードを確認
    console.log('\n=== 文字コード分析 ===');
    for (let i = 0; i < testText.length; i++) {
        const char = testText[i];
        const code = char.charCodeAt(0);
        if (code === 10 || code === 8232 || code === 8233) {
            console.log(`Position ${i}: "${char}" (U+${code.toString(16).toUpperCase().padStart(4, '0')})`);
        }
    }
    
    console.log('\n=== 通常改行のみで分割 ===');
    const normalSplit = testText.split('\n');
    console.log('Lines:', normalSplit.length);
    normalSplit.forEach((line, index) => {
        console.log(`Line ${index + 1}: "${line}"`);
    });
    
    console.log('\n=== ソフト改行文字設定 ===');
    const softBreakChars = ['\u2028']; // LSEP
    console.log('Soft break chars:', softBreakChars.map(char => JSON.stringify(char)));
    
    console.log('\n=== 改行文字検索 ===');
    softBreakChars.forEach(char => {
        const count = (testText.match(new RegExp(char, 'g')) || []).length;
        console.log(`"${JSON.stringify(char)}" found: ${count} times`);
        
        if (count > 0) {
            const positions = [];
            for (let i = 0; i < testText.length; i++) {
                if (testText[i] === char) {
                    positions.push(i);
                }
            }
            console.log(`Positions: ${positions}`);
        }
    });
    
    console.log('\n=== 両方の改行文字で分割 ===');
    const allBreakChars = ['\n', ...softBreakChars];
    console.log('All break chars:', allBreakChars.map(char => JSON.stringify(char)));
    
    // 正規表現パターン作成
    const escaped = allBreakChars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    console.log('Escaped chars:', escaped);
    
    const breakPattern = new RegExp(`[${escaped.join('')}]`);
    console.log('Break pattern:', breakPattern);
    
    const combinedSplit = testText.split(breakPattern);
    console.log('Combined split lines:', combinedSplit.length);
    combinedSplit.forEach((line, index) => {
        console.log(`Line ${index + 1}: "${line}"`);
    });
    
    console.log('\n=== 手動でLSEP追加テスト ===');
    const testWithLSEP = 'ソフト改行の検出処理テスト専用\u2028この前後の改行はソフト改行\u2028この行の後の改行は通常改行\nそれでは確認どうぞ！！';
    console.log('Test with LSEP:', JSON.stringify(testWithLSEP));
    
    const lsepSplit = testWithLSEP.split(breakPattern);
    console.log('LSEP split lines:', lsepSplit.length);
    lsepSplit.forEach((line, index) => {
        console.log(`Line ${index + 1}: "${line}"`);
    });
}

testSoftBreakSplitting();