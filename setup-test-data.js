#!/usr/bin/env node

/**
 * 統合テスト用の初期データセットアップスクリプト
 * 
 * 実際のアプリ開発シナリオに基づいた課題とToDoを登録します。
 */

require('dotenv').config();
const { firestore, COLLECTIONS } = require('./firestore-client');

// デフォルトのプロジェクトID
const DEFAULT_PROJECT_ID = 'chBE5SqDffsjqQ72tBeu';

const testData = {
  issues: [
    {
      課題No: 'ISSUE-001',
      課題タイトル: '議事録抽出機能の課題ナンバー修正',
      projectId: DEFAULT_PROJECT_ID,
      課題内容: 'analyze-minutes-auto.jsで仮IDが課題Noフィールドに設定されてしまい、自動採番が正しく動作しない問題を修正する。',
      重要度: '高',
      ステータス: 'クローズ',
      担当者: '高松',
      期日: '2026-02-13',
      起票日: '2026-02-10',
      更新日: '2026-02-13',
      クローズ候補: 'OFF',
      課題の最新状況: '修正完了。仮IDを_tempIdフィールドに設定するように変更し、サーバー側の自動採番が正常に動作するようになった。',
      '対応の方向性・結論': 'analyze-minutes-auto.jsとserver.jsの両方を修正し、課題Noフィールドを削除してから登録APIに送信する。'
    },
    {
      課題No: 'ISSUE-002',
      課題タイトル: '親課題取得ロジックの改善',
      projectId: DEFAULT_PROJECT_ID,
      課題内容: 'ToDoの親課題Noが正しく設定されない問題。仮ID→実際の課題Noの変換マッピングが機能していない。',
      重要度: '高',
      ステータス: '作業中',
      担当者: '高松',
      期日: '2026-02-14',
      起票日: '2026-02-10',
      更新日: '2026-02-13',
      クローズ候補: 'OFF',
      課題の最新状況: '進行中。minutes.jsのclassifyData関数とserver.jsの承認API内のマッピングロジックを修正中。',
      '対応の方向性・結論': '_tempIdフィールドを使った変換マッピングを統一し、エラーハンドリングを強化する。'
    },
    {
      課題No: 'ISSUE-003',
      課題タイトル: 'クローズ判定機能のテスト準備',
      projectId: DEFAULT_PROJECT_ID,
      課題内容: 'GitHub Actionsのワークフローでコミットメッセージを解析し、該当するToDoをクローズ候補にする機能が正しく動作するか検証する。',
      重要度: '中',
      ステータス: '起票',
      担当者: '高松',
      期日: '2026-02-13',
      起票日: '2026-02-13',
      更新日: '2026-02-13',
      クローズ候補: 'OFF',
      課題の最新状況: '新規作成。テストシナリオとサンプルコードの準備が必要。',
      '対応の方向性・結論': '実際のコード変更を含むコミットを作成し、クローズ判定ワークフローの動作を確認する。'
    }
  ],
  todos: [
    {
      ToDoNo: 'TODO-001',
      ToDoタイトル: 'analyze-minutes-auto.jsで仮IDを_tempIdに変更',
      projectId: DEFAULT_PROJECT_ID,
      ToDo内容: '仮IDを課題Noフィールドではなく_tempIdフィールドに設定する。課題Noは削除し、サーバー側の自動採番に任せる。',
      親課題No: 'ISSUE-001',
      優先度: '高',
      ステータス: 'クローズ',
      担当者: '高松',
      期日: '2026-02-13',
      起票日: '2026-02-10',
      更新日: '2026-02-13',
      クローズ日: '2026-02-13',
      クローズ候補: 'OFF',
      判定履歴: [],
      判定対象情報: {
        成果物ファイル名: 'tests/analyze-minutes-auto.js',
        成果物URL: ''
      }
    },
    {
      ToDoNo: 'TODO-002',
      ToDoタイトル: 'server.jsのAPI登録処理を修正',
      projectId: DEFAULT_PROJECT_ID,
      ToDo内容: '/api/registerエンドポイントで、リクエストボディから課題No/ToDoNo/_tempIdを削除してから登録する。',
      親課題No: 'ISSUE-001',
      優先度: '高',
      ステータス: 'クローズ',
      担当者: '高松',
      期日: '2026-02-13',
      起票日: '2026-02-10',
      更新日: '2026-02-13',
      クローズ日: '2026-02-13',
      クローズ候補: 'OFF',
      判定履歴: [],
      判定対象情報: {
        成果物ファイル名: 'server.js',
        成果物URL: ''
      }
    },
    {
      ToDoNo: 'TODO-003',
      ToDoタイトル: 'minutes.jsのclassifyData関数を修正',
      projectId: DEFAULT_PROJECT_ID,
      ToDo内容: 'classifyData関数で新規課題に_tempIdを設定し、課題Noフィールドは削除する。',
      親課題No: 'ISSUE-002',
      優先度: '高',
      ステータス: '未クローズ',
      担当者: '高松',
      期日: '2026-02-14',
      起票日: '2026-02-10',
      更新日: '2026-02-13',
      クローズ日: null,
      クローズ候補: 'OFF',
      判定履歴: [],
      判定対象情報: {
        成果物ファイル名: 'public/js/minutes.js',
        成果物URL: ''
      }
    },
    {
      ToDoNo: 'TODO-004',
      ToDoタイトル: '親課題マッピングのエラーハンドリング強化',
      projectId: DEFAULT_PROJECT_ID,
      ToDo内容: 'server.jsの承認API内で、仮IDが変換できない場合のエラーメッセージを改善し、詳細なログを出力する。',
      親課題No: 'ISSUE-002',
      優先度: '中',
      ステータス: '未クローズ',
      担当者: '高松',
      期日: '2026-02-14',
      起票日: '2026-02-10',
      更新日: '2026-02-13',
      クローズ日: null,
      クローズ候補: 'OFF',
      判定履歴: [],
      判定対象情報: {
        成果物ファイル名: 'server.js',
        成果物URL: ''
      }
    },
    {
      ToDoNo: 'TODO-005',
      ToDoタイトル: 'テストシナリオ用のサンプルコード追加',
      projectId: DEFAULT_PROJECT_ID,
      ToDo内容: 'public/js/test-sample.jsファイルを作成し、簡単なテスト用の関数を追加する。クローズ判定のテストに使用。',
      親課題No: 'ISSUE-003',
      優先度: '中',
      ステータス: '未クローズ',
      担当者: '高松',
      期日: '2026-02-13',
      起票日: '2026-02-13',
      更新日: '2026-02-13',
      クローズ日: null,
      クローズ候補: 'OFF',
      判定履歴: [],
      判定対象情報: {
        成果物ファイル名: 'public/js/test-sample.js',
        成果物URL: ''
      }
    }
  ]
};

async function setupTestData() {
  console.log('🚀 テストデータのセットアップを開始します...\n');

  try {
    // 既存データの確認
    const issuesSnapshot = await firestore.collection(COLLECTIONS.ISSUES).get();
    const todosSnapshot = await firestore.collection(COLLECTIONS.TODOS).get();

    if (issuesSnapshot.size > 0 || todosSnapshot.size > 0) {
      console.log('⚠️  既存データが存在します:');
      console.log(`   課題: ${issuesSnapshot.size}件`);
      console.log(`   ToDo: ${todosSnapshot.size}件`);
      console.log('\n   既存データを削除してから登録します...\n');

      // クリーンアップ
      const batch1 = firestore.batch();
      issuesSnapshot.docs.forEach(doc => batch1.delete(doc.ref));
      await batch1.commit();

      const batch2 = firestore.batch();
      todosSnapshot.docs.forEach(doc => batch2.delete(doc.ref));
      await batch2.commit();
    }

    // 課題を登録
    console.log('📋 課題を登録中...');
    for (const issue of testData.issues) {
      await firestore.collection(COLLECTIONS.ISSUES).doc(issue.課題No).set(issue);
      console.log(`  ✓ ${issue.課題No}: ${issue.課題タイトル}`);
    }

    // ToDoを登録
    console.log('\n📝 ToDoを登録中...');
    for (const todo of testData.todos) {
      await firestore.collection(COLLECTIONS.TODOS).doc(todo.ToDoNo).set(todo);
      console.log(`  ✓ ${todo.ToDoNo}: ${todo.ToDoタイトル} (親: ${todo.親課題No})`);
    }

    console.log('\n✅ テストデータのセットアップが完了しました！');
    console.log('\n📊 登録されたデータ:');
    console.log(`   課題: ${testData.issues.length}件`);
    console.log(`   ToDo: ${testData.todos.length}件`);
    console.log('\n💡 次のステップ:');
    console.log('   1. Word議事録を作成（minutes/test-integration.docx）');
    console.log('   2. 議事録解析を実行');
    console.log('   3. テストファイルを作成してコミット');
    console.log('   4. クローズ判定の動作確認');

  } catch (error) {
    console.error('❌ セットアップ中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
setupTestData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });
