// LSEP（Line Separator）検出テスト

function testLSEPDetection() {
    console.log('=== LSEP検出テスト ===');

    // 実際のLSEP文字を含むテキスト
    const testText = 'ソフト改行の検出処理テスト専用\u2028この前後の改行はソフト改行\u2028この行の後の改行は通常改行\nそれでは確認どうぞ！！';

    console.log('テストテキスト:', JSON.stringify(testText));
    console.log('テキスト長:', testText.length);

    // 文字コード分析
    console.log('\n=== 文字コード分析 ===');
    for (let i = 0; i < testText.length; i++) {
        const char = testText[i];
        const code = char.charCodeAt(0);
        if (code === 10 || code === 8232 || code === 8233) {
            console.log(`位置 ${i}: "${char}" (U+${code.toString(16).toUpperCase().padStart(4, '0')})`);
        }
    }

    // ソフト改行文字設定
    const softBreakChars = ['\u2028'];
    console.log('\n=== ソフト改行文字設定 ===');
    console.log('設定文字:', softBreakChars.map(char => `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`));

    // 検出テスト
    console.log('\n=== 検出テスト ===');
    let count = 0;
    for (const softBreakChar of softBreakChars) {
        const occurrences = (testText.match(new RegExp(softBreakChar, 'g')) || []).length;
        count += occurrences;
        console.log(`"${JSON.stringify(softBreakChar)}" 検出数: ${occurrences}`);
    }
    console.log('合計ソフト改行数:', count);

    // 分割テスト
    console.log('\n=== 分割テスト ===');
    const allBreakChars = ['\n', ...softBreakChars];
    const breakPattern = new RegExp(`[${allBreakChars.map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`);
    console.log('分割パターン:', breakPattern);

    const lines = testText.split(breakPattern);
    console.log('分割結果:', lines.length, '行');
    lines.forEach((line, index) => {
        console.log(`行${index + 1}: "${line}"`);
    });

    // UIテキストエリア値のシミュレーション（新しい処理方法）
    console.log('\n=== UIテキストエリア値シミュレーション（新処理） ===');
    const textareaValue = '\u2028'; // 実際のLSEP文字
    console.log('テキストエリア値:', JSON.stringify(textareaValue));
    console.log('文字コード:', textareaValue.charCodeAt(0));

    // 新しい処理方法
    let newSoftBreakChars = [];

    // テキストエリアの値を文字単位で処理
    for (let i = 0; i < textareaValue.length; i++) {
        const char = textareaValue[i];
        const code = char.charCodeAt(0);

        // ソフト改行文字（LSEP, PSEP）や特殊文字を検出
        if (code === 8232 || code === 8233 || code === 8203 || code === 65279) {
            if (newSoftBreakChars.indexOf(char) === -1) {
                newSoftBreakChars.push(char);
            }
        }
    }

    console.log('新処理後配列:', newSoftBreakChars);
    console.log('新処理後配列長:', newSoftBreakChars.length);

    if (newSoftBreakChars.length > 0) {
        console.log('最初の文字コード:', newSoftBreakChars[0].charCodeAt(0));
    }
}

testLSEPDetection();