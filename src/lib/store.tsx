"use client";
// 프로토타입용 상태 저장소 (브라우저 localStorage).
// 실제 서비스에서는 이 파일의 함수들을 Supabase 호출로 바꾸면 된다. 화면 코드는 그대로 유지.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { placeBid as rulePlaceBid, RULES, settle, nextCloseTime } from "./auction";
import { ADMIN, seedProducts } from "./seed";
import type { Address, Notice, Order, Product, User } from "./types";

interface State {
  users: User[];
  currentUserId?: string;
  products: Product[];
  orders: Order[];
  notices: Notice[];
}

const KEY = "kidsauction-v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function initial(): State {
  return { users: [ADMIN], products: seedProducts(), orders: [], notices: [] };
}

type Api = ReturnType<typeof useStoreApi>;
const Ctx = createContext<Api | null>(null);

function useStoreApi() {
  const [s, setS] = useState<State | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<State | null>(null);
  ref.current = s;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setS(raw ? JSON.parse(raw) : initial());
    } catch {
      setS(initial());
    }
  }, []);

  useEffect(() => {
    if (!s) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  const notify = (st: State, userId: string, text: string, href?: string): State => ({
    ...st,
    notices: [{ id: uid(), userId, text, href, at: Date.now(), read: false }, ...st.notices],
  });

  // 1초마다 마감 시간이 지난 경매를 정산
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setS((st) => {
        if (!st || !st.products.some((p) => p.status === "ACTIVE" && p.endsAt <= n)) return st;
        let next = { ...st };
        next.products = st.products.map((p) => {
          if (p.status !== "ACTIVE" || p.endsAt > n) return p;
          const done = settle(p, n);
          if (done.status === "SOLD" && done.winnerId) {
            next.orders = [
              { id: uid(), productId: p.id, userId: done.winnerId, amount: done.finalPrice!, createdAt: n, dueAt: n + RULES.paymentWindowMs, status: "UNPAID" },
              ...next.orders,
            ];
            next = notify(next, done.winnerId, `[알림톡] '${p.title}' 낙찰되었어요! 24시간 안에 결제해 주세요.`, "/my");
          }
          return done;
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const update = useCallback((fn: (st: State) => State) => setS((st) => (st ? fn(st) : st)), []);

  const me = s?.users.find((u) => u.id === s.currentUserId);

  return {
    ready: !!s,
    now,
    state: s ?? initial(),
    me,

    // ── 로그인 (Supabase Auth: 카카오 OAuth / 휴대폰 OTP로 교체 예정)
    login(provider: "kakao" | "phone", name: string, phone?: string) {
      update((st) => {
        const existing = st.users.find((u) => (phone ? u.phone === phone : u.provider === provider && u.name === name));
        if (existing) return { ...st, currentUserId: existing.id };
        const user: User = { id: uid(), name, provider, phone, strikes: 0, sizeAlerts: [] };
        return { ...st, users: [...st.users, user], currentUserId: user.id };
      });
    },
    loginAdmin() {
      update((st) => ({ ...st, currentUserId: "admin" }));
    },
    logout() {
      update((st) => ({ ...st, currentUserId: undefined }));
    },

    view(productId: string) {
      update((st) => ({ ...st, products: st.products.map((p) => (p.id === productId ? { ...p, views: p.views + 1 } : p)) }));
    },

    // ── 입찰
    bid(productId: string, maxAmount: number): { ok: boolean; message: string; leading?: boolean } {
      const st = ref.current;
      if (!st || !me) return { ok: false, message: "로그인 후 입찰할 수 있어요." };
      if (me.bannedUntil && me.bannedUntil > Date.now())
        return { ok: false, message: `미결제 누적으로 ${new Date(me.bannedUntil).toLocaleDateString()}까지 입찰이 제한되어 있어요.` };
      const p = st.products.find((x) => x.id === productId);
      if (!p) return { ok: false, message: "상품을 찾을 수 없어요." };
      const prevLeader = p.leaderId;
      const r = rulePlaceBid(p, me, maxAmount);
      if (!r.ok) return { ok: false, message: r.error };
      update((cur) => {
        let next = { ...cur, products: cur.products.map((x) => (x.id === productId ? r.product : x)) };
        if (prevLeader && prevLeader !== me.id && r.product.leaderId !== prevLeader)
          next = notify(next, prevLeader, `[알림톡] '${p.title}' 더 높은 입찰이 들어왔어요.`, `/auction/${p.id}`);
        return next;
      });
      return { ok: true, message: r.message, leading: r.product.leaderId === me.id };
    },

    buyNow(productId: string): { ok: boolean; message: string } {
      const st = ref.current;
      if (!st || !me) return { ok: false, message: "로그인 후 구매할 수 있어요." };
      const p = st.products.find((x) => x.id === productId);
      if (!p?.buyNowPrice) return { ok: false, message: "즉시구매가 없는 상품이에요." };
      const n = Date.now();
      update((cur) => ({
        ...cur,
        products: cur.products.map((x) =>
          x.id === productId ? { ...x, status: "SOLD", winnerId: me.id, finalPrice: p.buyNowPrice, closedAt: n } : x,
        ),
        orders: [{ id: uid(), productId, userId: me.id, amount: p.buyNowPrice!, createdAt: n, dueAt: n + RULES.paymentWindowMs, status: "UNPAID" }, ...cur.orders],
      }));
      return { ok: true, message: "즉시구매 완료! 마이페이지에서 결제해 주세요." };
    },

    // ── 결제 (토스페이먼츠 연동 예정): 묶음 결제
    pay(orderIds: string[], address: Address, saveAddress: boolean, shippingFee: number) {
      update((st) => ({
        ...st,
        users: saveAddress && me ? st.users.map((u) => (u.id === me.id ? { ...u, address } : u)) : st.users,
        orders: st.orders.map((o) =>
          orderIds.includes(o.id)
            ? { ...o, status: "PAID", paidAt: Date.now(), shippingFee: o.id === orderIds[0] ? shippingFee : 0 }
            : o,
        ),
      }));
    },

    respondOffer(orderId: string, accept: boolean) {
      update((st) => ({
        ...st,
        orders: st.orders.map((o) =>
          o.id === orderId ? { ...o, status: accept ? "UNPAID" : "DECLINED", dueAt: Date.now() + RULES.paymentWindowMs } : o,
        ),
      }));
    },

    setSizeAlerts(sizes: number[]) {
      if (!me) return;
      update((st) => ({ ...st, users: st.users.map((u) => (u.id === me.id ? { ...u, sizeAlerts: sizes } : u)) }));
    },

    readNotices() {
      if (!me) return;
      update((st) => ({ ...st, notices: st.notices.map((n) => (n.userId === me.id ? { ...n, read: true } : n)) }));
    },

    // ── 판매자 / 관리자
    submitProduct(p: Omit<Product, "id" | "currentPrice" | "bids" | "views" | "endsAt" | "status" | "sellerId" | "createdAt">) {
      if (!me) return;
      update((st) => ({
        ...st,
        products: [
          { ...p, id: uid(), currentPrice: p.startPrice, bids: [], views: 0, endsAt: nextCloseTime(), status: me.isAdmin ? "ACTIVE" : "PENDING", sellerId: me.id, createdAt: Date.now() },
          ...st.products,
        ],
      }));
    },

    review(productId: string, approve: boolean) {
      update((st) => {
        const p = st.products.find((x) => x.id === productId);
        if (!p) return st;
        let next: State = {
          ...st,
          products: st.products.map((x) =>
            x.id === productId ? { ...x, status: approve ? "ACTIVE" : "REJECTED", endsAt: nextCloseTime() } : x,
          ),
        };
        // 승인되면 '내 사이즈 알림' 등록 고객에게 알림톡
        if (approve)
          for (const u of st.users.filter((u) => u.sizeAlerts.includes(p.size)))
            next = notify(next, u.id, `[알림톡] 찜한 사이즈 ${p.size} 경매가 열렸어요: ${p.title}`, `/auction/${p.id}`);
        return next;
      });
    },

    /** 결제 기한 만료 처리: 1회 경고, 2회째 30일 입찰 제한, 차순위 입찰자에게 낙찰 제안 */
    expireOrder(orderId: string) {
      update((st) => {
        const o = st.orders.find((x) => x.id === orderId);
        const p = o && st.products.find((x) => x.id === o.productId);
        if (!o || !p) return st;
        const u = st.users.find((x) => x.id === o.userId)!;
        const strikes = u.strikes + 1;
        let next: State = {
          ...st,
          orders: st.orders.map((x) => (x.id === orderId ? { ...x, status: "EXPIRED" } : x)),
          users: st.users.map((x) =>
            x.id === u.id ? { ...x, strikes, bannedUntil: strikes >= 2 ? Date.now() + RULES.banMs : x.bannedUntil } : x,
          ),
        };
        next = notify(
          next,
          u.id,
          strikes >= 2
            ? "[알림톡] 미결제가 2회 누적되어 30일간 입찰이 제한돼요."
            : "[알림톡] 결제 기한이 지나 낙찰이 취소되었어요. 한 번 더 미결제 시 입찰이 제한돼요.",
        );
        // 차순위: 낙찰자를 제외한 입찰자 중 최고 입찰가
        const second = p.bids
          .filter((b) => b.userId !== o.userId)
          .reduce<{ userId: string; amount: number } | null>((a, b) => (!a || b.amount > a.amount ? b : a), null);
        const already = st.orders.some((x) => x.productId === p.id && x.userId === second?.userId);
        if (second && !already) {
          next.orders = [
            { id: uid(), productId: p.id, userId: second.userId, amount: second.amount, createdAt: Date.now(), dueAt: Date.now() + RULES.paymentWindowMs, status: "OFFERED" },
            ...next.orders,
          ];
          next = notify(next, second.userId, `[알림톡] '${p.title}' 차순위 낙찰 기회! ${second.amount.toLocaleString()}원에 구매하시겠어요?`, "/my");
        }
        return next;
      });
    },

    /** 테스트용: 진행 중인 경매를 지금 마감 */
    closeNow(productId?: string) {
      const n = Date.now() - 1;
      update((st) => ({
        ...st,
        products: st.products.map((p) => (p.status === "ACTIVE" && (!productId || p.id === productId) ? { ...p, endsAt: n } : p)),
      }));
    },

    resetAll() {
      try {
        localStorage.removeItem(KEY);
      } catch {}
      setS(initial());
    },
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const api = useStoreApi();
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error("StoreProvider missing");
  return v;
}
