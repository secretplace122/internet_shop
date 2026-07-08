// js/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyA3I9YlJx57STwghyiilKsGetxMkoNhRZI",
  authDomain: "internetmagazin12295.firebaseapp.com",
  projectId: "internetmagazin12295",
  storageBucket: "internetmagazin12295.firebasestorage.app",
  messagingSenderId: "689938309048",
  appId: "1:689938309048:web:b3cdd7fd07d6d46034b94d"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();