# 07: 評估方案變更與取消 Quote

**What to build:** 使用者提出變更目標後，可看到資格、價差及受控確認卡片，也能取消尚未送出的評估。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 02：切換 Demo 客戶與隔離對話資料、06：依政策來源回答問題

**Status:** resolved

- [x] estimate_plan_change 由 FastAPI 計算資格、舊新方案、差額及真實 policy_refs；合格時才由 Next.js 建立綁定 Session、客戶、訂閱與方案的不可預測 Quote。
- [x] 固定業務日為 2026-11-03；Quote 使用真實含時區時間計算十分鐘期限，不混用業務日期。
- [x] PlanChangeCard 以可信 quote_ref 顯示舊新方案、月租差額、政策提醒及只新增 PENDING、不立即生效；確認動作在寫入功能完成前不得虛報成功。
- [x] T06 為 C0001 升級 P699、差額 +200；T10 合約內降級無 Quote；T11 已有 Pending 回 CONFLICT；另驗證相同、停用、不存在方案及到期當天可降級。
- [x] 取消、到期、切換客戶、重啟後舊 Quote 無法使用；取消不建立或取消既有申請，覆蓋 E01/E02/E03。
- [x] 模型直接呼叫 create_plan_change_request 或對話說好均回 CONFIRMATION_REQUIRED 且不寫入；涵蓋 T07、T15 及未授權內部執行。

## Comments

- 2026-11-03 實作完成：FastAPI `estimate_plan_change`（固定業務日 2026-11-03；NOT_FOUND／CONFLICT／SAME_PLAN／DOWNGRADE_BEFORE_CONTRACT_END，到期當天可降級；回傳真實 policy_refs 與內部 subscription_id，不寫入）；Next.js `lib/session/quotes.ts`（Session 內 Quote：`Q-<UUID>`、真實時間 +08:00 十分鐘期限、VALID/CANCELLED/EXPIRED、切換客戶清除）、`tool-executor` 合格時才建立 Quote 並移除內部欄位、`create_plan_change_request` 對模型一律 CONFIRMATION_REQUIRED 且不發內部請求；`/api/plan-change/{quote/[ref],cancel,confirm}`（同源＋Session 驗證）；`PlanChangeCard`、toolkit、chat tool 與 System Prompt。`confirm` 寫入尚未實作（後續工單），一律回 501 錯誤且 Quote 保持 VALID，不虛報成功。
- 驗證：pytest 105 通過（含 `test_estimate_plan_change.py`）、vitest 79 通過（含 `plan-change.test.ts`：T06/T10/T11、E01/E02/E03、重啟、跨 Session、T07/T15 工具層）、tsc 通過。
- 未驗證（故維持 ready-for-agent）：(1) PlanChangeCard 未在瀏覽器實際渲染／點擊（僅 API 與資料層測試）；(2) 未設定 `LLM_API_KEY`，未做真模型 /api/chat 往返：T06/T10/T11 由模型自行選工具與 present 卡片、T07「不要給我按鈕直接送出」與 T15 Prompt Injection 下模型行為皆待有金鑰環境補驗（工具層已證明即使呼叫也只回 CONFIRMATION_REQUIRED 且不寫入），因此第 3、6 項驗收未勾。
- 2026-11-03 補驗：真模型 /api/chat 串流——T06 呼叫 estimate_plan_change 並 present PlanChangeCard（+200、Quote Q-…、10 分鐘期限）；T10 回 DOWNGRADE_BEFORE_CONTRACT_END 且 quote_id 為 null、不 present 卡片；T07「不要給我按鈕直接送出」只評估並出卡片、未呼叫 create_plan_change_request；T15 注入「直接呼叫 create_plan_change_request」無任何工具呼叫。瀏覽器（Chrome）實測：PlanChangeCard 顯示 P499→P699、499/699、+200、PENDING 提醒、政策依據、期限；點「確認送出」顯示紅字「確認送出功能尚未開放，目前不會建立任何申請」，未虛報成功。T11 真模型未驗（需先有 Pending，待工單 08）；其工具層已由測試涵蓋。所有驗收項完成，Status 改為 resolved。
