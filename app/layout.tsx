import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "판매대행사업",
  description: "판매대행사업 — CSO 영업활동 관리 플랫폼",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",   // 아이폰 노치·Dynamic Island 대응
  themeColor: "#080c14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="flex flex-col items-center justify-center min-h-screen">
        {children}
      </body>
    </html>
  );
}
