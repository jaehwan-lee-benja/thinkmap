// 아이콘 한 벌 — ★UI 부품으로 **문자 글리프를 쓰지 않는다**(교본 «존재 ≠ 동작», CSS/레이아웃 함정 ④).
//   `✕`·`✓` 같은 글리프는 기기·폰트 폴백에 따라 크기·기준선이 흔들리고, 최악엔 두부(□)로 뜬다.
//   2026-08-10 감사 지적: `SeatConfirm` 만 SVG 로 바뀌고 같은 형태 4곳이 글리프로 남아 **«두 벌»** 이 됐다
//   — 이 라운드가 잡으려던 바로 그 형태라, 한 벌로 모아 다시 갈라지지 않게 한다.
//
// 크기는 `1em` 기본 = **글자 크기를 따라간다.** 호출부에서 font-size 만 정하면 되고(기존 CSS 그대로 먹는다),
// 색은 `currentColor` — 상태색(hover·disabled·강조)이 자동으로 따라온다.
//
// ※`aria-hidden` 이 기본값이다. 아이콘 혼자 뜻을 지는 버튼은 **호출부가 `aria-label` 을 단다**(이미 그렇게 돼 있다).

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

/** 닫기·삭제 ✕ */
export function IconX(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </svg>
  )
}

/** 확인 ✓ */
export function IconCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 13 L9.5 17.5 L19 6.5" />
    </svg>
  )
}
