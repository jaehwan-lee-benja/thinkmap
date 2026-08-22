// 배포 버전 스탬프 — 아주 연한 회색 소형 텍스트(유저 지시 2026-08-08).
//   ★표기는 **사람 기준**: `v8.8-12` = 월.일 + 그날의 판 번호. «숫자가 커졌나»만 보면 새로고침 판별이 끝난다.
//   hash 는 괄호로 병기하고 더 연하게 — 사람은 앞을, 배포 검증은 뒤를 쓴다(값 생성은 vite.config 주석 참조).
//   ★`pointer-events: none` — 하단은 카운트다운 막대·가입 버튼이 지나는 자리라 무엇도 가리면 안 된다.
export default function BuildStamp() {
  const v = typeof __MK_BUILD__ === 'string' ? __MK_BUILD__ : 'dev'
  const sha = typeof __MK_SHA__ === 'string' ? __MK_SHA__ : ''
  return (
    <div className="mk-build" aria-hidden="true">
      <b>{v}</b>{sha ? <span className="mk-build-sha"> ({sha})</span> : null}
    </div>
  )
}
