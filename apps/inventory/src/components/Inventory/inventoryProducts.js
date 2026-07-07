// 제품 마스터 시드 — 원본 시트의 세로 고정 순서·par(한계재고) 그대로.
//
// 하드코딩 금지 원칙: 런타임은 inventory_products 테이블을 단일 출처로 읽는다.
// 이 상수는 (1) 최초 마이그레이션 시드, (2) 시트 대조용 참조 데이터 두 용도로만 쓴다.
//
// category: 'main'(본제품) | 'sub'(보조제품) | 'derived'(하단 환산행, 입력 없음/표시 전용)
// par_weekday / par_weekend: null = 한계재고 미설정(수령필요 = 종료합계로 계산)

export const PRODUCT_CATEGORIES = {
  MAIN: 'main',
  SUB: 'sub',
  DERIVED: 'derived',
}

export const SEED_PRODUCTS = [
  // ── 본제품 14 ──────────────────────────────────────────────
  { name: '제조 우유',        category: 'main', par_weekday: 10, par_weekend: 20, sort_order: 10 },
  { name: '판매 우유',        category: 'main', par_weekday: 15, par_weekend: 20, sort_order: 20 },
  { name: '플레인 1L',        category: 'main', par_weekday: 10, par_weekend: 10, sort_order: 30 },
  { name: '플레인 500ml',     category: 'main', par_weekday: 5,  par_weekend: 10, sort_order: 40 },
  { name: '플레인 150ml',     category: 'main', par_weekday: 10, par_weekend: 14, sort_order: 50 },
  { name: '딸기 요거트',      category: 'main', par_weekday: 10, par_weekend: 15, sort_order: 60, note: '목-오전 택배 외 수령' },
  { name: '밀크티',           category: 'main', par_weekday: null, par_weekend: null, sort_order: 70 },
  { name: '그릭요거트(2w)',   category: 'main', par_weekday: 2,  par_weekend: 2,  sort_order: 80 },
  { name: '꾼치즈(3w)',       category: 'main', par_weekday: 2,  par_weekend: 2,  sort_order: 90 },
  { name: '스트링치즈(3w)',   category: 'main', par_weekday: 5,  par_weekend: 5,  sort_order: 100 },
  { name: '베이스',           category: 'main', par_weekday: 10, par_weekend: 18, sort_order: 110, note: '1박스 = 24개' },
  { name: '카이막',           category: 'main', par_weekday: 2,  par_weekend: 4,  sort_order: 120, note: '금-다음주 날짜 수령' },
  { name: '카이막컵',         category: 'main', par_weekday: null, par_weekend: null, sort_order: 130 },
  { name: '빵 포장',          category: 'main', par_weekday: null, par_weekend: null, sort_order: 140 },

  // ── 보조제품 8 (par 미설정) ────────────────────────────────
  { name: '원두',             category: 'sub', par_weekday: null, par_weekend: null, sort_order: 210 },
  { name: '원두(디카페인)',   category: 'sub', par_weekday: null, par_weekend: null, sort_order: 220 },
  { name: '식빵',             category: 'sub', par_weekday: null, par_weekend: null, sort_order: 230 },
  { name: '호밀',             category: 'sub', par_weekday: null, par_weekend: null, sort_order: 240 },
  { name: '자몽',             category: 'sub', par_weekday: null, par_weekend: null, sort_order: 250 },
  { name: '오레오쿠키',       category: 'sub', par_weekday: null, par_weekend: null, sort_order: 260 },
  { name: '오레오링 오즈',    category: 'sub', par_weekday: null, par_weekend: null, sort_order: 270 },
  { name: '꿀',               category: 'sub', par_weekday: null, par_weekend: null, sort_order: 280 },

  // ── 하단 환산/집계 3 (입력 없음, 표시 전용 — 환산식 추후 확정) ──
  { name: '하)카이막(개)',    category: 'derived', par_weekday: null, par_weekend: null, sort_order: 310 },
  { name: '베이스(박스)',     category: 'derived', par_weekday: null, par_weekend: null, sort_order: 320 },
  { name: '우유(개or박스)',   category: 'derived', par_weekday: null, par_weekend: null, sort_order: 330 },
]
