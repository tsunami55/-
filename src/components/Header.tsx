"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function Header() {
  const { me, state, logout, configured } = useStore();
  const unread = me ? state.notices.filter((n) => n.userId === me.id && !n.read).length : 0;
  return (
    <>
    {!configured && <div className="bg-accent py-1.5 text-center text-xs text-white">서버 연결 키가 아직 설정되지 않았어요</div>}
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          키즈<span className="text-accent">옥션</span>
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm text-muted">
          <Link href="/" className="hover:text-ink">경매</Link>
          <Link href="/demo" className="hover:text-ink">체험하기</Link>
          {me?.isAdmin && <Link href="/admin" className="font-semibold text-ink">관리자</Link>}
        </nav>
        {me ? (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/my" className="relative font-medium">
              마이
              {unread > 0 && (
                <span className="absolute -right-3 -top-2 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{unread}</span>
              )}
            </Link>
            <button onClick={logout} className="text-muted hover:text-ink">로그아웃</button>
          </div>
        ) : (
          <Link href="/login" className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white">로그인</Link>
        )}
      </div>
    </header>
    </>
  );
}
