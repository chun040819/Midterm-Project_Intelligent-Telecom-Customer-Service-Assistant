// 五個虛構 Seed 客戶（SPEC §4.4）；選擇器只接受這份白名單。
export const DEMO_CUSTOMERS: Readonly<Record<string, string>> = {
  C0001: "Demo 客戶 A",
  C0002: "Demo 客戶 B",
  C0003: "Demo 客戶 C",
  C0004: "Demo 客戶 D",
  C0005: "Demo 客戶 E",
};

export function isDemoCustomerId(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(DEMO_CUSTOMERS, value);
}
