/* ================================================================
   config.js — শুধুমাত্র credentials
   আপনার আসল Firebase ও ZEGO ক্রেডেনশিয়াল এখানে বসান
   কিছু খালি রাখলে অ্যাপ কাজ করবে না — এটাই উদ্দেশ্য
   ================================================================ */
var _C = (function () {
  var _f = {
    apiKey: "আপনার-apiKey-এখানে",
    authDomain: "আপনার-প্রজেক্ট.firebaseapp.com",
    projectId: "আপনার-প্রজেক্ট-id",
    storageBucket: "আপনার-প্রজেক্ট.appspot.com",
    messagingSenderId: "আপনার-sender-id",
    appId: "আপনার-app-id"
  };

  var _z = {
    appId: 0,
    appSign: "আপনার-ZEGO-appSign-এখানে"
  };

  return {
    get fb() { return { apiKey: _f.apiKey, authDomain: _f.authDomain, projectId: _f.projectId, storageBucket: _f.storageBucket, messagingSenderId: _f.messagingSenderId, appId: _f.appId }; },
    get zg() { return { appId: _z.appId, appSign: _z.appSign }; }
  };
})();
