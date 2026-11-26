"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";

// 지금은 '이름만 입력하고 시작'(게스트 계정). 카카오 로그인은 카카오 디벨로퍼스 앱 등록 후 연결 예정.
export default function LoginPage() {
  const store = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (fallback = "/") => {
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") ? next : fallback);
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-12">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">키즈<span className="text-accent">옥션</span> 시작하기</h1>
        <p className="mt-2 text-sm text-muted">둘러보기는 로그인 없이 가능해요. 입찰할 때만 필요해요.</p>
      </div>

      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 또는 닉네임" className="w-full rounded-xl border border-line px-4 py-3 text-sm" />
        <button
          disabled={busy}
          onClick={async () => {
            if (!name.trim()) return setErr("이름을 입력해 주세요.");
            setBusy(true);
            const r = await store.login(name.trim());
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            go();
          }}
          className="w-full rounded-xl bg-ink py-3 font-semibold text-white disabled:opacity-50"
        >
          바로 시작하기
        </button>
        <button disabled className="w-full rounded-xl bg-[#FEE500]/50 py-3 font-semibold text-[#191919]/50">
          카카오로 시작하기 (준비 중)
        </button>
      </div>

      {err && <p className="text-center text-sm text-accent">{err}</p>}

      {!showAdmin ? (
        <button onClick={() => setShowAdmin(true)} className="w-full text-center text-xs text-muted underline">관리자 로그인</button>
      ) : (
        <div className="space-y-2 border-t border-line pt-4">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="관리자 이메일" className="w-full rounded-xl border border-line px-4 py-2.5 text-sm" />
          <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="비밀번호" className="w-full rounded-xl border border-line px-4 py-2.5 text-sm" />
          <button
            onClick={async () => {
              const r = await store.loginEmail(email, pw);
              if (!r.ok) return setErr(r.message);
              go("/admin");
            }}
            className="w-full rounded-xl border border-ink py-2.5 text-sm font-semibold"
          >
            관리자 로그인
          </button>
        </div>
      )}
    </div>
  );
}
