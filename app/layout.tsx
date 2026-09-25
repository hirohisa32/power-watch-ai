import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "POWER WATCH Studio", template: "%s | POWER WATCH" },
  description: "時計ストーリー動画制作スタジオ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
