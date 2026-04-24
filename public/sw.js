// sw.js - Service Worker TropiBerry
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || "🚨 NOVO PEDIDO - TropiBerry!";
    const options = {
        body: data.body || "Você tem novos pedidos aguardando no painel.",
        icon: "img/logosf.png",
        badge: "img/logosf.png",
        vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40],
        requireInteraction: true,
        data: { url: './dashboard.html' }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});