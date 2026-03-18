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

## ⚠️ 重要：テンプレートの正しいコピー方法

### ❌ 間違った使い方

`github-actions-template` フォルダをそのままコピーしても**動作しません**。

```
ユーザーのプロジェクト/
  └── github-actions-template/  ← フォルダごとコピー（動作しない）
      ├── .github/
      │   └── workflows/
      ├── scripts/
      └── tests/
```

→ **この配置ではワークフローが動作しません**

### ✅ 正しい使い方

**`github-actions-template` の中身をプロジェクトルートに展開してください。**

```
ユーザーのプロジェクト/
  ├── .github/              ← 中身を直接配置
  │   └── workflows/
  ├── scripts/              ← 中身を直接配置
  ├── tests/                ← 中身を直接配置
  ├── minutes/              ← 中身を直接配置
  ├── firestore-client.js   ← 中身を直接配置
  └── package.json          ← 中身を直接配置（⚠️ 下記の注意点を参照）
```

→ **フォルダの中身を直接ルートに配置**

---

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

⚠️ **社内利用について**:
このテンプレートはテクノスジャパン社内で使用するものです。
全社員で**同じFirebaseプロジェクト（tecnos-cbp）**を共有します。
アプリ内でプロジェクト（案件）管理があるため、Firebaseプロジェクトを分ける必要はありません。

GitHubリポジトリの **Settings > Secrets and variables > Actions** で以下のシークレットを登録してください：

| シークレット名 | 取得方法 | 必須 |
|--------------|---------|-----|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | 管理者から入手（全社員共通） | ✅ 必須 |
| `OPENAI_API_KEY` | 各自で取得 | ✅ 必須 |
| `GCP_PROJECT_ID` | `tecnos-cbp`（固定） | ✅ 必須 |
| `GCP_WIF_PROVIDER` | 管理者から入手（deploy.yml使用時のみ） | ⚪ オプション |
| `GCP_SA_EMAIL` | 管理者から入手（deploy.yml使用時のみ） | ⚪ オプション |

---

### 📋 各シークレットの設定値

#### 1️⃣ `FIREBASE_SERVICE_ACCOUNT_KEY` (必須)

**説明**: FirebaseのサービスアカウントJSON鍵（Firestore接続用）

**取得方法**: **管理者（馬場さん）から入手してください**

**入手先**:
- Slackで馬場さんにDMで依頼
- または、社内の安全な共有場所（社内Wiki、パスワードマネージャー等）から取得

**設定する値の形式**:
```json
{
  "type": "service_account",
  "project_id": "tecnos-cbp",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "cloud-run-app-sa@tecnos-cbp.iam.gserviceaccount.com",
  ...
}
```

⚠️ **セキュリティ上の重要な注意**:
- このキーは**最高機密情報**です
- Firestoreデータベースへの完全なアクセス権限があります
- **絶対に**以下の場所に記載・保存しないでください：
  - README.md やソースコード内
  - 公開リポジトリ
  - チャットツール（Slack、Teams等）のパブリックチャンネル
  - 個人のクラウドストレージ（Google Drive、Dropbox等）
- GitHub Secrets 以外では、管理者が指定した安全な場所にのみ保管してください

---

#### 2️⃣ `OPENAI_API_KEY` (必須)

**説明**: OpenAI API Key（議事録解析・Phase 2クローズ判定用）

**取得方法**: **各自で取得してください**（個人負担）

1. [OpenAI Platform](https://platform.openai.com/api-keys) を開く
2. **個人アカウント**でログイン（アカウントがない場合は新規登録）
3. **Create new secret key** をクリック
4. キー名を入力（例: `task-management-app`）
5. 表示されたキーをコピー

**設定する値の形式**:
```
sk-proj-Ab12Cd34Ef56Gh78...
```

⚠️ **注意**:
- キーは一度しか表示されません。必ず保存してください
- OpenAI APIは**有料**です。使用量に応じて**個人負担**で課金されます
- 無料枠（$5クレジット）がある場合もありますが、制限があります
- 使いすぎに注意してください

---

#### 3️⃣ `GCP_PROJECT_ID` (必須)

**説明**: Google Cloud Project ID

**設定する値**: `tecnos-cbp` （固定）

⚠️ **注意**:
- 全社員で同じ値（`tecnos-cbp`）を使用します
- アプリ内でプロジェクト（案件）を管理するため、Firebaseプロジェクトを分ける必要はありません

---

#### 4️⃣ `GCP_WIF_PROVIDER` (オプション)

**説明**: Workload Identity Providerのリソース名

**いつ必要？**:
- Cloud Runへのデプロイ機能（deploy.yml）を使用する場合のみ必要
- 議事録解析と自動クローズ判定機能のみを使う場合は**不要**

**取得方法**: 管理者（馬場さん）から入手してください

---

#### 5️⃣ `GCP_SA_EMAIL` (オプション)

**説明**: サービスアカウントのメールアドレス

**いつ必要？**:
- Cloud Runへのデプロイ機能（deploy.yml）を使用する場合のみ必要
- 議事録解析と自動クローズ判定機能のみを使う場合は**不要**

**設定する値**: `cloud-run-app-sa@tecnos-cbp.iam.gserviceaccount.com` （固定）

---

### 🔐 GitHub Secretsへの登録方法

1. GitHubでリポジトリを開く
2. **Settings** タブをクリック
3. 左サイドバー **Secrets and variables** → **Actions** をクリック
4. **New repository secret** をクリック
5. **Name**: シークレット名を入力（例: `FIREBASE_SERVICE_ACCOUNT_KEY`）
6. **Secret**: 上記で取得した値を貼り付け
7. **Add secret** をクリック
8. すべてのシークレットに対して繰り返す

---

## ✅ 完了！

設定が完了したら、フィーチャーブランチにコミット&プッシュすると自動的にワークフローが起動します。

- **自動クローズ判定（Phase 2）**: コードをプッシュすると、ToDoの判定対象ファイルと照合し、AIで完成度を判定してクローズ候補にマーク（すべてレビュー必須）
- **議事録解析**: `minutes/` フォルダにWord(.docx)またはMarkdown(.md)ファイルをプッシュすると、AIで課題とToDoを自動抽出

---

## 📚 詳細ドキュメント

より詳しいセットアップ手順、カスタマイズ方法、トラブルシューティングは以下を参照してください：

- [詳細セットアップガイド](../docs/SETUP_ACTIONS.md)

---

## 🛠️ カスタマイズ（オプション）

### アプリ内プロジェクト（案件）IDを指定する場合

⚠️ **注意**: これは「Firebase プロジェクトID（tecnos-cbp）」ではなく、「アプリ内で管理する案件のID」です。

特定の案件専用のリポジトリを作成する場合、`call-auto-close.yml` と `call-analyzer.yml` の `project_id` パラメータを編集してください。

```yaml
# call-auto-close.yml の例
with:
  project_id: '案件A'  # ← アプリ内の案件IDを指定
```

**通常は設定不要です**。議事録にプロジェクト名を記載すれば自動的に案件が紐づけられます。

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
