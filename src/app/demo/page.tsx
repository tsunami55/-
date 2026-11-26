"use client";
// 체험 경매: 화면 안에서만 돌아가는 시뮬레이션. 서버/실제 경매 데이터와 완전히 분리되어 있고
// 화면 어디에서도 실제 거래처럼 보이지 않도록 '체험용 예시' 표시를 항상 유지한다.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { increment, won } from "@/lib/auction";
import ProductArt from "@/components/ProductArt";

const DURATION = 60;
const START = 5000;
type DemoBid = { who: string; amount: number; me: boolean };

export default function DemoPage() {
  const [left, setLeft] = useState(DURATION);
  const [price, setPrice] = useState(START);
  const [bids, setBids] = useState<DemoBid[]>([]);
  const [running, setRunning] = useState(false);
  const cap = useRef(0);
  const priceRef = useRef(START);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);

  const start = useCallback(() => {
    cap.current = 14000 + Math.floor(Math.random() * 8) * 1000;
    setLeft(DURATION);
    setPrice(START);
    setBids([]);
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => (l <= 1 ? (setRunning(false), 0) : l - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  // 가상 입찰자
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const p = priceRef.current;
      if (p + increment(p) <= cap.current) {
        const amt = p + increment(p);
        setPrice(amt);
        setBids((b) => [{ who: `가상 입찰자 ${1 + Math.floor(Math.random() * 4)}`, amount: amt, me: false }, ...b]);
      }
      timer = setTimeout(tick, 2500 + Math.random() * 3500);
    };
    timer = setTimeout(tick, 1500);
    return () => clearTimeout(timer);
  }, [running]);

  const myBid = () => {
    const amt = price + increment(price);
    setPrice(amt);
    setBids((b) => [{ who: "나", amount: amt, me: true }, ...b]);
    if (left < 10) setLeft(10); // 마감 직전 연장 체험
  };

  const winner = bids[0];
  const bidders = new Set(bids.map((b) => b.who)).size;

  return (
    <div className="mx-auto max-w-md space-y-5 pt-6">
      <div className="sticky top-16 z-10 rounded-xl bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white">
        🎮 체험용 예시 · 실제 거래가 아니에요
      </div>
      <p className="text-center text-sm text-muted">
        가상 머니로 경매 진행을 체험해 보세요. 실제 경매는 매일 밤 9시 30분에 마감되지만, 체험은 60초로 줄였어요.
      </p>

      <div className="relative">
        <ProductArt category="top" color="#EDEDED" className="rounded-3xl" />
        <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-xs font-bold">체험용 예시 상품</span>
      </div>

      <div className="rounded-2xl bg-soft p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted">현재가 (가상)</p>
            <p className="tabular text-3xl font-extrabold">{won(price)}</p>
          </div>
          <p className={`tabular text-2xl font-bold ${left <= 10 && running ? "text-accent" : ""}`}>00:{String(left).padStart(2, "0")}</p>
        </div>
        <p className="tabular mt-2 text-xs text-muted">시작가 {won(START)} · 입찰 {bids.length}회</p>
      </div>

      {!running && bids.length === 0 && (
        <button onClick={start} className="w-full rounded-xl bg-ink py-3 font-semibold text-white">체험 시작</button>
      )}
      {running && (
        <button onClick={myBid} className="tabular w-full rounded-xl bg-accent py-3 font-semibold text-white">
          {won(price + increment(price))} 입찰하기 (가상 머니)
        </button>
      )}
      {!running && bids.length > 0 && (
        <div className="space-y-3 rounded-2xl border-2 border-ink p-5 text-center">
          <p className="text-xs font-semibold text-muted">체험 결과 (예시)</p>
          <p className="text-lg font-bold">{winner?.me ? "🎉 낙찰 성공!" : `${winner?.who} 낙찰`}</p>
          <div className="tabular grid grid-cols-3 gap-2 text-sm">
            <div><p className="text-xs text-muted">시작가</p><p className="font-bold">{won(START)}</p></div>
            <div><p className="text-xs text-muted">낙찰가</p><p className="font-bold text-accent">{won(price)}</p></div>
            <div><p className="text-xs text-muted">입찰자</p><p className="font-bold">{bidders}명</p></div>
          </div>
          <div className="flex gap-2">
            <button onClick={start} className="flex-1 rounded-xl border border-line py-2.5 text-sm">다시 체험</button>
            <Link href="/" className="flex-1 rounded-xl bg-ink py-2.5 text-sm font-semibold text-white">진짜 경매 참여하기</Link>
          </div>
        </div>
      )}

      {bids.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {bids.slice(0, 8).map((b, i) => (
            <li key={i} className={`tabular flex justify-between py-2 ${b.me ? "font-semibold text-accent" : ""}`}>
              <span>{b.who}</span><span>{won(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
