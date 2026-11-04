// إعدادات Firebase الخاصة بالمشروع
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
// import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBc3Mc_lL8xTrjiXrxgwBpIOSx6vT77WC0",
  authDomain: "progict-6f62c.firebaseapp.com",
  projectId: "progict-6f62c",
  storageBucket: "progict-6f62c.firebasestorage.app",
  messagingSenderId: "1071242778985",
  appId: "1:1071242778985:web:d0882800e17f89e4ac05f8",
  measurementId: "G-FYPYJY53VS"
};

// تهيئة Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
export const db = getFirestore(app);

