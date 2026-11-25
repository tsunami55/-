"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useStore } from "@/lib/store";

// 프로토타입: 실제 서비스에서는 Supabase Auth의 카카오 OAuth / 휴대폰 OTP로 교체.
export default function LoginPage() {
  const store = useStore();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  const go = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next && next.startsWith("/") ? next : "/");
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-12">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">키즈<span className="text-accent">옥션</span> 시작하기</h1>
        <p className="mt-2 text-sm text-muted">둘러보기는 로그인 없이 가능해요. 입찰할 때만 필요해요.</p>
      </div>

      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (테스트용: 카카오에서 받아올 정보)" className="w-full rounded-xl border border-line px-4 py-3 text-sm" />
        <button
          onClick={() => {
            if (!name.trim()) return setErr("테스트용 이름을 입력해 주세요.");
            store.login("kakao", name.trim());
            go();
          }}
          className="w-full rounded-xl bg-[#FEE500] py-3 font-semibold text-[#191919]"
        >
          카카오로 3초 만에 시작하기
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />또는 휴대폰 번호로<span className="h-px flex-1 bg-line" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" className="tabular min-w-0 flex-1 rounded-xl border border-line px-4 py-3 text-sm" />
          <button
            onClick={() => (phone.replace(/\D/g, "").length >= 10 ? (setSent(true), setErr("")) : setErr("휴대폰 번호를 확인해 주세요."))}
            className="rounded-xl border border-ink px-4 text-sm font-semibold"
          >
            인증번호
          </button>
        </div>
        {sent && (
          <>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="인증번호 6자리 (테스트: 123456)" className="tabular w-full rounded-xl border border-line px-4 py-3 text-sm" />
            <button
              onClick={() => {
                if (code !== "123456") return setErr("인증번호가 맞지 않아요.");
                const digits = phone.replace(/\D/g, "");
                store.login("phone", name.trim() || `고객${digits.slice(-4)}`, digits);
                go();
              }}
              className="w-full rounded-xl bg-ink py-3 font-semibold text-white"
            >
              확인
            </button>
          </>
        )}
      </div>

      {err && <p className="text-center text-sm text-accent">{err}</p>}

      <button onClick={() => { store.loginAdmin(); router.push("/admin"); }} className="w-full text-center text-xs text-muted underline">
        관리자로 로그인 (테스트)
      </button>
    </div>
  );
}
