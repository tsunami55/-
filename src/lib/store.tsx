"use client";
// Supabase 연동 저장소. 쓰기는 모두 DB 함수(RPC)로 처리하고, 변경은 실시간 구독으로 다시 불러온다.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Address, Bid, Notice, Order, Product, User } from "./types";

interface State {
  loaded: boolean;
  error?: string;
  myBidProductIds: string[];
  users: User[];
  currentUserId?: string;
  products: Product[];
  orders: Order[];
  notices: Notice[];
}

type Row = Record<string, unknown>;
const t = (v: unknown) => (v ? new Date(v as string).getTime() : undefined);

const toUser = (r: Row): User => ({
  id: r.id as string,
  name: r.name as string,
  phone: (r.phone as string) ?? undefined,
  isAdmin: r.is_admin as boolean,
  strikes: r.strikes as number,
  bannedUntil: t(r.banned_until),
  sizeAlerts: (r.size_alerts as number[]) ?? [],
  address: (r.address as Address) ?? undefined,
});

const toBid = (r: Row): Bid => ({
  id: r.id as string,
  userId: r.user_id as string,
  userLabel: r.user_label as string,
  amount: r.amount as number,
  at: t(r.created_at)!,
  auto: r.auto as boolean,
});

const toProduct = (r: Row, bids: Bid[]): Product => ({
  id: r.id as string,
  title: r.title as string,
  brand: r.brand as string,
  category: r.category as Product["category"],
  size: r.size as number,
  grade: r.grade as Product["grade"],
  defectNote: (r.defect_note as string) ?? undefined,
  color: r.color as string,
  startPrice: r.start_price as number,
  buyNowPrice: (r.buy_now_price as number) ?? undefined,
  currentPrice: r.current_price as number,
  hasReserve: r.has_reserve as boolean,
  reserveMet: r.reserve_met as boolean,
  leaderId: (r.leader_id as string) ?? undefined,
  bids,
  bidCount: r.bid_count as number,
  bidderCount: r.bidder_count as number,
  views: r.views as number,
  endsAt: t(r.ends_at)!,
  status: r.status as Product["status"],
  sellerId: (r.seller_id as string) ?? "",
  createdAt: t(r.created_at)!,
  winnerId: (r.winner_id as string) ?? undefined,
  finalPrice: (r.final_price as number) ?? undefined,
  closedAt: t(r.closed_at),
});

const toOrder = (r: Row): Order => {
  const product = r.product as { title?: string; size?: number } | null;
  return {
    id: r.id as string,
    productId: r.product_id as string,
    userId: r.user_id as string,
    amount: r.amount as number,
    createdAt: t(r.created_at)!,
    dueAt: t(r.due_at)!,
    status: r.status as Order["status"],
    paidAt: t(r.paid_at),
    shippingFee: (r.shipping_fee as number) ?? undefined,
    productTitle: product?.title ?? "(상품)",
    productSize: product?.size,
  };
};

const toNotice = (r: Row): Notice => ({
  id: r.id as string,
  userId: r.user_id as string,
  text: r.text as string,
  href: (r.href as string) ?? undefined,
  at: t(r.created_at)!,
  read: r.read as boolean,
});

type Result = { ok: boolean; message: string; leading?: boolean };
const EMPTY: State = { loaded: false, users: [], products: [], orders: [], notices: [], myBidProductIds: [] };

type Api = ReturnType<typeof useStoreApi>;
const Ctx = createContext<Api | null>(null);

/**
 * 데이터 전송량을 줄이는 방식:
 * - 상품 목록은 처음 한 번만 불러오고, 이후에는 실시간으로 '바뀐 상품/새 입찰'만 받아서 반영
 * - 입찰 기록은 상세 화면을 열 때 그 상품 것만 최근 30건
 * - 내 주문/알림은 내 데이터가 바뀔 때만 다시 불러옴 (양이 작음)
 */
function useStoreApi() {
  const [s, setS] = useState<State>(EMPTY);
  const [now, setNow] = useState(() => Date.now());
  const settling = useRef(0);
  const uidRef = useRef<string | undefined>(undefined);
  const mineTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const patch = useCallback((fn: (st: State) => State) => setS(fn), []);

  const mergeProduct = useCallback(
    (row: Row) =>
      patch((st) => {
        const ex = st.products.find((p) => p.id === row.id);
        const prod = toProduct(row, ex?.bids ?? []);
        return { ...st, products: ex ? st.products.map((p) => (p.id === prod.id ? prod : p)) : [...st.products, prod] };
      }),
    [patch],
  );

  const loadProducts = useCallback(async () => {
    if (!supabase) return patch((st) => ({ ...st, loaded: true }));
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [open, closed] = await Promise.all([
      supabase.from("products").select("*").in("status", ["ACTIVE", "PENDING"]).order("ends_at").limit(300),
      supabase.from("products").select("*").in("status", ["SOLD", "UNSOLD", "REJECTED"]).gte("closed_at", since).order("closed_at", { ascending: false }).limit(100),
    ]);
    const error = open.error ?? closed.error;
    patch((st) => {
      const prevBids = new Map(st.products.map((p) => [p.id, p.bids]));
      return {
        ...st,
        loaded: true,
        error: error ? `데이터를 불러오지 못했어요: ${error.message}` : undefined,
        products: [...(open.data ?? []), ...(closed.data ?? [])].map((r) => toProduct(r, prevBids.get(r.id) ?? [])),
      };
    });
  }, [patch]);

  const loadMine = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    uidRef.current = uid;
    if (!uid) return patch((st) => ({ ...st, currentUserId: undefined, users: [], orders: [], notices: [], myBidProductIds: [] }));
    const [users, orders, notices, mybids] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("orders").select("*, product:products(title,size)").order("created_at", { ascending: false }).limit(200),
      supabase.from("notices").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("bids").select("product_id").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
    ]);
    patch((st) => ({
      ...st,
      currentUserId: uid,
      users: (users.data ?? []).map(toUser),
      orders: (orders.data ?? []).map(toOrder),
      notices: (notices.data ?? []).map(toNotice),
      myBidProductIds: [...new Set((mybids.data ?? []).map((b) => b.product_id as string))],
    }));
  }, [patch]);

  const refreshMine = useCallback(() => {
    clearTimeout(mineTimer.current);
    mineTimer.current = setTimeout(loadMine, 300);
  }, [loadMine]);

  const loadBids = useCallback(
    async (productId: string) => {
      if (!supabase) return;
      const { data } = await supabase.from("bids").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(30);
      const bids = (data ?? []).map(toBid).reverse();
      patch((st) => ({ ...st, products: st.products.map((p) => (p.id === productId ? { ...p, bids } : p)) }));
    },
    [patch],
  );

  const refreshProduct = useCallback(
    async (productId: string) => {
      const { data } = (await supabase?.from("products").select("*").eq("id", productId).maybeSingle()) ?? {};
      if (data) mergeProduct(data);
    },
    [mergeProduct],
  );

  // 처음 불러오기 + 로그인 변화 + 실시간 변경분 반영
  useEffect(() => {
    const sb = supabase;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부(DB) 데이터 동기화
    loadProducts();
    if (!sb) return;
    const { data: sub } = sb.auth.onAuthStateChange(() => refreshMine());
    const ch = sb
      .channel("kidsauction")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, (e) => {
        const row = e.new as Row;
        if (row?.id) mergeProduct(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, (e) => {
        const row = e.new as Row;
        if (!row?.id) return;
        const b = toBid(row);
        patch((st) => ({
          ...st,
          myBidProductIds:
            b.userId === uidRef.current && !st.myBidProductIds.includes(row.product_id as string)
              ? [...st.myBidProductIds, row.product_id as string]
              : st.myBidProductIds,
          products: st.products.map((p) =>
            p.id !== row.product_id
              ? p
              : { ...p, bids: p.bids.some((x) => x.id === b.id) ? p.bids.map((x) => (x.id === b.id ? b : x)) : [...p.bids, b].slice(-30) },
          ),
        }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refreshMine)
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, refreshMine)
      .subscribe();
    return () => {
      sub.subscription.unsubscribe();
      sb.removeChannel(ch);
    };
  }, [loadProducts, refreshMine, mergeProduct, patch]);

  // 1초마다 시계 갱신. 마감 시간이 지난 경매가 보이면 정산 요청 (서버에서도 1분마다 자동 정산)
  useEffect(() => {
    const timer = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setS((st) => {
        if (supabase && st.products.some((p) => p.status === "ACTIVE" && p.endsAt <= n) && n - settling.current > 5000) {
          settling.current = n;
          supabase.rpc("settle_due_auctions").then(() => {
            loadProducts();
            refreshMine();
          });
        }
        return st;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loadProducts, refreshMine]);

  /** 서버 함수 호출. 실시간 연결이 끊겨도 화면이 맞도록 관련 데이터만 다시 불러온다. */
  const rpc = async (fn: string, args?: Record<string, unknown>, productId?: string): Promise<Result> => {
    if (!supabase) return { ok: false, message: "서버 연결 설정이 필요해요." };
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, message: error.message };
    if (productId) {
      refreshProduct(productId);
      loadBids(productId);
    }
    refreshMine();
    return (data as Result) ?? { ok: true, message: "" };
  };

  const state = s;
  const me = state.users.find((u) => u.id === state.currentUserId);

  return {
    ready: s.loaded,
    configured: !!supabase,
    now,
    state,
    me,
    loadBids,

    /** 간편 시작 (카카오 로그인 연동 전 임시: 이름만으로 게스트 계정 생성) */
    async login(name: string): Promise<Result> {
      if (!supabase) return { ok: false, message: "서버 연결 설정이 필요해요." };
      const { error } = await supabase.auth.signInAnonymously({ options: { data: { name } } });
      if (error) return { ok: false, message: error.message };
      await loadMine();
      return { ok: true, message: "" };
    },
    async loginEmail(email: string, password: string): Promise<Result> {
      if (!supabase) return { ok: false, message: "서버 연결 설정이 필요해요." };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, message: "이메일 또는 비밀번호가 맞지 않아요." };
      await Promise.all([loadMine(), loadProducts()]);
      return { ok: true, message: "" };
    },
    async logout() {
      await supabase?.auth.signOut();
      await Promise.all([loadMine(), loadProducts()]);
    },

    view: (productId: string) => void supabase?.rpc("increment_view", { p_product: productId }),

    bid: (productId: string, maxAmount: number) => rpc("place_bid", { p_product: productId, p_max: maxAmount }, productId),
    buyNow: (productId: string) => rpc("buy_now", { p_product: productId }, productId),
    pay: (orderIds: string[], address: Address, saveAddress: boolean) =>
      rpc("pay_orders", { p_orders: orderIds, p_address: address, p_save: saveAddress }),
    respondOffer: (orderId: string, accept: boolean) => rpc("respond_offer", { p_order: orderId, p_accept: accept }),
    setSizeAlerts: (sizes: number[]) => rpc("update_my_profile", { p_size_alerts: sizes }),
    readNotices: () => rpc("mark_notices_read"),

    async submitProduct(p: Pick<Product, "title" | "category" | "size" | "grade" | "defectNote" | "color" | "startPrice" | "reservePrice" | "buyNowPrice">) {
      const r = await rpc("submit_product", {
        p_title: p.title, p_category: p.category, p_size: p.size, p_grade: p.grade, p_defect_note: p.defectNote ?? null,
        p_color: p.color, p_start_price: p.startPrice, p_reserve_price: p.reservePrice ?? null, p_buy_now_price: p.buyNowPrice ?? null,
      });
      loadProducts();
      return r;
    },
    review: (productId: string, approve: boolean) => rpc("review_product", { p_product: productId, p_approve: approve }, productId),
    expireOrder: (orderId: string) => rpc("expire_order", { p_order: orderId }),
    async relist(productId?: string) {
      const r = await rpc("relist_unsold", { p_product: productId ?? null });
      loadProducts();
      return r;
    },
    async closeNow(productId?: string) {
      const r = await rpc("admin_close_now", { p_product: productId ?? null }, productId);
      loadProducts();
      return r;
    },
  };
}

/** 내가 1등일 때 내 최대 입찰가 (다른 사람에게는 비공개) */
export async function fetchMyLeaderMax(productId: string) {
  return ((await supabase?.rpc("my_leader_max", { p_product: productId }))?.data as number | null) ?? null;
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
