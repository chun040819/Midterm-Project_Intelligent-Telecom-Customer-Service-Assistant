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
    }),
  },
});

export default defineToolkit({
  present: generative.present({ display: "standalone" }),
});
