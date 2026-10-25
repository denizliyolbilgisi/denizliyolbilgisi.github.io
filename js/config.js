// DYB iPhone sürümü – ayarlar
// Bu dosyadaki bilgiler gizli DEĞİLDİR (Android uygulamasında da aynısı var).
// Asıl güvenlik Supabase'deki kurallardadır.

export const APP_VERSION = "1.0.0";

export const SUPABASE_URL = "https://thuvpjgimgeolgtekrxi.supabase.co";
export const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRodXZwamdpbWdlb2xndGVrcnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2OTY2ODksImV4cCI6MjEwODI3MjY4OX0.addu7YYYxsU-rBbZA6DOVfyY3lgIsqFFqpAOt3Xp7CY";

// Firebase → Proje ayarları → Genel → "Web uygulamaları" bölümündeki firebaseConfig
// (Boş bırakılırsa bildirim dışında her şey çalışır.)
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// Firebase → Proje ayarları → Cloud Messaging → Web Push sertifikaları → "Anahtar çifti" (açık anahtar)
export const VAPID_KEY = "";

// Denizli merkezi ve "bütün Denizli" yarıçapı (Android ile aynı)
export const DENIZLI = { lat: 37.7765, lng: 29.0864 };
export const FETCH_RADIUS_M = 60000;
export const ALERT_DISTANCE_M = 500;
