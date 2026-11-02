import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const config: NextConfig = {
  // 單機教學 Demo：內部服務僅綁 127.0.0.1，前端只對本機開放。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default withAui(config);
