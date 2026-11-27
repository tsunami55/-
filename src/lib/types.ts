// 키즈옥션 데이터 타입. 나중에 Supabase 테이블 구조와 1:1로 맞춘다.

export type Grade = "NEW" | "B_STAIN" | "B_SEAM" | "B_ETC";
export type Category = "top" | "bottom" | "outer" | "dress" | "set";
export type ProductStatus = "PENDING" | "ACTIVE" | "SOLD" | "UNSOLD" | "REJECTED";

export interface Bid {
  id: string;
  userId: string;
  userLabel: string; // 화면에 보이는 마스킹 이름 (예: 김**)
  amount: number;
  at: number;
  auto: boolean; // 최대가 설정(자동입찰)으로 들어간 입찰인지
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  category: Category;
  size: number; // 90 ~ 160
  grade: Grade;
  defectNote?: string; // B급일 때 하자 설명 (필수)
  color: string; // 임시 이미지 배경색
  startPrice: number;
  reservePrice?: number; // 최저낙찰가 (등록할 때만 사용, 서버에 비공개 저장)
  hasReserve?: boolean;
  reserveMet?: boolean;
  buyNowPrice?: number; // 즉시구매가
  currentPrice: number;
  leaderId?: string;
  leaderMax?: number; // 현재 1등의 최대 입찰가 (비공개)
  bids: Bid[]; // 상세 화면에서만 불러옴 (최근 30건)
  bidCount?: number;
  bidderCount?: number;
  views: number;
  endsAt: number;
  status: ProductStatus;
  sellerId: string;
  createdAt: number;
  winnerId?: string;
  finalPrice?: number;
  closedAt?: number;
}

export interface Address {
  name: string;
  phone: string;
  address: string;
}

export interface User {
  id: string;
  name: string;
  provider?: "kakao" | "phone" | "guest" | "email";
  phone?: string;
  isAdmin?: boolean;
  strikes: number; // 미결제 횟수
  bannedUntil?: number;
  sizeAlerts: number[]; // 알림 받을 사이즈 (복수 선택)
  address?: Address; // 첫 결제 때 저장, 재구매 때 자동 입력
}

export type OrderStatus = "UNPAID" | "PAID" | "EXPIRED" | "OFFERED" | "DECLINED";

export interface Order {
  id: string;
  productId: string;
  userId: string;
  amount: number;
  createdAt: number;
  dueAt: number; // 결제 기한
  status: OrderStatus;
  paidAt?: number;
  shippingFee?: number;
  productTitle?: string;
  productSize?: number;
}

export interface Notice {
  id: string;
  userId: string;
  text: string;
  href?: string;
  at: number;
  read: boolean;
}

export const GRADE_LABEL: Record<Grade, string> = {
  NEW: "새상품",
  B_STAIN: "B급 · 미세오염",
  B_SEAM: "B급 · 봉제불량",
  B_ETC: "B급 · 기타",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  top: "상의",
  bottom: "하의",
  outer: "아우터",
  dress: "원피스",
  set: "세트",
};

export const SIZES = [90, 100, 110, 120, 130, 140, 150, 160];
