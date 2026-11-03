import { describe, expect, it } from "vitest";
import { PlansResultSchema } from "@/lib/contracts";
import { chartRows, parsePlansEnvelope, selectPlans } from "@/lib/plan-view";

const plan = (plan_id: string, monthly_fee: number, data_limit_gb: number) => ({
  plan_id, name: plan_id, monthly_fee, data_limit_gb, voice_minutes: 80, is_active: true,
});
const trusted = PlansResultSchema.parse({
  plans: [plan("P499", 499, 25), plan("P699", 699, 60), plan("P999", 999, 100)],
});

describe("selectPlans", () => {
  it("未指定時回傳全部可信方案", () => {
    expect(selectPlans(trusted, undefined).map((p) => p.plan_id)).toEqual(["P499", "P699", "P999"]);
  });
  it("只保留已返回方案的子集，模型新增的方案被忽略", () => {
    const ids = selectPlans(trusted, ["P999", "P777", "P499"]).map((p) => p.plan_id);
    expect(ids).toEqual(["P499", "P999"]);
  });
  it("全是編造的方案時回空清單，不顯示假資料", () => {
    expect(selectPlans(trusted, ["P777"])).toEqual([]);
  });
});

describe("chartRows", () => {
  it("月租圖與流量圖都取自同一份可信資料（T05）", () => {
    expect(chartRows(trusted.plans, "monthly_fee").map((r) => r.value)).toEqual([499, 699, 999]);
    expect(chartRows(trusted.plans, "data_limit_gb").map((r) => r.value)).toEqual([25, 60, 100]);
  });
});

describe("parsePlansEnvelope", () => {
  it("接受 success 且 schema 合法的 envelope", () => {
    const r = parsePlansEnvelope({ status: "success", data: trusted, error: null }, true);
    expect(r?.plans).toHaveLength(3);
  });
  it("失效引用、錯誤 envelope 或不合 schema 資料回 null", () => {
    expect(parsePlansEnvelope({ status: "error", data: null }, false)).toBeNull();
    expect(parsePlansEnvelope({ status: "success", data: { plans: [{ plan_id: "P1" }] } }, true)).toBeNull();
    expect(parsePlansEnvelope(null, true)).toBeNull();
  });
});
