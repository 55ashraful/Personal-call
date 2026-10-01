var _C = (function () {
  var _f = {
    apiKey: "AIzaSyDVavo9JjW3HmmTU2U78w5w6FJPTiuIipo",
    authDomain: "personal-call-659a4.firebaseapp.com",
    databaseURL: "https://personal-call-659a4-default-rtdb.firebaseio.com",
    projectId: "personal-call-659a4",
    storageBucket: "personal-call-659a4.firebasestorage.app",
    messagingSenderId: "855478489325",
    appId: "1:855478489325:web:3df677bfc5cb5c2e5efce4",
    measurementId: "G-K4CV4TGZJN"
  };

  var _z = { appId: 0, appSign: "" };

  return {
    get fb() {
      return {
        apiKey: _f.apiKey, authDomain: _f.authDomain, databaseURL: _f.databaseURL,
        projectId: _f.projectId, storageBucket: _f.storageBucket,
        messagingSenderId: _f.messagingSenderId, appId: _f.appId, measurementId: _f.measurementId
      };
    },
    get zg() { return { appId: _z.appId, appSign: _z.appSign }; }
  };
})();
