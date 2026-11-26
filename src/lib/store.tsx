"use client";
// Supabase 연동 저장소. 쓰기는 모두 DB 함수(RPC)로 처리하고, 변경은 실시간 구독으로 다시 불러온다.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Address, Bid, Notice, Order, Product, User } from "./types";

interface State {
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
  views: r.views as number,
  endsAt: t(r.ends_at)!,
  status: r.status as Product["status"],
  sellerId: (r.seller_id as string) ?? "",
  createdAt: t(r.created_at)!,
  winnerId: (r.winner_id as string) ?? undefined,
  finalPrice: (r.final_price as number) ?? undefined,
  closedAt: t(r.closed_at),
});

const toOrder = (r: Row): Order => ({
  id: r.id as string,
  productId: r.product_id as string,
  userId: r.user_id as string,
  amount: r.amount as number,
  createdAt: t(r.created_at)!,
  dueAt: t(r.due_at)!,
  status: r.status as Order["status"],
  paidAt: t(r.paid_at),
  shippingFee: (r.shipping_fee as number) ?? undefined,
});

const toNotice = (r: Row): Notice => ({
  id: r.id as string,
  userId: r.user_id as string,
  text: r.text as string,
  href: (r.href as string) ?? undefined,
  at: t(r.created_at)!,
  read: r.read as boolean,
});

type Result = { ok: boolean; message: string; leading?: boolean };
const EMPTY: State = { users: [], products: [], orders: [], notices: [] };

type Api = ReturnType<typeof useStoreApi>;
const Ctx = createContext<Api | null>(null);

function useStoreApi() {
  const [s, setS] = useState<State | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const settling = useRef(0);

  const load = useCallback(async () => {
    if (!supabase) return setS(EMPTY);
    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user.id;
    const { data: prows } = await supabase.from("products").select("*").order("ends_at").limit(300);
    const ids = (prows ?? []).map((p) => p.id);
    const { data: brows } = ids.length
      ? await supabase.from("bids").select("*").in("product_id", ids).order("created_at")
      : { data: [] };
    const byProduct = new Map<string, Bid[]>();
    for (const b of brows ?? []) byProduct.set(b.product_id, [...(byProduct.get(b.product_id) ?? []), toBid(b)]);
    const [users, orders, notices] = uid
      ? await Promise.all([
          supabase.from("profiles").select("*"),
          supabase.from("orders").select("*").order("created_at", { ascending: false }),
          supabase.from("notices").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
    setS({
      currentUserId: uid,
      users: (users.data ?? []).map(toUser),
      products: (prows ?? []).map((p) => toProduct(p, byProduct.get(p.id) ?? [])),
      orders: (orders.data ?? []).map(toOrder),
      notices: (notices.data ?? []).map(toNotice),
    });
  }, []);

  // 처음 불러오기 + 로그인 변화 + 실시간 변경 구독
  useEffect(() => {
    const sb = supabase;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부(DB) 데이터 동기화
    load();
    if (!sb) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    };
    const { data: sub } = sb.auth.onAuthStateChange(() => reload());
    const ch = sb
      .channel("kidsauction")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, reload)
      .subscribe();
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
      sb.removeChannel(ch);
    };
  }, [load]);

  // 1초마다 시계 갱신, 마감 시간이 지난 경매가 보이면 정산 요청 (서버에서도 1분마다 자동 정산)
  useEffect(() => {
    const timer = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setS((st) => {
        if (supabase && st?.products.some((p) => p.status === "ACTIVE" && p.endsAt <= n) && n - settling.current > 5000) {
          settling.current = n;
          supabase.rpc("settle_due_auctions").then(() => load());
        }
        return st;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [load]);

  const rpc = async (fn: string, args?: Record<string, unknown>): Promise<Result> => {
    if (!supabase) return { ok: false, message: "서버 연결 설정이 필요해요." };
    const { data, error } = await supabase.rpc(fn, args);
    if (error) return { ok: false, message: error.message };
    load();
    return (data as Result) ?? { ok: true, message: "" };
  };

  const state = s ?? EMPTY;
  const me = state.users.find((u) => u.id === state.currentUserId);

  return {
    ready: !!s,
    configured: !!supabase,
    now,
    state,
    me,

    /** 간편 시작 (카카오 로그인 연동 전 임시: 이름만으로 게스트 계정 생성) */
    async login(name: string): Promise<Result> {
      if (!supabase) return { ok: false, message: "서버 연결 설정이 필요해요." };
      const { error } = await supabase.auth.signInAnonymously({ options: { data: { name } } });
      if (error) return { ok: false, message: error.message };
      await load();
      return { ok: true, message: "" };
    },
    async loginEmail(email: string, password: string): Promise<Result> {
      if (!supabase) return { ok: false, message: "서버 연결 설정이 필요해요." };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, message: "이메일 또는 비밀번호가 맞지 않아요." };
      await load();
      return { ok: true, message: "" };
    },
    async logout() {
      await supabase?.auth.signOut();
      await load();
    },

    view: (productId: string) => void supabase?.rpc("increment_view", { p_product: productId }),

    bid: (productId: string, maxAmount: number) => rpc("place_bid", { p_product: productId, p_max: maxAmount }),
    buyNow: (productId: string) => rpc("buy_now", { p_product: productId }),
    pay: (orderIds: string[], address: Address, saveAddress: boolean) =>
      rpc("pay_orders", { p_orders: orderIds, p_address: address, p_save: saveAddress }),
    respondOffer: (orderId: string, accept: boolean) => rpc("respond_offer", { p_order: orderId, p_accept: accept }),
    setSizeAlerts: (sizes: number[]) => rpc("update_my_profile", { p_size_alerts: sizes }),
    readNotices: () => rpc("mark_notices_read"),

    submitProduct: (p: Pick<Product, "title" | "category" | "size" | "grade" | "defectNote" | "color" | "startPrice" | "reservePrice" | "buyNowPrice">) =>
      rpc("submit_product", {
        p_title: p.title, p_category: p.category, p_size: p.size, p_grade: p.grade, p_defect_note: p.defectNote ?? null,
        p_color: p.color, p_start_price: p.startPrice, p_reserve_price: p.reservePrice ?? null, p_buy_now_price: p.buyNowPrice ?? null,
      }),
    review: (productId: string, approve: boolean) => rpc("review_product", { p_product: productId, p_approve: approve }),
    expireOrder: (orderId: string) => rpc("expire_order", { p_order: orderId }),
    closeNow: (productId?: string) => rpc("admin_close_now", { p_product: productId ?? null }),
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
