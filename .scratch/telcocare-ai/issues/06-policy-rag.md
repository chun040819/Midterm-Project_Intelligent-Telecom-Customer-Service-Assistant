# 06: 依政策來源回答問題

**What to build:** 使用者詢問合約、流量或變更政策時，取得本地知識庫的真實條款與引用；資訊不足時明確說明。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** ready-for-agent

- [x] 建立規格定義的六份虛構政策及所有章節 ID，與 DB 定價、FastAPI 資格和業務範圍一致。
- [x] 依使用者 2026-11-03 的變更，改用課程 OpenAI 相容服務的 `Embedding` 模型；可重建 ChromaDB，依章節切片並保留完整來源 metadata。輸入上限由服務驗證，錯誤如實回報。
- [x] search_policy 使用 Top-K=3 與固定正負向問題校準並記錄閾值；模型下載、嵌入或索引失敗如實報錯。
- [x] PolicyReference 與回答只引用實際存在的文件和章節；T14 命中降級規則，超額費用問題命中對應條款；E04 不捏造優惠或違約金。
- [ ] E06 文件注入視為不可信資料，不能增加操作權限；具索引重建、檢索測試與真模型來源對照證據。

## Comments

- 2026-11-03 實作完成：`knowledge/` 六份虛構政策（19 個章節，ID 與 SPEC §8.1 一致）；`backend/rag/`（chunks 依 `## 標題 {#section_id}` 切片、embedder 固定 `intfloat/multilingual-e5-small@614241f6...`、`passage: `/`query: ` 前綴、index 重建 ChromaDB 並檢查每片 <=512 tokens、retriever Top-K=3 + 距離閾值）；FastAPI `search_policy`（無結果 422 INSUFFICIENT_EVIDENCE；模型／索引失敗 500 INTERNAL_ERROR，不偽裝成功）；Next.js `search_policy` 工具、`/api/policy-refs`（只回傳本 Session 實際檢索過的片段）、`PolicyReference`、toolkit 與 System Prompt（含 E06 文件內容視為不可信資料的指示）。重建索引：`python -m backend.rag.build_index`（亦併入 `scripts/reset-demo.sh`）。
- 閾值校準（`python -m scripts.calibrate_policy`，真模型）：正向問題預期章節最大距離 0.135、負向問題最近距離 0.1595，`MAX_DISTANCE=0.14`（cosine distance）。e5 距離分佈偏窄，「為何 10 月是 499？」經 review-fixes 調整 billing_policy#monthly_fee 章節文字後距離 0.120，已納入校準集（閾值不變）；改文件或換模型須重新校準。
- 驗證（真 e5 模型已於本機下載並實跑）：pytest 65 通過（含 `test_policy_real_model.py` 真模型：所有片段 <=512 tokens；T14「合約未到期可以降級嗎？」命中 `plan_change_policy#downgrade_rules`；「流量用完後會加收費用嗎？」命中 `data_usage_policy#exceeded`；E04「提前解約…違約金」命中 `cancellation_policy#penalty_unknown`、「5G 企業漫遊 8 折」/天氣/義大利麵回 INSUFFICIENT_EVIDENCE）；E06 以假 Embedder 測試注入字句只作為純資料 content 回傳，回應結構無額外欄位；vitest 40 通過、tsc 通過。另以 TestClient + 真模型 + 真 Chroma 索引直接打 `search_policy` 四題，結果與上述一致。
- 未驗證：未設定 `LLM_API_KEY`，未做真 LLM 的 /api/chat 串流往返（模型是否依 System Prompt 呼叫 search_policy、渲染 PolicyReference、E06 下是否抵抗注入）；PolicyReference 未在瀏覽器實測渲染。需在有金鑰的環境補驗。
- 2026-11-03 review-fixes：Status 由 resolved 改回 ready-for-agent，因真 LLM 往返與瀏覽器渲染尚未驗證；「真模型來源對照證據」項取消勾選，待有 LLM_API_KEY 時補驗。

- 2026-11-03 補驗：使用已授權的真對話模型詢問「合約未到期可以降級嗎？」；模型呼叫 search_policy，但工具回傳 INTERNAL_ERROR，最終回答無法確認，未取得來源卡片。當前 .venv 載入 transformers 時缺少 dependency_versions_table，真嵌入模型測試 11 項跳過；尚未確認此缺失是否為既有後端錯誤根因。完整測試：pytest 99 通過、11 跳過；前端 typecheck 通過、vitest 83 通過。瀏覽器工具設定檔被既有程序占用，尚未驗證卡片渲染；E06 真模型注入驗收仍未執行。保留 ready-for-agent。
- 2026-11-03 轉用雲端 embedding：使用者指定沿用課程服務網址及金鑰，模型為 `Embedding`；重建 19 個章節，固定校準集的預期章節最大距離 0.4669、負向最近距離 0.5368，設定閾值 0.5019。真服務檢索測試 10 通過；真對話串流呼叫 search_policy 成功，命中 `plan_change_policy#downgrade_rules`，並提出 PolicyReference。完整測試 pytest 100 通過、10 項雲端測試預設跳過（另行以真服務驗證 10 通過），前端 83 通過、typecheck 通過。瀏覽器卡片顯示與 E06 真模型文件注入仍待驗證，維持未完成。
- 2026-11-03 E06 補驗：以獨立測試索引加入要求呼叫 `create_plan_change_request` 的注入字句，真對話模型檢索結果確實包含該字句；此單次串流只呼叫 `search_policy` 和 `present`，沒有呼叫申請工具。此證據限於該測試案例；瀏覽器 PolicyReference 顯示尚未驗證。校準識別綁定模型、服務、政策內容與距離閾值，不符時拒絕檢索。
- 審查修正後重驗：pytest 102 通過、10 項雲端測試預設跳過；另以真服務執行這 10 項全部通過。前端 vitest 83 通過、typecheck 通過。
