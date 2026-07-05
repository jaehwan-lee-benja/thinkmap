/**
 * ThinkMap Service Worker
 * 기본 캐싱 전략: 네트워크 우선, 오프라인 폴백
 */

const CACHE_NAME = 'thinkmap-v1';
// 정적 파일이라 Vite 치환이 안 됨 → SW 자기 위치에서 base 를 유도(위성 base 자동 대응).
// sw 가 /thinkmap/sw.js 에 있으면 BASE = '/thinkmap/'.
const BASE = new URL('./', self.location).pathname;
const STATIC_ASSETS = [
  BASE,
  BASE + 'index.html',
];

// 설치: 기본 정적 자산 캐싱
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 페치: 네트워크 우선, 실패 시 캐시 폴백
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // http/https 외의 요청(chrome-extension 등)과 API 요청은 캐싱하지 않음
  if (!request.url.startsWith('http') || request.url.includes('supabase') || request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 정상 응답이면 캐시에 저장
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 서빙
        return caches.match(request);
      })
  );
});
