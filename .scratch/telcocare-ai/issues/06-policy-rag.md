# 06: 依政策來源回答問題

**What to build:** 使用者詢問合約、流量或變更政策時，取得本地知識庫的真實條款與引用；資訊不足時明確說明。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** ready-for-agent

- [ ] 建立規格定義的六份虛構政策及所有章節 ID，與 DB 定價、FastAPI 資格和業務範圍一致。
- [ ] 可重建 ChromaDB；固定 multilingual-e5-small 版本，正確使用 query／passage 前綴，依章節切片並檢查不超過 512 tokens，保留完整來源 metadata。
- [ ] search_policy 使用 Top-K=3 與固定正負向問題校準並記錄閾值；模型下載、嵌入或索引失敗如實報錯。
- [ ] PolicyReference 與回答只引用實際存在的文件和章節；T14 命中降級規則，超額費用問題命中對應條款；E04 不捏造優惠或違約金。
- [ ] E06 文件注入視為不可信資料，不能增加操作權限；具索引重建、檢索測試與真模型來源對照證據。
