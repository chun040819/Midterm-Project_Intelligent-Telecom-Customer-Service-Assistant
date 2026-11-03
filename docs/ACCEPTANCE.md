# TelcoCare AI 驗收記錄（工單 11）

驗收日：2026-11-03。環境：macOS、Node 22、Python 3.12（uv）、對話模型 `Furen-max`、嵌入模型 `Embedding`（課程 NKUST AI Hub）。資料皆為虛構。

## 證據分級

- **確定性測試**：Pytest／Vitest，使用暫存 SQLite 或記憶體 Session，不碰 Demo DB。
- **真嵌入測試**：`RUN_CLOUD_EMBEDDING_TESTS=1` 對雲端 Embedding 驗證政策來源（10 項通過）。
- **真模型 + 瀏覽器**：實際 `Furen-max` 經 Next.js 對話，截圖見 `docs/acceptance/`。
- **未實測**：真模型的 60 秒逾時、七種 GenUI 全數逐一以真模型觸發。

## T01–T15

| ID | 結果 | 證據 |
|---|---|---|
| T01 | Pass | `backend/tests/test_get_my_subscription.py` |
| T02 | Pass | `backend/tests/test_get_my_bill.py` |
| T03 | Pass | `backend/tests/test_get_my_usage.py::test_t03_c0001_october` |
| T04 | Pass | `test_get_my_usage.py::test_t04_no_november_data` |
| T05 | Pass | `backend/tests/test_list_plans.py`、`frontend/tests/plan-view.test.ts` |
| T06 | Pass | `test_estimate_plan_change.py::test_t06…`；真模型截圖 `01-quote-card.jpg`（P499→P699、+200、有效期限、確認／取消） |
| T07 | Pass（確定性） | `frontend/tests/plan-change.test.ts`（模型直接寫入回 `CONFIRMATION_REQUIRED`、不寫入）；`db-evidence.txt` 僅證明 estimate 不寫入。真模型嘗試直接寫入未另做截圖 |
| T08 | Pass | `test_confirm_plan_change.py::test_t08…`；真模型 UI 點確認後 DB 4→5 筆、C0001 恰一筆 PENDING、訂閱仍 P499、`02-confirmed-pending.jpg` |
| T09 | Pass | `test_t09…`；`db-evidence.txt` 重複確認回同 request_id、`already_existed=True`、總數仍 5 |
| T10 | Pass | `test_estimate_plan_change.py::test_t10…` |
| T11 | Pass | `test_estimate_plan_change.py::test_t11…` |
| T12 | Pass | `test_get_my_usage.py::test_t12_c0003_exceeded` |
| T13 | Pass | `frontend/tests/tool-executor.test.ts`（多餘 `customer_id` 拒絕）、`test_runtime_contract.py` |
| T14 | Pass | 真嵌入測試；真模型截圖 `03-policy-source.jpg`（來源 `plan_change_policy#downgrade_rules`） |
| T15 | Pass（確定性） | `plan-change.test.ts`（無確認不能寫入）。真模型提示注入未另做截圖 |

## E01–E10

| ID | 結果 | 證據 |
|---|---|---|
| E01 | Pass | `plan-change.test.ts`（Quote 過期） |
| E02 | Pass | `plan-change.test.ts`（取消後不可確認） |
| E03 | Pass | `plan-change.test.ts`、`tool-executor.test.ts`、`session-routes.test.ts` |
| E04 | Pass | 真嵌入測試；真模型 `04-no-fabrication.jpg`（違約金資訊不足、不編造數字／優惠）。同輪第二次 `search_policy` 顯示「失敗」，最終回覆仍只引用知識庫 |
| E05 | Pass | 工單 10 真模型記錄（天氣、索取 System Prompt 皆固定拒絕） |
| E06 | Pass | `test_policy_retriever.py::test_injection_text_in_document_is_returned_as_plain_data` |
| E07 | Pass | `test_runtime_contract.py`；工單 10 真模型 `2026-13` 被拒 |
| E08 | Pass | `chat-route.test.ts`、`runtime-failure.test.ts`；工單 10 真模型停掉 FastAPI 後不宣稱成功 |
| E09 | Pass | `backend/tests/test_database.py::test_e09_reset_removes_new_request_and_restores_four_seed_requests`；`db-evidence.txt` |
| E10 | Pass | `plan-change.test.ts`（先查既有 `quote_id`） |

## Reset 與乾淨環境

- `./scripts/reset-demo.sh` 重建六表固定 Seed（含四筆歷史申請）並重建政策索引（19 個片段）。E09 測試比對六表前後完全一致。實測：展示新增申請後 reset，申請回到 4 筆、C0001 無 Pending。
- 記憶體 Session／Quote／data_ref 不在 DB：reset 後需重啟 `dev.sh`（已於驗收中重啟）。
- 乾淨環境：複製專案（排除 `.venv`、`node_modules`、`.env`、`.local`）後執行 `./scripts/setup.sh` 成功（建立 venv、`npm install`、`.env`、Seed）；`./scripts/test.sh` 為 pytest 129 通過 + 10 項雲端測試預設跳過、vitest 116 通過、tsc 通過。
- 初次需求：uv、Node 22+、網路（安裝依賴）、`.env` 的 `LLM_API_KEY`／`EMBEDDING_MODEL`；建索引會將政策傳至嵌入服務。沒有本機模型下載。
- 入口：`setup.sh`、`dev.sh`、`test.sh`、`reset-demo.sh`。

## 隔離

每項真模型展示使用新對話；寫入展示前後各 reset 一次。確定性測試不使用 Demo DB。
