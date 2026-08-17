import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "词格 · 歌词填空生成器",
  description: "将中文、日文与罗马音歌词拆成逐字逐音节的填空练习，并复制为 Markdown。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
