"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRemain, RULES, shippingFor, won } from "@/lib/auction";
import { useStore } from "@/lib/store";
import { SIZES, type Address } from "@/lib/types";

export default function MyPage() {
  const store = useStore();
  const { me, state, now, ready } = store;
  const [draft, setDraft] = useState<Address | null>(null);
  const addr: Address = draft ?? me?.address ?? { name: me?.name ?? "", phone: me?.phone ?? "", address: "" };
  const [save, setSave] = useState(true);
  const [paying, setPaying] = useState(false);

  const mine = useMemo(() => (me ? state.orders.filter((o) => o.userId === me.id) : []), [me, state.orders]);
  const unpaid = mine.filter((o) => o.status === "UNPAID");
  const offers = mine.filter((o) => o.status === "OFFERED");
  const paid = mine.filter((o) => o.status === "PAID");
  const subtotal = unpaid.reduce((a, o) => a + o.amount, 0);
  const fee = shippingFor(subtotal);
  const prod = (id: string) => state.products.find((p) => p.id === id)!;
  const myBidding = me ? state.products.filter((p) => p.status === "ACTIVE" && p.bids.some((b) => b.userId === me.id)) : [];
  const notices = me ? state.notices.filter((n) => n.userId === me.id).slice(0, 8) : [];

  if (!ready) return <p className="py-20 text-center text-muted">불러오는 중…</p>;
  if (!me) return <div className="py-20 text-center"><Link href="/login?next=/my" className="rounded-full bg-ink px-5 py-2 text-white">로그인</Link></div>;

  const toggleSize = (s: number) => store.setSizeAlerts(me.sizeAlerts.includes(s) ? me.sizeAlerts.filter((x) => x !== s) : [...me.sizeAlerts, s]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 pt-6">
      <div>
        <h1 className="text-xl font-bold">{me.name}님</h1>
        {me.strikes > 0 && (
          <p className="mt-1 text-sm text-accent">
            미결제 {me.strikes}회{me.bannedUntil && me.bannedUntil > now ? ` · ${new Date(me.bannedUntil).toLocaleDateString()}까지 입찰 제한` : " · 한 번 더 미결제 시 30일간 입찰이 제한돼요"}
          </p>
        )}
      </div>

      {notices.length > 0 && (
        <section className="rounded-2xl bg-soft p-4">
          <div className="mb-2 flex justify-between text-sm">
            <h2 className="font-bold">알림 (카카오 알림톡 미리보기)</h2>
            <button onClick={store.readNotices} className="text-muted">모두 읽음</button>
          </div>
          <ul className="space-y-1.5 text-sm">
            {notices.map((n) => (
              <li key={n.id} className={n.read ? "text-muted" : ""}>
                {n.href ? <Link href={n.href} className="hover:underline">{n.text}</Link> : n.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {offers.map((o) => (
        <section key={o.id} className="rounded-2xl border-2 border-accent p-4 text-sm">
          <p className="font-bold">차순위 낙찰 제안</p>
          <p className="mt-1">「{prod(o.productId).title}」을(를) 입찰하신 {won(o.amount)}에 구매하시겠어요?</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => store.respondOffer(o.id, true)} className="rounded-lg bg-ink px-4 py-2 text-white">구매할게요</button>
            <button onClick={() => store.respondOffer(o.id, false)} className="rounded-lg border border-line px-4 py-2">괜찮아요</button>
          </div>
        </section>
      ))}

      <section>
        <h2 className="mb-3 font-bold">결제 대기 (묶음배송)</h2>
        {unpaid.length === 0 ? (
          <p className="text-sm text-muted">결제할 낙찰 상품이 없어요.</p>
        ) : (
          <div className="space-y-4 rounded-2xl border border-line p-4">
            <ul className="divide-y divide-line text-sm">
              {unpaid.map((o) => (
                <li key={o.id} className="tabular flex justify-between py-2">
                  <span>{prod(o.productId).title} <span className="text-muted">({prod(o.productId).size})</span></span>
                  <span>{won(o.amount)} <span className="text-xs text-accent">· 기한 {formatRemain(o.dueAt - now)}</span></span>
                </li>
              ))}
            </ul>
            <div className="tabular space-y-1 text-sm">
              <div className="flex justify-between"><span>상품 합계</span><span>{won(subtotal)}</span></div>
              <div className="flex justify-between"><span>배송비 (묶음 1회)</span><span>{fee === 0 ? "무료" : won(fee)}</span></div>
              {fee > 0 && (
                <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
                  {won(RULES.freeShippingOver - subtotal)} 더 낙찰받으면 무료배송이에요!
                </p>
              )}
              <div className="flex justify-between pt-1 text-base font-bold"><span>결제 금액</span><span>{won(subtotal + fee)}</span></div>
            </div>
            {!paying ? (
              <button onClick={() => setPaying(true)} className="w-full rounded-xl bg-ink py-3 font-semibold text-white">결제하기</button>
            ) : (
              <div className="space-y-2">
                {me.address && <p className="text-xs text-emerald-600">저장된 배송지를 불러왔어요.</p>}
                {(["name", "phone", "address"] as const).map((k) => (
                  <input
                    key={k}
                    value={addr[k]}
                    onChange={(e) => setDraft({ ...addr, [k]: e.target.value })}
                    placeholder={k === "name" ? "받는 분" : k === "phone" ? "연락처" : "주소"}
                    className="w-full rounded-xl border border-line px-4 py-2.5 text-sm"
                  />
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> 다음에도 이 배송지 사용
                </label>
                <button
                  onClick={() => {
                    if (!addr.name || !addr.phone || !addr.address) return alert("배송 정보를 모두 입력해 주세요.");
                    store.pay(unpaid.map((o) => o.id), addr, save);
                    setPaying(false);
                  }}
                  className="tabular w-full rounded-xl bg-accent py-3 font-semibold text-white"
                >
                  {won(subtotal + fee)} 결제 (토스페이먼츠 연동 예정)
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-bold">내 사이즈 알림</h2>
        <p className="mb-3 text-xs text-muted">선택한 사이즈의 경매가 열리면 카카오 알림톡으로 알려드려요. 여러 개 선택할 수 있어요.</p>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s} onClick={() => toggleSize(s)} className={`tabular rounded-full border px-3 py-1 text-sm ${me.sizeAlerts.includes(s) ? "border-accent bg-accent text-white" : "border-line"}`}>
              {s}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-bold">입찰 중인 경매</h2>
        {myBidding.length === 0 ? <p className="text-sm text-muted">없어요.</p> : (
          <ul className="divide-y divide-line text-sm">
            {myBidding.map((p) => (
              <li key={p.id} className="tabular flex justify-between py-2">
                <Link href={`/auction/${p.id}`} className="hover:underline">{p.title}</Link>
                <span className={p.leaderId === me.id ? "font-semibold text-emerald-600" : "text-accent"}>
                  {won(p.currentPrice)} · {p.leaderId === me.id ? "1등" : "추월당함"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {paid.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold">구매 내역</h2>
          <ul className="divide-y divide-line text-sm">
            {paid.map((o) => (
              <li key={o.id} className="tabular flex justify-between py-2">
                <span>{prod(o.productId).title}</span><span>{won(o.amount)} · 결제완료</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
