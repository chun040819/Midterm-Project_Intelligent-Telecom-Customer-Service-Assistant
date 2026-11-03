# 10: 驗證失敗處理與執行限制

**What to build:** 使用者遇到模型、工具或介面錯誤時能看懂結果；系統遵守執行預算且不假稱交易成功。 依已確認的 TelcoCare AI 規格執行，維持單機教學 Demo 與虛構資料範圍。

**Blocked by:** 03：查詢月份帳單、04：查詢流量與超額狀態、05：比較有效資費方案、06：依政策來源回答問題、08：確認並建立唯一待審申請、09：查詢本人申請狀態

**Status:** resolved

- [x] 整合八個業務工具加 present，輸入拒絕額外欄位，Zod／Pydantic／UI 契約與錯誤 Envelope、HTTP 映射一致。
- [x] 每輪最多六工具執行步驟、六十秒總預算；逾時停止新派送並盡力取消，不聲稱遠端已停止。
- [x] Tool trace 顯示 Loading／Result／Error；只讀失敗最多重試一次，寫入不自動重送；不輸出機密或私密推理。
- [x] 非法 GenUI 元件或 Props 不渲染，若有可信結果則退回文字；無效或跨 Session 引用顯示失效，不產生假金額。
- [x] E05 拒絕超範圍與洩漏 Prompt；E07 拒絕無效參數；E08 模型串流中斷及 FastAPI 500 明確報錯，不宣稱建立申請。
- [x] 驗證前端工具續接、上下文、受控確認與政策來源整合；記錄確定性測試與真 Provider 限制，修復本工單發現的整合缺陷。

## Comments

- 2026-11-03 實作完成：
  - 新增 `frontend/lib/server/chat-runtime.ts`：六工具步驟（第七步 `toolChoice: none` 純文字收尾）、60 秒預算、固定句錯誤（不含 Provider 原文／金鑰）、`guardUIStream`——逾時的 abort chunk 與 Provider 串流中途斷線（原本會讓 stream 直接丟例外）都轉成可見的 error chunk。`/api/chat` 另關閉 `sendReasoning`，私密推理不再送到瀏覽器；Provider `maxRetries: 1`。
  - 內部呼叫加 15 秒單次逾時並接上整輪 `abortSignal`：預算用完不再派送、不再重試；只讀工具仍最多重試一次，寫入（confirm）不自動重送。
  - FastAPI：handler 未預期例外原本回非 Envelope 的 500，改回統一 `INTERNAL_ERROR` Envelope（不外洩例外內容）；新增八工具多餘欄位一律 422 的契約測試。
  - ToolTrace 以 `traceState` 區分 loading／result／error，Envelope 業務錯誤不再顯示為「完成」。
- 驗證：pytest 與 vitest（115 項）、tsc 通過。真模型 `/api/chat`：E05 天氣與索取 System Prompt 皆固定拒絕；E07 `2026-13` 被拒並請使用者更正；E08 停掉 FastAPI 後要求送出申請，只回「目前系統無法完成這項操作，請稍後再試。」未宣稱建立。
- 限制：非法 GenUI 元件／Props 的「不渲染」由 `@assistant-ui/generative-ui` 的 `renderGenerativeUI` 負責（未知元件回 null），無效或跨 Session `data_ref` 由各卡片顯示「資料已失效」（既有）；未另做瀏覽器自動化截圖。真模型的 60 秒逾時未實測（以 Mock 串流與單元測試涵蓋）。
