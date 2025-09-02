/* global self, importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js");

firebase.initializeApp({
  "projectId": "routemaster-admin-k1thy",
  "appId": "1:1071157867562:web:e6a8686b2849d515157f53",
  "storageBucket": "routemaster-admin-k1thy.firebasestorage.app",
  "apiKey": "AIzaSyAX-YaK7opiuKe8vQ0bH4RStr6UCVdlOEk",
  "authDomain": "routemaster-admin-k1thy.firebaseapp.com",
  "messagingSenderId": "1071157867562"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(({ notification, data }) => {
  const title = (notification && notification.title) || "RouteMaster";
  const body  = (notification && notification.body) || "";
  self.registration.showNotification(title, {
    body, data, icon: "/icon-192.png", badge: "/badge.png"
  });
});
