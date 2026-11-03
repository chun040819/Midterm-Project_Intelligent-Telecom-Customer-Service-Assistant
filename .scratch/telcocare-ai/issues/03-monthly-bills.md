# 03: 查詢月份帳單

**What to build:** 使用者在聊天查詢指定或最新月份帳單，看到與資料庫一致的帳單卡片。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** resolved

- [x] get_my_bill 經同一工具、串流與 present 流程顯示 BillCard，含月份、金額、到期日與快照狀態。
- [x] 省略月份選目前客戶最新有資料月份並明說月份；無效月份、額外欄位與 null 不當作省略，查無資料回 NOT_FOUND。
- [x] T02 顯示 C0001 的 2026-10 帳單 499 元、UNPAID、2026-11-15；2026-11 不借用其他月份或模型猜測。
- [x] 以獨立 DB 驗證月份、身分與 Envelope；留存真模型工具與卡片往返驗證。

## Comments

- 2026-11-03 實作完成：FastAPI `get_my_bill`（pydantic strict 月份 pattern、extra=forbid、null 不視為省略、省略取該客戶最新月份）、Next.js zod 輸入、BillCard、toolkit 註冊、System Prompt 補充。pytest 34、vitest 30、tsc 通過。
- 2026-11-03 真模型驗證（NKUST Furen-large，/api/chat 串流實測）：「2026 年 10 月帳單多少？」→ get_my_bill({billing_month:"2026-10"}) → 499／UNPAID／2026-11-15 → present BillCard，`/api/data-ref` 解析值與 DB 一致；「我的帳單多少？」→ get_my_bill({}) 取 2026-10；「2026 年 11 月帳單多少？」→ NOT_FOUND，模型回固定句型，未借用其他月份。
