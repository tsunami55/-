"use client";
import Link from "next/link";
import { useState } from "react";
import { formatRemain, participationRate, uniqueBidders, won } from "@/lib/auction";
import { useStore } from "@/lib/store";
import { CATEGORY_LABEL, GRADE_LABEL, SIZES, type Category, type Grade } from "@/lib/types";

const COLORS = ["#E8EEF7", "#F3ECE3", "#E6F0EA", "#F7E8EC", "#ECE9F6", "#EEF2E4"];

export default function AdminPage() {
  const store = useStore();
  const { me, state, now, ready } = store;
  const [rateDesc, setRateDesc] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const active = state.products.filter((p) => p.status === "ACTIVE");
  const pending = state.products.filter((p) => p.status === "PENDING");
  const paidToday = state.orders.filter((o) => o.status === "PAID" && (o.paidAt ?? 0) >= startOfDay);
  const sales = paidToday.reduce((a, o) => a + o.amount, 0);
  const unpaid = state.orders.filter((o) => o.status === "UNPAID");
  const endingSoon = active.filter((p) => p.endsAt - now < 30 * 60 * 1000).length;
  const ranked = [...active].sort((a, b) => (rateDesc ? 1 : -1) * (participationRate(b) - participationRate(a)));
  const user = (id: string) => state.users.find((u) => u.id === id);
  const prod = (id: string) => state.products.find((p) => p.id === id);

  if (!ready) return <p className="py-20 text-center text-muted">불러오는 중…</p>;
  if (!me?.isAdmin) return <p className="py-20 text-center text-muted">관리자만 볼 수 있어요. <Link href="/login" className="underline">로그인</Link></p>;

  return (
    <div className="space-y-8 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">관리자 대시보드</h1>
        <button onClick={() => setShowForm((v) => !v)} className="rounded-full bg-ink px-4 py-1.5 text-sm text-white">+ 상품 등록</button>
      </div>

      {showForm && <ProductForm onDone={() => setShowForm(false)} />}

      <div className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="오늘 매출" value={won(sales)} sub={`결제 ${paidToday.length}건`} />
        <Tile label="진행 중 경매" value={`${active.length}개`} sub={`30분 내 마감 ${endingSoon}개`} />
        <Tile label="미결제 낙찰" value={`${unpaid.length}건`} sub={won(unpaid.reduce((a, o) => a + o.amount, 0))} accent={unpaid.length > 0} />
        <Tile label="승인 대기" value={`${pending.length}개`} sub="판매자 등록 상품" accent={pending.length > 0} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">참가율 순위 <span className="text-xs font-normal text-muted">입찰자 수 ÷ 조회수</span></h2>
          <button onClick={() => setRateDesc((v) => !v)} className="rounded-full border border-line px-3 py-1 text-sm">
            {rateDesc ? "높은순 ↓" : "낮은순 ↑"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-2">상품</th><th>사이즈</th><th>조회</th><th>입찰자</th><th>참가율</th><th>현재가</th><th>남은 시간</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranked.map((p) => {
                const r = participationRate(p);
                return (
                  <tr key={p.id}>
                    <td className="py-2"><Link href={`/auction/${p.id}`} className="hover:underline">{p.title}</Link></td>
                    <td>{p.size}</td>
                    <td>{p.views}</td>
                    <td>{uniqueBidders(p)}</td>
                    <td className={r >= 0.3 ? "font-bold text-emerald-600" : r === 0 ? "text-accent" : ""}>{(r * 100).toFixed(0)}%</td>
                    <td>{won(p.currentPrice)}</td>
                    <td>{formatRemain(p.endsAt - now)}</td>
                    <td><button onClick={() => store.closeNow(p.id)} className="text-xs text-muted underline">지금 마감</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">참가율 높은 상품은 비슷한 상품을 더 등록하고, 낮은 상품은 시작가나 사진을 바꿔 보세요.</p>
      </section>

      <section>
        <h2 className="mb-3 font-bold">미결제 낙찰</h2>
        {unpaid.length === 0 ? <p className="text-sm text-muted">없어요.</p> : (
          <ul className="divide-y divide-line text-sm">
            {unpaid.map((o) => {
              const u = user(o.userId);
              return (
                <li key={o.id} className="tabular flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{prod(o.productId)?.title} · {u?.name} {u && u.strikes > 0 && <span className="text-accent">(경고 {u.strikes}회)</span>}</span>
                  <span className="flex items-center gap-3">
                    {won(o.amount)} · 기한 {formatRemain(o.dueAt - now)}
                    <button onClick={() => store.expireOrder(o.id)} className="rounded-lg border border-accent px-2 py-1 text-xs text-accent">
                      기한 만료 처리
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">만료 처리 시: 1회 경고, 2회째 30일 입찰 제한, 차순위 입찰자에게 자동으로 낙찰 제안</p>
      </section>

      <section>
        <h2 className="mb-3 font-bold">승인 대기 상품</h2>
        {pending.length === 0 ? <p className="text-sm text-muted">없어요.</p> : (
          <ul className="divide-y divide-line text-sm">
            {pending.map((p) => (
              <li key={p.id} className="tabular flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{p.title} · {p.size} · {GRADE_LABEL[p.grade]} · 시작가 {won(p.startPrice)}{p.defectNote && <span className="text-muted"> · {p.defectNote}</span>}</span>
                <span className="flex gap-2">
                  <button onClick={() => store.review(p.id, true)} className="rounded-lg bg-ink px-3 py-1 text-xs text-white">승인</button>
                  <button onClick={() => store.review(p.id, false)} className="rounded-lg border border-line px-3 py-1 text-xs">반려</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-3 border-t border-line pt-4 text-xs text-muted">
        <button onClick={() => store.closeNow()} className="underline">테스트: 진행 중 경매 전부 지금 마감</button>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "bg-accent-soft" : "bg-soft"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${accent ? "text-accent" : ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function ProductForm({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const [f, setF] = useState({
    title: "", category: "top" as Category, size: 110, grade: "NEW" as Grade, defectNote: "",
    startPrice: "", reservePrice: "", buyNowPrice: "",
  });
  const n = (v: string) => (v ? Number(v.replace(/\D/g, "")) : undefined);
  const input = "w-full rounded-xl border border-line px-3 py-2 text-sm";

  return (
    <form
      className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.title || !n(f.startPrice)) return alert("상품명과 시작가는 필수예요.");
        if (f.grade !== "NEW" && !f.defectNote) return alert("B급 상품은 하자 설명이 필수예요.");
        store.submitProduct({
          title: f.title, category: f.category, size: f.size, grade: f.grade,
          defectNote: f.grade === "NEW" ? undefined : f.defectNote,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          startPrice: n(f.startPrice)!, reservePrice: n(f.reservePrice), buyNowPrice: n(f.buyNowPrice),
        });
        onDone();
      }}
    >
      <input className={`${input} sm:col-span-2`} placeholder="상품명" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>
        {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select className={input} value={f.size} onChange={(e) => setF({ ...f, size: Number(e.target.value) })}>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={input} value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value as Grade })}>
        {Object.entries(GRADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input className={input} placeholder="시작가" inputMode="numeric" value={f.startPrice} onChange={(e) => setF({ ...f, startPrice: e.target.value })} />
      {f.grade !== "NEW" && (
        <input className={`${input} sm:col-span-2`} placeholder="하자 설명 (필수, 예: 밑단 안쪽 5mm 얼룩)" value={f.defectNote} onChange={(e) => setF({ ...f, defectNote: e.target.value })} />
      )}
      <input className={input} placeholder="최저낙찰가 (선택, 비공개)" inputMode="numeric" value={f.reservePrice} onChange={(e) => setF({ ...f, reservePrice: e.target.value })} />
      <input className={input} placeholder="즉시구매가 (선택)" inputMode="numeric" value={f.buyNowPrice} onChange={(e) => setF({ ...f, buyNowPrice: e.target.value })} />
      <p className="text-xs text-muted sm:col-span-2">사진 업로드는 Supabase Storage 연결 후 추가돼요. 오늘 밤 9시 30분 일괄 마감에 자동 편성돼요.</p>
      <button className="rounded-xl bg-ink py-2.5 text-sm font-semibold text-white sm:col-span-2">등록</button>
    </form>
  );
}
