self.addEventListener('fetch', function (event) {
    event.respondWith(
        caches.match(event.request)
            .then(function (response) {
                // 🌟 내 보관함(캐시)에 요청한 파일이 있으면 그걸 꺼내주고, 없으면 인터넷에서 새로 가져오라는 뜻!
                return response || fetch(event.request);
            })
    );
});