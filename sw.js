// ==========================================
// MoBo - Firebase Cloud Messaging
// 기존 PWA 서비스 워커와 함께 사용
// ==========================================


// QA-045G-5 | FCM PUSH 수신 진단
// 테스트 완료 후 제거할 임시 코드
self.addEventListener('push', () => {
    console.log(
        '🔔 [MoBo QA] 실제 PUSH 이벤트 도착!',
        new Date().toISOString()
    );
});

// QA-045H | 화면 활성 상태에서 생성한 알림 클릭 처리
// Firebase 자동 생성 알림은 기존 Firebase SDK가 처리


// QA-045H-2 | QA 알림 클릭 시 모보 실행
// Firebase SDK import 전에 등록해야 함
self.addEventListener('notificationclick', (event) => {
    event.stopImmediatePropagation();
    event.notification.close();

    event.waitUntil((async () => {
        const targetUrl =
            'https://staging--mobo-demo.netlify.app/';

        const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });

        const existingWindow = windows.find(client => {
            try {
                return new URL(client.url).origin ===
                    new URL(targetUrl).origin;
            } catch {
                return false;
            }
        });

        if (existingWindow) {
            try {
                await existingWindow.focus();
                console.log('✅ [MoBo QA] 기존 앱 활성화');
                return;
            } catch (error) {
                console.warn(
                    '기존 앱 활성화 실패, 새 창 시도',
                    error
                );
            }
        }

        const opened = await self.clients.openWindow(
            targetUrl
        );

        if (!opened) {
            console.warn(
                '⚠️ [MoBo QA] 앱 창을 열지 못했어요.'
            );
        }
    })());
});


// Firebase SDK (compat 방식)
importScripts(
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js'
);

// Firebase 프로젝트 연결
firebase.initializeApp({
    apiKey: "AIzaSyCi-EyujgiOKyj_m4pN2OdXoMJ-UoW5JCY",
    authDomain: "mobo-qa-2026.firebaseapp.com",
    projectId: "mobo-qa-2026",
    storageBucket: "mobo-qa-2026.firebasestorage.app",
    messagingSenderId: "694099450490",
    appId: "1:694099450490:web:7e9bc16ff3f2c7a622b9c3"
});

// 백그라운드 푸시 수신 활성화
const moboFirebaseMessaging = firebase.messaging();

// 🌟 버전 숫자를 하나 올렸습니다! (적용을 위해)
const CACHE_NAME = 'mobo-qa-cache-v11';
const DYNAMIC_CACHE = 'mobo-dynamic-v4'; // 🌟 외부 이미지/아이콘을 훔쳐(?) 담을 새로운 보조 창고!

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
    './icon.png',
    './notification-badge.png',
    'https://unpkg.com/lucide@latest'
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
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

    // 업데이트 공지는 이전 캐시 대신 서버에서 직접 확인
    const requestUrl = new URL(event.request.url);

    if (
        requestUrl.origin === self.location.origin &&
        requestUrl.pathname.endsWith('/update.json')
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
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