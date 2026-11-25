// 실제 상품 사진이 들어갈 자리. 지금은 카테고리별 단순 일러스트로 대체.
import type { Category } from "@/lib/types";

const paths: Record<Category, string> = {
  top: "M30 20 L42 14 Q50 22 58 14 L70 20 L80 34 L70 40 L66 34 L66 80 L34 80 L34 34 L30 40 L20 34 Z",
  bottom: "M32 16 L68 16 L72 84 L56 84 L50 40 L44 84 L28 84 Z",
  outer: "M28 20 L42 13 L50 24 L58 13 L72 20 L82 40 L72 44 L70 36 L70 84 L30 84 L30 36 L28 44 L18 40 Z M50 24 L50 84",
  dress: "M40 14 L60 14 L62 34 L78 84 L22 84 L38 34 Z",
  set: "M30 12 L42 8 Q50 14 58 8 L70 12 L76 22 L68 26 L66 22 L66 48 L34 48 L34 22 L32 26 L24 22 Z M36 52 L64 52 L66 90 L54 90 L50 66 L46 90 L34 90 Z",
};

export default function ProductArt({ category, color, className = "" }: { category: Category; color: string; className?: string }) {
  return (
    <div className={`flex aspect-square items-center justify-center ${className}`} style={{ background: color }}>
      <svg viewBox="0 0 100 100" className="h-1/2 w-1/2" aria-hidden>
        <path d={paths[category]} fill="white" stroke="#11111122" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
