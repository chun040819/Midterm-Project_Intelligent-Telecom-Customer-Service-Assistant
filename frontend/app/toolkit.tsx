"use generative";

import { z } from "zod";
import { defineToolkit } from "@assistant-ui/react";
import {
  JSONGenerativeUI,
  defaultGenerativeUILibrary,
  defineGenerativeComponents,
} from "@assistant-ui/generative-ui/react";
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
    }),
  },
});

export default defineToolkit({
  present: generative.present({ display: "standalone" }),
});
