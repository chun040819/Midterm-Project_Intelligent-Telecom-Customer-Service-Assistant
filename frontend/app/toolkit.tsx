"use generative";

import { z } from "zod";
import { defineToolkit } from "@assistant-ui/react";
import {
  JSONGenerativeUI,
  defaultGenerativeUILibrary,
  defineGenerativeComponents,
} from "@assistant-ui/generative-ui/react";
import { BillCard } from "@/components/telcocare-genui/BillCard";
import { PolicyReference } from "@/components/telcocare-genui/PolicyReference";
import { PlanChart } from "@/components/telcocare-genui/PlanChart";
import { PlanComparison } from "@/components/telcocare-genui/PlanComparison";
import { PlanChangeCard } from "@/components/telcocare-genui/PlanChangeCard";
import { UsageCard } from "@/components/telcocare-genui/UsageCard";
import { SubscriptionCard } from "@/components/telcocare-genui/SubscriptionCard";

const generative = new JSONGenerativeUI({
  library: {
    ...defaultGenerativeUILibrary,
    ...defineGenerativeComponents({
      SubscriptionCard: {
        description: "顯示目前訂閱方案。data_ref 必須是 get_my_subscription 工具結果中的 data_ref；不要自行填寫任何方案數字。",
        properties: z.object({ data_ref: z.string().describe("get_my_subscription 結果的 data_ref") }),
        render: (props) => <SubscriptionCard data_ref={props.data_ref} />,
      },
      PlanComparison: {
        description: "顯示有效資費比較表。data_ref 必須是 list_plans 工具結果中的 data_ref；selected_plan_ids 只能從該結果已返回的方案中挑選；不要自行填寫任何價格或流量。",
        properties: z.object({
          data_ref: z.string().describe("list_plans 結果的 data_ref"),
          selected_plan_ids: z.array(z.string()).optional(),
        }),
        render: (props) => <PlanComparison data_ref={props.data_ref} selected_plan_ids={props.selected_plan_ids} />,
      },
      PlanChart: {
        description: "顯示資費長條圖。data_ref 必須是 list_plans 工具結果中的 data_ref；metric 為 monthly_fee（月租）或 data_limit_gb（流量）；selected_plan_ids 只能從已返回的方案中挑選。",
        properties: z.object({
          data_ref: z.string().describe("list_plans 結果的 data_ref"),
          metric: z.enum(["monthly_fee", "data_limit_gb"]),
          selected_plan_ids: z.array(z.string()).optional(),
        }),
        render: (props) => <PlanChart data_ref={props.data_ref} metric={props.metric} selected_plan_ids={props.selected_plan_ids} />,
      },
      BillCard: {
        description: "顯示月份帳單。data_ref 必須是 get_my_bill 工具結果中的 data_ref；不要自行填寫月份、金額、到期日或繳費狀態。",
        properties: z.object({ data_ref: z.string().describe("get_my_bill 結果的 data_ref") }),
        render: (props) => <BillCard data_ref={props.data_ref} />,
      },
      PolicyReference: {
        description: "顯示政策引用。source_refs 只能填 search_policy 結果中實際出現的 document_id#section_id；不要自行編造來源或條款內容。",
        properties: z.object({ source_refs: z.array(z.string()).min(1).max(10).describe("search_policy 結果中的 document_id#section_id") }),
        render: (props) => <PolicyReference source_refs={props.source_refs} />,
      },
      PlanChangeCard: {
        description: "顯示方案變更確認卡片（舊新方案、月租差額、政策提醒、確認／取消按鈕）。quote_ref 必須是 estimate_plan_change 成功且 eligible=true 時回傳的 quote_id；不合格或無 quote_id 時不要使用。不要自行填寫任何數字，也不要代替使用者確認。",
        properties: z.object({ quote_ref: z.string().describe("estimate_plan_change 結果的 quote_id") }),
        render: (props) => <PlanChangeCard quote_ref={props.quote_ref} />,
      },
      UsageCard: {
        description: "顯示月份流量與語音用量進度。data_ref 必須是 get_my_usage 工具結果中的 data_ref；不要自行填寫月份、額度、用量或剩餘／超額數字。",
        properties: z.object({ data_ref: z.string().describe("get_my_usage 結果的 data_ref") }),
        render: (props) => <UsageCard data_ref={props.data_ref} />,
      },
    }),
  },
});

export default defineToolkit({
  present: generative.present({ display: "standalone" }),
});
