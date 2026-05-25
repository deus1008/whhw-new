import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "판매대행사업",
  description: "곧 새로운 모습으로 찾아옵니다",
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
