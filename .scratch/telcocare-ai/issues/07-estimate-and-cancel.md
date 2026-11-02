# 07: 評估方案變更與取消 Quote

**What to build:** 使用者提出變更目標後，可看到資格、價差及受控確認卡片，也能取消尚未送出的評估。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 02：切換 Demo 客戶與隔離對話資料、06：依政策來源回答問題

**Status:** ready-for-agent

- [ ] estimate_plan_change 由 FastAPI 計算資格、舊新方案、差額及真實 policy_refs；合格時才由 Next.js 建立綁定 Session、客戶、訂閱與方案的不可預測 Quote。
- [ ] 固定業務日為 2026-11-03；Quote 使用真實含時區時間計算十分鐘期限，不混用業務日期。
- [ ] PlanChangeCard 以可信 quote_ref 顯示舊新方案、月租差額、政策提醒及只新增 PENDING、不立即生效；確認動作在寫入功能完成前不得虛報成功。
- [ ] T06 為 C0001 升級 P699、差額 +200；T10 合約內降級無 Quote；T11 已有 Pending 回 CONFLICT；另驗證相同、停用、不存在方案及到期當天可降級。
- [ ] 取消、到期、切換客戶、重啟後舊 Quote 無法使用；取消不建立或取消既有申請，覆蓋 E01/E02/E03。
- [ ] 模型直接呼叫 create_plan_change_request 或對話說好均回 CONFIRMATION_REQUIRED 且不寫入；涵蓋 T07、T15 及未授權內部執行。
