// 백오피스 런처 — «링크만 있는 홈»(회원님 정정 2026-08-22 15:30).
//
// ★무엇인가: 직원이 «어디로 갈지»만 고르는 중립 페이지다. 조회(StaffView)는 «홈»이 아니라
//   여기 목록의 «한 항목»이다. 그래서 이 화면은 데이터를 한 줄도 부르지 않는다.
// ★게이트(중요): `?role=` 은 **쿼리이지 인증이 아니다** — 주소를 알면 누구나 이 목록을 연다.
//   ⇒ 보호는 런처가 아니라 **링크 «너머»**(각 화면의 로그인·RLS)에 있다. 그래서 여기에는
//   **회원 정보·매출·토큰 같은 값을 한 줄도 두지 않는다.** 손님이 열었을 때 알게 되는 것은
//   «이 매장에 이런 화면들이 있다»는 사실뿐이고, 그건 이미 기기에 붙은 북마크로 드러난다.
// ★새 탭으로 열지 않는다: 키오스크·태블릿에서 탭이 쌓이면 손님 화면으로 못 돌아온다.
import { BACKOFFICE_LINKS } from './backofficeLinks'

export default function LauncherView({ store }) {
  const go = (href) => { window.location.href = href }
  return (
    <div className="mk-screen mk-launcher">
      <div className="mk-launcher-head">
        <div className="mk-launcher-title">멤버십 백오피스</div>
        <div className="mk-launcher-sub">쓸 화면을 고르세요{store && store !== 'default' ? ` · 매장 ${store}` : ''}</div>
      </div>

      <ul className="mk-launcher-list">
        {BACKOFFICE_LINKS.map((l) => (
          <li key={l.role}>
            <button type="button" className="mk-launcher-item" onClick={() => go(l.href)}>
              <span className="mk-launcher-item-name">{l.name}</span>
              <span className="mk-launcher-item-desc">{l.desc}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* 손님 화면으로 나가는 길 — 직원이 «기기를 손님에게 돌려주는» 동선이다.
          ★여기엔 7777 을 요구하지 않는다(들어오는 문만 잠근다). 되돌아오는 길을 문구로 남긴다. */}
      <div className="mk-launcher-foot">
        <button
          type="button"
          className="mk-reset"
          onClick={() => {
            const ok = window.confirm('손님 화면으로 바꿉니다.\n직원 화면으로 돌아오려면 로고를 두 번 누르세요.')
            if (ok) window.location.href = `${import.meta.env.BASE_URL}`
          }}
        >손님 화면으로</button>
      </div>
    </div>
  )
}
