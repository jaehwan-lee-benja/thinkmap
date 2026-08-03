# 재사용 층위 통일 제안 — ②에러/로딩 UI(`AuthGate`) · ④빌드 설정(`createSatelliteConfig`) (thinkmap · 2026-08-04)

> 근거 = `docs/REFACTOR-AUDIT-20260804.md` §8·§10(통일 우선순위 2위=에러·로딩UI, 4위=빌드설정).
> 이 문서는 **설계 제안**이다. ★게이트 불변: 기존 파일 수정·삭제·git·DB 쓰기 금지. 산출은 이 신규 문서뿐.
> 조사 대상: `apps/{canvas,crmboard,inventory,members,membership,payroll,seat}/src/*App.jsx` 7개 +
> `src/App.jsx`(모선) + `apps/*/vite.config.js` 7개, 전문 열람.

---

## A. `<AuthGate>` / `useSatelliteAuth()` 설계

### A-1. 8원 diff — 무엇이 같고 무엇이 갈라지는가

8개 셸(App.jsx) 전문을 나란히 놓고 **로딩 → 미로그인 → (역할게이트) → 본문** 4단 구조로 쪼갰다.

| 위성 | 로딩 분기 | 미로그인 화면 | 역할/인가 게이트 | 게이트 성격 |
|---|---|---|---|---|
| canvas | `if(authLoading) return <div className="pv-center">로딩 중…</div>` | `pv-center pv-login` + h1 + p + 버튼(HUB_BASE 링크 없음) | `!isMaster` → 거부 화면(HUB_BASE 링크 있음) | 표준 마스터게이트 |
| crmboard | 동일 | 동일 패턴, **HUB_BASE 링크 있음** | `!isMaster` → 거부 화면 | 표준 마스터게이트 |
| inventory | 동일 | 동일 패턴, 링크 없음 | **없음** | 게이트 없음(로그인만) |
| members | 동일 | 동일 패턴, 링크 없음 | `!isMaster` → 거부 화면 | 표준 마스터게이트 |
| payroll | 동일 | 동일 패턴, 링크 없음 | `!isMaster` → 거부 화면 | 표준 마스터게이트 |
| seat | 동일 | 동일 패턴, **HUB_BASE 링크 있음** | 없음 | 게이트 없음 |
| ★membership | 동일 | 로그인 화면에 **`denied` 조건부 안내문**(`pv-denied`) 추가 | `session` 있어도 **RPC `is_master`/`is_store` 둘 다 false → `signOut()`** (인가 거부 → 강제 로그아웃 → 다시 미로그인 화면으로) + `checking` 중간상태(`계정 확인 중…`) | ★**커스텀 비동기 인가** — useAuth의 `isMaster`(app_users.role)와 **무관한 별도 RPC 경로** |
| ★모선 `src/App.jsx` | `GoogleAuthButton({authLoading, session, handleGoogleLogin})` 컴포넌트로 **이미 분리**돼 있음(1곳) | 위 컴포넌트가 렌더(`auth-screen` 클래스 계열 — **satellite 의 `pv-*` 와 다른 이름**) | `!isMaster && userStatus !== 'active'` → **pending/inactive/invited 3단계 승인대기 화면**(41줄, `src/App.jsx:521-561`) | ★**승인대기 게이트** — 위성 7개 중 아무도 안 씀. `userStatus` 축은 useAuth 가 이미 리턴하지만 소비처는 모선뿐 |

**측정법**: 8개 파일 전문 Read, `if (authLoading)`·`if (!session)`·`if (!isMaster)` 3패턴 grep 대조.
**확신도**: 확정(전문 대조, 표 안 각 셀이 실제 코드 인용).

### A-2. 공통부와 갈래 지점 — 정확히 어디가 갈라지는가

1. **로딩** — 8/8 완전 동일 논리(`authLoading` 하나만 본다). 텍스트("로딩 중…")도 7/7 위성 바이트 동일. 모선만 아이콘(🔄) 추가. → **완전 흡수 가능**.
2. **미로그인 화면** — 구조(제목+설명+버튼)는 8/8 동일하나, **표면 디테일이 위성마다 다르다**:
   - HUB_BASE 링크 유무(crmboard·seat 있음, 나머지 없음) — 갈래가 아니라 **누락 드리프트**로 보인다(신규 위성일수록 링크가 붙는 경향 — canvas/inventory/members/payroll 이 빠짐). 통일 시 옵션 하나(`showHubLink`)로 흡수하되, **기본값을 "있음"으로 바꾸는 게 실은 버그 수정**이라고 별도 표기해야 한다(범위: 로직 통일이지 UX 변경 아님 — 승인 필요 항목으로 남긴다).
   - 타이틀/설명 문구 — 위성마다 고유(당연히 옵션화).
   - membership 만 **denied 안내문**이 로그인 화면 안에 조건부로 낀다 — 이건 "로그인 화면"이 아니라 **"인가 거부 결과가 로그인 화면에 얹힌 것"**이라 슬롯(옵션 children)으로 분리해야 문구 갈래가 안 새어나간다.
3. **역할 게이트** — canvas/crmboard/members/payroll 4곳은 **바이트 수준으로 거의 동일**(`!isMaster` → "접근 권한이 없습니다. (마스터 전용)" + HUB_BASE 링크). → **표준 옵션 하나(`requireMaster`)로 완전 흡수 가능**.
4. **★membership 의 커스텀 인가** — 이름은 "게이트"지만 **다른 종의 상태 기계**다:
   - 판정 소스가 `isMaster`(useAuth, `app_users.role`) 가 아니라 **RPC `is_master()`/`is_store()`**(별도 DB 판정, allSettled로 부분실패 허용).
   - 실패 시 **거부 화면을 보여주는 게 아니라 `signOut()`을 호출**해 세션 자체를 지운다 → 사용자는 "로그인했는데 튕겼다"를 겪는다(REFACTOR-AUDIT §3-a 2번 항목, 유저 체감 혼동 후보로 이미 지목됨).
   - ⇒ **여기가 브리프가 경고한 "의미가 다른 걸 같은 이름으로 묶지 마라"의 실물이다.** `requireMaster` 옵션(=isMaster 로컬 판정, 실패 시 "거부 화면"만 보여주고 세션 유지)과 membership 의 `signOut`-온-거부(=세션 자체를 무효화)는 **결과 상태가 다르다**(하나는 "로그인 상태에서 화면만 막힘", 하나는 "다시 로그아웃 상태"). 하나의 boolean 옵션으로 합치면 membership 쪽 거동이 조용히 바뀔 위험이 있다.
5. **★모선의 승인대기 게이트** — `userStatus`(pending/inactive/invited) 축. 위성은 이 축을 아예 안 본다(신규가입=위성 단독 진입 경로가 없어서 — 위성은 모선 링크 경유가 사실상 전제). **위성으로 확장할 필요가 검증 안 됨(미측정)** — 지금은 모선 전용 확장점으로만 설계.

### A-3. API 설계

원칙: **`useAuth()`(core, 기존)는 안 건드린다** — 반환 필드(`session,authLoading,isMaster,userStatus,handleGoogleLogin,handleLogout`) 그대로 유지, 위성 자체 재구현 0건이라는 현 상태(§8 표 ①"ⓐ단일소스")를 깨지 않는다. 그 위에 **표현(presentation) 레이어만** 새로 얹는다.

```js
// packages/core/src/ui/AuthGate.jsx (신규)
// props:
//   title, subtitle          — 로그인 화면 문구 (필수, 위성마다 다름)
//   hubBase                  — 뒤로가기 링크 대상(옵션, 기본 없음 = 링크 미표시)
//   requireMaster            — boolean. true면 세션+역할 확인, isMaster=false → "접근 권한 없음" 거부 화면
//                               (★세션은 유지된다 — signOut 안 함. membership 과 의미가 다름을 이름으로도 분리)
//   loginExtra                — ReactNode | null. 로그인 화면 안에 추가로 낄 슬롯(membership 의 denied 안내문 등)
//   auth                      — useAuth() 의 반환값을 그대로 통과(위성이 자기 useAuth() 호출 유지 — 흐름 안 숨김)
//   children                  — (session) => ReactNode. 게이트 통과 후 본문
export function AuthGate({ title, subtitle, hubBase, requireMaster = false, loginExtra = null, auth, children }) {
  const { session, authLoading, isMaster, handleGoogleLogin } = auth
  if (authLoading) return <div className="pv-center">로딩 중…</div>
  if (!session) return (
    <div className="pv-center pv-login">
      <h1>{title}</h1>
      {loginExtra}
      <p>{subtitle}</p>
      <button onClick={handleGoogleLogin}>Google로 로그인</button>
      {hubBase && <a href={hubBase}>← 모선</a>}
    </div>
  )
  if (requireMaster && !isMaster) return (
    <div className="pv-center">
      <p>접근 권한이 없습니다. (마스터 전용)</p>
      {hubBase && <a className="pv-back" href={hubBase}>← 모선으로</a>}
    </div>
  )
  return children(session)
}
```

**membership 은 이 컴포넌트를 쓰지 않거나(현행 유지) 별도 확장 훅을 쓴다** — 억지로 `requireMaster`에 우겨넣지 않는다:

```js
// packages/core/src/hooks/useRoleAuthz.js (신규, 옵션 B — membership 전용, "적용 검토"용이지 강제 아님)
// RPC 기반 커스텀 인가. 실패 시 이 훅이 signOut 을 호출한다(★AuthGate 의 requireMaster 와 이름·의미를 분리).
export function useRoleAuthz(session, { checks = ['is_master', 'is_store'] } = {}) {
  const [status, setStatus] = useState('idle') // idle | checking | ok | denied
  useEffect(() => {
    if (!session) { setStatus('idle'); return }
    let alive = true
    setStatus('checking')
    Promise.allSettled(checks.map(fn => supabase.rpc(fn)))
      .then((results) => {
        if (!alive) return
        const ok = results.some(r => r.status === 'fulfilled' && r.value?.data === true)
        if (ok) setStatus('ok')
        else { setStatus('denied'); supabase.auth.signOut() }
      })
    return () => { alive = false }
  }, [session])
  return status // membership App.jsx 는 이 status 로 자기 denied 안내문을 그린다 — AuthGate 의 loginExtra 슬롯에 꽂는다
}
```

이렇게 가르면 membership 도 결국 `<AuthGate>`(로딩+로그인 화면 골격)는 쓰되, **인가 로직은 `useRoleAuthz`가 별도로 책임**진다 — "게이트가 signOut 을 부른다"는 특수 동작이 공용 컴포넌트 안에 숨지 않는다.

**모선의 승인대기 게이트**는 이번 이관 범위에서 **제외**한다(§A-2-5, 위성 쪽 필요성 미검증) — `AuthGate` 는 승인대기 상태를 모른다. 모선은 `AuthGate` 를 쓰더라도 `requireMaster` 통과 이후 자체적으로 `userStatus` 분기를 유지한다(모선 전용 컴포넌트로 별도 이관은 별건 제안 가능, 이 문서 범위 밖).

### A-4. 위성별 제거 줄수 실측(현재 코드 라인 수 기준)

측정법: 각 App.jsx 에서 `authLoading` 분기 + 미로그인 블록 + (있다면) `!isMaster` 블록의 **줄 수를 직접 셈**(주석·빈줄 제외, 실제 JSX/조건문 줄만). 파일:줄번호 병기.

| 위성 | 로딩 | 미로그인 | 마스터게이트 | 합계(제거 가능) | 근거 |
|---|---|---|---|---|---|
| canvas | 1 | 7 | 6 | **14줄** | `apps/canvas/src/CanvasApp.jsx:154,156-162,167-172` |
| crmboard | 1 | 8 | 7 | **16줄** | `apps/crmboard/src/CrmBoardApp.jsx:14,16-23,26-32` |
| inventory | 1 | 7 | — | **8줄** | `apps/inventory/src/InventoryApp.jsx:13,15-21` |
| members | 1 | 7 | 6 | **14줄** | `apps/members/src/MembersApp.jsx:14,16-22,24-29` |
| payroll | 1 | 7 | 6 | **14줄** | `apps/payroll/src/PayrollApp.jsx:39,41-47,49-54` |
| seat | 1 | 8 | — | **9줄** | `apps/seat/src/SeatApp.jsx:24,26-33` |
| membership | 1 | ~6(denied 슬롯 제외분) | (커스텀, 흡수 안 함) | **~7줄**(부분) | `apps/membership/src/MembershipApp.jsx:36,45-53` — 인가 로직(17-32)은 `useRoleAuthz` 이관으로 별도 절감(파일 자체 로직 이동이라 "제거"보다 "재배치") |
| 모선 `src/App.jsx` | 이미 컴포넌트 분리(2줄 호출부) | 〃 | 승인대기 41줄(범위 밖, 미이관) | **이관 대상 아님**(§A-3 참조) | `src/App.jsx:499-501` |

**합계(위성 6개 표준 패턴만, membership·모선 제외)**: 14+16+8+14+14+9 = **75줄** 제거. membership 은 인가 로직 재배치 포함 시 추가 절감이 있으나 "삭제"가 아니라 "이동"이라 이중계상하지 않았다.
**확신도**: 확정(줄 실측). membership 수치는 "부분"이라고 명시 표기(과다계상 방지).

### A-5. 위험 — 무엇이 깨질 수 있나

- 🔴 **membership 을 표준 `requireMaster` 로 잘못 흡수하면 즉시 회귀**: "거부 시 세션 유지"(AuthGate 표준)와 "거부 시 signOut"(membership 현행)이 다른데, 잘못 배선하면 매장 계정이 **거부 화면 대신 무한 로그인 루프**를 겪거나, 반대로 **미인가 계정이 화면만 막힌 채 세션이 살아남는** 방향으로 새로운 구멍이 생긴다. ⇒ **membership 은 마지막에, 별도 리뷰로.**
- 🟠 **HUB_BASE 링크 유무 통일이 "리팩터"를 가장한 사양 변경이 될 수 있다**(§A-2-2). 승인 시 "링크 통일(전부 표시)"을 **별도 항목으로 명시**해서 승인 범위에 명확히 넣어야 한다 — 조용히 묻어가면 안 됨.
- 🟠 **`pv-center`/`pv-login` CSS 는 core 에 없고 위성 7개 `index.css` 에 각자 사본**(`apps/*/src/index.css`, 해시 대조 결과 7개 중 2개만 일치 — canvas/crmboard/members/membership/seat 는 서로 다른 변형). `AuthGate`를 core 컴포넌트로 옮기면 **스타일도 같이 옮겨야 진짜 통일**인데, 지금 각 위성 CSS가 미세하게 달라 **어느 걸 정본으로 삼을지가 이 설계 문서 범위 밖의 별건 결정**이다(★미측정: 정밀 diff는 안 함). 컴포넌트만 옮기고 CSS를 안 옮기면 위성마다 로그인 화면이 미묘하게 달라 보이는 **잠재 드리프트가 그대로 남는다**.
- 🟡 **모선 `GoogleAuthButton`은 클래스 계열이 다르다**(`auth-screen`/`auth-login-*` vs 위성 `pv-*`). `AuthGate`를 모선까지 확장하면 **시각적 스킨 결정**(모선을 pv-* 로 바꾸나, 위성을 auth-* 로 바꾸나, 둘 다 두나)이 필요 — 이 문서는 "가능하다"만 확인하고 스킨 선택은 승인 대기 항목으로 남긴다.
- 🟡 **`useRoleAuthz` 신설은 membership 전용 재배치이지 새 정책이 아니다** — RPC 두 개(`is_master`/`is_store`) 호출 순서·`allSettled` 부분실패 허용 로직을 **바이트 그대로** 옮겨야 한다(로직 변경 시 SEAT-SPEC 류처럼 별도 SPEC 검토가 필요할 수 있음 — MEMBERSHIP-KIOSK-SPEC 확인은 이 조사 범위 밖, 미측정).

### A-6. 이관 순서 (위험 낮은 것부터)

1. **inventory, seat** — 역할 게이트가 아예 없어 가장 단순(로딩+로그인만). `AuthGate` 최초 검증 대상으로 적합.
2. **canvas, members, payroll, crmboard** — `requireMaster` 표준 패턴 4곳, 서로 바이트 수준 동일이라 한 번에 검증 가능.
3. **모선** — `GoogleAuthButton` → `AuthGate`로 교체(스킨 결정 선행 필요), 승인대기 게이트는 그대로 존치.
4. **membership** — 마지막. `useRoleAuthz` 분리 + `AuthGate`의 `loginExtra` 슬롯 배선을 **별도 커밋으로 격리**해서, 문제 생기면 이 한 커밋만 되돌릴 수 있게.

---

## B. `createSatelliteConfig()` 팩토리 설계

### B-1. 7원 diff

| 위성 | 줄수 | plugins | base 기본값 | port | 고유 옵션 |
|---|---|---|---|---|---|
| canvas | 10 | `[react()]` | `/thinkmap/canvas/` | 5176 | — |
| crmboard | 10 | `[react()]` | `/thinkmap/crmboard/` | **5178** | — |
| inventory | 10 | `[react()]` | `/thinkmap/inventory/` | 5175 | — |
| members | 10 | `[react()]` | `/thinkmap/members/` | **5178** | — |
| payroll | 15 | `[react()]` | `/thinkmap/payroll/` | 5174 | server 를 멀티라인으로만 씀(내용 동일), 주석이 구값(`/thinkmap-payroll/`) 언급 — §6-b SPEC드리프트와 같은 결의 사소 오탈 |
| seat | 12 | `[react()]` | `/thinkmap/seat/` | 5177 | `allowedHosts: ['.local']`(LAN mDNS 테스트) |
| ★membership | 46 | `[react(), legacy({...})]` | `/thinkmap/membership/` | **5178** | `css.postcss.plugins`(`postcssCustomProperties`, CS-273N 구형 WebView 폴백) + `build.target='es2015'` + `build.cssTarget='chrome61'` |

**측정법**: 7개 `vite.config.js` 전문 Read.
**확신도**: 확정.

- **동일 스켈레톤 5/7**(canvas·crmboard·inventory·members·payroll) — `plugins:[react()]`, `base: process.env.APP_BASE || '/thinkmap/<이름>/'`, `envDir:'../../'`, `server:{host:'0.0.0.0',port:N}` 뼈대가 완전히 같고 **이름·포트만 다르다**.
- **실질 고유는 정확히 2건**(브리프가 미리 지목한 대로 확인됨): membership(legacy/postcss/build), seat(allowedHosts).
- ★**포트 충돌 확정**: `crmboard`·`members`·`membership` **3개 모두 5178**(2개가 아니라 3개 — 레지스트리에 안 담기면 셋이 부딪힌다). 나머지 5개(5174/5175/5176/5177 + 모선 5173)는 유일값.

### B-2. `createSatelliteConfig()` API 설계

```js
// packages/core/vite/satellitePorts.js (신규) — ★포트의 단일 소스
// 이름→포트 레지스트리. 모듈 로드 시 즉시 자기검증(중복 포트 = import 단계에서 즉시 throw)
// ⇒ "구조적으로 불가능"의 실체 = 런타임 컴파일 타임 assert, 타입시스템이 아니라 fail-fast.
export const SATELLITE_PORTS = {
  payroll:    5174,
  inventory:  5175,
  canvas:     5176,
  seat:       5177,
  crmboard:   5178,
  members:    5179,   // ★충돌 해소: 5178→5179 (현재값과 다름, 승인 필요한 변경)
  membership: 5180,   // ★충돌 해소: 5178→5180
}
;(function assertUniquePorts(registry) {
  const seen = new Map()
  for (const [name, port] of Object.entries(registry)) {
    if (seen.has(port)) {
      throw new Error(`[satellitePorts] 포트 충돌: ${seen.get(port)} 와 ${name} 이 둘 다 ${port} 사용`)
    }
    seen.set(port, name)
  }
})(SATELLITE_PORTS)
```

```js
// packages/core/vite/createSatelliteConfig.js (신규)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { SATELLITE_PORTS } from './satellitePorts.js'

// name        — 필수. SATELLITE_PORTS 키(포트를 여기서만 뽑는다 — 호출부가 숫자를 직접 못 씀)
// plugins     — 옵션. react() 뒤에 이어붙일 추가 플러그인 배열(예: membership 의 legacy()).
// css, build  — 옵션. 있으면 그대로 병합(얕은 병합 — vite 옵션 자체가 대부분 얕은 구조라 충분).
// server      — 옵션. { host, port } 기본값 위에 얕은 병합(예: seat 의 allowedHosts).
export function createSatelliteConfig({ name, plugins = [], css, build, server = {} }) {
  const port = SATELLITE_PORTS[name]
  if (!port) throw new Error(`[createSatelliteConfig] '${name}' 이 SATELLITE_PORTS 에 없음 — 신규 위성은 먼저 레지스트리에 등록`)
  return defineConfig({
    plugins: [react(), ...plugins],
    base: process.env.APP_BASE || `/thinkmap/${name}/`,
    envDir: '../../',
    server: { host: '0.0.0.0', port, ...server },
    ...(css ? { css } : {}),
    ...(build ? { build } : {}),
  })
}
```

**5개 표준 위성 적용 예**(canvas):
```js
// apps/canvas/vite.config.js
import { createSatelliteConfig } from '@thinkmap/core/vite'
export default createSatelliteConfig({ name: 'canvas' })
```
10줄 → **2줄**(주석 제외).

**seat 적용 예**:
```js
export default createSatelliteConfig({
  name: 'seat',
  server: { allowedHosts: ['.local'] },
})
```

**membership 적용 예**(고유분 유지, 골격만 흡수):
```js
import legacy from '@vitejs/plugin-legacy'
import postcssCustomProperties from 'postcss-custom-properties'
import { fileURLToPath } from 'node:url'
import { createSatelliteConfig } from '@thinkmap/core/vite'

const tokenSources = [ /* 기존 3개 경로 그대로 */ ]

export default createSatelliteConfig({
  name: 'membership',
  plugins: [legacy({ targets: ['chrome >= 40', 'android >= 5'], additionalLegacyPolyfills: [...], renderLegacyChunks: true })],
  css: { postcss: { plugins: [postcssCustomProperties({ preserve: true, importFrom: tokenSources })] } },
  build: { target: 'es2015', cssTarget: 'chrome61' },
})
```
46줄 → **약 20줄**(고유 로직은 그대로 보존, 뼈대만 걷어냄).

core 쪽 `package.json` 에 subpath export 추가 필요: `"exports": {..., "./vite": "./vite/createSatelliteConfig.js"}` — 기존에 `"./styles/variables.css"` 서브패스가 이미 있어 **같은 패턴 확장**이라 마찰 없음.

### B-3. 위험 — 무엇이 깨질 수 있나

- 🔴 **포트 재배정 자체가 "무해한 리팩터"가 아니다** — `members`(5178→5179), `membership`(5178→5180) 은 **개발자 로컬 워크플로·문서(스크린샷·북마크 등)에 박힌 포트 번호를 깨뜨릴 수 있다**. 코드상 안전(충돌 해소가 목적)해도 **사람이 아는 숫자가 바뀌는 변경**이라 별도 승인 항목으로 명시해야 한다(자동 흡수 대상 아님).
- 🟠 **membership 의 `build.target`/`cssTarget`은 CS-273N 하드웨어 제약과 직결**(§0 문서 인용: Android 5.1.1 WebView). 팩토리가 `build` 옵션을 얕은 병합만 하므로 **키 하나만 있어도 다른 build 하위키가 통째로 날아가는 얕은 병합 함정**은 없음(membership 은 `target`+`cssTarget` 둘 다 한 객체로 명시하므로) — 단, **향후 다른 위성이 `build.sourcemap` 같은 별개 키를 추가하면 얕은 병합으로는 충돌 없이 합쳐지지만, membership 처럼 여러 위성이 `build`를 동시에 쓰기 시작하면 병합 규칙을 얕은→깊은으로 바꿔야 할 수 있다** — 지금은 고유 사용처가 membership 하나뿐이라 문제 없음, 확장 시 재검토 필요라고 표기.
- 🟡 **`envDir: '../../'` 는 팩토리가 항상 고정값으로 박는다** — 7/7 동일값이라 하드코딩이 안전하지만, **루트 구조가 바뀌면(예: apps 깊이가 늘면) 전 위성이 한 번에 깨진다**(단일 소스의 양날 — 통일의 목적 자체가 이런 전파를 원하는 것이므로 위험이라기보단 "의도된 폭발반경 확대"로 표기해 둔다).
- 🟡 **레지스트리 assert 는 `vite.config.js` import 시점에만 돈다** — `vite dev`/`vite build` 를 실행해야 걸린다. **CI 나 pre-commit 에서 정적으로 잡히지 않는다**(빌드를 안 돌리면 충돌이 남아있어도 안 보임). 완전한 "구조적 불가능"을 원하면 별도 lint 스크립트(레지스트리 파일만 단독 import 해서 검증)를 `npm run` 하나로 추가하는 게 낫다 — 이 문서는 설계만 제안, 스크립트 신설은 승인 후.

### B-4. 이관 순서

1. **레지스트리(`satellitePorts.js`) + 포트 재배정 승인** — 이게 선행돼야 나머지가 의미 있다(먼저 승인 게이트).
2. **canvas·inventory·payroll**(고유분 0, 충돌 없던 포트) — 팩토리 최초 검증 3곳.
3. **crmboard·members**(포트 재배정 포함) — 충돌 해소가 실제로 도는지 확인.
4. **seat**(override 확장점 검증 — `server` 병합).
5. **membership**(가장 복잡 — `plugins`/`css`/`build` 3종 override 전부 검증). 마지막.

---

## 부록 — A·B 공통 관찰

- 두 설계 모두 **core 의 subpath export 패턴을 재사용**한다(`./styles/variables.css` 선례) — 새 인프라가 아니라 기존 관례의 연장.
- 두 설계 모두 **"통일 = 삭제"가 아니라 "통일 = 표준 골격 + 명시적 override 슬롯"**을 원칙으로 삼았다 — §10 "접는다/남긴다" 구분(membership legacy·seat allowedHosts·membership 인가게이트)을 이 설계가 깨지 않는지가 검증 기준이다.
- **미측정으로 남긴 것**(정직 표기): `pv-*`/`auth-*` CSS 정밀 diff(§A-5), CI/lint 단에서의 포트 정적 검증(§B-3), 모선 승인대기 게이트의 위성 확장 필요성(§A-2-5).
