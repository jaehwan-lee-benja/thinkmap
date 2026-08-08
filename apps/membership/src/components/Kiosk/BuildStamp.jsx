// 배포 버전 스탬프 — 아주 연한 회색 소형 텍스트(유저 지시 2026-08-08).
//   값은 빌드 시점에 인라인된다(vite define `__MK_BUILD__`, 그 파일 주석 참조).
//   ★`pointer-events: none` — 어떤 버튼도 가리지 않는다(하단은 카운트다운 막대·가입 버튼이 지나는 자리다).
export default function BuildStamp() {
  const v = typeof __MK_BUILD__ === 'string' ? __MK_BUILD__ : 'dev'
  return <div className="mk-build" aria-hidden="true">v{v}</div>
}
