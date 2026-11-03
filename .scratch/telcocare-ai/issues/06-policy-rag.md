# 06: 依政策來源回答問題

**What to build:** 使用者詢問合約、流量或變更政策時，取得本地知識庫的真實條款與引用；資訊不足時明確說明。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** ready-for-agent

- [x] 建立規格定義的六份虛構政策及所有章節 ID，與 DB 定價、FastAPI 資格和業務範圍一致。
- [x] 可重建 ChromaDB；固定 multilingual-e5-small 版本，正確使用 query／passage 前綴，依章節切片並檢查不超過 512 tokens，保留完整來源 metadata。
- [x] search_policy 使用 Top-K=3 與固定正負向問題校準並記錄閾值；模型下載、嵌入或索引失敗如實報錯。
- [x] PolicyReference 與回答只引用實際存在的文件和章節；T14 命中降級規則，超額費用問題命中對應條款；E04 不捏造優惠或違約金。
- [ ] E06 文件注入視為不可信資料，不能增加操作權限；具索引重建、檢索測試與真模型來源對照證據。

## Comments

- 2026-11-03 實作完成：`knowledge/` 六份虛構政策（19 個章節，ID 與 SPEC §8.1 一致）；`backend/rag/`（chunks 依 `## 標題 {#section_id}` 切片、embedder 固定 `intfloat/multilingual-e5-small@614241f6...`、`passage: `/`query: ` 前綴、index 重建 ChromaDB 並檢查每片 <=512 tokens、retriever Top-K=3 + 距離閾值）；FastAPI `search_policy`（無結果 422 INSUFFICIENT_EVIDENCE；模型／索引失敗 500 INTERNAL_ERROR，不偽裝成功）；Next.js `search_policy` 工具、`/api/policy-refs`（只回傳本 Session 實際檢索過的片段）、`PolicyReference`、toolkit 與 System Prompt（含 E06 文件內容視為不可信資料的指示）。重建索引：`python -m backend.rag.build_index`（亦併入 `scripts/reset-demo.sh`）。
- 閾值校準（`python -m scripts.calibrate_policy`，真模型）：正向問題預期章節最大距離 0.135、負向問題最近距離 0.1595，`MAX_DISTANCE=0.14`（cosine distance）。e5 距離分佈偏窄，「為何 10 月是 499？」經 review-fixes 調整 billing_policy#monthly_fee 章節文字後距離 0.120，已納入校準集（閾值不變）；改文件或換模型須重新校準。
- 驗證（真 e5 模型已於本機下載並實跑）：pytest 65 通過（含 `test_policy_real_model.py` 真模型：所有片段 <=512 tokens；T14「合約未到期可以降級嗎？」命中 `plan_change_policy#downgrade_rules`；「流量用完後會加收費用嗎？」命中 `data_usage_policy#exceeded`；E04「提前解約…違約金」命中 `cancellation_policy#penalty_unknown`、「5G 企業漫遊 8 折」/天氣/義大利麵回 INSUFFICIENT_EVIDENCE）；E06 以假 Embedder 測試注入字句只作為純資料 content 回傳，回應結構無額外欄位；vitest 40 通過、tsc 通過。另以 TestClient + 真模型 + 真 Chroma 索引直接打 `search_policy` 四題，結果與上述一致。
- 未驗證：未設定 `LLM_API_KEY`，未做真 LLM 的 /api/chat 串流往返（模型是否依 System Prompt 呼叫 search_policy、渲染 PolicyReference、E06 下是否抵抗注入）；PolicyReference 未在瀏覽器實測渲染。需在有金鑰的環境補驗。
- 2026-11-03 review-fixes：Status 由 resolved 改回 ready-for-agent，因真 LLM 往返與瀏覽器渲染尚未驗證；「真模型來源對照證據」項取消勾選，待有 LLM_API_KEY 時補驗。
