# generate-image

Claude Code用の画像生成スキル。Google Gemini Image Generation API（Vertex AI / Generative Language API）を利用して画像を生成・加工する。

## 機能

- **テキストから画像生成** — プロンプトに基づく画像生成
- **参照画像ベースの生成** — 既存画像のキャラクターやスタイルを引き継いだ別シーン生成
- **画像後処理** — クロップ、リサイズ、フォーマット変換（sharp使用）

## 対応モデル

| モデル | カテゴリ | 特徴 |
|--------|----------|------|
| `gemini-2.5-flash-image` | GA | 安定、学習リスクなし（Vertex AI） |
| `gemini-3-pro-image-preview` | Preview | 高品質、4K対応、日本語テキスト対応 |
| `gemini-3.1-flash-image-preview` | Preview | 最新、4K対応、幅広いアスペクト比 |

> **注意:** Previewモデルは Generative Language API 経由のため、送信データがモデル学習に使用される可能性があります。

## セットアップ

### 必須

- Node.js 18+
- `GEMINI_SECRET_PATH` 環境変数にGCPサービスアカウントJSONキーのパスを設定

### オプション（画像後処理用）

```bash
npm install -g sharp
```

## スキルのインストール

```bash
# 個人用（全プロジェクト共通）
cp -r generate-image ~/.claude/skills/

# プロジェクト固有
cp -r generate-image <project>/.claude/skills/
```

## ファイル構成

```
generate-image/
├── SKILL.md                       # スキル定義
├── scripts/
│   ├── generate-image.mjs         # 画像生成スクリプト（依存なし）
│   └── process-image.mjs          # 画像後処理スクリプト（sharp必要）
└── references/
    └── endpoint-notes.md          # エンドポイント技術メモ
```
