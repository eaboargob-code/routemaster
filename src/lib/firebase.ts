import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  "projectId": "routemaster-admin-k1thy",
  "appId": "1:1071157867562:web:e6a8686b2849d515157f53",
  "storageBucket": "routemaster-admin-k1thy.firebasestorage.app",
  "apiKey": "AIzaSyAX-YaK7opiuKe8vQ0bH4RStr6UCVdlOEk",
  "authDomain": "routemaster-admin-k1thy.firebaseapp.com",
  "messagingSenderId": "1071157867562"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
