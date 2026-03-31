# エンドポイントに関する注意事項

## Vertex AI 一本化（2026-04-01 更新）

すべてのモデルは Vertex AI エンドポイント経由で利用する。
**データはモデル学習に使用されない**（Vertex AI 利用規約による保証）。

### 利用可能モデル

| Model ID | コードネーム | 備考 |
|----------|-------------|------|
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | 推奨（デフォルト） |
| `gemini-3-pro-image-preview` | Nano Banana Pro | 高品質版 |

### エンドポイント

- URL: `aiplatform.googleapis.com/v1/` （globalリージョン）
- URL: `{region}-aiplatform.googleapis.com/v1/` （特定リージョン）
- デフォルトリージョン: `global`

### 自動フォールバック

`-preview` モデルが404を返した場合、スクリプトは自動的に `-preview` なしのモデルIDでリトライする。
これにより、GA昇格時にスキル側の変更なしで移行できる。

例: `gemini-3.1-flash-image-preview` → 404 → `gemini-3.1-flash-image` でリトライ

## 経緯

### 2026-03-13 時点
- `gemini-3-pro-image-preview` および `gemini-3.1-flash-image-preview` は Vertex AI ではアクセス不可（404）
- 同モデルは Generative Language API (`/v1beta/`) でのみ利用可能
- `gemini-2.5-flash-image` を GA モデルとして Vertex AI `/v1/` で利用

### 2026-04-01 更新
- `gemini-3.1-flash-image-preview` および `gemini-3-pro-image-preview` が Vertex AI (`global`) で利用可能に
- Generative Language API ルーティングを廃止し、Vertex AI に一本化
- リージョンを `global` に変更
- `-preview` → 非preview の自動フォールバックロジック追加
- ロールバックタグ: `v1.0-generative-language-api`
