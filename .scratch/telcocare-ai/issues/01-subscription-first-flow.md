# 01: 查詢目前訂閱的首條完整流程

**What to build:** 使用者能啟動本機客服頁，以預設 Demo 客戶詢問目前方案，經真模型工具呼叫取得資料並看到可信的訂閱卡片。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 建立 Next.js、FastAPI、SQLite 的可啟動完整流程；提供 setup、dev、test 入口與必要環境範例，機密只存在伺服器。
- [ ] 建立規格六表與外鍵、CHECK、唯一 Quote、單客戶 Pending 約束；固定 Seed 含五客戶、四方案、五訂閱、15 帳單、15 用量、四歷史申請，測試使用獨立 DB。
- [ ] 採用規格指定 assistant-ui、AI SDK 與單一 OpenAI-compatible 模型；核對官方 API、鎖定相容版本，實測 Tool Calling、Streaming、present 前端工具結果回傳與續接，不以 Mock 代表真模型成功。
- [ ] 具繁體中文開場白、示範問題、訊息列表、輸入框、串流指示與可展開 Tool trace；目前客戶來自 HttpOnly／SameSite Cookie 對應伺服器 Session，預設 C0001。
- [ ] get_my_subscription 經受驗證的內部通道查詢；Browser 不直連 FastAPI，內部服務只綁定本機，輸入拒絕額外身分或授權欄位，結果遵守規格 Envelope。
- [ ] SubscriptionCard 由 Session／對話內可信 data_ref 解析，模型不能指定業務數字；T01 顯示 P499、499 元、2027-06-30，並有資料層約束與完整流程證據。
- [ ] 套用完整五部分 System Prompt；若相容性迫使改變指定技術選型，先提出證據與變更提案。

## Comments

- 2026-11-03 實作完成程式與自動化測試（pytest 17、vitest 10、tsc、next build 通過；FastAPI／Next.js 本機啟動與頁面渲染已煙霧測試）。
- **未標 resolved**：缺少 `LLM_API_KEY`，真模型 Tool Calling／Streaming／`present` 回送續接與 T01 完整流程（P499／499 元／2027-06-30 卡片）尚未實測。需使用者填入 `.env` 後驗證。
