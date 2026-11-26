// 경매 규칙 (순수 함수). 화면과 분리해 두어 나중에 서버(Supabase 함수)로 그대로 옮길 수 있다.
import type { Bid, Product } from "./types";

export const RULES = {
  closeHour: 21,
  closeMinute: 30, // 매일 밤 9시 30분 일괄 마감
  softCloseMs: 2 * 60 * 1000, // 마감 2분 전 입찰 시 2분 연장
  buyNowCutoff: 0.8, // 입찰가가 즉시구매가의 80%에 도달하면 즉시구매 종료
  paymentWindowMs: 24 * 60 * 60 * 1000, // 낙찰 후 24시간 내 결제
  banMs: 30 * 24 * 60 * 60 * 1000, // 2회 미결제 시 30일 입찰 제한
  shippingFee: 3500,
  freeShippingOver: 50000,
};

/** 입찰 단위: 1만원 미만 500원, 1만원 이상 1,000원 */
export function increment(price: number) {
  return price < 10000 ? 500 : 1000;
}

/** 다음 일괄 마감 시각 (오늘 21:30, 이미 지났으면 내일 21:30) */
export function nextCloseTime(now = Date.now()) {
  const d = new Date(now);
  d.setHours(RULES.closeHour, RULES.closeMinute, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function minNextBid(p: Product) {
  return p.bids.length === 0 ? p.startPrice : p.currentPrice + increment(p.currentPrice);
}

export function buyNowAvailable(p: Product) {
  return (
    p.status === "ACTIVE" &&
    !!p.buyNowPrice &&
    p.currentPrice < p.buyNowPrice * RULES.buyNowCutoff
  );
}

export function reserveMet(p: Product) {
  if (p.reserveMet !== undefined) return p.reserveMet;
  return !p.reservePrice || p.currentPrice >= p.reservePrice;
}

export function uniqueBidders(p: Product) {
  return new Set(p.bids.map((b) => b.userId)).size;
}

/** 참가율 = 입찰자 수 ÷ 조회수 */
export function participationRate(p: Product) {
  return p.views === 0 ? 0 : uniqueBidders(p) / p.views;
}

export function maskName(name: string) {
  return name.slice(0, 1) + "**";
}

const uid = () => Math.random().toString(36).slice(2, 10);

export type BidResult = { ok: true; product: Product; message: string } | { ok: false; error: string };

/**
 * 입찰 (자동입찰 포함).
 * maxAmount = 고객이 낼 수 있는 최대 금액. 일반 입찰이면 입찰 금액 그대로.
 * 시스템은 경쟁자보다 한 단위만 높게 대신 입찰한다.
 */
export function placeBid(
  p: Product,
  user: { id: string; name: string },
  maxAmount: number,
  now = Date.now(),
): BidResult {
  if (p.status !== "ACTIVE") return { ok: false, error: "진행 중인 경매가 아니에요." };
  if (now >= p.endsAt) return { ok: false, error: "경매가 마감되었어요." };

  const label = maskName(user.name);
  const bids: Bid[] = [...p.bids];
  const add = (userId: string, userLabel: string, amount: number, auto: boolean) =>
    bids.push({ id: uid(), userId, userLabel, amount, at: now, auto });

  const next: Product = { ...p };
  let message = "";

  if (p.leaderId === user.id) {
    // 이미 1등: 최대가만 올린다 (가격은 그대로)
    if (maxAmount <= (p.leaderMax ?? 0))
      return { ok: false, error: "기존 최대 입찰가보다 높게 설정해 주세요." };
    next.leaderMax = maxAmount;
    message = `최대 입찰가를 ${maxAmount.toLocaleString()}원으로 올렸어요.`;
  } else {
    const min = minNextBid(p);
    if (maxAmount < min) return { ok: false, error: `${min.toLocaleString()}원 이상 입찰해 주세요.` };

    if (!p.leaderId) {
      next.currentPrice = p.startPrice;
      next.leaderId = user.id;
      next.leaderMax = maxAmount;
      add(user.id, label, p.startPrice, maxAmount > p.startPrice);
      message = "첫 입찰이에요! 현재 1등이에요.";
    } else if (maxAmount > (p.leaderMax ?? 0)) {
      // 새 입찰자가 이김
      const prevMax = p.leaderMax ?? 0;
      const prevLeader = p.bids.findLast((b) => b.userId === p.leaderId);
      const price = Math.min(maxAmount, prevMax + increment(prevMax));
      if (prevLeader && prevMax > p.currentPrice) add(p.leaderId, prevLeader.userLabel, prevMax, true);
      add(user.id, label, price, price < maxAmount);
      next.currentPrice = price;
      next.leaderId = user.id;
      next.leaderMax = maxAmount;
      message = "현재 1등이에요!";
    } else {
      // 기존 1등의 최대가가 더 높음 → 자동입찰로 방어
      const leaderLabel = p.bids.findLast((b) => b.userId === p.leaderId)?.userLabel ?? "**";
      const price = Math.min(p.leaderMax ?? 0, maxAmount + increment(maxAmount));
      add(user.id, label, maxAmount, false);
      add(p.leaderId, leaderLabel, price, true);
      next.currentPrice = price;
      message = "다른 분이 더 높은 최대가를 설정해 두었어요. 더 높게 입찰해 보세요.";
    }
  }

  // 1등의 최대가가 최저낙찰가 이상이면 현재가를 최저낙찰가까지 올린다
  if (next.reservePrice && (next.leaderMax ?? 0) >= next.reservePrice && next.currentPrice < next.reservePrice) {
    next.currentPrice = next.reservePrice;
    bids[bids.length - 1] = { ...bids[bids.length - 1], amount: next.reservePrice };
  }

  // 마감 직전 입찰 → 자동 연장
  if (p.endsAt - now < RULES.softCloseMs) {
    next.endsAt = now + RULES.softCloseMs;
    message += " (마감 직전 입찰로 2분 연장되었어요)";
  }

  next.bids = bids;
  return { ok: true, product: next, message };
}

/** 마감 정산: 낙찰 또는 유찰 */
export function settle(p: Product, now = Date.now()): Product {
  if (p.bids.length > 0 && p.leaderId && (!p.reservePrice || (p.leaderMax ?? 0) >= p.reservePrice)) {
    return {
      ...p,
      status: "SOLD",
      winnerId: p.leaderId,
      finalPrice: Math.max(p.currentPrice, p.reservePrice ?? 0),
      closedAt: now,
    };
  }
  return { ...p, status: "UNSOLD", closedAt: now };
}

/** 묶음배송: 미결제 낙찰 합계 5만원 이상이면 무료 */
export function shippingFor(total: number) {
  return total >= RULES.freeShippingOver ? 0 : RULES.shippingFee;
}

export function won(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export function formatRemain(ms: number) {
  if (ms <= 0) return "마감";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
