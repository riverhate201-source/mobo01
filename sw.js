// 🌟 버전 숫자를 하나 올렸습니다! (적용을 위해)
const CACHE_NAME = 'mobo-cache-v8';
const DYNAMIC_CACHE = 'mobo-dynamic-v1'; // 🌟 외부 이미지/아이콘을 훔쳐(?) 담을 새로운 보조 창고!

const urlsToCache = [
    './',
    './index.html',
    './css/reset.css',
    './css/style.css',
    './js/custom.js',
    './manifest.json',
    './privacy.html',
    './images/bomtoon_bg.png',
    './images/lezhin_bg.png',
    './images/mrblue_bg.png',
    './images/ridi_bg.png',
    './icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // 옛날 캐시 다 태워버리기 (보조 창고 빼고!)
                    if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // POST 요청이나 크롬 내부 요청은 건너뜁니다 (에러 방지)
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
            // 1. 창고에 있으면 즉시 꺼내주기 (오프라인 쌩쌩!)
            if (cachedResponse) return cachedResponse;

            // 2. 창고에 없으면 인터넷에서 가져오기 (ImgBB 사진, 외부 폰트 등)
            return fetch(event.request).then(networkResponse => {
                // 성공적으로 가져왔다면, 다음 오프라인을 위해 보조 창고(DYNAMIC)에 몰래 복사해둡니다!
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // 3. 오프라인인데 창고에도 없을 때 에러 뿜고 앱 멈추지 않게 조용히 무시하기
                console.log('오프라인: 외부 리소스를 가져올 수 없습니다.', event.request.url);
            });
        })
    );
});