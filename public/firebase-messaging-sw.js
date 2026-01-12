// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyD9j8xNgkb3l1YBQ0vG0Y9b6Am-3c8hZgE",
    authDomain: "tropiberry.firebaseapp.com",
    projectId: "tropiberry",
    storageBucket: "tropiberry.firebasestorage.app",
    messagingSenderId: "189248026578",
    appId: "1:189248026578:web:dac33920f93edba0adba0b"
});

const messaging = firebase.messaging();

// Notificação em segundo plano (Quando o app está fechado)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Mensagem recebida em segundo plano: ', payload);

    const notificationTitle = payload.notification.title || "TropiBerry Açaí";
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/img/logosf.png', // Certifique-se que este caminho da imagem existe
        badge: '/img/logosf.png',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});