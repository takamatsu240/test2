# GitHub Actions テンプレート - タスク管理アプリ

このフォルダには、タスク管理アプリのGitHub Actions機能を有効化するためのファイル一式が含まれています。

## 📦 含まれるファイル

```
github-actions-template/
├── .github/
│   └── workflows/
│       ├── auto-close.yml         # 実体ワークフロー：自動クローズ判定
│       ├── analyzer.yml           # 実体ワークフロー：議事録解析
│       ├── call-auto-close.yml    # 呼び出し側：自動クローズ判定
│       └── call-analyzer.yml      # 呼び出し側：議事録解析
├── scripts/
│   ├── analyze-minutes.js         # 議事録解析スクリプト
│   └── docx_to_md.py             # Word→Markdown変換スクリプト
├── tests/
│   └── analyze-commit.js          # コミット解析スクリプト
├── minutes/                       # 議事録フォルダ（すぐに使える）
│   ├── .gitkeep                  # 空フォルダ保持用
│   └── README.md                 # 使い方ガイド
├── firestore-client.js            # Firestore接続クライアント
├── package.json                   # npm依存関係（Actions用）
└── README.md                      # このファイル
```

## ⚠️ 重要：既存プロジェクトへ導入する際の注意点

### 📦 package.json の上書きに注意！

テンプレートの `package.json` をそのまま既存プロジェクトに上書きコピーすると、**既存アプリのシステムが壊れる可能性があります**。

既存プロジェクトの種類に応じて、以下の対応を行ってください：

---

#### 🅰️ パターンA：既存プロジェクトが package.json を持っている場合

**対象:** Next.js、React、Vue.js、Express など、Node.js を使用しているプロジェクト

**対応方法:**

1. **テンプレートの `package.json` は上書きコピーしない**
2. **既存の `package.json` の `dependencies` に以下を追記**

```json
{
  "dependencies": {
    // ... 既存の依存関係 ...
    "@google-cloud/firestore": "^8.1.0",
    "dotenv": "^16.3.1",
    "firebase-admin": "^13.6.1",
    "mammoth": "^1.11.0",
    "minimatch": "^9.0.3",
    "openai": "^4.20.0"
  }
}
```

3. **npm install を実行**
   ```bash
   npm install
   ```

---

#### 🅱️ パターンB：既存プロジェクトが package.json を持っていない場合

**対象:** Python、Ruby、PHP、Java、Go など、Node.js を使用していないプロジェクト

**対応方法:**

1. **テンプレートの `package.json` をそのままコピー**
   - プロジェクトのルートディレクトリに配置
   - GitHub Actions のサーバー上でのみ使用されるため、既存アプリには影響しません

2. **npm install を実行**
   ```bash
   npm install
   ```

---

## 🚀 クイックスタート

### ステップ1: ファイルをコピー

#### 1-1. 基本ファイルをコピー

以下のファイル・フォルダをコピーしてください：

```bash
✅ コピーするもの:
├── .github/           # ワークフローファイル
├── scripts/           # スクリプト
├── tests/             # テスト
├── minutes/           # 議事録フォルダ
├── firestore-client.js
└── package.json       # ⚠️ 条件付き（下記参照）
```

#### 1-2. package.json の処理

**🅰️ 既存の package.json がある場合:**
- ❌ テンプレートの `package.json` はコピー**しない**
- ✅ 上記「パターンA」の手順で依存関係を追記

**🅱️ 既存の package.json がない場合:**
- ✅ テンプレートの `package.json` をそのままコピー

#### 1-3. コピー後の構造

```bash
your-repository/
├── .github/          # ← コピーされたワークフロー
├── scripts/          # ← コピーされたスクリプト
├── tests/            # ← コピーされたテスト
├── minutes/          # ← コピーされた議事録フォルダ
├── firestore-client.js
├── package.json      # ← 状況に応じて処理（上記参照）
└── ... （既存のコード）
```

### ステップ2: npm パッケージをインストール

```bash
npm install
```

### ステップ3: GitHub Secrets を設定

GitHubリポジトリの **Settings > Secrets and variables > Actions** で以下のシークレットを登録してください：

| シークレット名 | 説明 | 必須 |
|--------------|------|-----|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase Service Account JSON Key | ✅ 必須 |
| `OPENAI_API_KEY` | OpenAI API Key (GPT-4o) | ✅ 必須 |
| `GCP_PROJECT_ID` | Google Cloud Project ID | ✅ 必須 |
| `GCP_WIF_PROVIDER` | GCP Workload Identity Provider | ⚪ オプション |
| `GCP_SA_EMAIL` | GCP Service Account Email | ⚪ オプション |

## ✅ 完了！

設定が完了したら、フィーチャーブランチにコミット&プッシュすると自動的にワークフローが起動します。

- **自動クローズ判定**: コードをプッシュすると、関連するToDoを自動検出してクローズ候補にマーク
- **議事録解析**: `minutes/` フォルダにWord(.docx)またはMarkdown(.md)ファイルをプッシュすると、AIで課題とToDoを自動抽出

---

## 📚 詳細ドキュメント

より詳しいセットアップ手順、カスタマイズ方法、トラブルシューティングは以下を参照してください：

- [詳細セットアップガイド](../docs/SETUP_ACTIONS.md)

---

## 🛠️ カスタマイズ（オプション）

### プロジェクトIDを指定する場合

複数プロジェクトを管理している場合、`call-auto-close.yml` と `call-analyzer.yml` の `project_id` パラメータを編集してください。

```yaml
# call-auto-close.yml の例
with:
  project_id: 'your-project-id-here'  # ← ここを変更
```

### 議事録フォルダのパスを変更する場合

`call-analyzer.yml` の `paths` セクションを編集してください。

```yaml
# call-analyzer.yml の例
on:
  push:
    paths:
      - 'your-custom-folder/**/*.docx'  # ← ここを変更
      - 'your-custom-folder/**/*.md'
```

---

## 💡 よくある質問

**Q: 既存の package.json を上書きしてしまった！**

**A:** Git で復元できます：
```bash
# コミット前の場合
git checkout HEAD -- package.json

# コミット済みの場合
git log --oneline -10  # 履歴確認
git show <ハッシュ>:package.json > package.json
```
復元後、上記「パターンA」の手順で依存関係のみを追記してください。

---

**Q: 既存プロジェクトに導入したいが、Node.js を使っていない（Python、Ruby、PHP など）**

**A:** 問題ありません！
- テンプレートの `package.json` をそのままコピーしてください
- GitHub Actions のサーバー上でのみ使用されるため、既存アプリには影響しません
- Python、Ruby、PHP などのコードはそのまま動作します

---

**Q: Next.js プロジェクトだが、テンプレートの package.json をコピーしても良い？**

**A:** ❌ いいえ！
- Next.js はすでに `package.json` を持っているため、上書きすると壊れます
- 上記「パターンA」の手順に従って、依存関係のみを既存ファイルに追記してください

---

**Q: ワークフローが起動しない**

**A:** 以下を確認してください：
- フィーチャーブランチ（main/master以外）でプッシュしているか
- コミットメッセージに `[skip ci]` が含まれていないか
- GitHub Secrets が正しく設定されているか

---

**Q: 議事録解析が動かない**

**A:** 以下を確認してください：
- `minutes/` フォルダがコピーされているか
- 議事録ファイルの拡張子が `.docx` または `.md` か
- フィーチャーブランチでプッシュしているか

---

**Q: npm のバージョンエラーが出る**

**A:** Node.js 20以上が必要です。GitHub Actionsでは自動的に Node.js 20 がセットアップされます。

---

## 📞 サポート

問題が発生した場合は、[詳細セットアップガイド](../docs/SETUP_ACTIONS.md) のトラブルシューティングセクションを参照してください。
