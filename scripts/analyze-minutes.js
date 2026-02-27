#!/usr/bin/env node

/**
 * 議事録AI自動解析システム
 *
 * Markdownフォーマットの議事録ファイルを解析し、
 * 課題(Issues)とToDo項目を自動抽出してFirestoreに保存します。
 *
 * 使用方法:
 *   node scripts/analyze-minutes.js --file minutes/example.md --projectId PROJECT_ID
 *
 * 機能:
 * - OpenAI GPT-4oによる議事録の構造化解析
 * - 課題とToDoの自動抽出
 * - Firestore pendingMinutesコレクションへの保存
 * - マルチテナント対応（projectId指定可能）
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// ==================== 設定 ====================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o';
const MAX_FILE_SIZE = 50000; // 50KB

// ==================== コマンドライン引数解析 ====================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    file: null,
    projectId: '',
    commit: '',
    pushedBy: ''
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && i + 1 < args.length) {
      options.file = args[i + 1];
      i++;
    } else if (args[i] === '--projectId' && i + 1 < args.length) {
      options.projectId = args[i + 1];
      i++;
    } else if (args[i] === '--commit' && i + 1 < args.length) {
      options.commit = args[i + 1];
      i++;
    } else if (args[i] === '--pushedBy' && i + 1 < args.length) {
      options.pushedBy = args[i + 1];
      i++;
    }
  }

  return options;
}

// ==================== Firestore初期化 ====================

let db;
let COLLECTIONS;

async function initializeFirestore() {
  // Firebase Admin SDKの初期化
  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is required');
    }

    const serviceAccount = JSON.parse(serviceAccountKey);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.GCP_PROJECT_ID
    });
  }

  db = admin.firestore();

  COLLECTIONS = {
    PENDING_MINUTES: 'pendingMinutes',
    ISSUES: 'issues',
    TODOS: 'todos',
    PROJECTS: 'projects'
  };

  return { db, COLLECTIONS };
}

// ==================== ユーティリティ関数 ====================

/**
 * ファイルを読み込む
 */
function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`ファイルサイズが大きすぎます: ${stats.size} bytes (上限: ${MAX_FILE_SIZE} bytes)`);
  }

  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * OpenAI APIを呼び出して議事録を解析
 */
async function analyzeMinutes(content, openai) {
  console.log('📊 OpenAI GPT-4oで議事録を解析中...');

  const prompt = `
あなたは議事録解析の専門家です。以下のMarkdown形式の議事録から、プロジェクト情報、課題(Issue)、ToDo項目を抽出してください。

# 議事録フォーマットの構造

議事録は以下の構造を持ちます:

1. **「## 1. 前回課題・ToDoの進捗確認」セクション**
   - このセクション内のすべての課題・ToDoは **既存データの更新** です
   - 必ず \`既存課題No\` または \`既存ToDoNo\` フィールドを含めてください

2. **「## 2. 新規議題」以降のセクション**
   - このセクション内の課題・ToDoは **新規データ** です
   - 親子関係に注意してください

# 抽出ルール

## 1. プロジェクト情報の抽出
- 議事録の冒頭「# プロジェクト情報」セクションから抽出
- 「プロジェクト名: XXX」の形式から値を取得
- セクションがない場合は null

## 2. 既存課題の更新（「## 1. 前回課題・ToDoの進捗確認」セクション）

### 既存課題の抽出
- 見出し: \`### 課題: タスク XXX [既存課題: ISSUE-YYY]\` の形式
- \`[既存課題: ISSUE-YYY]\` から課題番号を抽出
- **必ず \`既存課題No: "ISSUE-YYY"\` フィールドを含める**
- 次の行の変更内容を抽出:
  - \`**最新状況**: 内容\` → \`課題の最新状況\` フィールドに設定
  - \`**対応方針**: 内容\` → \`対応の方向性・結論\` フィールドに設定
  - \`**期日**: 内容\` → \`期日\` フィールドに設定
  - \`**完了**\` → \`ステータス\` を "クローズ" に設定
  - \`**中止**\` → \`ステータス\` を "中止" に設定

### 既存ToDoの抽出
- 見出し: \`**ToDo**: タスク XXX [既存ToDo: TODO-YYY を更新]\` の形式
- \`[既存ToDo: TODO-YYY を更新]\` または \`[既存ToDo: TODO-YYY]\` からToDo番号を抽出
- **必ず \`既存ToDoNo: "TODO-YYY"\` フィールドを含める**
- 次の行の変更内容を抽出:
  - \`**最新状況**: 内容\` → \`ToDo内容\` フィールドに設定
  - \`**対応方針**: 内容\` → \`ToDo内容\` フィールドに設定
  - \`**期日**: 内容\` → \`期日\` フィールドに設定
  - \`**完了**\` → \`ステータス\` を "クローズ" に設定
  - \`**中止**\` → \`ステータス\` を "中止" に設定

## 3. 新規課題・ToDoの抽出（「## 2. 新規議題」以降のセクション）

### 新規課題の抽出
- 見出し: \`### 課題: XXX\` の形式（\`[既存課題: ...]\` の記述がない）
- 課題タイトルは見出しから「課題: 」を除いた部分
- \`**課題内容**:\`、\`**対応方針**:\`、\`**担当者**:\`、\`**期限**:\` などから情報を抽出

### 新規ToDoの抽出と親子関係
- 見出し: \`**ToDo**: XXX\` の形式（\`[既存ToDo: ...]\` の記述がない）
- ToDoタイトルは「ToDo: 」を除いた部分
- **親子関係の判定**:
  - \`### 課題: XXX\` の配下にある「今後のアクション」セクション内の \`**ToDo**\` は、その課題の子ToDo
  - **必ず \`親課題タイトル参照\` フィールドに親課題のタイトル（「課題: 」を除いた部分）を設定**
  - 例: 「### 課題: 組織階層型データ構造への移行」の配下のToDoは \`親課題タイトル参照: "組織階層型データ構造への移行"\`
- 担当者、期日、内容、判定対象（成果物ファイル名）などの情報を抽出

# フィールドの詳細

## 課題のフィールド
- \`課題タイトル\`: string（必須）
- \`既存課題No\`: string（既存課題の場合のみ。例: "ISSUE-001", "NEW-ISSUE-2"）
- \`課題内容\`: string（「**課題内容**:」から抽出）
- \`対応の方向性・結論\`: string（「**対応方針**:」から抽出）
- \`課題の最新状況\`: string（「**最新状況**:」から抽出）
- \`担当者\`: string
- \`期日\`: string（YYYY-MM-DD形式。「期限」「期日」から抽出）
- \`ステータス\`: string（明示的に記載がない限り「起票」）
- \`重要度\`: string（明示的に記載がない限り「中」）

## ToDoのフィールド
- \`ToDoタイトル\`: string（必須）
- \`既存ToDoNo\`: string（既存ToDoの場合のみ。例: "TODO-004", "TODO-025"）
- \`親課題タイトル参照\`: string（新規ToDoで親課題がある場合のみ）
- \`ToDo内容\`: string（「内容:」「- 内容:」から抽出）
- \`担当者\`: string（「担当者:」「- 担当者:」から抽出）
- \`期日\`: string（YYYY-MM-DD形式。「期日:」「- 期日:」から抽出）
- \`ステータス\`: string（明示的に記載がない限り「起票」）
- \`優先度\`: string（明示的に記載がない限り「中」）
- \`判定対象情報\`: object
  - \`成果物ファイル名\`: string（「判定対象:」「- 判定対象:」から抽出）
  - \`成果物URL\`: string

# レスポンス形式

以下のJSON形式で返してください:

\`\`\`json
{
  "projectName": "string or null",
  "issues": [
    {
      "課題タイトル": "組織階層型データ構造への移行",
      "課題内容": "...",
      "対応の方向性・結論": "...",
      "担当者": "高松",
      "期日": "2026-02-05",
      "ステータス": "起票",
      "重要度": "中"
    },
    {
      "課題タイトル": "タスク NEW-ISSUE-2",
      "既存課題No": "NEW-ISSUE-2",
      "課題の最新状況": "(未定)",
      "ステータス": "起票",
      "重要度": "中"
    }
  ],
  "todos": [
    {
      "ToDoタイトル": "組織階層型データ構造の設計書作成",
      "親課題タイトル参照": "組織階層型データ構造への移行",
      "ToDo内容": "Firestoreの新しいコレクション構造の設計書を作成...",
      "担当者": "高松",
      "期日": "2026-02-05",
      "判定対象情報": {
        "成果物ファイル名": "docs/FIRESTORE_SCHEMA_V2.md",
        "成果物URL": ""
      },
      "ステータス": "起票",
      "優先度": "中"
    },
    {
      "ToDoタイトル": "タスク TODO-004",
      "既存ToDoNo": "TODO-004",
      "ToDo内容": "server.jsの /api/register エンドポイントで...",
      "ステータス": "起票",
      "優先度": "中"
    }
  ]
}
\`\`\`

# 重要な注意事項

## 既存課題/ToDoの更新時の出力ルール
**【絶対ルール】既存課題/ToDoの更新時は、以下のフィールドのみを出力してください:**
- **必須**: \`既存課題No\` または \`既存ToDoNo\`
- **変更されたフィールドのみ**: 議事録に記載された変更内容（最新状況、対応方針、期日など）
- **出力してはいけないフィールド**:
  - ❌ 課題タイトル / ToDoタイトル（既存データから取得するため不要）
  - ❌ ステータス（完了/中止になった場合のみ出力。それ以外は出力しない）
  - ❌ 重要度 / 優先度（変更が記載されていない限り出力しない）
  - ❌ 判定対象情報（変更が記載されていない限り出力しない）
  - ❌ 担当者、期日、内容など、議事録に変更が記載されていないフィールド

**出力例:**
\`\`\`json
// ✅ 正しい例: 対応方針のみ変更
{
  "既存課題No": "ISSUE-003",
  "対応の方向性・結論": "ロジックを見直す"
}

// ✅ 正しい例: 期日のみ変更
{
  "既存ToDoNo": "TODO-001",
  "期日": "2026-02-26"
}

// ✅ 正しい例: 完了マーク
{
  "既存ToDoNo": "TODO-002",
  "ステータス": "クローズ"
}

// ❌ 間違った例: 不要なフィールドを含む
{
  "ToDoタイトル": "タスク TODO-004",  // ← 不要！
  "既存ToDoNo": "TODO-004",
  "ToDo内容": "前半まで完了",
  "ステータス": "起票",  // ← 変更がないので不要！
  "優先度": "中"        // ← 変更がないので不要！
}
\`\`\`

## その他の注意事項
- **「## 1. 前回課題・ToDoの進捗確認」セクション内のすべての項目には必ず \`既存課題No\` または \`既存ToDoNo\` を含める**
- **新規ToDoで親課題がある場合は必ず \`親課題タイトル参照\` を含める**
- 日付は YYYY-MM-DD 形式に変換
- フィールドが空または情報がない場合は、そのフィールドを省略

# 議事録内容

${content}
`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'あなたは議事録から課題とToDoを正確に抽出するAIアシスタントです。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);

    console.log(`✅ 解析完了: ${result.issues?.length || 0}件の課題, ${result.todos?.length || 0}件のToDo`);

    return result;
  } catch (error) {
    console.error('❌ OpenAI API呼び出しエラー:', error.message);
    throw error;
  }
}

/**
 * プロジェクト名を正規化
 * - スマート引用符を通常の引用符に統一
 * - 前後の空白を削除
 */
function normalizeProjectName(name) {
  if (!name) return '';

  return name
    .trim()
    // スマート引用符を通常の引用符に変換
    .replace(/[\u2018\u2019]/g, "'")  // シングルクォート (U+2018, U+2019 → U+0027)
    .replace(/[\u201C\u201D]/g, '"'); // ダブルクォート (U+201C, U+201D → U+0022)
}

/**
 * プロジェクト名から完全一致でプロジェクトを検索
 * 検索時にスマート引用符を正規化して比較
 */
async function findProjectByName(projectName) {
  if (!projectName || projectName.trim() === '') {
    return null;
  }

  const { db, COLLECTIONS } = await initializeFirestore();

  try {
    const normalizedSearchName = normalizeProjectName(projectName);
    console.log(`   検索クエリ: name == "${projectName}" → 正規化後: "${normalizedSearchName}" (文字数: ${normalizedSearchName.length})`);
    console.log(`   検索文字コード: [${Array.from(normalizedSearchName).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ')}]`);

    // すべてのプロジェクトを取得して、正規化して比較
    const projectsSnapshot = await db.collection(COLLECTIONS.PROJECTS).get();

    // 正規化して比較
    let foundProject = null;
    for (const doc of projectsSnapshot.docs) {
      const data = doc.data();
      const normalizedFirestoreName = normalizeProjectName(data.name || '');

      console.log(`   比較中: "${data.name}" → 正規化後: "${normalizedFirestoreName}"`);
      console.log(`     文字コード: [${Array.from(normalizedFirestoreName).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ')}]`);

      if (normalizedFirestoreName === normalizedSearchName) {
        console.log(`   ✅ 一致！プロジェクト発見: ${doc.id} - ${data.name}`);
        foundProject = {
          id: doc.id,
          ...data
        };
        break;
      }
    }

    if (!foundProject) {
      console.log(`⚠️ プロジェクト名「${projectName}」（正規化後: "${normalizedSearchName}"）に一致するプロジェクトが見つかりませんでした`);
      console.log(`   検索したプロジェクト数: ${projectsSnapshot.docs.length}`);
      return null;
    }

    return foundProject;
  } catch (error) {
    console.error('❌ プロジェクト検索エラー:', error.message);
    return null;
  }
}

/**
 * Firestoreに未承認議事録を保存
 */
async function savePendingMinutes(minutesFile, analysisResult, metadata) {
  console.log('💾 Firestoreに未承認議事録を保存中...');

  const { db, COLLECTIONS } = await initializeFirestore();

  const pendingData = {
    minutesFile: path.basename(minutesFile),
    minutesFilePath: minutesFile,
    projectId: metadata.projectId || '',
    projectNameFromMinutes: metadata.projectNameFromMinutes || '',
    parsedData: {
      issues: analysisResult.issues || [],
      todos: analysisResult.todos || []
    },
    metadata: {
      commit: metadata.commit || '',
      pushedBy: metadata.pushedBy || '',
      analyzedAt: new Date().toISOString(),
      model: AI_MODEL
    },
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  try {
    const docRef = await db.collection(COLLECTIONS.PENDING_MINUTES).add(pendingData);

    console.log(`✅ 未承認議事録を保存しました (ID: ${docRef.id})`);
    console.log(`   - 課題: ${analysisResult.issues?.length || 0}件`);
    console.log(`   - ToDo: ${analysisResult.todos?.length || 0}件`);

    return docRef.id;
  } catch (error) {
    console.error('❌ Firestore保存エラー:', error.message);
    throw error;
  }
}

// ==================== メイン処理 ====================

async function main() {
  console.log('========================================');
  console.log('🔍 議事録AI自動解析開始');
  console.log('========================================');

  // コマンドライン引数を解析
  const options = parseArgs();

  if (!options.file) {
    console.error('❌ エラー: --file オプションは必須です');
    console.log('使用方法: node scripts/analyze-minutes.js --file minutes/example.md [--projectId PROJECT_ID]');
    process.exit(1);
  }

  if (!OPENAI_API_KEY) {
    console.error('❌ エラー: OPENAI_API_KEY環境変数が設定されていません');
    process.exit(1);
  }

  console.log(`📄 ファイル: ${options.file}`);
  console.log(`🏢 プロジェクトID: ${options.projectId || '(デフォルト)'}`);
  console.log(`👤 プッシュユーザー: ${options.pushedBy || '(不明)'}`);
  console.log(`📝 コミット: ${options.commit || '(不明)'}`);
  console.log('');

  try {
    // 1. ファイルを読み込む
    console.log('📖 議事録ファイルを読み込み中...');
    const content = readFile(options.file);
    console.log(`✅ 読み込み完了 (${content.length} 文字)`);
    console.log('');

    // 2. OpenAI APIで解析
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const analysisResult = await analyzeMinutes(content, openai);
    console.log('');

    // 3. プロジェクト名からプロジェクトを検索
    let resolvedProjectId = options.projectId;
    let projectName = analysisResult.projectName;

    if (!resolvedProjectId && projectName) {
      console.log('🔍 プロジェクト名からプロジェクトを検索中...');
      console.log(`   議事録内のプロジェクト名: ${projectName}`);

      const project = await findProjectByName(projectName);

      if (project) {
        resolvedProjectId = project.id;
        console.log(`✅ プロジェクトに紐付け: ${project.name} (ID: ${project.id})`);
      } else {
        console.log(`⚠️ プロジェクト名「${projectName}」に一致するプロジェクトが見つかりませんでした`);
        console.log(`   → プロジェクト未割り当ての未承認議事録として保存します`);
      }
      console.log('');
    }

    // 4. Firestoreに保存
    const metadata = {
      projectId: resolvedProjectId || '',
      projectNameFromMinutes: projectName || '',
      commit: options.commit,
      pushedBy: options.pushedBy
    };

    const pendingId = await savePendingMinutes(options.file, analysisResult, metadata);
    console.log('');

    // 5. サマリー
    console.log('========================================');
    console.log('✅ 議事録解析完了');
    console.log('========================================');
    console.log(`📋 未承認議事録ID: ${pendingId}`);
    console.log(`📊 課題: ${analysisResult.issues?.length || 0}件`);
    console.log(`📊 ToDo: ${analysisResult.todos?.length || 0}件`);
    if (resolvedProjectId) {
      console.log(`🏢 プロジェクト: ${projectName || resolvedProjectId}`);
    } else {
      console.log(`⚠️ プロジェクト: 未割り当て`);
    }
    console.log('');
    console.log('🌐 アプリを開いて未承認議事録を確認してください');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('❌ エラーが発生しました');
    console.error('========================================');
    console.error(error.message);
    console.error('');

    if (error.stack) {
      console.error('スタックトレース:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = { analyzeMinutes, savePendingMinutes };
