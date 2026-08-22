// 「백오피스 홈으로」 — ★모든 직원 화면이 **같은 컴포넌트 하나**를 쓴다(#7, 2026-08-22).
//   화면마다 버튼을 손으로 붙이면 목적지·문구·위치가 갈라지고, 한 곳만 고쳐도 나머지가 낡는다.
// ★목적지는 «런처»다(회원님 정정 15:30) — 조회 화면(StaffView)이 아니라 링크만 있는 홈.
// ★역할 세션은 유지한다: 여기서 `forgetRole()` 을 부르지 않는다. 기기 용도 반납은 런처 안의
//   «손님 화면으로»(확인 1회)가 맡고, 되돌아오는 문은 로고 2탭 라인이다 — **문 하나에 규칙 하나.**
import { HOME_HREF } from './backofficeLinks'

export default function BackofficeHomeButton({ label = '백오피스 홈으로' }) {
  return (
    <button
      type="button"
      className="mk-bo-home"
      onClick={() => { window.location.href = HOME_HREF }}
    >← {label}</button>
  )
}
