# 09: 查詢本人申請狀態

**What to build:** 使用者能在聊天查詢自己的指定或最新申請，看到真實待審或預載歷史狀態。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 02：切換 Demo 客戶與隔離對話資料

**Status:** ready-for-agent

- [ ] get_plan_change_status 依目前客戶查詢；未指定 ID 時按 created_at DESC、request_id DESC 取最新，無紀錄或他人紀錄回 NOT_FOUND。
- [ ] PlanChangeCard 由可信 request_ref 顯示編號、舊新方案、狀態與建立時間；PENDING 不說成生效，歷史 APPROVED／REJECTED 不提供審核操作。
- [ ] 利用四筆 Seed 歷史紀錄獨立驗證三種狀態、排序、無資料與跨客戶拒絕，不依賴新增申請功能。
- [ ] 重新選擇 Demo 客戶後可查本人持久化申請，不要求恢復遺失的 Quote 或聊天；具工具、引用與真模型 UI 驗證。
