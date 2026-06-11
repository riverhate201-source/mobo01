// 🌟 코드를 수정할 때마다 이 숫자를 v7, v8... 로 올려주면 유저들 폰에서도 알아서 업데이트됩니다!
const CACHE_NAME = 'mobo-cache-v6'; 

// 🌟 깃허브, 넷리파이 어디서든 완벽하게 작동하는 마법의 '상대 경로(./)'
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
  // 만약 배경 이미지 등 꼭 필요한 파일이 더 있다면 './images/bg.png' 처럼 추가해 주세요!
];

// 1. 창고에 파일 담기 (설치)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 오프라인 창고에 파일 저장 완료!');
        return cache.addAll(urlsToCache);
      })
  );
  // 설치되자마자 즉시 활성화 대기열로 넘어가게 만들기!
  self.skipWaiting(); 
});

// 2. 낡은 창고 불태우기 (활성화 및 업데이트)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 이름표가 현재 버전(v6)이랑 다르면? -> 옛날 거니까 삭제!
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 낡은 창고 삭제 완료!');
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 새로운 서비스 워커가 즉시 앱을 통제하도록 만들기!
  self.clients.claim(); 
});

// 3. 파일 요청 가로채기 (오프라인 마법 + 꼬리표 무시)
self.addEventListener('fetch', event => {
  event.respondWith(
    // 🌟 [핵심] ignoreSearch: true 가 있어야 주소 뒤에 꼬리표(?v=...)가 붙어도 무시하고 캐시를 찾아냅니다!
    caches.match(event.request, { ignoreSearch: true })
      .then(response => {
        if (response) {
          return response; // 폰 창고에 있으면 그거 꺼내주기! (오프라인 작동)
        }
        return fetch(event.request); // 없으면 진짜 인터넷에서 가져오기
      })
  );
});