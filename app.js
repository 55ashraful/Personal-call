window.onerror = function (m, s, l) {
  var t = document.getElementById('toast');
  if (t) { t.textContent = '⚠ ' + m + ' (লাইন ' + l + ')'; t.className = 'show err'; }
  return false;
};

/* ================= DB ================= */
var DB = (function () {
  var _a = null, _d = null;

  function init() {
    if (typeof _C === 'undefined' || !_C.fb || !_C.fb.apiKey) {
      throw new Error('config.js পাওয়া যায়নি বা ভুল আছে');
    }
    firebase.initializeApp(_C.fb);
    _a = firebase.auth();
    _d = firebase.firestore();
    _d.enablePersistence({ synchronizeTabs: true }).catch(function () {});
  }

  function uiAv(n) {
    n = String(n || '').trim() || 'U';
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(n) + '&background=00a884&color=fff&size=200&bold=true';
  }

  function normPhone(p) {
    p = String(p || '').replace(/[\s\-().]/g, '');
    if (p && p.charAt(0) !== '+') p = '+' + p;
    return p;
  }

  function resizeImg(file, max) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var sc = Math.min(1, max / Math.max(img.width, img.height));
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc);
        cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? res(b) : rej(new Error('ছবি প্রসেস ব্যর্থ')); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('ছবি পড়া যায়নি')); };
      img.src = url;
    });
  }

  function toB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result.split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  async function uploadImage(file, max) {
    if (!_C.imgbb || !_C.imgbb.apiKey) throw new Error('ImgBB key নেই (config.js)');
    var blob = await resizeImg(file, max || 1280);
    var d = await toB64(blob);
    var fd = new FormData();
    fd.append('key', _C.imgbb.apiKey);
    fd.append('image', d);
    var r = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
    var j = await r.json();
    if (j && j.success && j.data) return j.data.display_url || j.data.url;
    throw new Error('ছবি আপলোড ব্যর্থ');
  }

  async function phoneExists(ph) {
    var s = await _d.collection('users').where('phone', '==', normPhone(ph)).limit(1).get();
    return !s.empty;
  }

  async function registerAccount(name, phone, email, pass) {
    var c = await _a.createUserWithEmailAndPassword(email, pass);
    await _d.collection('users').doc(c.user.uid).set({
      name: name, phone: normPhone(phone), email: email,
      avatar: uiAv(name), online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { uid: c.user.uid, name: name, phone: normPhone(phone), email: email, avatar: uiAv(name) };
  }

  async function emailLogin(email, pass) {
    var c = await _a.signInWithEmailAndPassword(email, pass);
    var d = await _d.collection('users').doc(c.user.uid).get();
    if (d.exists) return { uid: c.user.uid, ...d.data() };
    var nm = c.user.displayName || 'ব্যবহারকারী';
    return { uid: c.user.uid, name: nm, email: c.user.email || '', phone: '', avatar: uiAv(nm) };
  }

  async function updateProfile(uid, data) {
    if (_d && uid) await _d.collection('users').doc(uid).set(data, { merge: true });
  }

  async function logout(uid) {
    if (uid && _d) { try { await _d.collection('users').doc(uid).update({ online: false }); } catch (e) {} }
    if (_a) await _a.signOut();
  }

  function setOn(uid) { if (_d && uid) _d.collection('users').doc(uid).update({ online: true }).catch(function () {}); }
  function setOff(uid) { if (_d && uid) _d.collection('users').doc(uid).update({ online: false }).catch(function () {}); }

  function onUsers(uid, cb) {
    return _d.collection('users')
      .where(firebase.firestore.FieldPath.documentId(), '!=', uid)
      .onSnapshot(function (s) { cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; })); },
        function (e) { console.error('onUsers:', e); });
  }

  async function findByPhones(list) {
    var ok = (list || []).filter(function (p) { return /^\+\d{8,15}$/.test(p); });
    if (!ok.length) return null;
    var s = await _d.collection('users').where('phone', 'in', ok).limit(1).get();
    if (s.empty) return null;
    return { id: s.docs[0].id, ...s.docs[0].data() };
  }

  async function addContact(uid, c) {
    await _d.collection('users').doc(uid).collection('contacts').doc(c.id).set({
      uid: c.id, name: c.name || 'কন্টাক্ট', phone: c.phone || '',
      avatar: c.avatar || uiAv(c.name),
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function removeContact(uid, cid) {
    _d.collection('users').doc(uid).collection('contacts').doc(cid).delete().catch(function () {});
  }

  function onContacts(uid, cb) {
    return _d.collection('users').doc(uid).collection('contacts')
      .onSnapshot(function (s) { cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; })); },
        function (e) { console.error('onContacts:', e); });
  }

  function chatId(a, b) { return [a, b].sort().join('_'); }

  async function sendMsg(cid, m) {
    await _d.collection('chats').doc(cid).collection('messages').add(m);
    await _d.collection('chats').doc(cid).set({
      lastMsg: { text: m.text, sid: m.senderId, ts: m.timestamp },
      parts: cid.split('_'),
      updated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  function onMsgs(cid, cb) {
    return _d.collection('chats').doc(cid).collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot(function (s) {
        cb(s.docChanges().map(function (c) { return { t: c.type, d: { ...c.doc.data(), _id: c.doc.id } }; }));
      }, function (e) { console.error('onMsgs:', e); });
  }

  function onChatList(uid, cb) {
    return _d.collection('chats')
      .where('parts', 'array-contains', uid)
      .onSnapshot(function (s) {
        var a = s.docs.map(function (d) { return { id: d.id, ...d.data() }; });
        a.sort(function (x, y) {
          var tx = x.updated && x.updated.toMillis ? x.updated.toMillis() : 0;
          var ty = y.updated && y.updated.toMillis ? y.updated.toMillis() : 0;
          return ty - tx;
        });
        cb(a);
      }, function (e) { console.error('onChatList:', e); });
  }

  function setTyping(cid, uid) { if (_d) _d.collection('chats').doc(cid).collection('typing').doc(uid).set({ t: 1 }).catch(function () {}); }
  function clearTyping(cid, uid) { if (_d) _d.collection('chats').doc(cid).collection('typing').doc(uid).delete().catch(function () {}); }
  function onTyping(cid, muid, cb) {
    return _d.collection('chats').doc(cid).collection('typing')
      .onSnapshot(function (s) {
        var t = false;
        s.docs.forEach(function (d) { if (d.id !== muid) t = true; });
        cb(t);
      }, function () {});
  }

  async function mkCall(d, offer) {
    var id = 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    await _d.collection('calls').doc(id).set({
      callerId: d.callerId, calleeId: d.calleeId,
      callerName: d.callerName || '', callerAvatar: d.callerAvatar || '',
      type: d.type, status: 'ringing', offer: offer,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    return id;
  }

  function watchCall(id, cb) {
    return _d.collection('calls').doc(id)
      .onSnapshot(function (d) { if (d.exists) cb(d.data()); }, function () {});
  }

  async function updCall(id, p) { if (_d && id) { try { await _d.collection('calls').doc(id).update(p); } catch (e) {} } }

  function addCandidate(id, side, c) {
    _d.collection('calls').doc(id).collection('cands_' + side).add(c).catch(function () {});
  }

  function onCandidates(id, side, cb) {
    return _d.collection('calls').doc(id).collection('cands_' + side)
      .onSnapshot(function (s) {
        s.docChanges().forEach(function (c) { if (c.type === 'added') cb(c.doc.data()); });
      }, function () {});
  }

  function onIncCall(uid, cb) {
    return _d.collection('calls')
      .where('calleeId', '==', uid).where('status', '==', 'ringing')
      .onSnapshot(function (s) {
        s.docChanges().forEach(function (c) { if (c.type === 'added') cb({ id: c.doc.id, ...c.doc.data() }); });
      }, function (e) { console.error('onIncCall:', e); });
  }

  async function addCallLog(uid, log) {
    if (_d && uid) { try { await _d.collection('users').doc(uid).collection('callHistory').add(log); } catch (e) {} }
  }

  function onCallHistory(uid, cb) {
    return _d.collection('users').doc(uid).collection('callHistory')
      .orderBy('ts', 'desc').limit(40)
      .onSnapshot(function (s) { cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; })); },
        function (e) { console.error('onHistory:', e); });
  }

  function getUserDoc(u) {
    var fb = function () {
      var nm = u.displayName || 'ব্যবহারকারী';
      return { uid: u.uid, name: nm, email: u.email || '', phone: '', avatar: uiAv(nm) };
    };
    return Promise.race([
      _d.collection('users').doc(u.uid).get(),
      new Promise(function (res) { setTimeout(function () { res(null); }, 3000); })
    ]).then(function (d) {
      if (d && d.exists) return { uid: u.uid, ...d.data() };
      return fb();
    }).catch(fb);
  }

  function onAuth(cb) {
    _a.onAuthStateChanged(async function (u) {
      if (u) cb(await getUserDoc(u));
      else cb(null);
    });
  }

  return {
    init: init, normPhone: normPhone, uiAv: uiAv, uploadImage: uploadImage,
    phoneExists: phoneExists, registerAccount: registerAccount, emailLogin: emailLogin,
    updateProfile: updateProfile, logout: logout, setOn: setOn, setOff: setOff,
    onUsers: onUsers, findByPhones: findByPhones,
    addContact: addContact, removeContact: removeContact,
    onContacts: onContacts, chatId: chatId, sendMsg: sendMsg, onMsgs: onMsgs, onChatList: onChatList,
    setTyping: setTyping, clearTyping: clearTyping, onTyping: onTyping,
    mkCall: mkCall, watchCall: watchCall, updCall: updCall,
    addCandidate: addCandidate, onCandidates: onCandidates, onIncCall: onIncCall,
    addCallLog: addCallLog, onCallHistory: onCallHistory, onAuth: onAuth
  };
})();

/* ================= নোটিফিকেশন ================= */
function showNotif(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    var n = new Notification(title, { body: body, tag: tag });
    n.onclick = function () { window.focus(); n.close(); };
  } catch (e) {}
}
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
async function askNotif() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
}

/* ================= অ্যাপ ================= */
(function () {
  'use strict';

  var COUNTRIES = [
    ['BD', '🇧🇩', 'বাংলাদেশ', '+880'], ['IN', '🇮🇳', 'ভারত', '+91'], ['PK', '🇵🇰', 'পাকিস্তান', '+92'],
    ['SA', '🇸🇦', 'সৌদি আরব', '+966'], ['AE', '🇦🇪', 'ইউএই', '+971'], ['MY', '🇲🇾', 'মালয়েশিয়া', '+60'],
    ['US', '🇺🇸', 'যুক্তরাষ্ট্র', '+1'], ['GB', '🇬🇧', 'যুক্তরাজ্য', '+44'], ['LK', '🇱🇰', 'শ্রীলঙ্কা', '+94'],
    ['NP', '🇳🇵', 'নেপাল', '+977']
  ];

  function guessCC() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      var m = { 'Asia/Dhaka': 'BD', 'Asia/Kolkata': 'IN', 'Asia/Karachi': 'PK', 'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Kuala_Lumpur': 'MY', 'Europe/London': 'GB', 'America/New_York': 'US', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP' };
      var c = m[tz];
      if (c) return COUNTRIES.find(function (x) { return x[0] === c; }) || COUNTRIES[0];
    } catch (e) {}
    return COUNTRIES[0];
  }

  var S = {
    user: null, users: [], chatList: [], chatMsgs: {}, contacts: [], callHistory: [],
    chatTarget: null, chatUnsub: null, typingUnsub: null, typingTimeout: null,
    chatListUnsub: null, contactsUnsub: null, historyUnsub: null,
    unsubUsers: null, unsubCalls: null,
    ccCountry: null, pendingReg: null, emailCode: null, codeExp: 0,
    resendTimer: null, resendSec: 60, notified: {},
    callActive: false, callType: 'video', callPhase: 'idle',
    callTarget: null, callDocId: null, iAmCaller: false, wasConnected: false,
    endReason: null, logWritten: false,
    pc: null, callUnsub: null, candUnsub: null, outTimeout: null, incTimeout: null,
    isMuted: false, isCamOff: false, callStart: null, callTimerIv: null,
    localStream: null, ringCtx: null, ringIv: null,
    mediaRecorder: null, recChunks: [], recStream: null, recMime: '',
    recStart: 0, recTimerIv: null,
    voiceSeq: 0, voiceMap: {}, playingAudio: null, playingBtn: null
  };

  var RTC_CFG = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  };

  var q = function (s) { return document.querySelector(s); };
  var qa = function (s) { return document.querySelectorAll(s); };

  var D = {
    toast: q('#toast'),
    phoneScr: q('#phoneScr'), emailScr: q('#emailScr'), otpScr: q('#otpScr'),
    mainScr: q('#mainScr'), chatScr: q('#chatScr'), setScr: q('#setScr'),
    dialScr: q('#dialScr'), callScr: q('#callScr'), incPop: q('#incPop'),
    nameIn: q('#nameIn'), phoneIn: q('#phoneIn'), regEmailIn: q('#regEmailIn'), regPassIn: q('#regPassIn'),
    regBtn: q('#regBtn'), showEmailLogin: q('#showEmailLogin'),
    ccBtn: q('#ccBtn'), ccFlag: q('#ccFlag'), ccCode: q('#ccCode'),
    ccOv: q('#ccOv'), ccClose: q('#ccClose'), ccSearchIn: q('#ccSearchIn'), ccList: q('#ccList'),
    emailBack: q('#emailBack'), loginEmailIn: q('#loginEmailIn'), loginPassIn: q('#loginPassIn'), loginBtn: q('#loginBtn'),
    otpBack: q('#otpBack'), otpPhone: q('#otpPhone'),
    verifyOtpBtn: q('#verifyOtpBtn'), resendBtn: q('#resendBtn'), resendTimer: q('#resendTimer'),
    tabChats: q('#tabChats'), tabCalls: q('#tabCalls'), tabContacts: q('#tabContacts'),
    dialFab: q('#dialFab'), dialBack: q('#dialBack'), dialNumIn: q('#dialNumIn'),
    dialSub: q('#dialSub'),
    keypad: q('#keypad'), dialSearchBtn: q('#dialSearchBtn'), dialResult: q('#dialResult'),
    chatAv: q('#chatAv'), chatNameH: q('#chatNameH'), chatStatusP: q('#chatStatusP'),
    chatBackBtn: q('#chatBackBtn'), chatCallBtn: q('#chatCallBtn'), chatVidBtn: q('#chatVidBtn'),
    msgsC: q('#msgsC'), chatTa: q('#chatTa'), sendMsgBtn: q('#sendMsgBtn'),
    attachBtn: q('#attachBtn'), imgInput: q('#imgInput'), micBtn: q('#micBtn'),
    inputWrap: q('#inputWrap'),
    recBar: q('#recBar'), recTime: q('#recTime'), recCancel: q('#recCancel'), recSend: q('#recSend'),
    setBackBtn: q('#setBackBtn'), setList: q('#setList'), setAvInput: q('#setAvInput'),
    callVid: q('#callVid'), remVid: q('#remVid'), locVid: q('#locVid'), pipWrap: q('#pipWrap'),
    remAudio: q('#remAudio'),
    callAv: q('#callAv'), callNameH: q('#callNameH'), callTypeTxt: q('#callTypeTxt'),
    callStTxt: q('#callStTxt'), callTimer: q('#callTimer'), ringCircles: q('#ringCircles'),
    muteBtn: q('#muteBtn'), camBtn: q('#camBtn'), spkBtn: q('#spkBtn'), endBtn: q('#endBtn'),
    incAv: q('#incAv'), incName: q('#incName'), incType: q('#incType'), accBtn: q('#accBtn'), accIco: q('#accIco'), rejBtn: q('#rejBtn'),
    searchBtn: q('#searchBtn'), menuBtn: q('#menuBtn'),
    imgViewer: q('#imgViewer'), imgViewerImg: q('#imgViewerImg'), imgViewerClose: q('#imgViewerClose')
  };

  function toast(m, t) {
    D.toast.textContent = m;
    D.toast.className = 'show' + (t ? ' ' + t : '');
    clearTimeout(D.toast._t);
    D.toast._t = setTimeout(function () { D.toast.className = ''; }, 6000);
  }

  function errMsG(e) {
    console.error(e);
    var code = e && e.code ? e.code : '';
    var map = {
      'permission-denied': 'Firestore Rules ঠিক করে Publish করুন',
      'auth/email-already-in-use': 'ইমেইলে অ্যাকাউন্ট আছে — লগইন করুন',
      'auth/weak-password': 'পাসওয়ার্ড ৬ অক্ষর দিন',
      'auth/wrong-password': 'ভুল পাসওয়ার্ড',
      'auth/invalid-credential': 'ইমেইল/পাসওয়ার্ড ভুল',
      'auth/user-not-found': 'অ্যাকাউন্ট নেই',
      'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে'
    };
    return map[code] || ('ত্রুটি: ' + (code || (e && (e.message || e.text)) || 'অজানা'));
  }

  function go(f, t, c) {
    f.classList.remove('on');
    t.classList.remove('from-l', 'slide-up');
    if (c) t.classList.add(c);
    requestAnimationFrame(function () { t.classList.add('on'); });
  }
  function back(f, t) {
    f.classList.remove('on');
    requestAnimationFrame(function () { t.classList.add('on'); });
  }
  function hideAll() {
    qa('.scr').forEach(function (s) { s.classList.remove('on', 'from-l', 'slide-up'); });
  }
  function showPhone() {
    hideAll();
    requestAnimationFrame(function () { D.phoneScr.classList.add('on'); });
  }

  function fmtT(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function fmtD(ts) {
    var d = new Date(ts), t = new Date();
    if (d.toDateString() === t.toDateString()) return 'আজ';
    var y = new Date(t); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'গতকাল';
    return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
  }
  function fmtTS(ts) { return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  function findU(uid) { return S.users.find(function (u) { return u.id === uid; }); }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function avOf(u) { return (u && u.avatar) ? u.avatar : DB.uiAv(u ? u.name : 'U'); }

    function playRing() {
    stopRing();
    /* ★ config.js-এ রিংটোন লিংক থাকলে সেটা বাজবে ★ */
    try {
      if (_C.ring && _C.ring.incoming) {
        var au = new Audio(_C.ring.incoming);
        au.loop = true;
        S.ringAudio = au;
        au.play().catch(function () {});
        return;
      }
    } catch (e) {}
    /* ডিফল্ট বিপ-বিপ */
    try {
      var c = S.ringCtx = new (window.AudioContext || window.webkitAudioContext)();
      var i = 0;
      function p() {
        if (!S.ringCtx) return;
        var o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.frequency.value = [523, 659][i++ % 2];
        g.gain.setValueAtTime(0.08, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
        o.start(); o.stop(c.currentTime + 0.5);
      }
      p(); S.ringIv = setInterval(p, 1100);
    } catch (e) {}
  }
  function stopRing() {
    if (S.ringIv) { clearInterval(S.ringIv); S.ringIv = null; }
    if (S.ringAudio) { try { S.ringAudio.pause(); } catch (e) {} S.ringAudio = null; }
    if (S.ringCtx) { try { S.ringCtx.close(); } catch (e) {} S.ringCtx = null; }
  }
  function tone(f1, f2, d) {
    try {
      var c = new (window.AudioContext || window.webkitAudioContext)();
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.setValueAtTime(f1, c.currentTime);
      o.frequency.linearRampToValueAtTime(f2, c.currentTime + d * 0.6);
      g.gain.setValueAtTime(0.05, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d);
      o.start(); o.stop(c.currentTime + d);
    } catch (e) {}
  }

  var otpIn = qa('#otpInputs input');
  otpIn.forEach(function (inp, i) {
    inp.addEventListener('input', function () { if (inp.value && i < 5) otpIn[i + 1].focus(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !inp.value && i > 0) { otpIn[i - 1].focus(); otpIn[i - 1].value = ''; }
    });
  });
  function getOTP() { return Array.from(otpIn).map(function (i) { return i.value; }).join(''); }
  function clearOTP() { otpIn.forEach(function (i) { i.value = ''; }); otpIn[0].focus(); }

  function startResend() {
    S.resendSec = 60;
    D.resendBtn.disabled = true;
    D.resendTimer.textContent = '60';
    clearInterval(S.resendTimer);
    S.resendTimer = setInterval(function () {
      S.resendSec--;
      D.resendTimer.textContent = S.resendSec;
      if (S.resendSec <= 0) { clearInterval(S.resendTimer); D.resendBtn.disabled = false; D.resendTimer.textContent = ''; }
    }, 1000);
  }

  /* কান্ট্রি */
  function setCC(c) { S.ccCountry = c; D.ccFlag.textContent = c[1]; D.ccCode.textContent = c[3]; }
  function renderCC(term) {
    var t = (term || '').toLowerCase(), h = '';
    COUNTRIES.forEach(function (c) {
      if (t && c[2].toLowerCase().indexOf(t) === -1 && c[3].indexOf(t) === -1) return;
      h += '<div class="cc-item" data-cc="' + c[0] + '"><span class="fl">' + c[1] + '</span><span class="nm">' + esc(c[2]) + '</span><span class="dl">' + c[3] + '</span></div>';
    });
    D.ccList.innerHTML = h;
  }
  D.ccList.addEventListener('click', function (e) {
    var it = e.target.closest('.cc-item');
    if (!it) return;
    var c = COUNTRIES.find(function (x) { return x[0] === it.getAttribute('data-cc'); });
    if (c) setCC(c);
    D.ccOv.classList.remove('on');
  });
  setCC(guessCC());
  D.ccBtn.addEventListener('click', function () { D.ccSearchIn.value = ''; renderCC(''); D.ccOv.classList.add('on'); });
  D.ccClose.addEventListener('click', function () { D.ccOv.classList.remove('on'); });
  D.ccSearchIn.addEventListener('input', function () { renderCC(D.ccSearchIn.value); });

  /* ইমেইল কোড */
  function emailReady() {
    return typeof emailjs !== 'undefined' && _C.email && _C.email.publicKey &&
      String(_C.email.publicKey).indexOf('YOUR') !== 0;
  }

  async function sendCode() {
    if (!emailReady()) {
      var e = new Error('config.js-এ EmailJS কী বসান');
      e.code = 'emailjs/not-configured';
      throw e;
    }
    S.emailCode = String(Math.floor(100000 + Math.random() * 900000));
    S.codeExp = Date.now() + 600000;
    await emailjs.send(_C.email.serviceId, _C.email.templateId, {
      to_email: S.pendingReg.email, email: S.pendingReg.email, user_email: S.pendingReg.email,
      recipient: S.pendingReg.email, reply_to: S.pendingReg.email,
      to_name: S.pendingReg.name, name: S.pendingReg.name, user_name: S.pendingReg.name,
      code: S.emailCode, passcode: S.emailCode, otp: S.emailCode, token: S.emailCode,
      time: '10', subject: 'Personal Call ভেরিফিকেশন কোড', app_name: 'Personal Call'
    }, { publicKey: _C.email.publicKey });
  }

  /* রেজিস্ট্রেশন */
  D.regBtn.addEventListener('click', async function () {
    var name = D.nameIn.value.trim();
    var nnum = D.phoneIn.value.replace(/\D/g, '');
    var natClean = nnum.replace(/^0+/, '');
    var full = S.ccCountry ? S.ccCountry[3] + natClean : '+' + natClean;
    var email = D.regEmailIn.value.trim();
    var pass = D.regPassIn.value;

    if (!name) { toast('নাম দিন', 'err'); return; }
    if (!natClean || natClean.length < 6 || natClean.length > 14) { toast('সঠিক মোবাইল নম্বর দিন', 'err'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('সঠিক ইমেইল দিন', 'err'); return; }
    if (pass.length < 6) { toast('পাসওয়ার্ড ৬ অক্ষর দিন', 'err'); return; }

    D.regBtn.disabled = true;
    D.regBtn.innerHTML = '<span class="sp"></span>';
    try {
      if (await DB.phoneExists(full)) {
        toast('এই নম্বরে আগেই অ্যাকাউন্ট আছে — লগইন করুন', 'err');
        D.regBtn.disabled = false;
        D.regBtn.textContent = 'রেজিস্টার করুন (ইমেইলে কোড যাবে)';
        return;
      }
      S.pendingReg = { name: name, phone: full, email: email, pass: pass };
      await sendCode();
      D.otpPhone.textContent = email;
      clearOTP();
      go(D.phoneScr, D.otpScr);
      startResend();
      toast('কোড ইমেইলে পাঠানো হয়েছে 📧', 'ok');
    } catch (e) { toast(errMsG(e), 'err'); }
    D.regBtn.disabled = false;
    D.regBtn.textContent = 'রেজিস্টার করুন (ইমেইলে কোড যাবে)';
  });

  D.verifyOtpBtn.addEventListener('click', async function () {
    var code = getOTP();
    if (code.length !== 6) { toast('৬ সংখ্যার কোড দিন', 'err'); return; }
    if (Date.now() > S.codeExp) { toast('মেয়াদ শেষ — আবার পাঠান', 'err'); return; }
    D.verifyOtpBtn.disabled = true;
    D.verifyOtpBtn.innerHTML = '<span class="sp"></span>';
    try {
      if (code !== S.emailCode) { toast('ভুল কোড', 'err'); }
      else {
        var r = S.pendingReg;
        S.user = await DB.registerAccount(r.name, r.phone, r.email, r.pass);
        S.pendingReg = null; S.emailCode = null;
        clearInterval(S.resendTimer);
        toast('অ্যাকাউন্ট তৈরি হয়েছে! 🎉', 'ok');
        enterMain();
      }
    } catch (e) { toast(errMsG(e), 'err'); }
    D.verifyOtpBtn.disabled = false;
    D.verifyOtpBtn.textContent = 'ভেরিফাই করুন';
  });

  D.resendBtn.addEventListener('click', async function () {
    try {
      await sendCode(); startResend(); clearOTP();
      toast('নতুন কোড পাঠানো হয়েছে', 'ok');
    } catch (e) { toast(errMsG(e), 'err'); }
  });

  D.otpBack.addEventListener('click', function () { back(D.otpScr, D.phoneScr); });

  /* লগইন */
  D.showEmailLogin.addEventListener('click', function () { go(D.phoneScr, D.emailScr, 'from-l'); });
  D.emailBack.addEventListener('click', function () { back(D.emailScr, D.phoneScr); });

  D.loginBtn.addEventListener('click', async function () {
    var email = D.loginEmailIn.value.trim(), pass = D.loginPassIn.value;
    if (!email || !pass) { toast('ইমেইল ও পাসওয়ার্ড দিন', 'err'); return; }
    D.loginBtn.disabled = true;
    D.loginBtn.innerHTML = '<span class="sp"></span>';
    try {
      S.user = await DB.emailLogin(email, pass);
      toast('লগইন সফল', 'ok');
      enterMain();
    } catch (e) { toast(errMsG(e), 'err'); }
    D.loginBtn.disabled = false;
    D.loginBtn.textContent = 'লগইন করুন';
  });

  /* মূল */
  function enterMain() {
    hideAll();
    clearInterval(S.resendTimer);
    D.resendBtn.disabled = true;
    clearOTP();
    askNotif();
    DB.setOn(S.user.uid);

    S.unsubUsers = DB.onUsers(S.user.uid, function (us) { S.users = us; renderChats(); renderContacts(); });
    S.chatListUnsub = DB.onChatList(S.user.uid, function (c) {
      S.chatList = c; renderChats();
      c.forEach(function (ch) {
        if (!ch.lastMsg || ch.lastMsg.sid === S.user.uid) return;
        var key = ch.id + '_' + (ch.lastMsg.ts || 0);
        if (S.notified[key]) return;
        S.notified[key] = 1;
        var ou = ch.parts[0] === S.user.uid ? ch.parts[1] : ch.parts[0];
        var u = findU(ou);
        var isOpen = S.chatTarget && S.chatTarget.uid === ou && document.hasFocus();
        if (!isOpen) {
          showNotif('💬 ' + (u ? u.name : 'নতুন মেসেজ'), ch.lastMsg.text || '', 'm' + ch.id);
          vibrate(200);
        }
      });
    });
    S.contactsUnsub = DB.onContacts(S.user.uid, function (c) { S.contacts = c; renderContacts(); });
    S.historyUnsub = DB.onCallHistory(S.user.uid, function (h) { S.callHistory = h; renderHistory(); });
    S.unsubCalls = DB.onIncCall(S.user.uid, incoming);

    hideAll();
    requestAnimationFrame(function () { D.mainScr.classList.add('on'); });
  }

  var CALL_SVG = '<svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>';
  var VID_SVG = '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
  var DEL_SVG = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

  function renderChats() {
    var h = '';
    if (!S.chatList.length) {
      if (!S.users.length) {
        h = '<div class="empty-st"><p>এখনো কোনো ব্যবহারকারী নেই।<br>নিচের 📞 বাটনে চেপে নম্বর ডায়াল করুন</p></div>';
      } else {
        S.users.forEach(function (u) {
          h += '<div class="chat-row" data-uid="' + u.id + '"><img class="av" src="' + esc(avOf(u)) + '"><div class="det"><h4>' + esc(u.name) + '</h4><p>' + (u.online ? 'অনলাইন' : 'অফলাইন') + '</p></div></div>';
        });
      }
    } else {
      S.chatList.forEach(function (c) {
        var ou = c.parts[0] === S.user.uid ? c.parts[1] : c.parts[0];
        var u = findU(ou);
        if (!u) return;
        var lt = c.lastMsg ? c.lastMsg.text : 'কোনো মেসেজ নেই';
        var tm = c.lastMsg && c.lastMsg.ts ? fmtTS(c.lastMsg.ts) : '';
        h += '<div class="chat-row" data-uid="' + u.id + '"><img class="av" src="' + esc(avOf(u)) + '"><div class="det"><h4>' + esc(u.name) + '</h4><p>' + esc(lt) + '</p></div><div class="meta"><span class="time">' + tm + '</span></div></div>';
      });
      var done = S.chatList.map(function (c) { return c.parts[0] === S.user.uid ? c.parts[1] : c.parts[0]; });
      S.users.forEach(function (u) {
        if (done.indexOf(u.id) === -1) {
          h += '<div class="chat-row" data-uid="' + u.id + '"><img class="av" src="' + esc(avOf(u)) + '"><div class="det"><h4>' + esc(u.name) + '</h4><p>চ্যাট শুরু করুন</p></div></div>';
        }
      });
    }
    D.tabChats.innerHTML = h;
  }

  D.tabChats.addEventListener('click', function (e) {
    var r = e.target.closest('.chat-row');
    if (r && r.getAttribute('data-uid')) openChat(r.getAttribute('data-uid'));
  });

  function renderContacts() {
    var h = '<div class="sec-label">আমার কন্টাক্ট (' + S.contacts.length + ')</div>';
    if (!S.contacts.length) h += '<div class="empty-st"><p>📞 বাটনে চেপে নম্বর ডায়াল করে কন্টাক্ট সেভ করুন</p></div>';
    S.contacts.forEach(function (c) {
      var lv = findU(c.uid);
      h += '<div class="chat-row" data-uid="' + c.uid + '"><img class="av" src="' + esc(avOf(c)) + '"><div class="det"><h4>' + esc(c.name) + '</h4><p>' + esc(c.phone || '') + ' • ' + (lv ? (lv.online ? 'অনলাইন' : 'অফলাইন') : 'অ্যাপে নেই') + '</p></div>' +
        '<button class="mini-act" data-act="a">' + CALL_SVG + '</button><button class="mini-act" data-act="v">' + VID_SVG + '</button><button class="mini-act red" data-act="d">' + DEL_SVG + '</button></div>';
    });
    D.tabContacts.innerHTML = h;
  }

  D.tabContacts.addEventListener('click', function (e) {
    var r = e.target.closest('.chat-row');
    if (!r) return;
    var uid = r.getAttribute('data-uid');
    var b = e.target.closest('.mini-act');
    if (b) {
      var a = b.getAttribute('data-act');
      if (a === 'd') { DB.removeContact(S.user.uid, uid); toast('মুছে ফেলা হয়েছে', 'ok'); return; }
      if (!findU(uid)) { toast('ইউজার অ্যাপে নেই', 'err'); return; }
      call(uid, a === 'v' ? 'video' : 'audio');
      return;
    }
    openChat(uid);
  });

  function renderHistory() {
    var h = '<div class="sec-label">সাম্প্রতিক কল</div>';
    if (!S.callHistory.length) h += '<div class="empty-st"><p>এখনো কোনো কল হয়নি</p></div>';
    S.callHistory.forEach(function (x) {
      var col = x.status === 'completed' ? 'var(--wa-teal)' : 'var(--wa-danger)';
      var dt = x.dir === 'out' ? 'আউটগোয়িং' : (x.status === 'completed' ? 'ইনকামিং' : 'মিসড কল');
      h += '<div class="chat-row" data-uid="' + x.withUid + '" data-type="' + (x.type || 'audio') + '"><img class="av" src="' + esc(x.avatar || DB.uiAv(x.name)) + '"><div class="det"><h4>' + esc(x.name) + '</h4><p style="color:' + col + '">' + dt + '</p></div><div class="meta"><span class="time">' + (x.ts ? fmtD(x.ts) : '') + '</span></div></div>';
    });
    D.tabCalls.innerHTML = h;
  }

  D.tabCalls.addEventListener('click', function (e) {
    var r = e.target.closest('.chat-row');
    if (!r) return;
    var uid = r.getAttribute('data-uid');
    if (!uid || !findU(uid)) { toast('ইউজার নেই', 'err'); return; }
    call(uid, r.getAttribute('data-type') || 'audio');
  });

  /* ডায়ালার */
  D.dialFab.addEventListener('click', function () {
    D.dialNumIn.value = '';
    D.dialResult.innerHTML = '';
    if (D.dialSub) D.dialSub.textContent = '';
    go(D.mainScr, D.dialScr, 'from-l');
  });
  D.dialBack.addEventListener('click', function () { back(D.dialScr, D.mainScr); });

  D.keypad.querySelectorAll('.key').forEach(function (k) {
    k.addEventListener('click', function () {
      var v = k.getAttribute('data-k');
      if (v === 'del') D.dialNumIn.value = D.dialNumIn.value.slice(0, -1);
      else if (D.dialNumIn.value.length < 20) D.dialNumIn.value += v;
    });
  });

  D.dialSearchBtn.addEventListener('click', async function () {
    var raw = D.dialNumIn.value.replace(/[\s\-()]/g, '');
    var tries = [];
    if (raw.charAt(0) === '+') {
      tries.push(raw);
    } else {
      var nat = raw.replace(/\D/g, '');
      var natNoZero = nat.replace(/^0+/, '');
      var cc = S.ccCountry ? S.ccCountry[3] : '+880';
      if (nat.indexOf('880') === 0) {
        tries.push('+' + nat);
        var rest = nat.substring(3).replace(/^0+/, '');
        if (rest) tries.push('+880' + rest);
      } else if (natNoZero) {
        tries.push(cc + natNoZero);
        tries.push(cc + '0' + natNoZero);
      }
    }

    if (!tries.length) { toast('সঠিক নম্বর দিন', 'err'); return; }
    if (D.dialSub) D.dialSub.textContent = 'খোঁজা নম্বর: ' + tries[0];

    D.dialSearchBtn.disabled = true;
    D.dialSearchBtn.textContent = 'খোঁজা হচ্ছে...';
    D.dialResult.innerHTML = '';
    try {
      var u = await DB.findByPhones(tries);
      if (!u) {
        D.dialResult.innerHTML = '<div class="dial-card"><p style="margin:0">এই নম্বরে কোনো অ্যাকাউন্ট নেই।</p></div>';
        return;
      }
      D.dialResult.innerHTML =
        '<div class="dial-card"><img src="' + esc(avOf(u)) + '"><h4>' + esc(u.name) + '</h4><p>' + esc(u.phone) + '</p>' +
        '<div class="dc-btns"><button id="dcC">' + CALL_SVG + ' কল</button><button id="dcV">' + VID_SVG + ' ভিডিও</button></div>' +
        '<div class="dc-btns" style="margin-top:8px"><button class="ghost" id="dcChat">💬 চ্যাট</button><button class="ghost" id="dcS">💾 সেভ</button></div></div>';
      q('#dcC').onclick = function () { call(u.id, 'audio'); };
      q('#dcV').onclick = function () { call(u.id, 'video'); };
      q('#dcChat').onclick = function () { back(D.dialScr, D.mainScr); openChat(u.id); };
      q('#dcS').onclick = async function () {
        var nm = prompt('কন্টাক্টের নাম:', u.name);
        if (nm === null) return;
        await DB.addContact(S.user.uid, { id: u.id, name: nm.trim() || u.name, phone: u.phone, avatar: u.avatar });
        toast('সেভ হয়েছে', 'ok');
      };
    } catch (e) { toast('খুঁজতে সমস্যা: ' + (e.message || ''), 'err'); }
    D.dialSearchBtn.disabled = false;
    D.dialSearchBtn.textContent = '🔍 খুঁজুন / কল';
  });

  /* চ্যাট */
  function toggleSM() {
    var has = D.chatTa.value.trim().length > 0;
    D.sendMsgBtn.style.display = has ? '' : 'none';
    D.micBtn.style.display = has ? 'none' : '';
  }

  function stopVP() {
    if (S.playingAudio) { try { S.playingAudio.pause(); } catch (e) {} S.playingAudio = null; }
    if (S.playingBtn) { S.playingBtn.textContent = '▶'; S.playingBtn = null; }
  }

  function openChat(uid) {
    var u = findU(uid);
    if (!u) { toast('ইউজার নেই', 'err'); return; }
    stopVP();
    S.chatTarget = { uid: uid, user: u };
    D.chatAv.src = avOf(u);
    D.chatNameH.textContent = u.name;
    D.chatStatusP.textContent = u.online ? 'অনলাইন' : 'অফলাইন';
    D.chatTa.value = '';
    D.sendMsgBtn.style.display = 'none';
    D.micBtn.style.display = '';
    D.recBar.style.display = 'none';

    var cid = DB.chatId(S.user.uid, uid);
    if (!S.chatMsgs[cid]) S.chatMsgs[cid] = [];
    renderMsgs(cid);

    if (S.chatUnsub) S.chatUnsub();
    S.chatUnsub = DB.onMsgs(cid, function (ch) {
      ch.forEach(function (c) {
        if (c.t === 'added' && !S.chatMsgs[cid].some(function (m) { return m._id === c.d._id; })) S.chatMsgs[cid].push(c.d);
      });
      renderMsgs(cid);
    });

    if (S.typingUnsub) S.typingUnsub();
    S.typingUnsub = DB.onTyping(cid, S.user.uid, function (t) {
      D.chatStatusP.textContent = t ? 'টাইপ করছে...' : (u.online ? 'অনলাইন' : 'অফলাইন');
    });

    go(D.mainScr, D.chatScr, 'from-l');
  }

  function renderMsgs(cid) {
    var ms = S.chatMsgs[cid] || [], h = '', ld = '';
    ms.forEach(function (m) {
      var ds = fmtD(m.timestamp);
      if (ds !== ld) { h += '<div class="date-sep"><span>' + ds + '</span></div>'; ld = ds; }
      var out = m.senderId === S.user.uid;
      var body = '';
      if (m.type === 'image' && m.img) {
        body = '<img class="chat-img" src="' + esc(m.img) + '" data-full="' + esc(m.img) + '">';
      } else if (m.type === 'voice' && m.voice) {
        var vid = 'v' + (++S.voiceSeq);
        S.voiceMap[vid] = { b64: m.voice, mime: m.vmime || 'audio/webm', dur: m.dur || 0 };
        body = '<div class="vmsg"><button class="vplay" data-vid="' + vid + '">▶</button><div class="vbar"><div class="vfill"></div></div><span class="vdur">' + fmtT(m.dur || 0) + '</span></div>';
      } else if (m.type === 'call') {
        /* ★ WhatsApp-স্টাইল কল লগ বাবল ★ */
        var t = m.callType === 'video' ? 'ভিডিও কল' : 'অডিও কল';
        var st = m.status === 'completed'
          ? (m.dur ? 'সম্পন্ন • ' + fmtT(m.dur) : 'সম্পন্ন')
          : (m.status === 'noanswer' ? 'কেউ ধরেনি' : (m.status === 'rejected' ? 'কাটা হয়েছে' : 'মিসড কল'));
        var ico = m.callType === 'video' ? VID_SVG : CALL_SVG;
        body = '<div style="display:flex;align-items:center;gap:10px;min-width:170px">' +
          '<span style="width:38px;height:38px;background:rgba(255,255,255,.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#fff">' + ico.replace('<svg viewBox="0 0 24 24">', '').replace('</svg>', '') + '</svg></span>' +
          '<span style="flex:1"><b style="display:block;font-size:14px">' + t + '</b>' +
          '<span style="font-size:12px;color:#cfe9e2">' + st + '</span></span></div>';
      } else body = esc(m.text);
      h += '<div class="' + (out ? 'msg out' : 'msg in') + '"><div class="bbl">' + body + '</div><div class="mt">' + fmtTS(m.timestamp) + (out ? ' <span class="tick">✓✓</span>' : '') + '</div></div>';
    });
    D.msgsC.innerHTML = h;
    D.msgsC.scrollTop = D.msgsC.scrollHeight;
  }

  D.msgsC.addEventListener('click', function (e) {
    var vp = e.target.closest('.vplay');
    if (vp) {
      var v = S.voiceMap[vp.getAttribute('data-vid')];
      if (!v) return;
      stopVP();
      var a = new Audio('data:' + v.mime + ';base64,' + v.b64);
      S.playingAudio = a; S.playingBtn = vp;
      vp.textContent = '⏸';
      var f = vp.parentNode.querySelector('.vfill');
      a.ontimeupdate = function () { if (f && a.duration) f.style.width = ((a.currentTime / a.duration) * 100) + '%'; };
      a.onended = stopVP;
      a.play().catch(function () { toast('প্লে ব্যর্থ', 'err'); });
      return;
    }
    var im = e.target.closest('.chat-img');
    if (im) { D.imgViewerImg.src = im.getAttribute('data-full'); D.imgViewer.classList.add('on'); }
  });

  D.imgViewerClose.addEventListener('click', function () { D.imgViewer.classList.remove('on'); });

  D.chatTa.addEventListener('input', function () {
    toggleSM();
    D.chatTa.style.height = 'auto';
    D.chatTa.style.height = Math.min(D.chatTa.scrollHeight, 100) + 'px';
    if (S.chatTarget) {
      var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
      DB.setTyping(cid, S.user.uid);
      clearTimeout(S.typingTimeout);
      S.typingTimeout = setTimeout(function () { DB.clearTyping(cid, S.user.uid); }, 2000);
    }
  });

  D.sendMsgBtn.addEventListener('click', sendMsg);
  D.chatTa.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });

  function sendMsg() {
    var t = D.chatTa.value.trim();
    if (!t || !S.chatTarget) return;
    var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
    DB.sendMsg(cid, { senderId: S.user.uid, text: t, timestamp: Date.now() });
    DB.clearTyping(cid, S.user.uid);
    D.chatTa.value = ''; D.chatTa.style.height = 'auto';
    toggleSM();
  }

  /* ছবি */
  D.attachBtn.addEventListener('click', function () { D.imgInput.click(); });
  D.imgInput.addEventListener('change', async function () {
    var f = this.files[0]; this.value = '';
    if (!f || !S.chatTarget) return;
    toast('ছবি আপলোড হচ্ছে...', 'ok');
    try {
      var url = await DB.uploadImage(f, 1280);
      var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
      DB.sendMsg(cid, { senderId: S.user.uid, text: '📷 ছবি', img: url, type: 'image', timestamp: Date.now() });
      toast('ছবি পাঠানো হয়েছে ✅', 'ok');
    } catch (e) { toast(e.message || 'ব্যর্থ', 'err'); }
  });

  /* ভয়েস */
  D.micBtn.addEventListener('click', async function () {
    if (!S.chatTarget) return;
    if (typeof MediaRecorder === 'undefined') { toast('এই ব্রাউজারে রেকর্ড সাপোর্ট নেই', 'err'); return; }
    try { S.recStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { toast('মাইকের অনুমতি দিন', 'err'); return; }
    S.recMime = '';
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].forEach(function (t) {
      if (!S.recMime && MediaRecorder.isTypeSupported(t)) S.recMime = t;
    });
    try { S.mediaRecorder = S.recMime ? new MediaRecorder(S.recStream, { mimeType: S.recMime }) : new MediaRecorder(S.recStream); }
    catch (e) { toast('রেকর্ডার ব্যর্থ', 'err'); releaseMic(); return; }
    S.recChunks = [];
    S.mediaRecorder.ondataavailable = function (e) { if (e.data.size) S.recChunks.push(e.data); };
    S.mediaRecorder.start();
    D.inputWrap.style.display = 'none';
    D.micBtn.style.display = 'none';
    D.recBar.style.display = 'flex';
    S.recStart = Date.now();
    D.recTime.textContent = '0:00';
    S.recTimerIv = setInterval(function () {
      var s = Math.floor((Date.now() - S.recStart) / 1000);
      D.recTime.textContent = fmtT(s);
      if (s >= 60) finishRec(true);
    }, 500);
  });

  function releaseMic() {
    if (S.recStream) { S.recStream.getTracks().forEach(function (t) { t.stop(); }); S.recStream = null; }
  }
  function stopRecUI() {
    clearInterval(S.recTimerIv);
    D.recBar.style.display = 'none';
    D.inputWrap.style.display = '';
    D.micBtn.style.display = D.chatTa.value.trim() ? 'none' : '';
  }

  async function finishRec(send) {
    if (!S.mediaRecorder || S.mediaRecorder.state === 'inactive') { stopRecUI(); releaseMic(); return; }
    var dur = Math.max(1, Math.floor((Date.now() - S.recStart) / 1000));
    var mr = S.mediaRecorder; S.mediaRecorder = null;
    var done = new Promise(function (r) { mr.onstop = r; });
    try { mr.stop(); } catch (e) {}
    await done;
    releaseMic(); stopRecUI();
    if (!send) { S.recChunks = []; toast('বাতিল', 'ok'); return; }
    if (!S.recChunks.length || !S.chatTarget) { S.recChunks = []; return; }
    var blob = new Blob(S.recChunks, { type: S.recMime || 'audio/webm' });
    S.recChunks = [];
    if (blob.size > 900000) { toast('ভয়েস বড় হয়ে গেছে', 'err'); return; }
    try {
      var d = await new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(r.result.split(',')[1]); };
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
      DB.sendMsg(cid, { senderId: S.user.uid, text: '🎙️ ভয়েস', voice: d, vmime: S.recMime || 'audio/webm', dur: dur, type: 'voice', timestamp: Date.now() });
      toast('ভয়েস পাঠানো হয়েছে ✅', 'ok');
    } catch (e) { toast('ভয়েস পাঠানো ব্যর্থ', 'err'); }
  }

  D.recSend.addEventListener('click', function () { finishRec(true); });
  D.recCancel.addEventListener('click', function () { finishRec(false); });

  D.chatBackBtn.addEventListener('click', function () {
    if (S.chatUnsub) { S.chatUnsub(); S.chatUnsub = null; }
    if (S.typingUnsub) { S.typingUnsub(); S.typingUnsub = null; }
    stopVP();
    S.chatTarget = null;
    back(D.chatScr, D.mainScr);
  });

  qa('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      qa('.tab').forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      var tg = t.getAttribute('data-tab');
      D.tabChats.style.display = tg === 'chats' ? '' : 'none';
      D.tabCalls.style.display = tg === 'calls' ? '' : 'none';
      D.tabContacts.style.display = tg === 'contacts' ? '' : 'none';
    });
  });

  /* সেটিংস */
  D.menuBtn.addEventListener('click', function () { renderSet(); go(D.mainScr, D.setScr, 'from-l'); });
  D.setBackBtn.addEventListener('click', function () { back(D.setScr, D.mainScr); });

  function renderSet() {
    var u = S.user;
    D.setList.innerHTML =
      '<div class="set-header">প্রোফাইল</div>' +
      '<div class="set-item"><img src="' + esc(avOf(u)) + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover"><div class="si-text"><h4>' + esc(u.name) + '</h4><p>' + esc(u.phone || u.email || '') + '</p></div></div>' +
      '<div class="set-item" id="pItem"><div class="si-icon" style="background:var(--wa-teal)">📷</div><div class="si-text"><h4>প্রোফাইল ছবি বদলান</h4><p>গ্যালারি থেকে</p></div></div>' +
      '<div class="set-item" id="nItem"><div class="si-icon" style="background:#3b82f6">✏️</div><div class="si-text"><h4>নাম পরিবর্তন করুন</h4><p>নাম সেট করুন</p></div></div>' +
     '<div class="set-item" id="iItem"><div class="si-icon" style="background:#34a853">📲</div><div class="si-text"><h4>অ্যাপ হিসেবে ইনস্টল করুন</h4><p>হোম স্ক্রিনে অ্যাপ আইকন</p></div></div>' +
     '<div class="set-divider"></div><div class="set-header">অ্যাকাউন্ট</div>' +
      '<div class="set-item" id="lItem"><div class="si-icon" style="background:var(--wa-danger)">🚪</div><div class="si-text"><h4>লগআউট</h4><p>বের হোন</p></div></div>';

    q('#pItem').onclick = function () { D.setAvInput.click(); };
    q('#nItem').onclick = function () {
      var n = prompt('আপনার নাম:', u.name);
      if (n && n.trim()) {
        DB.updateProfile(u.uid, { name: n.trim(), avatar: DB.uiAv(n.trim()) });
        u.name = n.trim(); u.avatar = DB.uiAv(n.trim());
        toast('নাম আপডেট হয়েছে', 'ok');
        renderSet();
      }
    };
    q('#iItem').onclick = function () { installApp(); };
    q('#lItem').onclick = async function () {
      if (S.unsubUsers) S.unsubUsers();
      if (S.unsubCalls) S.unsubCalls();
      if (S.chatListUnsub) S.chatListUnsub();
      if (S.contactsUnsub) S.contactsUnsub();
      if (S.historyUnsub) S.historyUnsub();
      await DB.logout(S.user.uid);
      S.user = null; S.chatMsgs = {}; S.chatList = []; S.contacts = []; S.callHistory = []; S.notified = {};
      showPhone();
      toast('লগআউট হয়েছে', 'ok');
    };
  }

  D.setAvInput.addEventListener('change', async function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    toast('আপলোড হচ্ছে...', 'ok');
    try {
      var url = await DB.uploadImage(f, 512);
      await DB.updateProfile(S.user.uid, { avatar: url });
      S.user.avatar = url;
      toast('ছবি সেভ হয়েছে ✅', 'ok');
      renderSet();
    } catch (e) { toast(e.message || 'ব্যর্থ', 'err'); }
  });

  D.searchBtn.addEventListener('click', function () {
    var t = prompt('নাম দিয়ে খুঁজুন:');
    if (!t) return;
    t = t.toLowerCase();
    D.tabChats.querySelectorAll('.chat-row').forEach(function (r) {
      var h4 = r.querySelector('h4');
      if (h4) r.style.display = h4.textContent.toLowerCase().indexOf(t) !== -1 ? '' : 'none';
    });
    setTimeout(function () {
      D.tabChats.querySelectorAll('.chat-row').forEach(function (r) { r.style.display = ''; });
    }, 4000);
  });

  /* কল */
  function cleanPC() {
    if (S.candUnsub) { S.candUnsub(); S.candUnsub = null; }
    if (S.callUnsub) { S.callUnsub(); S.callUnsub = null; }
    if (S.pc) { try { S.pc.close(); } catch (e) {} S.pc = null; }
    if (S.localStream) { S.localStream.getTracks().forEach(function (t) { t.stop(); }); S.localStream = null; }
    clearTimeout(S.outTimeout); clearTimeout(S.incTimeout);
  }

  function resetCall() {
    D.locVid.srcObject = null; D.remVid.srcObject = null; D.remAudio.srcObject = null;
    D.callVid.style.display = 'none';
    D.callAv.style.display = '';
    D.callTimer.style.display = 'none'; D.ringCircles.style.display = 'none';
    D.muteBtn.classList.remove('off'); D.camBtn.classList.remove('off'); D.spkBtn.classList.remove('off');
    D.pipWrap.classList.remove('off');
    if (S.callTimerIv) { clearInterval(S.callTimerIv); S.callTimerIv = null; }
    D.callScr.classList.remove('on');
  }

  function mkPC(cid, side) {
    var pc = new RTCPeerConnection(RTC_CFG);
    if (S.localStream) S.localStream.getTracks().forEach(function (t) { pc.addTrack(t, S.localStream); });
    pc.ontrack = function (e) {
      if (S.callType === 'video') D.remVid.srcObject = e.streams[0];
      else D.remAudio.srcObject = e.streams[0];
    };
    pc.onicecandidate = function (e) { if (e.candidate) DB.addCandidate(cid, side, e.candidate.toJSON()); };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected') {
        S.wasConnected = true;
        stopRing(); tone(880, 1200, 0.25);
        D.callStTxt.textContent = 'সংযুক্ত';
                S.callPhase = 'connected';
        D.callStTxt.style.color = '';
        if (S.callType === 'video') { D.callVid.style.display = ''; D.callAv.style.display = 'none'; }
        startCallTimer();
      } else if (pc.connectionState === 'failed') {
        if (S.callPhase !== 'ended') endCallNow('failed', false);
      }
    };
    return pc;
  }

  /* ================= কল সিস্টেম (সম্পূর্ণ) ================= */

  function startCallTimer() {
    if (S.callTimerIv) return;
    S.callStart = Date.now();
    D.callStTxt.textContent = 'সংযুক্ত';
    D.callTimer.style.display = '';
    D.callTimer.textContent = '00:00';
    S.callTimerIv = setInterval(function () {
      D.callTimer.textContent = fmtT(Math.floor((Date.now() - S.callStart) / 1000));
    }, 1000);
  }

  function stopCallTimer() {
    if (S.callTimerIv) { clearInterval(S.callTimerIv); S.callTimerIv = null; }
  }

  function showMain() {
    hideAll();
    requestAnimationFrame(function () { D.mainScr.classList.add('on'); });
  }

  async function startLocalMedia() {
    var wantVideo = S.callType === 'video';
    try {
      S.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false
      });
    } catch (e) {
      if (wantVideo) toast('ক্যামেরা পাওয়া যায়নি — শুধু অডিও যাবে', 'ok');
      S.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    S.isMuted = false;
    S.isCamOff = false;
  }

  function setCallHeader(name, avatar, typeTxt) {
    D.callNameH.textContent = name || '-';
    D.callTypeTxt.textContent = typeTxt;
    D.callAv.src = avatar || DB.uiAv(name);
  }

  async function getCallDoc(id) {
    try {
      var snap = await firebase.firestore().collection('calls').doc(id).get();
      return snap.exists ? snap.data() : null;
    } catch (e) { return null; }
  }

  function addMyLog(target, dir, type, status, dur) {
    if (!S.user || !target) return;
    DB.addCallLog(S.user.uid, {
      name: target.name, avatar: target.avatar, withUid: target.uid,
      dir: dir, type: type, status: status, dur: dur || 0, ts: Date.now()
    });
  }

  function unsubAllMain() {
    ['unsubUsers', 'chatListUnsub', 'contactsUnsub', 'historyUnsub', 'unsubCalls'].forEach(function (k) {
      if (S[k]) { try { S[k](); } catch (e) {} S[k] = null; }
    });
    if (S.chatUnsub) { try { S.chatUnsub(); } catch (e) {} S.chatUnsub = null; }
    if (S.typingUnsub) { try { S.typingUnsub(); } catch (e) {} S.typingUnsub = null; }
  }

  /* ---------- কল করা (কলার) ---------- */
  async function call(uid, type) {
    if (S.callActive) { toast('একটি কল ইতিমধ্যে চলছে', 'err'); return; }
    var u = findU(uid);
    if (!u) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }
    if (!u.online) { toast('ইউজার অফলাইনে আছে', 'err'); return; }

    S.callActive = true;
    S.callPhase = 'outgoing';
    S.iAmCaller = true;
    S.wasConnected = false;
    S.logWritten = false;
    S.endReason = null;
    S.callType = type;
    S.callTarget = { uid: uid, name: u.name, avatar: avOf(u) };

    setCallHeader(u.name, avOf(u), type === 'video' ? 'ভিডিও কল' : 'অডিও কল');
    D.callStTxt.textContent = 'কল করা হচ্ছে...';
    D.callTimer.style.display = 'none';
    D.ringCircles.style.display = '';
    D.callVid.style.display = 'none';
    D.callAv.style.display = '';
    hideAll();
    requestAnimationFrame(function () { D.callScr.classList.add('on'); });

    try {
      await startLocalMedia();
      D.callTypeTxt.textContent = S.callType === 'video' ? 'ভিডিও কল' : 'অডিও কল';
      if (S.callType === 'video') { D.locVid.srcObject = S.localStream; D.pipWrap.classList.remove('off'); }
      playRingback();

      S.callDocId = await DB.mkCall({
        callerId: S.user.uid, calleeId: uid,
        callerName: S.user.name || '', callerAvatar: S.user.avatar || '',
        type: S.callType
      }, null);

      S.pc = mkPC(S.callDocId, 'caller');
      var offer = await S.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: S.callType === 'video' });
      await S.pc.setLocalDescription(offer);
      await DB.updCall(S.callDocId, { offer: offer });

      S.candUnsub = DB.onCandidates(S.callDocId, 'callee', function (c) {
        if (S.pc && c && c.candidate) S.pc.addIceCandidate(c).catch(function () {});
      });

      S.callUnsub = DB.watchCall(S.callDocId, function (d) {
        if (S.callPhase === 'ended') return;
        if (d.status === 'accepted') {
          S.callPhase = 'connecting';
          D.ringCircles.style.display = 'none';
          D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
          if (d.answer && S.pc && S.pc.signalingState === 'have-local-offer') {
            S.pc.setRemoteDescription(d.answer).catch(function () {});
          }
        } else if (d.status === 'rejected') {
          endCallNow('rejected', true);
        } else if (d.status === 'ended') {
          endCallNow(d.endReason || 'normal', true);
        }
      });

      clearTimeout(S.outTimeout);
      S.outTimeout = setTimeout(function () {
        if (S.callPhase === 'outgoing') endCallNow('noanswer', false);
      }, 45000);
    } catch (e) {
      toast(errMsG(e), 'err');
      endCallNow('failed', false);
    }
  }

  function playRingback() {
    stopRing();
    try {
      var c = S.ringCtx = new (window.AudioContext || window.webkitAudioContext)();
      function p() {
        if (!S.ringCtx) return;
        var o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.frequency.value = 425;
        g.gain.setValueAtTime(0.06, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.2);
        o.start(); o.stop(c.currentTime + 1.2);
      }
      p();
      S.ringIv = setInterval(p, 3000);
    } catch (e) {}
  }

  /* ---------- ইনকামিং কল ---------- */
  function incoming(c) {
    if (!S.user) return;
    if (S.callActive) { DB.updCall(c.id, { status: 'ended', endReason: 'busy' }); return; }

    S.callActive = true;
    S.callPhase = 'incoming';
    S.iAmCaller = false;
    S.wasConnected = false;
    S.logWritten = false;
    S.callDocId = c.id;
    S.callType = c.type || 'audio';
    S.incOffer = c.offer || null;
    S.callTarget = { uid: c.callerId, name: c.callerName || 'অজানা', avatar: c.callerAvatar || '' };

    D.incAv.src = S.callTarget.avatar || DB.uiAv(S.callTarget.name);
    D.incName.textContent = S.callTarget.name;
    D.incType.textContent = S.callType === 'video' ? 'ভিডিও কল' : 'অডিও কল';
    D.accIco.innerHTML = S.callType === 'video'
      ? '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>'
      : '<path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1.003 1.003 0 0 1 1.01-.24c1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.1.31.03.66-.25 1.02l-2.2 2.2z"/>';
    D.incPop.classList.add('on');
    playRing();
    vibrate([500, 300, 500, 300, 500, 300, 500, 300, 500, 300, 500, 300]);
    showNotif('📞 ইনকামিং কল', S.callTarget.name, 'call' + c.id);

    /* কলার কেটে দিলে পপআপ সরে যাবে */
    if (S.incWatchUnsub) { try { S.incWatchUnsub(); } catch (e) {} }
    S.incWatchUnsub = DB.watchCall(c.id, function (d) {
      if (S.callPhase !== 'incoming') return;
      if (d.status === 'ended') {
        clearTimeout(S.incTimeout);
        D.incPop.classList.remove('on');
        stopRing(); vibrate(80);
        addMyLog(S.callTarget, 'in', S.callType, 'missed', 0);
        resetCallState();
        toast('মিসড কল', 'err');
      }
    });

    /* ৪৫ সেকেন্ডে কেউ ধরেনি = মিসড কল */
    clearTimeout(S.incTimeout);
    S.incTimeout = setTimeout(function () {
      if (S.callPhase !== 'incoming') return;
      D.incPop.classList.remove('on');
      stopRing(); vibrate(80);
      if (S.callDocId) DB.updCall(S.callDocId, { status: 'ended', endReason: 'noanswer' });
      addMyLog(S.callTarget, 'in', S.callType, 'missed', 0);
      resetCallState();
      toast('মিসড কল', 'err');
    }, 45000);
  }

  /* ---------- কল একসেপ্ট (কলি) ---------- */
  async function acceptCall() {
    if (S.callPhase !== 'incoming') return;
    clearTimeout(S.incTimeout);
    if (S.incWatchUnsub) { try { S.incWatchUnsub(); } catch (e) {} S.incWatchUnsub = null; }
    stopRing();
    S.callPhase = 'connecting';
    D.incPop.classList.remove('on');

    setCallHeader(S.callTarget.name, S.callTarget.avatar, S.callType === 'video' ? 'ভিডিও কল' : 'অডিও কল');
    D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
    D.callTimer.style.display = 'none';
    D.ringCircles.style.display = 'none';
    D.callVid.style.display = 'none';
    D.callAv.style.display = '';
    hideAll();
    requestAnimationFrame(function () { D.callScr.classList.add('on'); });

    try {
      var tries = 0;
      while (!S.incOffer && tries < 15) {
        await new Promise(function (r) { setTimeout(r, 300); });
        var d = await getCallDoc(S.callDocId);
        if (d && d.offer) S.incOffer = d.offer;
        tries++;
      }
      if (!S.incOffer) throw new Error('কল সংযোগ পাওয়া যায়নি — আবার চেষ্টা করুন');

      await startLocalMedia();
      if (S.callType === 'video') { D.locVid.srcObject = S.localStream; D.pipWrap.classList.remove('off'); }

      S.pc = mkPC(S.callDocId, 'callee');
      await S.pc.setRemoteDescription(S.incOffer);
      var ans = await S.pc.createAnswer();
      await S.pc.setLocalDescription(ans);
      await DB.updCall(S.callDocId, { status: 'accepted', answer: ans });

      S.candUnsub = DB.onCandidates(S.callDocId, 'caller', function (c) {
        if (S.pc && c && c.candidate) S.pc.addIceCandidate(c).catch(function () {});
      });
      S.callUnsub = DB.watchCall(S.callDocId, function (d) {
        if (S.callPhase === 'ended') return;
        if (d.status === 'ended') endCallNow(d.endReason || 'normal', true);
      });
    } catch (e) {
      toast(errMsG(e), 'err');
      endCallNow('failed', false);
    }
  }

  /* ---------- কল রিজেক্ট ---------- */
  function rejectCall() {
    if (S.callPhase !== 'incoming') return;
    clearTimeout(S.incTimeout);
    if (S.incWatchUnsub) { try { S.incWatchUnsub(); } catch (e) {} S.incWatchUnsub = null; }
    stopRing();
    D.incPop.classList.remove('on');
    if (S.callDocId) DB.updCall(S.callDocId, { status: 'rejected' });
    addMyLog(S.callTarget, 'in', S.callType, 'rejected', 0);
    resetCallState();
  }

  /* ---------- কল শেষ ---------- */
  function endCallNow(reason, fromRemote) {
    if (S.callPhase === 'ended') return;
    var wasConnected = S.wasConnected;
    var dur = wasConnected && S.callStart ? Math.floor((Date.now() - S.callStart) / 1000) : 0;
    var target = S.callTarget;
    var type = S.callType;
    var iAmCaller = S.iAmCaller;
    var docId = S.callDocId;

    S.callPhase = 'ended';
    clearTimeout(S.outTimeout);
    clearTimeout(S.incTimeout);
    if (S.incWatchUnsub) { try { S.incWatchUnsub(); } catch (e) {} S.incWatchUnsub = null; }
    stopRing();
    if (docId && !fromRemote) DB.updCall(docId, { status: 'ended', endReason: reason });
    cleanPC();
    stopCallTimer();
    resetCall();
    D.incPop.classList.remove('on');

    if (S.user && target) {
      var st = wasConnected ? 'completed'
        : (reason === 'rejected' ? 'rejected' : (iAmCaller ? 'noanswer' : 'missed'));
      addMyLog(target, iAmCaller ? 'out' : 'in', type, st, dur);

      /* চ্যাটে কল-বাবল — শুধু কলার লেখে (ডুপ্লিকেট এড়াতে) */
      if (iAmCaller) {
        var bst = wasConnected ? 'completed' : (reason === 'rejected' ? 'rejected' : 'noanswer');
        DB.sendMsg(DB.chatId(S.user.uid, target.uid), {
          senderId: S.user.uid, type: 'call', callType: type,
          text: '📞 ' + (type === 'video' ? 'ভিডিও কল' : 'অডিও কল'),
          status: bst, dur: dur, timestamp: Date.now()
        });
      }
    }
    resetCallState();
    showMain();
  }

  function resetCallState() {
    S.callActive = false;
    S.callPhase = 'idle';
    S.callTarget = null;
    S.callDocId = null;
    S.iAmCaller = false;
    S.wasConnected = false;
    S.endReason = null;
    S.logWritten = false;
    S.incOffer = null;
    S.isMuted = false;
    S.isCamOff = false;
    S.callStart = null;
    stopCallTimer();
  }

  /* ---------- কল বাটনগুলো ---------- */
  D.endBtn.addEventListener('click', function () {
    endCallNow(S.wasConnected ? 'normal' : (S.iAmCaller ? 'cancelled' : 'normal'), false);
  });
  D.muteBtn.addEventListener('click', function () {
    if (!S.localStream) return;
    S.isMuted = !S.isMuted;
    S.localStream.getAudioTracks().forEach(function (t) { t.enabled = !S.isMuted; });
    D.muteBtn.classList.toggle('off', S.isMuted);
    toast(S.isMuted ? 'মাইক বন্ধ 🔇' : 'মাইক চালু 🎙️', 'ok');
  });
  D.camBtn.addEventListener('click', function () {
    if (!S.localStream) return;
    S.isCamOff = !S.isCamOff;
    S.localStream.getVideoTracks().forEach(function (t) { t.enabled = !S.isCamOff; });
    D.camBtn.classList.toggle('off', S.isCamOff);
    D.pipWrap.classList.toggle('off', S.isCamOff);
  });
  D.spkBtn.addEventListener('click', function () {
    S.speakerOn = !S.speakerOn;
    D.spkBtn.classList.toggle('off', !S.speakerOn);
    toast(S.speakerOn ? 'স্পিকার চালু 🔊' : 'স্পিকার বন্ধ', 'ok');
  });
  D.accBtn.addEventListener('click', acceptCall);
  D.rejBtn.addEventListener('click', rejectCall);
  D.chatCallBtn.addEventListener('click', function () {
    if (S.chatTarget) call(S.chatTarget.uid, 'audio');
  });
  D.chatVidBtn.addEventListener('click', function () {
    if (S.chatTarget) call(S.chatTarget.uid, 'video');
  });

  /* ---------- PWA ইনস্টল ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
  });
  function installApp() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
    } else {
      toast('ব্রাউজার মেনু (⋮) থেকে "Add to Home screen" দিন', 'ok');
    }
  }

  /* ---------- স্টার্টআপ ---------- */
  function hideBoot() {
    var b = q('#bootLoader');
    if (b) {
      b.classList.add('hide');
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 500);
    }
  }
  window.addEventListener('load', function () { setTimeout(hideBoot, 1500); });
  setTimeout(hideBoot, 6000);

  try {
    DB.init();
  } catch (e) {
    toast(e.message, 'err');
    hideBoot();
  }

  var firstAuth = true;
  DB.onAuth(function (u) {
    S.user = u;
    if (u) enterMain();
    else if (!firstAuth) showPhone();
    firstAuth = false;
    hideBoot();
  });

  window.addEventListener('beforeunload', function () {
    if (S.user) DB.setOff(S.user.uid);
  });
})();
