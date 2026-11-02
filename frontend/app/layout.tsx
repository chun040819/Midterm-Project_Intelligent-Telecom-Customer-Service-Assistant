import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TelcoCare AI",
  description: "虛構電信公司的智慧客服（教學 Demo）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}
