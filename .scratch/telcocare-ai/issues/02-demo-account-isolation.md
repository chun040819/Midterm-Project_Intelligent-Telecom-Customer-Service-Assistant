# 02: 切換 Demo 客戶與隔離對話資料

**What to build:** 使用者可明確切換五個虛構客戶，各自的聊天與工具資料不會混用。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 01：查詢目前訂閱的首條完整流程

**Status:** ready-for-agent

- [ ] 選擇器只接受五個 Seed 客戶；切換後顯示正確訂閱，清除歷史、工具快取與已存在的引用及 Quote。
- [ ] 重新整理清除聊天與引用，但可保留 Cookie 對應客戶；失效 Session 安全重建，不恢復舊資料權限。
- [ ] 變更客戶請求檢查同源 Origin；忽略 Browser 偽造的內部身分標頭，未驗證的內部請求被拒絕。
- [ ] 聊天要求其他客戶資料與模型輸入夾帶 customer_id 都被拒絕；T13 與 E03 的既有資料引用隔離具可重現證據，後續 Quote 隔離由變更工單補驗。

- 2026-11-03 實作完成程式與自動化測試（pytest 17、vitest 21、tsc、next build 通過）：POST /api/demo/account（同源 Origin、五客戶白名單、切換清 data_ref）、選擇器 UI（換客戶重掛聊天）、T13／E03 隔離測試。尚未做瀏覽器實測與真模型驗證，故維持 ready-for-agent；Quote 清除待變更工單。
