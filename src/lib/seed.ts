// 초기 상품: 운영자가 직접 등록한 실제 경매 상품 (입찰 기록은 0에서 시작).
import { nextCloseTime } from "./auction";
import type { Product, User } from "./types";

type SeedItem = Pick<
  Product,
  "title" | "brand" | "category" | "size" | "grade" | "defectNote" | "color" | "startPrice" | "reservePrice" | "buyNowPrice"
>;

const items: SeedItem[] = [
  { title: "코튼 오버핏 맨투맨", brand: "키즈옥션 셀렉", category: "top", size: 110, grade: "NEW", color: "#E8EEF7", startPrice: 5000, buyNowPrice: 19000 },
  { title: "기모 조거 팬츠", brand: "키즈옥션 셀렉", category: "bottom", size: 120, grade: "B_SEAM", defectNote: "왼쪽 주머니 안쪽 박음질 2cm 풀림 (겉에서 안 보임)", color: "#F3ECE3", startPrice: 3000, buyNowPrice: 12000 },
  { title: "경량 패딩 점퍼", brand: "키즈옥션 셀렉", category: "outer", size: 130, grade: "NEW", color: "#E6F0EA", startPrice: 15000, reservePrice: 25000, buyNowPrice: 49000 },
  { title: "체크 플리츠 원피스", brand: "키즈옥션 셀렉", category: "dress", size: 100, grade: "B_STAIN", defectNote: "밑단 안쪽 연한 얼룩 (지름 5mm), 세탁 시 제거 가능성 있음", color: "#F7E8EC", startPrice: 4000, buyNowPrice: 16000 },
  { title: "트레이닝 상하 세트", brand: "키즈옥션 셀렉", category: "set", size: 140, grade: "NEW", color: "#ECE9F6", startPrice: 12000, buyNowPrice: 39000 },
  { title: "데님 와이드 팬츠", brand: "키즈옥션 셀렉", category: "bottom", size: 150, grade: "NEW", color: "#E3EAF2", startPrice: 8000, reservePrice: 15000, buyNowPrice: 29000 },
  { title: "후드 집업", brand: "키즈옥션 셀렉", category: "outer", size: 160, grade: "B_ETC", defectNote: "지퍼 손잡이 도금 일부 벗겨짐", color: "#EEF2E4", startPrice: 6000, buyNowPrice: 22000 },
  { title: "스트라이프 긴팔 티", brand: "키즈옥션 셀렉", category: "top", size: 90, grade: "NEW", color: "#F6F0E2", startPrice: 2000, buyNowPrice: 9000 },
];

export function seedProducts(now = Date.now()): Product[] {
  const endsAt = nextCloseTime(now);
  const products: Product[] = items.map((it, i) => ({
    ...it,
    id: `p${i + 1}`,
    currentPrice: it.startPrice,
    bids: [],
    views: 0,
    endsAt,
    status: "ACTIVE",
    sellerId: "admin",
    createdAt: now,
  }));
  // 일반 판매자가 등록한 승인 대기 상품 예시
  products.push({
    id: "p9", title: "니트 가디건", brand: "판매자 등록", category: "outer", size: 120, grade: "NEW",
    color: "#F4E9E1", startPrice: 7000, buyNowPrice: 25000, currentPrice: 7000, bids: [], views: 0,
    endsAt, status: "PENDING", sellerId: "seller1", createdAt: now,
  });
  return products;
}

export const ADMIN: User = { id: "admin", name: "관리자", provider: "phone", isAdmin: true, strikes: 0, sizeAlerts: [] };
