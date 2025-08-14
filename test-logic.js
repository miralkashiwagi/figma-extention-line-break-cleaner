// テストコード：改行処理ロジックの検証

function testLineBreakLogic() {
    const testText = `歯周病は、歯ぐきの炎症や出血、歯がグラグラするなどの症状が現れる病気で、進行すると歯を支える骨が溶けてしまい、
最終的には歯が抜け落ちてしまうこともあります。日本人の成人の約8割がかかっていると言われる国民病です。主な原因
は、歯と歯ぐきの間に蓄積したプラーク（細菌の塊）です。初期には自覚症状が少ないため、定期的な歯科医院でのチェッ
クが重要です。`;

    console.log('=== 入力テキスト ===');
    console.log(testText);
    console.log();

    const lines = testText.split('\n');
    console.log(`=== 分割結果: ${lines.length}行 ===`);
    lines.forEach((line, index) => {
        console.log(`行${index + 1}: "${line.trim()}"`);
        console.log(`  末尾文字: "${line.trim().slice(-5)}"`);
        console.log(`  句読点で終わる: ${/[。．！？]$/.test(line.trim())}`);
        console.log();
    });

    console.log('=== 処理シミュレーション ===');
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i];
        const nextLine = lines[i + 1];
        
        console.log(`--- 処理中: 行${i + 1}/${lines.length} ---`);
        console.log(`現在行: "${currentLine.trim()}"`);
        console.log(`次の行: "${nextLine?.trim() || 'なし'}"`);
        
        // 最後の行は必ず追加
        if (nextLine === undefined) {
            console.log('→ 最後の行として追加');
            result.push(currentLine);
            break;
        }
        
        // 現在行が句読点で終わるかチェック
        const currentTrimmed = currentLine.trim();
        if (/[。．！？]$/.test(currentTrimmed)) {
            console.log('→ 句読点で終わる → 改行保持');
            result.push(currentLine);
            continue;
        }
        
        // 句読点で終わらない場合は次行と結合
        console.log('→ 句読点なし → 結合');
        const combinedLine = currentLine + nextLine; // 簡単な結合
        result.push(combinedLine);
        i++; // 次の行をスキップ
        console.log(`  スキップ: 行${i + 1}をスキップしました`);
    }
    
    console.log();
    console.log('=== 最終結果 ===');
    result.forEach((line, index) => {
        console.log(`結果行${index + 1}: "${line.trim()}"`);
    });
}

testLineBreakLogic();