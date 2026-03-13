# エンドポイントと学習リスクに関する注意事項

## エンドポイントの切り分け

スクリプトはモデルIDに基づいて自動的にエンドポイントをルーティングする。

### Vertex AI（GAモデル）
- 対象: `-preview` サフィックスが付かないモデル（例: `gemini-2.5-flash-image`）
- エンドポイント: `{region}-aiplatform.googleapis.com/v1/`
- **データはモデル学習に使用されない**（Vertex AI利用規約による保証）

### Generative Language API（Previewモデル）
- 対象: `-preview` サフィックスが付くモデル（例: `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`）
- エンドポイント: `generativelanguage.googleapis.com/v1beta/`
- **データがモデル学習に使用される可能性がある**（Google AI利用規約）
- OAuthスコープに `generative-language` が追加で必要

## 運用上の注意

- Previewモデルは日本語テキストの正確なレンダリングなど、GA版にない機能を持つ
- しかし業務利用時は学習リスクがあるため、**必ずユーザーの明示的な許可を得てから使用すること**
- GAモデルへの昇格が行われた場合、Vertex AIエンドポイントに切り替わり学習リスクは解消される

## 経緯（2026-03-13時点）

- `gemini-3-pro-image-preview` および `gemini-3.1-flash-image-preview` はVertex AI (`/v1/` および `/v1beta1/`) ではアクセス不可（404）
- 同モデルは Generative Language API (`/v1beta/`) でのみ利用可能
- `gemini-2.5-flash-image` はVertex AI `/v1/` で利用可能
