import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "키즈옥션 · 3세~주니어 아동복 경매",
  description: "새상품과 B급 새상품 아동복을 경매로 합리적으로. 매일 밤 9시 30분 마감.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <StoreProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 pb-24">{children}</main>
          <footer className="border-t border-line py-8 text-center text-xs text-muted">
            키즈옥션 · 통신판매중개업 신고 예정 · 프로토타입 (데이터는 이 브라우저에만 저장돼요)
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}
