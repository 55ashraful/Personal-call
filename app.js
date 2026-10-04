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
        /* ★ অফলাইন: চ্যাট ফোনে সেভ থাকবে, নেট এলে অটো সিঙ্ক ★ */
    _d.enablePersistence({ synchronizeTabs: true }).catch(function () {});
    firebase.initializeApp(_C.fb);
    _a = firebase.auth();
    _d = firebase.firestore();
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

  async function findByPhone(ph) {
    ph = normPhone(ph);
    if (!/^\+\d{8,15}$/.test(ph)) return null;
    var s = await _d.collection('users').where('phone', '==', ph).limit(1).get();
    if (s.empty) return null;
    return { id: s.docs[0].id, ...s.docs[0].data() };
  }

  /* ★ একাধিক ফরম্যাটে একসাথে খোঁজা (+88017..., +880017... দুটোই) ★ */
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

    function onAuth(cb) {
    _a.onAuthStateChanged(async function (u) {
      if (u) {
        var d = await _d.collection('users').doc(u.uid).get();
        if (d.exists) cb({ uid: u.uid, ...d.data() });
        else {
          var nm = u.displayName || 'ব্যবহারকারী';
          cb({ uid: u.uid, name: nm, email: u.email || '', phone: '', avatar: uiAv(nm) });
        }
      } else {
        cb(null);
      }
    });
  }

  return {
    init: init, normPhone: normPhone, uiAv: uiAv, uploadImage: uploadImage,
    phoneExists: phoneExists, registerAccount: registerAccount, emailLogin: emailLogin,
    updateProfile: updateProfile, logout: logout, setOn: setOn, setOff: setOff,
    onUsers: onUsers, findByPhone: findByPhone, findByPhones: findByPhones,
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
    toast: q('#toast'), secOv: q('#secOverlay'),
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
    callBg: q('#callBg'), callVid: q('#callVid'), remVid: q('#remVid'), locVid: q('#locVid'), pipWrap: q('#pipWrap'),
    remAudio: q('#remAudio'),
    callInfo: q('#callInfo'), callAv: q('#callAv'), callNameH: q('#callNameH'), callStTxt: q('#callStTxt'), callTimer: q('#callTimer'), ringCircles: q('#ringCircles'),
    muteBtn: q('#muteBtn'), camBtn: q('#camBtn'), endBtn: q('#endBtn'),
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
    /* ★ ফিক্স: শুরুর শূন্য (0) কেটে দেশের কোড যোগ হয়
       01749799621 → +8801749799621 (আগে ভুলে +88001749799621 হতো) ★ */
    var natClean = nnum.replace(/^0+/, '');
    var full = S.ccCountry ? S.ccCountry[3] + natClean : '+' + natClean;
    var email = D.regEmailIn.value.trim();
    var pass = D.regPassIn.value;

    if (!name) { toast('নাম দিন', 'err'); return; }
    if (!natClean || natClean.length < 6 || natClean.length > 14) { toast('সঠিক মোবাইল নম্বর দিন (যেমন: 01749799621)', 'err'); return; }
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
    D.dialSub.textContent = '';
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
    /* ★ একাধিক ফরম্যাটে খোঁজা — পুরনো অ্যাকাউন্ট (ডাবল জিরোসহ) থাকলেও পাবে ★ */
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

    /* ★ খোঁজা নম্বর উপরে টপবারে দেখাবে ★ */
    D.dialSub.textContent = 'খোঁজা নম্বর: ' + tries[0];

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
    q('#lItem').onclick = async function () {
      if (S.unsubUsers) S.unsubUsers();
      if (S.unsubCalls) S.unsubCalls();
      if (S.chatListUnsub) S.chatListUnsub();
      if (S.contactsUnsub) S.contactsUnsub();
      if (S.historyUnsub) S.historyUnsub();
      await DB.logout(S.user.uid);
      S.user = null; S.chatMsgs = {}; S.chatList = []; S.contacts = []; S.callHistory = []; S.notified = {};
      hideAll();
      D.nameIn.value = ''; D.phoneIn.value = ''; D.regEmailIn.value = ''; D.regPassIn.value = '';
      D.loginEmailIn.value = ''; D.loginPassIn.value = '';
      requestAnimationFrame(function () { D.phoneScr.classList.add('on'); });
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
    D.callVid.style.display = 'none'; D.callInfo.style.display = '';
    D.callTimer.style.display = 'none'; D.ringCircles.style.display = 'none';
    D.muteBtn.classList.remove('off'); D.camBtn.classList.remove('off');
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
        D.ringCircles.style.display = 'none';
        startCT();
      } else if (pc.connectionState === 'failed') {
        toast('কানেকশন ব্যর্থ', 'err');
        endCall(true);
      }
    };
    return pc;
  }

  async function call(uid, type) {
    if (S.callActive) { toast('কল চলছে', 'err'); return; }
    var u = findU(uid);
    if (!u) { toast('ইউজার নেই', 'err'); return; }

    S.callActive = true; S.callType = type; S.callPhase = 'calling';
    S.callTarget = u; S.iAmCaller = true; S.wasConnected = false;
    S.isMuted = false; S.isCamOff = false;

    D.callBg.style.backgroundImage = 'url(' + avOf(u) + ')';
    D.callAv.src = avOf(u);
    D.callNameH.textContent = u.name;
    D.callStTxt.textContent = 'কল করা হচ্ছে...';
    D.ringCircles.style.display = 'flex';
    D.callScr.classList.add('on');

    try {
      S.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' ? { facingMode: 'user' } : false });
      if (type === 'video') {
        D.locVid.srcObject = S.localStream;
        D.callVid.style.display = ''; D.callInfo.style.display = 'none';
      }
    } catch (e) {
      toast('মাইক/ক্যামেরার অনুমতি দিন', 'err');
      cleanPC(); resetCall();
      S.callActive = false; S.callPhase = 'idle';
      return;
    }

    var pc = S.pc = mkPC('pending', 'caller');
    try {
      var off = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(off);
      S.callDocId = await DB.mkCall({
        callerId: S.user.uid, calleeId: uid,
        callerName: S.user.name, callerAvatar: S.user.avatar, type: type
      }, { type: off.type, sdp: off.sdp });

      playRing();
      S.callUnsub = DB.watchCall(S.callDocId, async function (d) {
        if (d.status === 'rejected') { stopRing(); toast('কল কাটা হয়েছে', 'err'); endCall(false, true); }
        else if (d.status === 'ended' && !S.wasConnected) { stopRing(); toast('কেউ ধরেনি', 'err'); endCall(false, true); }
        else if (d.answer && !pc.currentRemoteDescription) {
          try { await pc.setRemoteDescription(new RTCSessionDescription(d.answer)); D.callStTxt.textContent = 'সংযোগ হচ্ছে...'; } catch (e) {}
        }
      });
      S.candUnsub = DB.onCandidates(S.callDocId, 'callee', function (c) {
        if (S.pc) S.pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
      });
      S.outTimeout = setTimeout(function () {
        if (!S.wasConnected) {
          DB.updCall(S.callDocId, { status: 'noanswer' });
          stopRing(); toast('কেউ ধরেনি', 'err');
          endCall(true, true);
        }
      }, 45000);
    } catch (e) {
      toast('কল ব্যর্থ', 'err');
      cleanPC(); resetCall();
      S.callActive = false; S.callPhase = 'idle';
    }
  }

  function startCT() {
    if (S.callTimerIv) return;
    S.callStart = Date.now();
    D.callTimer.style.display = '';
    S.callTimerIv = setInterval(function () {
      D.callTimer.textContent = fmtT(Math.floor((Date.now() - S.callStart) / 1000));
    }, 1000);
  }

  function incoming(c) {
    if (S.callActive || S.callPhase === 'incoming') { DB.updCall(c.id, { status: 'busy' }); return; }
    S.callDocId = c.id; S.callType = c.type; S.callPhase = 'incoming';
    S.iAmCaller = false; S.wasConnected = false;
    S.callTarget = { uid: c.callerId, name: c.callerName, avatar: c.callerAvatar };

    D.incAv.src = c.callerAvatar || DB.uiAv(c.callerName);
    D.incName.textContent = c.callerName || 'অজানা';
    D.incType.textContent = c.type === 'video' ? 'ভিডিও কল' : 'অডিও কল';
    D.incPop.classList.add('on');
    playRing();
    showNotif('📞 ইনকামিং ' + (c.type === 'video' ? 'ভিডিও' : 'অডিও') + ' কল', c.callerName || 'অজানা', 'c' + c.id);
    vibrate([600, 300, 600, 300, 600]);

    S.incTimeout = setTimeout(function () {
      if (S.callPhase === 'incoming') {
        D.incPop.classList.remove('on');
        stopRing();
        DB.updCall(c.id, { status: 'missed' });
        wLog('in', 'missed', 0);
        S.callPhase = 'idle'; S.callDocId = null; S.callTarget = null;
      }
    }, 40000);
  }

  D.accBtn.addEventListener('click', async function () {
    if (S.callPhase !== 'incoming') return;
    D.incPop.classList.remove('on');
    stopRing();
    S.callActive = true; S.callPhase = 'answering';
    var t = S.callTarget || {};
    D.callBg.style.backgroundImage = 'url(' + (t.avatar || '') + ')';
    D.callAv.src = t.avatar || '';
    D.callNameH.textContent = t.name || '';
    D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
    D.ringCircles.style.display = 'none';
    D.callScr.classList.add('on');

    try {
      S.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: S.callType === 'video' ? { facingMode: 'user' } : false });
      if (S.callType === 'video') {
        D.locVid.srcObject = S.localStream;
        D.callVid.style.display = ''; D.callInfo.style.display = 'none';
      }
    } catch (e) {
      toast('মাইক/ক্যামেরার অনুমতি দিন', 'err');
      DB.updCall(S.callDocId, { status: 'rejected' });
      cleanPC(); resetCall();
      S.callActive = false; S.callPhase = 'idle';
      return;
    }

    var pc = S.pc = mkPC(S.callDocId, 'callee');
    try {
      var doc = await new Promise(function (r) {
        var un = DB.watchCall(S.callDocId, function (d) { un(); r(d); });
      });
      await pc.setRemoteDescription(new RTCSessionDescription(doc.offer));
      var ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await DB.updCall(S.callDocId, { status: 'accepted', answer: { type: ans.type, sdp: ans.sdp } });
      S.candUnsub = DB.onCandidates(S.callDocId, 'caller', function (c) {
        if (S.pc) S.pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
      });
      S.callUnsub = DB.watchCall(S.callDocId, function (d) {
        if (d.status === 'ended' || d.status === 'noanswer') endCall(false, true);
      });
    } catch (e) {
      toast('একসেপ্ট ব্যর্থ', 'err');
      DB.updCall(S.callDocId, { status: 'rejected' });
      cleanPC(); resetCall();
      S.callActive = false; S.callPhase = 'idle';
    }
  });

  D.rejBtn.addEventListener('click', function () {
    if (S.callPhase !== 'incoming') return;
    D.incPop.classList.remove('on');
    stopRing();
    DB.updCall(S.callDocId, { status: 'rejected' });
    wLog('in', 'rejected', 0);
    clearTimeout(S.incTimeout);
    S.callPhase = 'idle'; S.callDocId = null; S.callTarget = null;
  });

  function endCall(byRemote, skipLog) {
    var dur = S.wasConnected && S.callStart ? Math.floor((Date.now() - S.callStart) / 1000) : 0;
    if (!byRemote && S.callDocId) DB.updCall(S.callDocId, { status: 'ended' });
    if (!skipLog) wLog(S.iAmCaller ? 'out' : 'in', S.wasConnected ? 'completed' : (S.iAmCaller ? 'noanswer' : 'missed'), dur);
    stopRing(); tone(600, 300, 0.25);
    cleanPC(); resetCall();
    S.callActive = false; S.callPhase = 'idle';
    S.callTarget = null; S.callDocId = null;
    S.wasConnected = false; S.callStart = null;
  }

  function wLog(dir, st, dur) {
    if (!S.callTarget || !S.user) return;
    DB.addCallLog(S.user.uid, {
      withUid: S.callTarget.uid, name: S.callTarget.name || 'অজানা',
      avatar: S.callTarget.avatar || DB.uiAv(S.callTarget.name),
      type: S.callType, dir: dir, status: st, dur: dur, ts: Date.now()
    });
  }

  D.endBtn.addEventListener('click', function () { endCall(true); });
  D.muteBtn.addEventListener('click', function () {
    S.isMuted = !S.isMuted;
    D.muteBtn.classList.toggle('off', S.isMuted);
    if (S.localStream) S.localStream.getAudioTracks().forEach(function (t) { t.enabled = !S.isMuted; });
  });
  D.camBtn.addEventListener('click', function () {
    S.isCamOff = !S.isCamOff;
    D.camBtn.classList.toggle('off', S.isCamOff);
    if (S.localStream) S.localStream.getVideoTracks().forEach(function (t) { t.enabled = !S.isCamOff; });
    D.pipWrap.classList.toggle('off', S.isCamOff);
  });
  D.chatCallBtn.addEventListener('click', function () { if (S.chatTarget) call(S.chatTarget.uid, 'audio'); });
  D.chatVidBtn.addEventListener('click', function () { if (S.chatTarget) call(S.chatTarget.uid, 'video'); });
     /* ★ লোডিং স্ক্রিন সরানো ★ */
  function hideBoot() {
    var b = document.getElementById('bootLoader');
    if (b) b.style.display = 'none';
  }
  setTimeout(hideBoot, 8000); /* নিরাপত্তা: সবচেয়ে খারাপেও ৮ সেকেন্ডে সরবে */

  window.addEventListener('offline', function () { toast('📴 অফলাইন — মেসেজ সেভ হবে, নেট এলে পাঠানো হবে', 'ok'); });
  window.addEventListener('online', function () { toast('📶 অনলাইন — সিঙ্ক হচ্ছে', 'ok'); });
   
  /* ইনিশিয়ালাইজ */
  try {
    DB.init();
    if (typeof emailjs !== 'undefined' && _C.email && _C.email.publicKey) {
      emailjs.init({ publicKey: _C.email.publicKey });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
     DB.onAuth(function (u) {
      hideBoot();
      if (u && !S.user) { S.user = u; enterMain(); }
      /* u == null হলে রেজিস্ট্রেশন স্ক্রিন দেখাবে (ডিফল্ট খোলা থাকে) */
    });
  } catch (e) {
    var t = document.getElementById('toast');
    if (t) { t.textContent = 'সেটআপ ত্রুটি: ' + e.message; t.className = 'show err'; }
  }

    document.title = 'Personal Call • v10';

  window.addEventListener('beforeunload', function () {
    if (S.user) DB.setOff(S.user.uid);
    if (S.callActive) endCall(true);
    stopRing();
  });

})();
