import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "WATCH STORY STUDIO", template: "%s | WATCH STORY STUDIO" },
  description: "時計が持つ物語を映像にするクリエイティブスタジオ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
