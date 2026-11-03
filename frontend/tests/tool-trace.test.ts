import { describe, expect, it } from "vitest";
import { traceState } from "@/lib/tool-trace";

describe("Tool trace 狀態（Loading／Result／Error）", () => {
  it("執行中為 loading", () => {
    expect(traceState({ running: true, isError: false, result: undefined })).toBe("loading");
  });
  it("工具成功為 result", () => {
    expect(traceState({ running: false, isError: false, result: { status: "success", data: {}, error: null } })).toBe("result");
  });
  it("Envelope 業務錯誤（如 NOT_FOUND、INTERNAL_ERROR）為 error，即使傳輸層沒有 isError", () => {
    expect(traceState({ running: false, isError: false, result: { status: "error", data: null, error: { code: "INTERNAL_ERROR", message: "x" } } })).toBe("error");
  });
  it("傳輸層錯誤為 error", () => {
    expect(traceState({ running: false, isError: true, result: undefined })).toBe("error");
  });
});
