/**
 * base 경로 헬퍼 — 모선(Hub)·위성(Satellite) 공통.
 *
 * 0-A 에서 /thinkmap/ 하드코딩을 각 앱의 build base(vite base → import.meta.env.BASE_URL)로
 * 파라미터화했다. 이 헬퍼는 그 BASE_URL 사용을 한 곳으로 모아 위성이 자기 base 를
 * 흩뿌리지 않게 한다. Vite 가 각 앱 빌드 시 BASE_URL 을 정적 치환한다(예: '/thinkmap/').
 *
 * 정적 파일(public/sw.js, public/manifest.json)은 Vite 치환 대상이 아니라 이 헬퍼를
 * 쓰지 못한다 — 그쪽은 자기 위치 기준 상대화로 이미 처리했다.
 */

/** 현재 앱의 base 경로. 항상 끝에 슬래시가 붙는다(예: '/thinkmap/', 루트면 '/'). */
export const BASE_URL = import.meta.env.BASE_URL

/**
 * base 경로에 하위 경로를 이어붙인다. 선행 슬래시는 중복 방지를 위해 제거한다.
 * @param {string} path 예: 'sw.js', 'favicon.ico' → '/thinkmap/sw.js'
 * @returns {string}
 */
export function withBase(path = '') {
  return BASE_URL + String(path).replace(/^\/+/, '')
}
