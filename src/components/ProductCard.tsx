"use client";
import Link from "next/link";
import { bidCountOf, formatRemain, uniqueBidders, won } from "@/lib/auction";
import { GRADE_LABEL, type Product } from "@/lib/types";
import ProductArt from "./ProductArt";

export default function ProductCard({ p, now }: { p: Product; now: number }) {
  const remain = p.endsAt - now;
  const closed = p.status !== "ACTIVE";
  return (
    <Link href={`/auction/${p.id}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl">
        <ProductArt category={p.category} color={p.color} className="transition group-hover:scale-[1.03]" />
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            p.grade === "NEW" ? "bg-white text-ink" : "bg-ink text-white"
          }`}
        >
          {GRADE_LABEL[p.grade]}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">{p.size}</span>
        {closed && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold">
            {p.status === "SOLD" ? "낙찰 완료" : "유찰"}
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="truncate text-sm">{p.title}</p>
        <p className="tabular text-base font-bold">{won(closed ? (p.finalPrice ?? p.currentPrice) : p.currentPrice)}</p>
        <p className="tabular text-xs text-muted">
          입찰 {bidCountOf(p)}회 · {uniqueBidders(p)}명
          {!closed && <span className={remain < 600000 ? " text-accent" : ""}> · {formatRemain(remain)}</span>}
        </p>
      </div>
    </Link>
  );
}
