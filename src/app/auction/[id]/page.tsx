"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { buyNowAvailable, formatRemain, increment, minNextBid, reserveMet, RULES, uniqueBidders, won } from "@/lib/auction";
import { useStore } from "@/lib/store";
import { CATEGORY_LABEL, GRADE_LABEL } from "@/lib/types";
import ProductArt from "@/components/ProductArt";

export default function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const store = useStore();
  const { state, now, me, ready } = store;
  const p = state.products.find((x) => x.id === id);
  const [mode, setMode] = useState<"bid" | "max">("bid");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const viewed = useRef(false);

  useEffect(() => {
    if (ready && p && !viewed.current) {
      viewed.current = true;
      store.view(p.id);
    }
  }, [ready, p, store]);

  if (!ready) return <p className="py-20 text-center text-muted">불러오는 중…</p>;
  if (!p) return <p className="py-20 text-center text-muted">상품을 찾을 수 없어요.</p>;

  const min = minNextBid(p);
  const active = p.status === "ACTIVE";
  const iAmLeader = me && p.leaderId === me.id;
  const myMax = iAmLeader ? p.leaderMax : undefined;

  const submit = () => {
    const v = Number(amount.replace(/[^0-9]/g, ""));
    if (!v) return setMsg({ ok: false, text: "금액을 입력해 주세요." });
    const r = store.bid(p.id, v);
    setMsg({ ok: r.ok && r.leading !== false, text: r.message });
    if (r.ok) setAmount("");
  };

  return (
    <div className="grid gap-8 pt-6 md:grid-cols-2">
      <div className="space-y-3">
        <ProductArt category={p.category} color={p.color} className="rounded-3xl" />
        {p.grade !== "NEW" && (
          <div className="rounded-2xl border border-line p-4 text-sm">
            <p className="font-bold">하자 안내 · {GRADE_LABEL[p.grade]}</p>
            <p className="mt-1 text-muted">{p.defectNote}</p>
            <div className="mt-3 flex aspect-[3/1] items-center justify-center rounded-xl bg-soft text-xs text-muted">
              하자 부위 사진 (등록 필수)
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-sm text-muted">{p.brand} · {CATEGORY_LABEL[p.category]} · 사이즈 {p.size}</p>
          <h1 className="mt-1 text-xl font-bold">{p.title}</h1>
        </div>

        {active ? (
          <div className="rounded-2xl bg-soft p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted">현재가</p>
                <p className="tabular text-3xl font-extrabold">{won(p.currentPrice)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">남은 시간</p>
                <p className={`tabular text-lg font-bold ${p.endsAt - now < 600000 ? "text-accent" : ""}`}>{formatRemain(p.endsAt - now)}</p>
              </div>
            </div>
            <div className="tabular mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>시작가 {won(p.startPrice)}</span>
              <span>입찰 {p.bids.length}회 · {uniqueBidders(p)}명</span>
              <span>입찰 단위 {won(increment(p.currentPrice))}</span>
              {p.reservePrice && <span className={reserveMet(p) ? "text-emerald-600" : ""}>{reserveMet(p) ? "최저낙찰가 도달" : "최저낙찰가 미달"}</span>}
            </div>
            {iAmLeader && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-accent">
                현재 1등이에요 · 내 최대 입찰가 {won(myMax!)}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-ink p-5 text-white">
            <p className="text-sm text-white/60">{p.status === "SOLD" ? "낙찰 완료" : p.status === "UNSOLD" ? "유찰" : "승인 대기"}</p>
            {p.status === "SOLD" && (
              <div className="tabular mt-2 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-white/60">시작가</p><p className="font-bold">{won(p.startPrice)}</p></div>
                <div><p className="text-xs text-white/60">낙찰가</p><p className="font-bold text-accent">{won(p.finalPrice!)}</p></div>
                <div><p className="text-xs text-white/60">입찰자</p><p className="font-bold">{uniqueBidders(p)}명</p></div>
              </div>
            )}
          </div>
        )}

        {active && (
          <div className="space-y-3">
            {!me ? (
              <Link href={`/login?next=/auction/${p.id}`} className="block rounded-xl bg-ink py-3 text-center font-semibold text-white">
                로그인하고 입찰하기 (5초)
              </Link>
            ) : (
              <>
                <div className="flex rounded-xl border border-line p-1 text-sm">
                  {(["bid", "max"] as const).map((m) => (
                    <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-2 ${mode === m ? "bg-ink text-white" : "text-muted"}`}>
                      {m === "bid" ? "직접 입찰" : "최대가 설정 (자동입찰)"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  {mode === "bid"
                    ? `${won(min)} 이상 입력해 주세요.`
                    : "낼 수 있는 최대 금액을 정해 두면, 다른 분이 입찰할 때마다 한 단위씩 자동으로 대신 입찰해요. 최대가는 다른 사람에게 보이지 않아요."}
                </p>
                <div className="flex gap-2">
                  <input
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={mode === "bid" ? String(min) : "최대 금액"}
                    className="tabular min-w-0 flex-1 rounded-xl border border-line px-4 py-3"
                  />
                  <button onClick={submit} className="rounded-xl bg-accent px-6 font-semibold text-white">입찰</button>
                </div>
                {mode === "bid" && (
                  <div className="flex gap-2">
                    {[0, 1, 3].map((k) => {
                      const v = min + increment(p.currentPrice) * k;
                      return (
                        <button key={k} onClick={() => setAmount(String(v))} className="tabular flex-1 rounded-lg border border-line py-1.5 text-sm">
                          {won(v)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {buyNowAvailable(p) && (
                  <button
                    onClick={() => {
                      if (!confirm(`${won(p.buyNowPrice!)}에 바로 구매할까요?`)) return;
                      const r = store.buyNow(p.id);
                      setMsg({ ok: r.ok, text: r.message });
                    }}
                    className="tabular w-full rounded-xl border border-ink py-3 font-semibold"
                  >
                    즉시구매 {won(p.buyNowPrice!)}
                  </button>
                )}
              </>
            )}
            {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-accent"}`}>{msg.text}</p>}
            <p className="text-xs text-muted">
              마감 2분 전 입찰이 들어오면 2분 연장돼요. 즉시구매는 현재가가 즉시구매가의 {RULES.buyNowCutoff * 100}%에 도달하면 종료돼요.
              낙찰 후 24시간 안에 결제해 주세요.
            </p>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-bold">입찰 기록</h2>
          {p.bids.length === 0 ? (
            <p className="text-sm text-muted">아직 입찰이 없어요. 첫 입찰자가 되어 보세요!</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {[...p.bids].reverse().slice(0, 10).map((b) => (
                <li key={b.id} className="tabular flex justify-between py-2">
                  <span>{b.userLabel}{b.auto && <span className="ml-1 text-xs text-muted">자동</span>}</span>
                  <span className="font-medium">{won(b.amount)}</span>
                  <span className="text-muted">{new Date(b.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
