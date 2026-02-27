const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let firestore = null;
let initializationError = null;

// Firebase Adminの初期化
try {
  if (!admin.apps.length) {
    const config = {
      projectId: process.env.GCP_PROJECT_ID || 'tecnos-cbp',
    };

    // サービスアカウントキーファイルが存在する場合のみ使用
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (credPath) {
      try {
        // ファイルパスを絶対パスに変換
        const absolutePath = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);

        // ファイルが存在し、読み込み可能かチェック
        if (fs.existsSync(absolutePath)) {
          const serviceAccount = require(absolutePath);

          // サービスアカウントキーに project_id が含まれているかチェック
          if (serviceAccount.project_id) {
            config.credential = admin.credential.cert(serviceAccount);
            console.log('✅ サービスアカウントキーで認証しました');
          } else {
            console.log('⚠️  サービスアカウントキーに project_id がありません。credentialなしで初期化します。');
          }
        } else {
          console.log('⚠️  認証ファイルが見つかりません。credentialなしで初期化します:', absolutePath);
        }
      } catch (error) {
        console.log('⚠️  認証ファイルの読み込みに失敗しました。credentialなしで初期化します:', error.message);
      }
    } else {
      // GOOGLE_APPLICATION_CREDENTIALS が設定されていない場合
      // Cloud Runやその他のGCP環境では、credentialを指定しない方が良い
      // Cloud Runのメタデータサービスが自動的に認証情報を提供する
      console.log('✅ Cloud Run環境: credentialなしで初期化します（自動認証）');
    }

    // 初期化実行（credentialが設定されていない場合、GCPメタデータサービスから自動取得）
    admin.initializeApp(config);
    console.log('✅ Firebase Admin初期化完了');
  }

  firestore = admin.firestore();
  console.log('✅ Firestoreインスタンス作成成功');
} catch (error) {
  console.error('❌ Firebase Admin SDK初期化エラー:', error.message);
  console.error('詳細:', error);
  initializationError = error;
  // サーバーは起動を続行するが、API呼び出し時にエラーを返す
}

// コレクション名の定義
const COLLECTIONS = {
  PROJECTS: 'projects',
  ISSUES: 'issues',
  TODOS: 'todos',
  PENDING_MINUTES: 'pending_minutes'  // 未承認議事録
};

// 接続確認用の関数
const testConnection = async () => {
  if (initializationError) {
    console.error('❌ Firestore初期化されていません:', initializationError.message);
    return false;
  }

  if (!firestore) {
    console.error('❌ Firestoreインスタンスが存在しません');
    return false;
  }

  try {
    // 空のクエリでFirestoreへの接続をテスト
    await firestore.collection(COLLECTIONS.ISSUES).limit(1).get();
    console.log('✅ Firestore接続成功:', process.env.GCP_PROJECT_ID || 'local-dev');
    return true;
  } catch (error) {
    console.error('❌ Firestore接続失敗:', error.message);
    return false;
  }
};

// エクスポート
module.exports = { firestore, COLLECTIONS, testConnection };
