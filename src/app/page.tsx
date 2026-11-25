"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRemain, nextCloseTime } from "@/lib/auction";
import { useStore } from "@/lib/store";
import { SIZES, type Grade } from "@/lib/types";
import ProductCard from "@/components/ProductCard";

export default function Home() {
  const { state, now, ready } = useStore();
  const [sizes, setSizes] = useState<number[]>([]);
  const [grade, setGrade] = useState<"ALL" | "NEW" | "B">("ALL");
  const [sort, setSort] = useState<"ending" | "popular" | "low">("ending");

  const list = useMemo(() => {
    const isB = (g: Grade) => g !== "NEW";
    return state.products
      .filter((p) => p.status === "ACTIVE")
      .filter((p) => sizes.length === 0 || sizes.includes(p.size))
      .filter((p) => grade === "ALL" || (grade === "NEW" ? !isB(p.grade) : isB(p.grade)))
      .sort((a, b) =>
        sort === "ending" ? a.endsAt - b.endsAt : sort === "popular" ? b.bids.length - a.bids.length : a.currentPrice - b.currentPrice,
      );
  }, [state.products, sizes, grade, sort]);

  const closed = state.products.filter((p) => p.status === "SOLD").slice(0, 4);
  const toggle = (s: number) => setSizes((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  return (
    <div className="space-y-8 pt-6">
      <section className="rounded-3xl bg-ink px-6 py-8 text-white">
        <p className="text-sm text-white/60">3세~주니어 · 새상품 &amp; B급 새상품</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-snug sm:text-3xl">
          {ready && new Date(nextCloseTime(now)).getDate() !== new Date(now).getDate() ? "내일" : "오늘"} 밤 9시 30분,
          <br />
          <span className="text-accent">일괄 마감</span> 경매
        </h1>
        <p className="tabular mt-3 text-sm text-white/80">
          마감까지 <b className="text-white">{ready ? formatRemain(nextCloseTime(now) - now) : "--:--:--"}</b> · 5만원 이상 무료배송
        </p>
      </section>

      <Link href="/demo" className="flex items-center justify-between rounded-2xl border border-line bg-accent-soft px-5 py-4">
        <div>
          <p className="text-sm font-bold">경매가 처음이세요?</p>
          <p className="text-xs text-muted">가상 머니로 입찰부터 낙찰까지 미리 체험해 보세요 (실제 거래 아님)</p>
        </div>
        <span className="shrink-0 whitespace-nowrap pl-3 text-sm font-semibold text-accent">체험하기 →</span>
      </Link>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`rounded-full border px-3 py-1 text-sm tabular ${sizes.includes(s) ? "border-ink bg-ink text-white" : "border-line"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-3">
            {(["ALL", "NEW", "B"] as const).map((g) => (
              <button key={g} onClick={() => setGrade(g)} className={grade === g ? "font-bold" : "text-muted"}>
                {g === "ALL" ? "전체" : g === "NEW" ? "새상품" : "B급 새상품"}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="bg-transparent text-muted">
            <option value="ending">마감 임박순</option>
            <option value="popular">입찰 많은순</option>
            <option value="low">낮은 가격순</option>
          </select>
        </div>
      </section>

      {!ready ? (
        <p className="py-20 text-center text-muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="py-20 text-center text-muted">조건에 맞는 경매가 없어요. 마이페이지에서 사이즈 알림을 설정해 보세요.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => <ProductCard key={p.id} p={p} now={now} />)}
        </div>
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">최근 낙찰</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {closed.map((p) => <ProductCard key={p.id} p={p} now={now} />)}
          </div>
        </section>
      )}
    </div>
  );
}
