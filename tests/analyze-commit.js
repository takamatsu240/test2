#!/usr/bin/env node

/**
 * AIハイブリッド型タスク自動追跡システム
 *
 * Phase 2: ファイル名照合 + ファイル全体AI判定方式
 * - ファイル名照合 + AI判定（完成度: perfect/OK） → クローズ候補
 *
 * すべてのクローズ判定はレビュー必須（直接クローズなし）
 * セキュリティガードレール実装済み
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { firestore, COLLECTIONS, admin } = require('../firestore-client');
const minimatch = require('minimatch');

// ==================== 設定 ====================

// AI解析設定（Phase 2専用）
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';
const PHASE2_AI_ENABLED = process.env.PHASE2_AI_ENABLED !== 'false';  // デフォルトで有効

// セキュリティ: 除外ファイルパターン
const EXCLUDED_PATTERNS = [
  // ロックファイル
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',

  // 環境設定・機密情報
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '*.key',
  '*.pem',
  '*.cert',
  '*.p12',
  'service-account-key.json',
  'credentials.json',

  // アセット/バイナリ
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.pdf',
  '*.ico',
  '*.svg',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',

  // ビルド成果物
  'dist/*',
  'build/*',
  'node_modules/*',
  'vendor/*',
  '.next/*',
  'out/*',

  // システムファイル
  '.DS_Store',
  '.gitignore',
  'Thumbs.db',
  'desktop.ini'
];

// ==================== ユーティリティ関数 ====================

/**
 * Gitコマンドを実行
 */
function execGit(command) {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.error(`❌ Gitコマンドエラー: ${command}`);
    console.error(error.message);
    return null;
  }
}

/**
 * 最新のコミット情報を取得
 */
function getLatestCommit() {
  const hash = execGit('git rev-parse HEAD');
  const message = execGit('git log -1 --pretty=%B');
  const author = execGit('git log -1 --pretty=%an');
  const date = execGit('git log -1 --pretty=%ci');

  if (!hash || !message) {
    return null;
  }

  return { hash, message, author, date };
}

/**
 * 変更されたファイルのリストを取得
 * マージコミット対応: -m オプションでマージコミットの変更も取得
 */
function getChangedFiles(commitHash) {
  // まず通常のコミットとして取得を試みる
  let output = execGit(`git diff-tree --no-commit-id --name-only -r ${commitHash}`);

  // マージコミットの場合は -m オプションを使用
  if (!output || output.trim() === '') {
    console.log('ℹ️  マージコミットを検出。-m オプションで変更ファイルを取得します。');
    output = execGit(`git diff-tree --no-commit-id --name-only -r -m ${commitHash}`);
  }

  if (!output) return [];

  return output.split('\n').filter(f => f.trim() !== '');
}

/**
 * 変更後のファイル全体の内容を取得
 */
function getFileContent(commitHash, filePath) {
  try {
    const content = execGit(`git show ${commitHash}:"${filePath}"`);
    return content || '';
  } catch (error) {
    console.error(`ファイル内容取得エラー (${filePath}):`, error.message);
    return '';
  }
}

/**
 * コミットの差分を取得（ファイル単位）
 * マージコミット対応: -m オプションでマージコミットの差分も取得
 */
function getFileDiff(commitHash, filePath) {
  // まず通常のコミットとして取得を試みる
  let diff = execGit(`git show ${commitHash} -- "${filePath}"`);

  // 差分が空の場合、マージコミットとして -m オプションで再取得
  if (!diff || diff.trim() === '') {
    diff = execGit(`git show -m ${commitHash} -- "${filePath}"`);
  }

  return diff || '';
}

/**
 * 差分と周辺コンテキストを抽出（大きいファイル用）
 * コンテキスト行数を動的に調整して10,000文字に近づける
 * @param {string} fileDiff - ファイル差分
 * @param {string} fileContent - ファイル全体の内容
 * @param {number} maxLength - 最大文字数
 * @returns {object} { content: string, contextLines: number }
 */
function extractDiffWithContext(fileDiff, fileContent, maxLength = 10000) {
  // ファイル全体を行ごとに分割
  const fileLines = fileContent.split('\n');

  // 差分から変更行を抽出（@@ ... @@の情報を解析）
  const diffLines = fileDiff.split('\n');
  const changedRanges = [];

  // @@ -oldStart,oldCount +newStart,newCount @@ 形式を解析
  for (const line of diffLines) {
    const match = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (match) {
      const newStart = parseInt(match[3]);
      const newCount = parseInt(match[4] || '1');
      changedRanges.push({
        start: Math.max(1, newStart),
        end: newStart + newCount
      });
    }
  }

  if (changedRanges.length === 0) {
    // 差分情報が取得できない場合は差分をそのまま返す
    return { content: fileDiff.slice(0, maxLength), contextLines: 0 };
  }

  /**
   * 指定されたコンテキスト行数で出力を生成
   */
  function generateOutput(contextLines) {
    const includedLines = new Set();

    for (const range of changedRanges) {
      const contextStart = Math.max(0, range.start - contextLines);
      const contextEnd = Math.min(fileLines.length, range.end + contextLines);

      for (let i = contextStart; i < contextEnd; i++) {
        includedLines.add(i);
      }
    }

    // 行番号順にソート
    const sortedLines = Array.from(includedLines).sort((a, b) => a - b);

    // コンテキスト付き差分を生成
    let result = `=== 差分 + 周辺コンテキスト（前後${contextLines}行） ===\n\n`;
    let lastLine = -1;

    for (const lineNum of sortedLines) {
      // 連続していない場合は省略マーカーを挿入
      if (lastLine !== -1 && lineNum > lastLine + 1) {
        result += `\n... (${lineNum - lastLine - 1}行省略) ...\n\n`;
      }

      result += `${lineNum + 1}: ${fileLines[lineNum]}\n`;
      lastLine = lineNum;
    }

    return result;
  }

  // 10行単位で最適なコンテキスト行数を探す（最大100行まで）
  let bestContextLines = 10;
  let bestOutput = generateOutput(bestContextLines);
  let bestLength = bestOutput.length;

  // 10,000文字に最も近い設定を探す
  for (let contextLines = 20; contextLines <= 100; contextLines += 10) {
    const output = generateOutput(contextLines);
    const outputLength = output.length;

    // 10,000文字を超えたら、前の設定を使う
    if (outputLength > maxLength) {
      break;
    }

    // 10,000文字により近ければ更新
    if (Math.abs(outputLength - maxLength) < Math.abs(bestLength - maxLength)) {
      bestContextLines = contextLines;
      bestOutput = output;
      bestLength = outputLength;
    }

    // ぴったり10,000文字付近なら終了
    if (outputLength >= maxLength - 500) {
      break;
    }
  }

  // 最終的なサイズチェック（念のため）
  if (bestOutput.length > maxLength) {
    bestOutput = bestOutput.slice(0, maxLength - 100) + '\n\n... (残りは省略されました) ...';
  }

  console.log(`    🔧 コンテキスト最適化: ${bestContextLines}行 → ${bestOutput.length}文字`);

  return { content: bestOutput, contextLines: bestContextLines };
}

/**
 * ファイルが除外パターンに一致するか判定
 */
function isExcludedFile(filePath) {
  return EXCLUDED_PATTERNS.some(pattern => {
    // ワイルドカード対応
    const regex = new RegExp(
      '^' + pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') + '$'
    );
    return regex.test(filePath);
  });
}

/**
 * 差分から除外ファイルをフィルタリング
 */
function filterExcludedFiles(changedFiles) {
  return changedFiles.filter(file => !isExcludedFile(file));
}

/**
 * 未クローズToDoを取得（リポジトリベース、Firestore直接アクセス）
 */
async function getUnclosedTodos() {
  try {
    const repository = process.env.REPOSITORY;  // GitHub Actionsから取得: "username/repo-name"

    // リポジトリ情報がない場合は全プロジェクトから検索（後方互換性）
    if (!repository) {
      console.warn('⚠️ REPOSITORY環境変数が設定されていません。全プロジェクトから検索します。');
      const todosSnapshot = await firestore.collection(COLLECTIONS.TODOS).get();
      const todos = todosSnapshot.docs.map(doc => doc.data());
      const unclosedTodos = todos.filter(t => t.ステータス !== 'クローズ');
      return unclosedTodos;
    }

    console.log(`🔍 リポジトリ検索: ${repository}`);

    // 1. リポジトリ名からプロジェクトIDを取得（array-contains クエリ）
    const projectSnapshot = await firestore
      .collection(COLLECTIONS.PROJECTS)
      .where('repositories', 'array-contains', repository)
      .limit(1)
      .get();

    if (projectSnapshot.empty) {
      console.warn(`⚠️ リポジトリ ${repository} に紐づくプロジェクトが見つかりません。`);
      console.warn(`💡 プロジェクト設定で repositories フィールドに "${repository}" を追加してください。`);
      return [];
    }

    const project = projectSnapshot.docs[0];
    const projectId = project.id;
    const projectData = project.data();

    console.log(`✓ プロジェクト検出: ${projectData.name} (ID: ${projectId})`);
    console.log(`  紐付けリポジトリ: ${projectData.repositories?.join(', ') || '(なし)'}`);

    // 2. そのプロジェクトのTODOのみを取得
    const todosSnapshot = await firestore
      .collection(COLLECTIONS.TODOS)
      .where('projectId', '==', projectId)
      .get();

    const todos = todosSnapshot.docs.map(doc => doc.data());
    const unclosedTodos = todos.filter(t => t.ステータス !== 'クローズ');

    console.log(`✓ 未クローズTODO: ${unclosedTodos.length}件 (プロジェクト: ${projectData.name})`);
    return unclosedTodos;

  } catch (error) {
    console.error('❌ 未クローズToDo取得エラー:', error.message);
    console.error('詳細:', error);
    return [];
  }
}

/**
 * ToDoをクローズ候補にマーク（Firestore直接アクセス）
 */
async function markAsCloseCandidate(todoNo, params) {
  try {
    // ToDoの存在確認
    const todoDoc = await firestore.collection(COLLECTIONS.TODOS).doc(todoNo).get();

    if (!todoDoc.exists) {
      throw new Error(`ToDo ${todoNo} が見つかりません`);
    }

    const todo = todoDoc.data();

    // クローズ候補フラグをONに更新
    todo.クローズ候補 = 'ON';

    // ステータス更新
    if (params.status) {
      if (['closed', 'in_progress', 'review_pending'].includes(params.status)) {
        todo.ステータス = params.status === 'closed' ? 'クローズ' :
                          params.status === 'in_progress' ? '作業中' :
                          '確認待ち';
      }
    }

    // AI解析結果を保存
    if (params.aiAnalysis) {
      todo.aiAnalysis = {
        analyzedAt: params.aiAnalysis.analyzedAt || new Date().toISOString(),
        confidence: params.aiAnalysis.confidence || 0,
        reason: params.aiAnalysis.reason || '',
        model: params.aiAnalysis.model || 'gpt-4o',
        contentType: params.aiAnalysis.contentType || ''
      };
    }

    // 判定履歴が存在しない場合は初期化
    if (!todo.判定履歴) {
      todo.判定履歴 = [];
    }

    // 判定履歴を追加
    const historyEntry = {
      日時: new Date().toISOString(),
      理由: params.reason || 'クローズ候補判定',
      コミットハッシュ: params.commitHash || '',
      コミットメッセージ: params.commitMessage || '',
      判定方式: params.aiAnalysis ? 'Phase2 (AI)' : 'Phase2 (ファイル照合)',
      送信内容: params.aiAnalysis?.contentType || ''
    };
    todo.判定履歴.push(historyEntry);

    // クローズ日の設定
    if (params.status === 'closed') {
      todo.クローズ日 = new Date().toISOString().split('T')[0];
    }

    // 更新日を設定
    todo.更新日 = new Date().toISOString().split('T')[0];

    // Firestoreに保存
    await firestore.collection(COLLECTIONS.TODOS).doc(todoNo).set(todo, { merge: true });

    return { success: true, todo };
  } catch (error) {
    console.error(`❌ クローズ候補マークエラー (${todoNo}):`, error.message);
    throw error;
  }
}

/**
 * 軽量AI判定（Phase 2用）
 * ファイル全体の内容を送信して判定（大きいファイルは差分+コンテキスト）
 */
async function quickAICheck(fileContent, fileDiff, todo, filePath) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY が設定されていません');
  }

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const MAX_FILE_SIZE = 10000;
  let codeContent = '';
  let contentType = '';
  let contextLines = 0;
  let isPartialView = false; // ファイル全体を見れたかどうか

  // ファイルサイズに応じて送信内容を切り替え
  if (fileContent.length <= MAX_FILE_SIZE) {
    // 小さいファイル → 全体を送信
    codeContent = fileContent;
    contentType = 'ファイル全体';
    isPartialView = false;
  } else {
    // 大きいファイル → 差分 + 周辺コンテキスト（動的調整）
    const result = extractDiffWithContext(fileDiff, fileContent, MAX_FILE_SIZE);
    codeContent = result.content;
    contextLines = result.contextLines;
    contentType = `差分 + 周辺コンテキスト（前後${contextLines}行）`;
    isPartialView = true;
  }

  const prompt = `以下のコードを解析し、ToDoが完了または進行中か段階的に判定してください。

【ファイル: ${filePath}】（${contentType}）
<code>
${codeContent}
</code>

【ToDo】
- タイトル: ${todo.ToDoタイトル}
- 内容: ${todo.ToDo内容 || '（なし）'}

【判定手順】
以下の項目を順番に判定してください：

1. 実装の存在チェック
   ✓ ToDoに関連する実装コードが含まれているか
   ✗ コメントのみ、フォーマット変更のみ、typo修正のみ

2. 動作性チェック
   ✓ 実際に動作する実装コードか（関数定義、ロジック追加など）
   ✗ TODO/FIXMEコメントの追加のみ
   ✗ console.log等のデバッグコードのみ

3. 要件充足度チェック
   - "perfect": ToDoの全要件を満たしている完全実装
   - "OK": 主要機能は実装済み、細部が残る程度
   - "insufficient": 基本構造のみ、主要ロジックが未実装、または関連性が低い

【出力形式】
{
  "completeness": "perfect" | "OK" | "insufficient",
  "has_code": true/false,
  "is_functional": true/false,
  "reason": "判定理由（100文字以内）",
  "missing": "不足している要素（あれば、50文字以内）"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'コードを解析して段階的に判定してください。JSON形式で出力。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // 大きいファイル（部分的な表示）の場合は強制的にinsufficient判定
    if (isPartialView) {
      return {
        completeness: 'insufficient',
        has_code: result.has_code || false,
        is_functional: result.is_functional || false,
        reason: `ファイルが大きいため全体を確認できませんでした。${result.reason || ''}`.substring(0, 100),
        missing: result.missing || 'ファイル全体の確認',
        contentType: contentType,
        isPartialView: true
      };
    }

    return {
      completeness: result.completeness || 'insufficient',
      has_code: result.has_code || false,
      is_functional: result.is_functional || false,
      reason: result.reason || 'AI判定完了',
      missing: result.missing || '',
      contentType: contentType,
      isPartialView: false
    };
  } catch (error) {
    console.error(`❌ 軽量AI判定エラー (${todo.ToDoNo}):`, error.message);
    // エラー時はinsufficient判定
    return {
      completeness: 'insufficient',
      has_code: false,
      is_functional: false,
      reason: `AI判定エラー: ${error.message}`,
      missing: 'AI判定の実行',
      contentType: contentType,
      isPartialView: isPartialView
    };
  }
}

// ==================== Phase 2: ファイル名照合（ワイルドカード対応） ====================

function phase2_matchByFileName(changedFiles, unclosedTodos) {
  const matched = [];

  for (const todo of unclosedTodos) {
    // 判定対象情報から成果物ファイル名を取得
    const targetFile = todo.判定対象情報?.成果物ファイル名;

    if (!targetFile || targetFile.trim() === '') {
      continue; // 成果物ファイル名が設定されていない
    }

    let isMatch = false;
    let matchedFile = null;

    // ワイルドカードパターン（**, *, ?）が含まれている場合
    if (targetFile.includes('*') || targetFile.includes('?')) {
      // グロブパターンマッチング（minimatch使用）
      for (const file of changedFiles) {
        if (minimatch(file, targetFile)) {
          isMatch = true;
          matchedFile = file;
          break;
        }
      }
    } else {
      // 通常の部分一致照合
      for (const file of changedFiles) {
        if (file.includes(targetFile) || targetFile.includes(file)) {
          isMatch = true;
          matchedFile = file;
          break;
        }
      }
    }

    if (isMatch) {
      matched.push({
        todoNo: todo.ToDoNo,
        reason: `ファイル照合: ${targetFile} → ${matchedFile}`,
        matchedFile: matchedFile
      });
    }
  }

  return matched;
}

// ==================== メイン処理 ====================

async function main() {
  console.log('=========================================');
  console.log('AIハイブリッド型タスク自動追跡システム');
  console.log('（Phase 2: ファイル名照合 + AI判定）');
  console.log('すべてクローズ候補マーク（レビュー必須）');
  console.log('=========================================\n');

  // 最新コミット情報を取得
  console.log('📝 最新のコミット情報を取得中...');
  const commit = getLatestCommit();

  if (!commit) {
    console.log('❌ コミット情報の取得に失敗しました。');
    process.exit(1);
  }

  console.log(`✓ コミット: ${commit.hash.substring(0, 10)}`);
  console.log(`✓ メッセージ: ${commit.message.split('\n')[0]}`);
  console.log('');

  // 変更ファイルを取得
  console.log('📂 変更ファイルを取得中...');
  const changedFiles = getChangedFiles(commit.hash);
  const filteredFiles = filterExcludedFiles(changedFiles);

  console.log(`✓ 変更ファイル: ${changedFiles.length}件`);
  console.log(`✓ 解析対象: ${filteredFiles.length}件（除外: ${changedFiles.length - filteredFiles.length}件）`);

  if (filteredFiles.length > 0) {
    console.log('  - ' + filteredFiles.slice(0, 5).join('\n  - '));
    if (filteredFiles.length > 5) {
      console.log(`  ... 他 ${filteredFiles.length - 5}件`);
    }
  }
  console.log('');

  // 未クローズToDoを取得
  console.log('📋 未クローズToDoを取得中...');
  const unclosedTodos = await getUnclosedTodos();
  console.log(`✓ 未クローズToDo: ${unclosedTodos.length}件`);
  console.log('');

  if (unclosedTodos.length === 0) {
    console.log('ℹ️  未クローズのToDoがありません。処理を終了します。');
    process.exit(0);
  }

  // 結果を格納
  const results = new Map(); // TodoNo -> { reason, phase, aiAnalysis }

  // ==================== Phase 2: ファイル名照合 + ファイル全体AI判定 ====================
  console.log('🔍 Phase 2: ファイル名照合 + ファイル全体AI判定');
  const phase2Matches = phase2_matchByFileName(filteredFiles, unclosedTodos);

  // 未マッチファイルを検出（どのToDoの判定対象情報にもマッチしなかったファイル）
  const matchedFiles = phase2Matches.map(m => m.matchedFile);
  const unmatchedFiles = filteredFiles.filter(file => !matchedFiles.includes(file));

  if (unmatchedFiles.length > 0) {
    console.log('');
    console.log(`⚠️  ${unmatchedFiles.length}件のファイルがどのToDoの判定対象情報にもマッチしませんでした:`);
    console.log(`  - ${unmatchedFiles.slice(0, 5).join('\n  - ')}`);
    if (unmatchedFiles.length > 5) {
      console.log(`  ... 他 ${unmatchedFiles.length - 5}件`);
    }

    // 未マッチファイル警告をFirestoreに保存
    try {
      const warningDoc = {
        projectId: process.env.PROJECT_ID || 'default',
        日時: new Date().toISOString(),
        コミットハッシュ: commit.hash.substring(0, 10),
        コミットメッセージ: commit.message.split('\n')[0],
        未マッチファイル: unmatchedFiles,
        メッセージ: `${unmatchedFiles.length}件のファイルがどのToDoの判定対象情報にも含まれていません。新しいToDoの作成または既存ToDoの判定対象情報の更新を検討してください。`,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await firestore.collection(COLLECTIONS.UNMATCHED_FILE_WARNINGS).add(warningDoc);
      console.log(`  ✓ 未マッチファイル警告を保存しました`);
    } catch (error) {
      console.log(`  ❌ 未マッチファイル警告の保存に失敗: ${error.message}`);
    }
  }

  if (phase2Matches.length > 0) {
    console.log(`✓ ${phase2Matches.length}件のファイル一致を検出`);

    // AI判定が有効な場合は軽量チェックを実行
    if (PHASE2_AI_ENABLED && process.env.OPENAI_API_KEY) {
      console.log('🤖 Phase 2: AI判定実行中（ハイブリッドモード）...');

      for (const match of phase2Matches) {
        try {
          // 該当ファイルの全体内容と差分を取得
          const fileContent = getFileContent(commit.hash, match.matchedFile);
          const fileDiff = getFileDiff(commit.hash, match.matchedFile);

          if (!fileContent || fileContent.trim() === '') {
            console.log(`  ⚠️  ${match.todoNo}: ファイル内容を取得できませんでした`);
            continue;
          }

          // ToDoオブジェクトを取得
          const todo = unclosedTodos.find(t => t.ToDoNo === match.todoNo);

          if (!todo) {
            console.log(`  ⚠️  ${match.todoNo}: ToDoが見つかりません`);
            continue;
          }

          const fileSize = fileContent.length;
          const mode = fileSize <= 10000 ? 'ファイル全体' : '差分+コンテキスト';
          console.log(`  📄 ${match.todoNo}: ${match.matchedFile} (${fileSize}文字, モード: ${mode})`);

          // 軽量AI判定（ハイブリッドモード）
          const aiResult = await quickAICheck(fileContent, fileDiff, todo, match.matchedFile);

          // perfectまたはOKの場合のみクローズ候補
          if (aiResult.completeness === 'perfect' || aiResult.completeness === 'OK') {
            console.log(`  ✓ ${match.todoNo}: ${match.matchedFile} (完成度: ${aiResult.completeness})`);
            console.log(`    理由: ${aiResult.reason}`);
            console.log(`    送信内容: ${aiResult.contentType}`);
            if (aiResult.missing) {
              console.log(`    不足要素: ${aiResult.missing}`);
            }

            results.set(match.todoNo, {
              reason: `${match.reason} - ${aiResult.reason}`,
              phase: 'Phase2 (ファイル全体AI)',
              commitHash: commit.hash.substring(0, 10),
              commitMessage: commit.message.split('\n')[0],
              aiAnalysis: {
                analyzedAt: new Date().toISOString(),
                completeness: aiResult.completeness,
                has_code: aiResult.has_code,
                is_functional: aiResult.is_functional,
                reason: aiResult.reason,
                missing: aiResult.missing || '',
                model: AI_MODEL,
                contentType: aiResult.contentType,
                isPartialView: aiResult.isPartialView || false
              }
            });
          } else {
            console.log(`  ⏭️  ${match.todoNo}: スキップ (完成度: ${aiResult.completeness})`);
            console.log(`    理由: ${aiResult.reason}`);
          }
        } catch (error) {
          console.log(`  ❌ ${match.todoNo}: AI判定エラー - ${error.message}`);

          // エラーをFirestoreに保存（警告として記録）
          try {
            const todoDoc = await firestore.collection(COLLECTIONS.TODOS).doc(match.todoNo).get();
            if (todoDoc.exists) {
              const todo = todoDoc.data();

              if (!todo.Phase2エラー) {
                todo.Phase2エラー = [];
              }

              const errorEntry = {
                日時: new Date().toISOString(),
                コミットハッシュ: commit.hash.substring(0, 10),
                コミットメッセージ: commit.message.split('\n')[0],
                対象ファイル: match.matchedFile,
                エラーメッセージ: error.message,
                エラー種別: 'AI判定エラー'
              };

              todo.Phase2エラー.push(errorEntry);

              // 最新10件のみ保持
              if (todo.Phase2エラー.length > 10) {
                todo.Phase2エラー = todo.Phase2エラー.slice(-10);
              }

              await firestore.collection(COLLECTIONS.TODOS).doc(match.todoNo).set(todo, { merge: true });
              console.log(`    ✓ エラー情報を保存しました`);
            }
          } catch (saveError) {
            console.log(`    ⚠️  エラー情報の保存に失敗: ${saveError.message}`);
          }
        }
      }
    } else {
      // AI判定が無効な場合はファイル照合のみ
      if (!PHASE2_AI_ENABLED) {
        console.log('ℹ️  Phase 2 AI判定は無効化されています（ファイル照合のみ）');
      } else if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️  OPENAI_API_KEYが未設定のため、Phase 2 AI判定をスキップ');
      }

      for (const result of phase2Matches) {
        if (!results.has(result.todoNo)) {
          console.log(`  - ${result.todoNo}: ${result.matchedFile}`);
          results.set(result.todoNo, {
            reason: result.reason,
            phase: 'Phase2 (ファイル照合のみ)',
            commitHash: commit.hash.substring(0, 10),
            commitMessage: commit.message.split('\n')[0]
          });
        }
      }
    }
  } else {
    console.log('ℹ️  ファイル名が一致するToDoが見つかりませんでした');
  }

  console.log('');

  // ==================== 統合結果 ====================
  console.log('=========================================');
  console.log('📊 統合結果');
  console.log('=========================================');

  if (results.size === 0) {
    console.log('ℹ️  該当するToDoが見つかりませんでした。');
    console.log('');
    console.log('💡 ヒント:');
    console.log('  - ToDoの判定対象情報に成果物ファイル名を設定する（Phase 2）');
    console.log('');
    process.exit(0);
  }

  console.log(`✓ ${results.size}件のToDoをクローズ候補にマークします:\n`);

  for (const [todoNo, data] of results) {
    console.log(`  【${todoNo}】`);
    console.log(`    判定: ${data.phase}`);
    console.log(`    アクション: クローズ候補マーク（レビュー必須）`);
    console.log(`    理由: ${data.reason}`);
    if (data.aiAnalysis) {
      console.log(`    AI完成度: ${data.aiAnalysis.completeness}`);
    }
    console.log('');
  }

  // ==================== API呼び出し ====================
  console.log('🚀 クローズ候補判定APIを呼び出し中...');

  let successCount = 0;
  let errorCount = 0;

  for (const [todoNo, data] of results) {
    try {
      await markAsCloseCandidate(todoNo, data);
      console.log(`✓ ${todoNo}: マーク完了`);
      successCount++;
    } catch (error) {
      console.log(`✗ ${todoNo}: ${error.message}`);
      errorCount++;
    }
  }

  console.log('');
  console.log('=========================================');
  console.log('処理完了');
  console.log('=========================================');
  console.log(`成功: ${successCount}件`);
  console.log(`失敗: ${errorCount}件`);
  console.log('');

  if (successCount > 0) {
    console.log('📌 次のステップ:');
    console.log('1. アプリのダッシュボードを開く');
    console.log('2. 「クローズ候補」セクションを確認');
    console.log('3. 該当ToDoをレビューしてクローズ');
    console.log('');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// スクリプト実行
main().catch((error) => {
  console.error('❌ エラー:', error.message);
  console.error(error.stack);
  process.exit(1);
});
