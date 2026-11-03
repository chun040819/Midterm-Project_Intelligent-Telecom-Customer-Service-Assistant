# 09: 查詢本人申請狀態

**What to build:** 使用者能在聊天查詢自己的指定或最新申請，看到真實待審或預載歷史狀態。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 02：切換 Demo 客戶與隔離對話資料

**Status:** resolved

- [x] get_plan_change_status 依目前客戶查詢；未指定 ID 時按 created_at DESC、request_id DESC 取最新，無紀錄或他人紀錄回 NOT_FOUND。
- [x] PlanChangeCard 由可信 request_ref 顯示編號、舊新方案、狀態與建立時間；PENDING 不說成生效，歷史 APPROVED／REJECTED 不提供審核操作。
- [x] 利用四筆 Seed 歷史紀錄獨立驗證三種狀態、排序、無資料與跨客戶拒絕，不依賴新增申請功能。
- [x] 重新選擇 Demo 客戶後可查本人持久化申請，不要求恢復遺失的 Quote 或聊天；具工具、引用與真模型 UI 驗證。

## Comments

- 2026-11-03 實作完成：FastAPI 新增只讀 `get_plan_change_status`（限定目前客戶、created_at DESC／request_id DESC，他人與不存在同為 NOT_FOUND，不外洩 quote_id）。Next.js 加入工具、Zod 契約與 `PlanChangeCard` 的 `request_ref`（= 工具結果 data_ref，經 Session 解析；與 `quote_ref` 擇一，唯讀無操作）。
- 驗證：pytest（四筆 Seed 三種狀態、排序、無資料、跨客戶、參數拒絕）與 vitest 97 通過、tsc 通過。真模型以 `/api/chat` 實測：C0002 與 C0005 皆呼叫工具並以 `present` 輸出 `PlanChangeCard{request_ref}`；C0001 無紀錄與查他人 R-SEED-001 皆回固定 NOT_FOUND 句型。Chrome 擴充套件未連線，未做瀏覽器畫面驗收。
- 2026-11-03 補驗：Chrome＋真模型。C0005 問「我的申請審核到哪了？」→ 出狀態卡（待審核、P499→P699、R-SEED-004、2026/11/01 10:00），文字說明尚未生效；切換 C0002 後舊對話清空，再查出已核准卡（R-SEED-001、2026/07/20 10:00），皆無審核操作按鈕。REJECTED 與 C0001 無紀錄、跨客戶拒絕由 pytest／vitest 與 `/api/chat` 實測涵蓋。測試後已 reset-demo，Status 改為 resolved。
