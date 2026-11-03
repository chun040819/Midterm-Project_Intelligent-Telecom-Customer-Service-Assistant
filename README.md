# TelcoCare AI（期中 Demo）

虛構電信公司的繁體中文智慧客服。完整規格見 [docs/SPEC.md](docs/SPEC.md)。所有資料皆為虛構。

目前進度：工單 01（查詢目前訂閱的首條完整流程）。

## 需求

Node 22+、[uv](https://docs.astral.sh/uv/)、一組 OpenAI-compatible 且支援 Tool Calling + Streaming 的模型。

## 啟動

```bash
./scripts/setup.sh        # 安裝依賴、建立 .env、以固定 Seed 建 SQLite
# 編輯 .env：填入 LLM_API_KEY（LLM_BASE_URL／LLM_MODEL 已預設為課程 NKUST Furen-large）
./scripts/dev.sh          # FastAPI 127.0.0.1:8000 + Next.js 127.0.0.1:3000
```

Next.js 需讀到根目錄 `.env`：`dev.sh` 已匯出；若單獨執行 `npm run dev`，請在 `frontend/` 放一個指向 `../.env` 的 `.env.local`。

其他入口：`./scripts/reset-demo.sh`（還原 Seed；記憶體 Session 需重啟 dev）、`./scripts/test.sh`。

## 架構重點

- Browser 只連 Next.js；Next.js Server 以 `X-Internal-Token` + `X-Demo-Customer-Id` 呼叫僅綁本機的 FastAPI。
- 客戶身分來自 HttpOnly／SameSite=Lax Cookie 對應的伺服器 Session（預設 C0001），模型工具沒有 `customer_id` 參數，多餘欄位會被拒絕。
- 卡片的數字由 Session 內的 `data_ref` 經 `/api/data-ref/{ref}` 解析，模型只能指定引用。
- 未設定 `LLM_*` 時 `/api/chat` 回 503，不以 Mock 假裝成功。

## 版本鎖定（已測試可建置）

Next 16.4.4、React 19.3.1、ai 7.0.159、@ai-sdk/openai-compatible 3.0.82、@assistant-ui/react 0.15.32、@assistant-ui/ai-sdk 0.0.16、@assistant-ui/generative-ui 0.0.8、@assistant-ui/next 0.0.25、zod 4.6.7。

## 模型固定版本

- 對話模型：`Furen-large`（`.env` 的 `LLM_MODEL`，課程 NKUST AI Hub 託管）。
- RAG 嵌入模型：`intfloat/multilingual-e5-small`，revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`（`backend/rag/config.py`）；換版須重跑 `python -m scripts.calibrate_policy` 並更新 `MAX_DISTANCE`。
- 固定業務判定日：`.env` 的 `DEMO_BUSINESS_DATE`（預設 2026-11-03），為 FastAPI 唯一來源。

## 尚未驗證

真模型的 Tool Calling、Streaming、`present` 結果回送與續接需要有效 `LLM_API_KEY`，尚未實測。
