(function () {
  'use strict';

  var COUNTRIES = [
    ['BD','🇧🇩','বাংলাদেশ','+880'],['IN','🇮🇳','ভারত','+91'],['PK','🇵🇰','পাকিস্তান','+92'],
    ['LK','🇱🇰','শ্রীলঙ্কা','+94'],['NP','🇳🇵','নেপাল','+977'],['MM','🇲🇲','মিয়ানমার','+95'],
    ['AF','🇦🇫','আফগানিস্তান','+93'],['IR','🇮🇷','ইরান','+98'],['IQ','🇮🇶','ইরাক','+964'],
    ['SA','🇸🇦','সৌদি আরব','+966'],['AE','🇦🇪','ইউএই','+971'],['QA','🇶🇦','কাতার','+974'],
    ['KW','🇰🇼','কুয়েত','+965'],['BH','🇧🇭','বাহরাইন','+973'],['OM','🇴🇲','ওমান','+968'],
    ['YE','🇾🇪','ইয়েমেন','+967'],['TR','🇹🇷','তুরস্ক','+90'],['MY','🇲🇾','মালয়েশিয়া','+60'],
    ['SG','🇸🇬','সিঙ্গাপুর','+65'],['ID','🇮🇩','ইন্দোনেশিয়া','+62'],['TH','🇹🇭','থাইল্যান্ড','+66'],
    ['VN','🇻🇳','ভিয়েতনাম','+84'],['PH','🇵🇭','ফিলিপাইন','+63'],['KH','🇰🇭','কম্বোডিয়া','+855'],
    ['CN','🇨🇳','চীন','+86'],['JP','🇯🇵','জাপান','+81'],['KR','🇰🇷','দক্ষিণ কোরিয়া','+82'],
    ['GB','🇬🇧','যুক্তরাজ্য','+44'],['US','🇺🇸','যুক্তরাষ্ট্র','+1'],['CA','🇨🇦','কানাডা','+1'],
    ['AU','🇦🇺','অস্ট্রেলিয়া','+61'],['NZ','🇳🇿','নিউজিল্যান্ড','+64'],['FR','🇫🇷','ফ্রান্স','+33'],
    ['DE','🇩🇪','জার্মানি','+49'],['IT','🇮🇹','ইতালি','+39'],['ES','🇪🇸','স্পেন','+34'],
    ['NL','🇳🇱','নেদারল্যান্ডস','+31'],['RU','🇷🇺','রাশিয়া','+7'],['BR','🇧🇷','ব্রাজিল','+55'],
    ['MX','🇲🇽','মেক্সিকো','+52'],['SA2','🇸🇬','সৌদি','+966']
  ];

  function guessCountry() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      var m = { 'Asia/Dhaka':'BD','Asia/Kolkata':'IN','Asia/Karachi':'PK','Asia/Colombo':'LK',
        'Asia/Riyadh':'SA','Asia/Dubai':'AE','Asia/Kuala_Lumpur':'MY','Europe/London':'GB',
        'America/New_York':'US','Asia/Tokyo':'JP' };
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
    ccCountry: null, pendingReg: null,
    emailCode: null, codeExp: 0, resendTimer: null, resendSec: 60,
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
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    iceCandidatePoolSize: 4
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
    otpBack: q('#otpBack'), otpPhone: q('#otpPhone'), otpInputs: q('#otpInputs'),
    verifyOtpBtn: q('#verifyOtpBtn'), resendBtn: q('#resendBtn'), resendTimer: q('#resendTimer'),
    tabChats: q('#tabChats'), tabCalls: q('#tabCalls'), tabContacts: q('#tabContacts'),
    dialFab: q('#dialFab'), dialBack: q('#dialBack'), dialNumIn: q('#dialNumIn'),
    keypad: q('#keypad'), dialSearchBtn: q('#dialSearchBtn'), dialResult: q('#dialResult'),
    chatAv: q('#chatAv'), chatNameH: q('#chatNameH'), chatStatusP: q('#chatStatusP'),
    chatBackBtn: q('#chatBackBtn'), chatCallBtn: q('#chatCallBtn'), chatVidBtn: q('#chatVidBtn'),
    msgsC: q('#msgsC'), chatTa: q('#chatTa'), sendMsgBtn: q('#sendMsgBtn'),
    attachBtn: q('#attachBtn'), imgInput: q('#imgInput'), micBtn: q('#micBtn'),
    recBar: q('#recBar'), recTime: q('#recTime'), recCancel: q('#recCancel'), recSend: q('#recSend'),
    setBackBtn: q('#setBackBtn'), setList: q('#setList'), setAvInput: q('#setAvInput'),
    callBg: q('#callBg'), callVid: q('#callVid'), remVid: q('#remVid'), locVid: q('#locVid'), pipWrap: q('#pipWrap'),
    remAudio: q('#remAudio'),
    callInfo: q('#callInfo'), callAv: q('#callAv'), callNameH: q('#callNameH'), callStTxt: q('#callStTxt'), callTimer: q('#callTimer'), ringCircles: q('#ringCircles'),
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
    console.error('পূর্ণ ত্রুটি:', e);
    var code = e && e.code ? e.code : '';
    var map = {
      'emailjs/not-configured': 'config.js-এ EmailJS-এর ৩টা কী বসান',
      'permission-denied': 'Firestore Rules ঠিক করে Publish করুন',
      'auth/email-already-in-use': 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে — লগইন করুন',
      'auth/invalid-email': 'ভুল ইমেইল ফরম্যাট',
      'auth/weak-password': 'পাসওয়ার্ড দুর্বল — কমপক্ষে ৬ অক্ষর',
      'auth/user-not-found': 'এই ইমেইলে অ্যাকাউন্ট নেই',
      'auth/wrong-password': 'ভুল পাসওয়ার্ড',
      'auth/invalid-credential': 'ইমেইল বা পাসওয়ার্ড ভুল',
      'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, পরে চেষ্টা করুন',
      'auth/network-request-failed': 'ইন্টারনেট সমস্যা',
      'auth/unauthorized-domain': 'Firebase Console-এ ডোমেইন যোগ করুন'
    };
    var detail = code || (e && (e.message || e.text)) || 'অজানা';
    return map[code] || ('ত্রুটি: ' + detail);
  }

  function go(from, to, cls) {
    from.classList.remove('on');
    to.classList.remove('from-l', 'slide-up');
    if (cls) to.classList.add(cls);
    requestAnimationFrame(function () { to.classList.add('on'); });
  }
  function back(from, to) {
    from.classList.remove('on');
    to.classList.remove('from-l', 'slide-up');
    to.classList.add('from-l');
    requestAnimationFrame(function () { to.classList.add('on'); });
  }
  function hideAllScreens() {
    qa('.scr').forEach(function (s) { s.classList.remove('on', 'from-l', 'slide-up'); });
  }

  function fmtTime(s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function fmtDate(ts) {
    var d = new Date(ts), today = new Date();
    if (d.toDateString() === today.toDateString()) return 'আজ';
    var y = new Date(today); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'গতকাল';
    return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
  }
  function fmtTimeShort(ts) { return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true }); }
  function findUser(uid) { return S.users.find(function (u) { return u.id === uid; }); }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function avatarOf(u) { return u && u.avatar ? u.avatar : DB.uiAvatar(u ? u.name : 'U'); }

  function enableSec() {
    D.secOv.classList.add('on');
    document.addEventListener('keydown', function (e) {
      if (e.key === 'PrintScreen') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') e.preventDefault();
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('selectstart', function (e) { if (!e.target.closest('input,textarea')) e.preventDefault(); });
  }
  function disableSec() { D.secOv.classList.remove('on'); }

  function playRing() {
    stopRing();
    try {
      var c = S.ringCtx = new (window.AudioContext || window.webkitAudioContext)();
      var i = 0;
      function p() {
        if (!S.ringCtx) return;
        var o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = 'sine';
        o.frequency.value = [523, 659][i++ % 2];
        g.gain.setValueAtTime(0.06, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
        o.start(c.currentTime); o.stop(c.currentTime + 0.5);
      }
      p();
      S.ringIv = setInterval(p, 1100);
    } catch (e) {}
  }
  function stopRing() {
    if (S.ringIv) { clearInterval(S.ringIv); S.ringIv = null; }
    if (S.ringCtx) { try { S.ringCtx.close(); } catch (e) {} S.ringCtx = null; }
  }
  function playTone(f1, f2, dur) {
    try {
      var c = new (window.AudioContext || window.webkitAudioContext)();
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.type = 'sine';
      o.frequency.setValueAtTime(f1, c.currentTime);
      o.frequency.linearRampToValueAtTime(f2, c.currentTime + dur * 0.6);
      g.gain.setValueAtTime(0.05, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.start(c.currentTime); o.stop(c.currentTime + dur);
    } catch (e) {}
  }

  var otpInputs = qa('#otpInputs input');
  otpInputs.forEach(function (inp, i) {
    inp.addEventListener('input', function () { if (inp.value && i < 5) otpInputs[i + 1].focus(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !inp.value && i > 0) { otpInputs[i - 1].focus(); otpInputs[i - 1].value = ''; }
    });
  });
  function getOTP() { return Array.from(otpInputs).map(function (i) { return i.value; }).join(''); }
  function clearOTP() { otpInputs.forEach(function (i) { i.value = ''; }); otpInputs[0].focus(); }

  function startResendTimer() {
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

  /* ============ কান্ট্রি সিলেক্টর ============ */
  function setCountry(c) {
    S.ccCountry = c;
    D.ccFlag.textContent = c[1];
    D.ccCode.textContent = c[3];
  }

  function renderCountryList(term) {
    var t = (term || '').toLowerCase();
    var html = '';
    COUNTRIES.forEach(function (c) {
      if (t && c[2].toLowerCase().indexOf(t) === -1 && c[3].indexOf(t) === -1 && c[0].toLowerCase() !== t) return;
      html += '<div class="cc-item" data-cc="' + c[0] + '"><span class="fl">' + c[1] + '</span><span class="nm">' + esc(c[2]) + '</span><span class="dl">' + c[3] + '</span></div>';
    });
    D.ccList.innerHTML = html || '<div class="empty-st"><p>পাওয়া যায়নি</p></div>';
  }

  /* দেশ লিস্টে ট্যাপ — ডেলিগেশন */
  D.ccList.addEventListener('click', function (e) {
    var it = e.target.closest('.cc-item');
    if (!it) return;
    var c = COUNTRIES.find(function (x) { return x[0] === it.getAttribute('data-cc'); });
    if (c) setCountry(c);
    D.ccOv.classList.remove('on');
  });

  setCountry(guessCountry());

  D.ccBtn.addEventListener('click', function () {
    D.ccSearchIn.value = '';
    renderCountryList('');
    D.ccOv.classList.add('on');
  });
  D.ccClose.addEventListener('click', function () { D.ccOv.classList.remove('on'); });
  D.ccSearchIn.addEventListener('input', function () { renderCountryList(D.ccSearchIn.value); });

  /* ============ EmailJS ============ */
  function emailJsReady() {
    return typeof emailjs !== 'undefined' && _C.email && _C.email.publicKey &&
      _C.email.serviceId && _C.email.templateId &&
      String(_C.email.publicKey).indexOf('YOUR') !== 0 &&
      String(_C.email.serviceId).indexOf('YOUR') !== 0 &&
      String(_C.email.templateId).indexOf('YOUR') !== 0;
  }

  async function sendCodeViaEmail() {
    if (!emailJsReady()) {
      var e = new Error('EmailJS কনফিগার নেই — config.js ঠিক করুন');
      e.code = 'emailjs/not-configured';
      throw e;
    }
    S.emailCode = String(Math.floor(100000 + Math.random() * 900000));
    S.codeExp = Date.now() + 10 * 60 * 1000;

    var params = {
      to_email: S.pendingReg.email,
      email: S.pendingReg.email,
      user_email: S.pendingReg.email,
      recipient: S.pendingReg.email,
      reply_to: S.pendingReg.email,
      to_name: S.pendingReg.name,
      name: S.pendingReg.name,
      user_name: S.pendingReg.name,
      code: S.emailCode,
      passcode: S.emailCode,
      otp: S.emailCode,
      token: S.emailCode,
      time: '10',
      subject: 'Personal Call ভেরিফিকেশন কোড',
      app_name: 'Personal Call'
    };

    await emailjs.send(_C.email.serviceId, _C.email.templateId, params, { publicKey: _C.email.publicKey });
  }

  /* ============ রেজিস্ট্রেশন ============ */
  D.regBtn.addEventListener('click', async function () {
    var name = D.nameIn.value.trim();
    var nnum = D.phoneIn.value.replace(/\D/g, '');
    var full = S.ccCountry ? S.ccCountry[3] + nnum : nnum;
    var email = D.regEmailIn.value.trim();
    var pass = D.regPassIn.value;

    if (!name) { toast('নাম দিন', 'err'); return; }
    if (nnum.length < 6 || nnum.length > 14) { toast('সঠিক মোবাইল নম্বর দিন (শুধু সংখ্যা)', 'err'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('সঠিক ইমেইল দিন', 'err'); return; }
    if (pass.length < 6) { toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর', 'err'); return; }

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
      toast('ইমেইল পাঠানো হচ্ছে...', 'ok');
      await sendCodeViaEmail();

      D.otpPhone.textContent = email;
      clearOTP();
      go(D.phoneScr, D.otpScr);
      startResendTimer();
      toast('কোড আপনার ইমেইলে পাঠানো হয়েছে 📧', 'ok');
    } catch (e) {
      toast(errMsG(e), 'err');
    }

    D.regBtn.disabled = false;
    D.regBtn.textContent = 'রেজিস্টার করুন (ইমেইলে কোড যাবে)';
  });

  D.verifyOtpBtn.addEventListener('click', async function () {
    var code = getOTP();
    if (code.length !== 6) { toast('৬ সংখ্যার কোড দিন', 'err'); return; }
    if (Date.now() > S.codeExp) { toast('কোডের মেয়াদ শেষ — আবার পাঠান', 'err'); return; }

    D.verifyOtpBtn.disabled = true;
    D.verifyOtpBtn.innerHTML = '<span class="sp"></span>';

    try {
      if (code !== S.emailCode) {
        toast('ভুল কোড, ইমেইলটা আবার দেখুন', 'err');
      } else {
        var r = S.pendingReg;
        S.user = await DB.registerAccount(r.name, r.phone, r.email, r.pass);
        S.pendingReg = null; S.emailCode = null;
        clearInterval(S.resendTimer);
        toast('অ্যাকাউন্ট তৈরি হয়েছে! 🎉', 'ok');
        enterMain();
      }
    } catch (e) {
      toast(errMsG(e), 'err');
    }

    D.verifyOtpBtn.disabled = false;
    D.verifyOtpBtn.textContent = 'ভেরিফাই করুন';
  });

  D.resendBtn.addEventListener('click', async function () {
    try {
      await sendCodeViaEmail();
      startResendTimer(); clearOTP();
      toast('নতুন কোড ইমেইলে পাঠানো হয়েছে', 'ok');
    } catch (e) { toast(errMsG(e), 'err'); }
  });

  D.otpBack.addEventListener('click', function () { back(D.otpScr, D.phoneScr); });

  /* ============ লগইন ============ */
  D.showEmailLogin.addEventListener('click', function () { go(D.phoneScr, D.emailScr, 'from-l'); });
  D.emailBack.addEventListener('click', function () { back(D.emailScr, D.phoneScr); });

  D.loginBtn.addEventListener('click', async function () {
    var email = D.loginEmailIn.value.trim();
    var pass = D.loginPassIn.value;
    if (!email || !pass) { toast('ইমেইল ও পাসওয়ার্ড দিন', 'err'); return; }
    D.loginBtn.disabled = true;
    D.loginBtn.innerHTML = '<span class="sp"></span>';
    try {
      S.user = await DB.emailLogin(email, pass);
      toast('সফলভাবে লগইন হয়েছে', 'ok');
      enterMain();
    } catch (e) { toast(errMsG(e), 'err'); }
    D.loginBtn.disabled = false;
    D.loginBtn.textContent = 'লগইন করুন';
  });

  /* ============ মূল স্ক্রিন ============ */
  function enterMain() {
    hideAllScreens();
    clearInterval(S.resendTimer);
    D.resendBtn.disabled = true;
    clearOTP();

    enableSec();
    DB.setOn(S.user.uid);

    S.unsubUsers = DB.onUsers(S.user.uid, function (users) {
      S.users = users;
      renderChatList(); renderContacts();
    });
    S.chatListUnsub = DB.onChatList(S.user.uid, function (chats) {
      S.chatList = chats; renderChatList();
    });
    S.contactsUnsub = DB.onContacts(S.user.uid, function (cs) {
      S.contacts = cs; renderContacts();
    });
    S.historyUnsub = DB.onCallHistory(S.user.uid, function (h) {
      S.callHistory = h; renderCallHistory();
    });
    S.unsubCalls = DB.onIncCall(S.user.uid, handleIncomingCall);

    requestAnimationFrame(function () { D.mainScr.classList.add('on'); });
  }

  var CALL_SVG = '<svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>';
  var VID_SVG = '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
  var CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  var DEL_SVG = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
  var CAM_SVG = '<svg viewBox="0 0 24 24"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>';

  /* ================================================================
     ★ চ্যাট লিস্ট — ডেলিগেশন দিয়ে (ট্যাপ এখন সবসময় কাজ করবে) ★
     ================================================================ */
  function renderChatList() {
    var html = '';
    if (S.chatList.length === 0) {
      if (S.users.length === 0) {
        html = '<div class="empty-st"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg><p>এখনো কোনো ব্যবহারকারী নেই।<br>নিচের 📞 বাটনে চাপ দিয়ে নম্বর ডায়াল করুন</p></div>';
      } else {
        S.users.forEach(function (u) {
          html += '<div class="chat-row" data-uid="' + u.id + '">' +
            '<img class="av" src="' + esc(avatarOf(u)) + '" alt="">' +
            '<div class="det"><h4>' + esc(u.name) + '</h4><p>' + (u.online ? 'অনলাইন' : 'অফলাইন') + '</p></div></div>';
        });
      }
    } else {
      S.chatList.forEach(function (chat) {
        var parts = chat.parts;
        var otherUid = parts[0] === S.user.uid ? parts[1] : parts[0];
        var u = findUser(otherUid);
        if (!u) return;
        var lastTxt = chat.lastMsg ? chat.lastMsg.text : 'কোনো মেসেজ নেই';
        var lastTime = chat.lastMsg && chat.lastMsg.ts ? fmtTimeShort(chat.lastMsg.ts) : '';
        var tickHtml = (chat.lastMsg && chat.lastMsg.sid === S.user.uid) ? '<span class="tick">\u2713\u2713</span>' : '';
        html += '<div class="chat-row" data-uid="' + u.id + '">' +
          '<img class="av" src="' + esc(avatarOf(u)) + '" alt="">' +
          '<div class="det"><h4>' + esc(u.name) + ' ' + tickHtml + '</h4><p>' + esc(lastTxt) + '</p></div>' +
          '<div class="meta"><span class="time">' + lastTime + '</span></div></div>';
      });
      var chattedUids = S.chatList.map(function (c) {
        var p = c.parts; return p[0] === S.user.uid ? p[1] : p[0];
      });
      S.users.forEach(function (u) {
        if (chattedUids.indexOf(u.id) === -1) {
          html += '<div class="chat-row" data-uid="' + u.id + '">' +
            '<img class="av" src="' + esc(avatarOf(u)) + '" alt="">' +
            '<div class="det"><h4>' + esc(u.name) + '</h4><p>চ্যাট শুরু করুন</p></div></div>';
        }
      });
    }
    D.tabChats.innerHTML = html;
  }

  /* ★ চ্যাট লিস্ট ট্যাপ — একবার বসানো, HTML রিফ্রেশেও মরে না ★ */
  D.tabChats.addEventListener('click', function (e) {
    var row = e.target.closest('.chat-row');
    if (row && row.getAttribute('data-uid')) openChat(row.getAttribute('data-uid'));
  });

  function renderContacts() {
    var html = '<div class="sec-label">আমার কন্টাক্ট (' + S.contacts.length + ')</div>';
    if (S.contacts.length === 0) {
      html += '<div class="empty-st"><p>নিচের <b>📞</b> বাটনে চাপ দিয়ে<br>নম্বর ডায়াল করে কন্টাক্ট সেভ করুন</p></div>';
    }
    S.contacts.forEach(function (c) {
      var live = findUser(c.uid);
      var st = live ? (live.online ? 'অনলাইন' : 'অফলাইন') : 'অ্যাপে নেই';
      html += '<div class="chat-row" data-uid="' + c.uid + '">' +
        '<img class="av" src="' + esc(avatarOf(c)) + '" alt="">' +
        '<div class="det"><h4>' + esc(c.name) + '</h4><p>' + esc(c.phone || '') + ' • ' + st + '</p></div>' +
        '<button class="mini-act" data-act="audio">' + CALL_SVG + '</button>' +
        '<button class="mini-act" data-act="video">' + VID_SVG + '</button>' +
        '<button class="mini-act red" data-act="del">' + DEL_SVG + '</button>' +
        '</div>';
    });
    D.tabContacts.innerHTML = html;
  }

  /* ★ কন্টাক্ট ট্যাপ — ডেলিগেশন ★ */
  D.tabContacts.addEventListener('click', function (e) {
    var row = e.target.closest('.chat-row');
    if (!row) return;
    var uid = row.getAttribute('data-uid');
    if (!uid) return;
    var btn = e.target.closest('.mini-act');
    if (btn) {
      var act = btn.getAttribute('data-act');
      if (act === 'del') { DB.removeContact(S.user.uid, uid); toast('কন্টাক্ট মুছে ফেলা হয়েছে', 'ok'); return; }
      if (!findUser(uid)) { toast('এই নম্বরের মালিক এখনো অ্যাপে জয়েন করেনি', 'err'); return; }
      startCall(uid, act === 'video' ? 'video' : 'audio');
      return;
    }
    openChat(uid);
  });

  function renderCallHistory() {
    var html = '<div class="sec-label">সাম্প্রতিক কল</div>';
    if (S.callHistory.length === 0) {
      html += '<div class="empty-st"><p>এখনো কোনো কল হয়নি</p></div>';
    }
    S.callHistory.forEach(function (h) {
      var col = h.status === 'completed' ? 'var(--wa-teal)' : 'var(--wa-danger)';
      var dirTxt = h.dir === 'out' ? 'আউটগোয়িং' : (h.status === 'completed' ? 'ইনকামিং' : 'মিসড কল');
      var statusTxt = h.status === 'completed' && h.dur ? dirTxt + ' • ' + fmtTime(h.dur) : dirTxt;
      html += '<div class="chat-row" data-uid="' + h.withUid + '" data-type="' + (h.type || 'audio') + '">' +
        '<img class="av" src="' + esc(h.avatar || DB.uiAvatar(h.name)) + '" alt="">' +
        '<div class="det"><h4>' + esc(h.name) + '</h4><p style="color:' + col + '">' + statusTxt + '</p></div>' +
        '<div class="meta"><span class="time">' + (h.ts ? fmtDate(h.ts) : '') + '</span></div>' +
        '<button class="mini-act">' + CALL_SVG + '</button></div>';
    });
    D.tabCalls.innerHTML = html;
  }

  /* ★ কল হিস্ট্রি ট্যাপ — ডেলিগেশন ★ */
  D.tabCalls.addEventListener('click', function (e) {
    var row = e.target.closest('.chat-row');
    if (!row) return;
    var uid = row.getAttribute('data-uid');
    var type = row.getAttribute('data-type') || 'audio';
    if (!uid || !findUser(uid)) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }
    startCall(uid, type);
  });

  /* ================================================================
     ★ ডায়ালার — স্মার্ট: 01729904003 লিখলেও অটো +880 যোগ হয় ★
     ================================================================ */
  D.dialFab.addEventListener('click', function () { go(D.mainScr, D.dialScr, 'from-l'); });
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

    /* ★ স্মার্ট নরমালাইজ:
       +880... দিলে সরাসরি
       880... দিলে + যোগ
       017... বা 01... দিলে নিজের কান্ট্রি কোড যোগ (+880) */
    var num;
    if (raw.charAt(0) === '+') {
      num = raw;
    } else if (raw.charAt(0) === '8' && raw.length > 10) {
      num = '+' + raw;
    } else if (raw.charAt(0) === '0' && S.ccCountry) {
      num = S.ccCountry[3] + raw.substring(1);
    } else if (S.ccCountry) {
      num = S.ccCountry[3] + raw;
    } else {
      num = '+' + raw;
    }
    num = DB.normPhone(num);

    if (!/^\+\d{8,15}$/.test(num)) { toast('সঠিক নম্বর দিন (যেমন: 01729904003)', 'err'); return; }
    D.dialSearchBtn.disabled = true;
    D.dialSearchBtn.textContent = 'খোঁজা হচ্ছে...';
    D.dialResult.innerHTML = '';
    try {
      var u = await DB.findByPhone(num);
      if (!u) {
        D.dialResult.innerHTML = '<div class="dial-card"><p style="margin:0">এই নম্বরে কোনো অ্যাকাউন্ট নেই।<br><span style="font-size:12px">নম্বরটির মালিক অ্যাপে রেজিস্টার করলে দেখা যাবে</span></p></div>';
        return;
      }
      D.dialResult.innerHTML =
        '<div class="dial-card">' +
        '<img src="' + esc(avatarOf(u)) + '" alt="">' +
        '<h4>' + esc(u.name) + '</h4><p>' + esc(u.phone || num) + ' • ' + (u.online ? 'অনলাইন' : 'অফলাইন') + '</p>' +
        '<div class="dc-btns">' +
        '<button id="dcCall">' + CALL_SVG + ' কল</button>' +
        '<button id="dcVid">' + VID_SVG + ' ভিডিও</button>' +
        '</div>' +
        '<div class="dc-btns" style="margin-top:8px">' +
        '<button class="ghost" id="dcChat">' + CHAT_SVG + ' চ্যাট</button>' +
        '<button class="ghost" id="dcSave">💾 সেভ</button>' +
        '</div></div>';

      q('#dcCall').addEventListener('click', function () { startCall(u.id, 'audio'); });
      q('#dcVid').addEventListener('click', function () { startCall(u.id, 'video'); });
      q('#dcChat').addEventListener('click', function () { back(D.dialScr, D.mainScr); openChat(u.id); });
      q('#dcSave').addEventListener('click', async function () {
        var nm = prompt('কন্টাক্টের নাম দিন:', u.name);
        if (nm === null) return;
        try {
          await DB.addContact(S.user.uid, { id: u.id, name: nm.trim() || u.name, phone: u.phone, avatar: u.avatar });
          toast('কন্টাক্ট সেভ হয়েছে', 'ok');
        } catch (e) { toast('সেভ করা যায়নি', 'err'); }
      });
    } catch (e) {
      toast('খুঁজতে সমস্যা: ' + (e.message || ''), 'err');
    }
    D.dialSearchBtn.disabled = false;
    D.dialSearchBtn.textContent = '🔍 খুঁজুন / কল';
  });

  D.dialNumIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') D.dialSearchBtn.click(); });

  /* ================================================================
     চ্যাট + ছবি + ভয়েস
     ================================================================ */
  function toggleSendMic() {
    var has = D.chatTa.value.trim().length > 0;
    D.sendMsgBtn.style.display = has ? '' : 'none';
    D.micBtn.style.display = has ? 'none' : '';
  }

  function stopVoicePlayback() {
    if (S.playingAudio) {
      try { S.playingAudio.pause(); } catch (e) {}
      S.playingAudio = null;
    }
    if (S.playingBtn) {
      S.playingBtn.textContent = '▶';
      var fill = S.playingBtn.parentNode.querySelector('.vfill');
      if (fill) fill.style.width = '0';
      S.playingBtn = null;
    }
  }

  function openChat(uid) {
    var user = findUser(uid);
    if (!user) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }
    stopVoicePlayback();
    S.chatTarget = { type: 'dm', uid: uid, user: user };
    D.chatAv.src = avatarOf(user);
    D.chatNameH.textContent = user.name;
    D.chatStatusP.textContent = user.online ? 'অনলাইন' : 'অফলাইন';

    D.chatTa.value = '';
    D.sendMsgBtn.style.display = 'none';
    D.micBtn.style.display = '';
    D.recBar.style.display = 'none';

    var cid = DB.chatId(S.user.uid, uid);
    if (!S.chatMsgs[cid]) S.chatMsgs[cid] = [];
    renderMessages(cid);

    if (S.chatUnsub) S.chatUnsub();
    S.chatUnsub = DB.onMsgs(cid, function (changes) {
      changes.forEach(function (c) {
        if (c.t === 'added') {
          var exists = S.chatMsgs[cid].some(function (m) { return m._id === c.d._id; });
          if (!exists) S.chatMsgs[cid].push(c.d);
        }
      });
      renderMessages(cid);
    });

    if (S.typingUnsub) S.typingUnsub();
    S.typingUnsub = DB.onTyping(cid, S.user.uid, function (t) {
      D.chatStatusP.textContent = t ? 'টাইপ করছে...' : (user.online ? 'অনলাইন' : 'অফলাইন');
    });

    go(S.chatScr.classList.contains('on') ? D.chatScr : D.mainScr, D.chatScr, 'from-l');
  }

  function renderMessages(cid) {
    var msgs = S.chatMsgs[cid] || [];
    var html = '', lastDate = '';
    msgs.forEach(function (m) {
      var ds = fmtDate(m.timestamp);
      if (ds !== lastDate) { html += '<div class="date-sep"><span>' + ds + '</span></div>'; lastDate = ds; }
      var isOut = m.senderId === S.user.uid;
      var tickHtml = isOut ? '<span class="tick">\u2713\u2713</span>' : '';
      var body = '';

      if (m.type === 'image' && m.img) {
        body = '<img class="chat-img" src="' + esc(m.img) + '" data-full="' + esc(m.img) + '" alt="ছবি">';
      } else if (m.type === 'voice' && m.voice) {
        var vid = 'v' + (++S.voiceSeq);
        S.voiceMap[vid] = { b64: m.voice, mime: m.vmime || 'audio/webm', dur: m.dur || 0 };
        body = '<div class="vmsg"><button class="vplay" data-vid="' + vid + '">▶</button>' +
          '<div class="vbar"><div class="vfill"></div></div>' +
          '<span class="vdur">' + fmtTime(m.dur || 0) + '</span></div>';
      } else {
        body = esc(m.text);
      }

      html += '<div class="' + (isOut ? 'msg out' : 'msg in') + '">' +
        '<div class="bbl">' + body + '</div>' +
        '<div class="mt">' + fmtTimeShort(m.timestamp) + ' ' + tickHtml + '</div></div>';
    });
    D.msgsC.innerHTML = html;
    D.msgsC.scrollTop = D.msgsC.scrollHeight;
  }

  D.msgsC.addEventListener('click', function (e) {
    var vp = e.target.closest('.vplay');
    if (vp) {
      var vid = vp.getAttribute('data-vid');
      var v = S.voiceMap[vid];
      if (!v) return;
      stopVoicePlayback();
      var a = new Audio('data:' + v.mime + ';base64,' + v.b64);
      S.playingAudio = a;
      S.playingBtn = vp;
      vp.textContent = '⏸';
      var fill = vp.parentNode.querySelector('.vfill');
      a.ontimeupdate = function () {
        if (fill && a.duration) fill.style.width = ((a.currentTime / a.duration) * 100) + '%';
      };
      a.onended = function () { stopVoicePlayback(); };
      a.play().catch(function () { toast('প্লে করা যায়নি', 'err'); });
      return;
    }
    var im = e.target.closest('.chat-img');
    if (im) {
      D.imgViewerImg.src = im.getAttribute('data-full');
      D.imgViewer.classList.add('on');
    }
  });

  D.imgViewerClose.addEventListener('click', function () { D.imgViewer.classList.remove('on'); D.imgViewerImg.src = ''; });

  D.chatTa.addEventListener('input', function () {
    toggleSendMic();
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
    var text = D.chatTa.value.trim();
    if (!text || !S.chatTarget) return;
    var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
    DB.sendMsg(cid, { senderId: S.user.uid, text: text, timestamp: Date.now() });
    DB.clearTyping(cid, S.user.uid);
    D.chatTa.value = '';
    D.chatTa.style.height = 'auto';
    toggleSendMic();
  }

  /* ছবি পাঠানো */
  D.attachBtn.addEventListener('click', function () { D.imgInput.click(); });

  D.imgInput.addEventListener('change', async function () {
    var f = this.files[0];
    this.value = '';
    if (!f || !S.chatTarget) return;
    if (!/^image\//.test(f.type)) { toast('ছবি ফাইল দিন', 'err'); return; }

    toast('ছবি আপলোড হচ্ছে...', 'ok');
    try {
      var url = await DB.uploadImage(f, 1280);
      var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
      DB.sendMsg(cid, {
        senderId: S.user.uid,
        text: '📷 ছবি',
        img: url,
        type: 'image',
        timestamp: Date.now()
      });
      DB.clearTyping(cid, S.user.uid);
      toast('ছবি পাঠানো হয়েছে ✅', 'ok');
    } catch (e) {
      toast(e.message || 'ছবি পাঠানো যায়নি', 'err');
    }
  });

  /* ভয়েস রেকর্ডিং */
  D.micBtn.addEventListener('click', async function () {
    if (!S.chatTarget) return;
    if (typeof MediaRecorder === 'undefined') { toast('এই ব্রাউজারে ভয়েস রেকর্ড সাপোর্ট নেই', 'err'); return; }

    try {
      S.recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast('মাইক্রোফোনের অনুমতি দিন', 'err');
      return;
    }

    S.recMime = '';
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) { S.recMime = types[i]; break; }
    }

    try {
      S.mediaRecorder = S.recMime ? new MediaRecorder(S.recStream, { mimeType: S.recMime }) : new MediaRecorder(S.recStream);
    } catch (e) {
      toast('রেকর্ডার চালু হয়নি', 'err');
      S.recStream.getTracks().forEach(function (t) { t.stop(); });
      return;
    }

    S.recChunks = [];
    S.mediaRecorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) S.recChunks.push(e.data);
    };
    S.mediaRecorder.start();

    D.inputWrap.style.display = 'none';
    D.micBtn.style.display = 'none';
    D.recBar.style.display = 'flex';
    S.recStart = Date.now();
    D.recTime.textContent = '0:00';
    S.recTimerIv = setInterval(function () {
      var sec = Math.floor((Date.now() - S.recStart) / 1000);
      D.recTime.textContent = fmtTime(sec);
      if (sec >= 60) finishRecording(true);
    }, 500);
  });

  function stopRecorderUI() {
    clearInterval(S.recTimerIv);
    D.recBar.style.display = 'none';
    D.inputWrap.style.display = '';
    D.micBtn.style.display = D.chatTa.value.trim() ? 'none' : '';
  }

  function releaseMic() {
    if (S.recStream) {
      S.recStream.getTracks().forEach(function (t) { t.stop(); });
      S.recStream = null;
    }
  }

  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result.split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  async function finishRecording(send) {
    if (!S.mediaRecorder || S.mediaRecorder.state === 'inactive') { stopRecorderUI(); releaseMic(); return; }

    var dur = Math.max(1, Math.floor((Date.now() - S.recStart) / 1000));
    var mr = S.mediaRecorder;
    S.mediaRecorder = null;

    var stopped = new Promise(function (res) { mr.onstop = res; });
    try { mr.stop(); } catch (e) {}
    await stopped;
    releaseMic();
    stopRecorderUI();

    if (!send) { S.recChunks = []; toast('রেকর্ডিং বাতিল', 'ok'); return; }
    if (!S.recChunks.length) { S.recChunks = []; return; }

    var blob = new Blob(S.recChunks, { type: S.recMime || 'audio/webm' });
    S.recChunks = [];

    if (blob.size > 900000) { toast('ভয়েস খুব বড় — ছোট করে পাঠান', 'err'); return; }

    try {
      toast('ভয়েস পাঠানো হচ্ছে...', 'ok');
      var b64 = await blobToB64(blob);
      var cid = DB.chatId(S.user.uid, S.chatTarget.uid);
      DB.sendMsg(cid, {
        senderId: S.user.uid,
        text: '🎙️ ভয়েস মেসেজ',
        voice: b64,
        vmime: S.recMime || 'audio/webm',
        dur: dur,
        type: 'voice',
        timestamp: Date.now()
      });
      DB.clearTyping(cid, S.user.uid);
      toast('ভয়েস মেসেজ পাঠানো হয়েছে ✅', 'ok');
    } catch (e) {
      toast('ভয়েস পাঠানো যায়নি', 'err');
    }
  }

  D.recSend.addEventListener('click', function () { finishRecording(true); });
  D.recCancel.addEventListener('click', function () { finishRecording(false); });

  D.chatBackBtn.addEventListener('click', function () {
    if (S.chatUnsub) { S.chatUnsub(); S.chatUnsub = null; }
    if (S.typingUnsub) { S.typingUnsub(); S.typingUnsub = null; }
    if (S.mediaRecorder && S.mediaRecorder.state !== 'inactive') finishRecording(false);
    stopVoicePlayback();
    S.chatTarget = null;
    back(D.chatScr, D.mainScr);
  });

  qa('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      qa('.tab').forEach(function (t) { t.classList.remove('on'); });
      tab.classList.add('on');
      var target = tab.getAttribute('data-tab');
      D.tabChats.style.display = target === 'chats' ? '' : 'none';
      D.tabCalls.style.display = target === 'calls' ? '' : 'none';
      D.tabContacts.style.display = target === 'contacts' ? '' : 'none';
    });
  });

  /* ============ সেটিংস ============ */
  D.menuBtn.addEventListener('click', function () { renderSettings(); go(D.mainScr, D.setScr, 'from-l'); });
  D.setBackBtn.addEventListener('click', function () { back(D.setScr, D.mainScr); });

  function renderSettings() {
    var u = S.user;
    var html = '<div class="set-header">প্রোফাইল</div>';
    html += '<div class="set-item"><img src="' + esc(avatarOf(u)) + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover"><div class="si-text"><h4>' + esc(u.name) + '</h4><p>' + esc(u.phone || u.email || '') + '</p></div></div>';
    html += '<div class="set-item" id="photoItem"><div class="si-icon" style="background:var(--wa-teal)">' + CAM_SVG + '</div><div class="si-text"><h4>প্রোফাইল ছবি বদলান</h4><p>গ্যালারি থেকে ছবি দিয়ে সেভ করুন</p></div></div>';
    html += '<div class="set-item" id="editNameItem"><div class="si-icon" style="background:#3b82f6"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div><div class="si-text"><h4>নাম পরিবর্তন করুন</h4><p>আপনার নাম সেট করুন</p></div></div>';
    html += '<div class="set-divider"></div><div class="set-header">অ্যাকাউন্ট</div>';
    html += '<div class="set-item" id="logoutItem"><div class="si-icon" style="background:var(--wa-danger)"><svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg></div><div class="si-text"><h4>লগআউট</h4><p>অ্যাকাউন্ট থেকে বের হোন</p></div></div>';
    D.setList.innerHTML = html;

    q('#photoItem').addEventListener('click', function () { D.setAvInput.click(); });
    q('#editNameItem').addEventListener('click', function () {
      var newName = prompt('আপনার নাম:', u.name);
      if (newName && newName.trim()) {
        DB.updateProfile(u.uid, { name: newName.trim(), avatar: DB.uiAvatar(newName.trim()) });
        u.name = newName.trim();
        toast('নাম আপডেট হয়েছে', 'ok');
        renderSettings();
      }
    });

    q('#logoutItem').addEventListener('click', async function () {
      try {
        if (S.unsubUsers) S.unsubUsers();
        if (S.unsubCalls) S.unsubCalls();
        if (S.chatListUnsub) S.chatListUnsub();
        if (S.contactsUnsub) S.contactsUnsub();
        if (S.historyUnsub) S.historyUnsub();
        await DB.logout(S.user.uid);
        S.user = null; S.chatMsgs = {}; S.chatList = []; S.contacts = []; S.callHistory = [];
        disableSec();
        hideAllScreens();
        clearInterval(S.resendTimer);
        D.nameIn.value = ''; D.phoneIn.value = '';
        D.regEmailIn.value = ''; D.regPassIn.value = '';
        D.loginEmailIn.value = ''; D.loginPassIn.value = '';
        requestAnimationFrame(function () { D.phoneScr.classList.add('on'); });
        toast('লগআউট হয়েছে', 'ok');
      } catch (e) { toast('লগআউট ব্যর্থ', 'err'); }
    });
  }

  D.setAvInput.addEventListener('change', async function () {
    var f = this.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('ছবি ফাইল দিন', 'err'); return; }
    toast('ছবি আপলোড হচ্ছে...', 'ok');
    try {
      var url = await DB.uploadImage(f, 512);
      await DB.updateProfile(S.user.uid, { avatar: url });
      S.user.avatar = url;
      toast('প্রোফাইল ছবি সেভ হয়েছে ✅', 'ok');
      renderSettings();
    } catch (e) {
      toast(e.message || 'আপলোড ব্যর্থ', 'err');
    }
    this.value = '';
  });

  D.searchBtn.addEventListener('click', function () {
    var term = prompt('নাম বা নম্বর দিয়ে খুঁজুন:');
    if (!term) return;
    term = term.toLowerCase();
    D.tabChats.querySelectorAll('.chat-row').forEach(function (row) {
      var h4 = row.querySelector('h4');
      if (h4) row.style.display = h4.textContent.toLowerCase().includes(term) ? '' : 'none';
    });
    setTimeout(function () {
      D.tabChats.querySelectorAll('.chat-row').forEach(function (row) { row.style.display = ''; });
    }, 4000);
  });

  /* ============ রিয়েল WebRTC কল ============ */
  function cleanupPC() {
    if (S.candUnsub) { S.candUnsub(); S.candUnsub = null; }
    if (S.callUnsub) { S.callUnsub(); S.callUnsub = null; }
    if (S.pc) { try { S.pc.close(); } catch (e) {} S.pc = null; }
    if (S.localStream) { S.localStream.getTracks().forEach(function (t) { t.stop(); }); S.localStream = null; }
    clearTimeout(S.outTimeout); clearTimeout(S.incTimeout);
  }

  function resetCallUI() {
    D.locVid.srcObject = null;
    D.remVid.srcObject = null;
    D.remAudio.srcObject = null;
    D.callVid.style.display = 'none';
    D.callInfo.style.display = '';
    D.callTimer.style.display = 'none';
    D.ringCircles.style.display = 'none';
    D.muteBtn.classList.remove('off');
    D.camBtn.classList.remove('off');
    D.pipWrap.classList.remove('off');
    if (S.callTimerIv) { clearInterval(S.callTimerIv); S.callTimerIv = null; }
    D.callScr.classList.remove('on');
  }

  function createPC(callId, mySide) {
    var pc = new RTCPeerConnection(RTC_CFG);
    if (S.localStream) {
      S.localStream.getTracks().forEach(function (t) { pc.addTrack(t, S.localStream); });
    }
    pc.ontrack = function (e) {
      var remote = e.streams[0];
      if (S.callType === 'video') D.remVid.srcObject = remote;
      else D.remAudio.srcObject = remote;
    };
    pc.onicecandidate = function (e) {
      if (e.candidate) DB.addCandidate(callId, mySide, e.candidate.toJSON());
    };
    pc.onconnectionstatechange = function () {
      var st = pc.connectionState;
      if (st === 'connected') {
        S.wasConnected = true;
        stopRing();
        playTone(880, 1200, 0.25);
        D.callStTxt.textContent = 'সংযুক্ত';
        D.ringCircles.style.display = 'none';
        startCallTimer();
      } else if (st === 'failed') {
        toast('কানেকশন ব্যর্থ — নেটওয়ার্ক চেক করুন', 'err');
        endCall(true);
      }
    };
    return pc;
  }

  async function startCall(uid, type) {
    if (S.callActive) { toast('ইতিমধ্যে একটা কল চলছে', 'err'); return; }
    var user = findUser(uid);
    if (!user) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }

    S.callActive = true; S.callType = type; S.callPhase = 'calling';
    S.callTarget = user; S.iAmCaller = true; S.wasConnected = false;
    S.isMuted = false; S.isCamOff = false;

    D.callBg.style.backgroundImage = 'url(' + avatarOf(user) + ')';
    D.callAv.src = avatarOf(user);
    D.callNameH.textContent = user.name;
    D.callStTxt.textContent = 'কল করা হচ্ছে...';
    D.ringCircles.style.display = 'flex';
    D.callScr.classList.remove('slide-up');
    D.callScr.classList.add('on');

    try {
      S.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { facingMode: 'user' } : false
      });
      if (type === 'video') {
        D.locVid.srcObject = S.localStream;
        D.callVid.style.display = '';
        D.callInfo.style.display = 'none';
      }
    } catch (e) {
      toast('মাইক/ক্যামেরার অনুমতি দিন', 'err');
      cleanupPC(); resetCallUI();
      S.callActive = false; S.callPhase = 'idle';
      return;
    }

    var pc = S.pc = createPC('pending', 'caller');

    try {
      var offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(offer);

      S.callDocId = await DB.mkCall({
        callerId: S.user.uid, calleeId: uid,
        callerName: S.user.name, callerAvatar: S.user.avatar,
        calleeName: user.name, type: type
      }, { type: offer.type, sdp: offer.sdp });

      playRing();

      S.callUnsub = DB.watchCall(S.callDocId, async function (data) {
        if (data.status === 'rejected') {
          stopRing(); toast('কল কাটা হয়েছে', 'err'); endCall(false, true);
        } else if (data.status === 'ended' && !S.wasConnected) {
          stopRing(); toast('কেউ ধরেনি', 'err'); endCall(false, true);
        } else if (data.answer && !pc.currentRemoteDescription) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
          } catch (e) { console.error('setRemoteDescription:', e); }
        }
      });

      S.candUnsub = DB.onCandidates(S.callDocId, 'callee', function (c) {
        if (S.pc) S.pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
      });

      S.outTimeout = setTimeout(function () {
        if (S.callPhase !== 'idle' && !S.wasConnected) {
          DB.updCall(S.callDocId, { status: 'noanswer' });
          stopRing(); toast('কেউ ধরেনি', 'err');
          endCall(true, true);
        }
      }, 45000);
    } catch (e) {
      console.error('কল শুরু ব্যর্থ:', e);
      toast('কল শুরু করা যায়নি', 'err');
      cleanupPC(); resetCallUI();
      S.callActive = false; S.callPhase = 'idle';
    }
  }

  function startCallTimer() {
    if (S.callTimerIv) return;
    S.callStart = Date.now();
    D.callTimer.style.display = '';
    S.callTimerIv = setInterval(function () {
      D.callTimer.textContent = fmtTime(Math.floor((Date.now() - S.callStart) / 1000));
    }, 1000);
  }

  function handleIncomingCall(call) {
    if (S.callActive || S.callPhase === 'incoming') { DB.updCall(call.id, { status: 'busy' }); return; }

    S.callDocId = call.id;
    S.callType = call.type;
    S.callPhase = 'incoming';
    S.iAmCaller = false;
    S.wasConnected = false;
    S.callTarget = { uid: call.callerId, name: call.callerName, avatar: call.callerAvatar };

    D.incAv.src = call.callerAvatar || DB.uiAvatar(call.callerName);
    D.incName.textContent = call.callerName || 'অজানা';
    D.incType.textContent = call.type === 'video' ? 'ভিডিও কল' : 'অডিও কল';
    D.accIco.innerHTML = call.type === 'video' ? VID_SVG : CALL_SVG;

    D.incPop.classList.add('on');
    playRing();

    S.incTimeout = setTimeout(function () {
      if (S.callPhase === 'incoming') {
        D.incPop.classList.remove('on');
        stopRing();
        DB.updCall(call.id, { status: 'missed' });
        writeCallLog('in', 'missed', 0);
        S.callPhase = 'idle'; S.callDocId = null; S.callTarget = null;
      }
    }, 40000);
  }

  D.accBtn.addEventListener('click', async function () {
    if (S.callPhase !== 'incoming') return;
    D.incPop.classList.remove('on');
    stopRing();

    S.callActive = true;
    S.callPhase = 'answering';

    var t = S.callTarget || {};
    D.callBg.style.backgroundImage = 'url(' + (t.avatar || '') + ')';
    D.callAv.src = t.avatar || '';
    D.callNameH.textContent = t.name || '';
    D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
    D.ringCircles.style.display = 'none';
    D.callScr.classList.remove('slide-up');
    D.callScr.classList.add('on');

    try {
      S.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: S.callType === 'video' ? { facingMode: 'user' } : false
      });
      if (S.callType === 'video') {
        D.locVid.srcObject = S.localStream;
        D.callVid.style.display = '';
        D.callInfo.style.display = 'none';
      }
    } catch (e) {
      toast('মাইক/ক্যামেরার অনুমতি দিন', 'err');
      DB.updCall(S.callDocId, { status: 'rejected' });
      cleanupPC(); resetCallUI();
      S.callActive = false; S.callPhase = 'idle';
      return;
    }

    var pc = S.pc = createPC(S.callDocId, 'callee');

    try {
      var callDoc = await new Promise(function (res) {
        var un = DB.watchCall(S.callDocId, function (d) { un(); res(d); });
      });

      await pc.setRemoteDescription(new RTCSessionDescription(callDoc.offer));
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await DB.updCall(S.callDocId, { status: 'accepted', answer: { type: answer.type, sdp: answer.sdp } });

      S.candUnsub = DB.onCandidates(S.callDocId, 'caller', function (c) {
        if (S.pc) S.pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
      });

      S.callUnsub = DB.watchCall(S.callDocId, function (data) {
        if (data.status === 'ended' || data.status === 'noanswer') endCall(false, true);
      });

      D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
    } catch (e) {
      console.error('একসেপ্ট ব্যর্থ:', e);
      toast('কল একসেপ্ট করা যায়নি', 'err');
      DB.updCall(S.callDocId, { status: 'rejected' });
      cleanupPC(); resetCallUI();
      S.callActive = false; S.callPhase = 'idle';
    }
  });

  D.rejBtn.addEventListener('click', function () {
    if (S.callPhase !== 'incoming') return;
    D.incPop.classList.remove('on');
    stopRing();
    playTone(600, 300, 0.25);
    DB.updCall(S.callDocId, { status: 'rejected' });
    writeCallLog('in', 'rejected', 0);
    clearTimeout(S.incTimeout);
    S.callPhase = 'idle'; S.callDocId = null; S.callTarget = null;
  });

  function endCall(byRemote, skipLog) {
    var dur = S.wasConnected && S.callStart ? Math.floor((Date.now() - S.callStart) / 1000) : 0;
    if (!byRemote && S.callDocId) DB.updCall(S.callDocId, { status: 'ended' });
    if (!skipLog) writeCallLog(S.iAmCaller ? 'out' : 'in', S.wasConnected ? 'completed' : (S.iAmCaller ? 'noanswer' : 'missed'), dur);
    stopRing();
    playTone(600, 300, 0.25);
    cleanupPC();
    resetCallUI();
    S.callActive = false; S.callPhase = 'idle';
    S.callTarget = null; S.callDocId = null;
    S.wasConnected = false; S.callStart = null;
  }

  function writeCallLog(dir, status, dur) {
    if (!S.callTarget || !S.user) return;
    DB.addCallLog(S.user.uid, {
      withUid: S.callTarget.uid || S.callTarget.id,
      name: S.callTarget.name || 'অজানা',
      avatar: S.callTarget.avatar || DB.uiAvatar(S.callTarget.name),
      type: S.callType, dir: dir, status: status, dur: dur, ts: Date.now()
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
  D.spkBtn.addEventListener('click', function () { D.spkBtn.classList.toggle('off'); });

  D.chatCallBtn.addEventListener('click', function () { if (S.chatTarget && S.chatTarget.uid) startCall(S.chatTarget.uid, 'audio'); });
  D.chatVidBtn.addEventListener('click', function () { if (S.chatTarget && S.chatTarget.uid) startCall(S.chatTarget.uid, 'video'); });

  /* ============ ইনিশিয়ালাইজ ============ */
  try {
    DB.init();

    if (typeof emailjs !== 'undefined' && _C.email && _C.email.publicKey) {
      emailjs.init({ publicKey: _C.email.publicKey });
    }

    DB.onAuth(function (user) {
      if (user && !S.user) { S.user = user; enterMain(); }
    });
  } catch (e) {
    document.getElementById('phoneScr').innerHTML =
      '<div class="login-card">' +
      '<div class="login-logo"><svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>' +
      '<h1 style="color:var(--wa-danger)">সেটআপ ত্রুটি</h1>' +
      '<p class="sub">' + e.message + '</p></div>';
  }

  window.addEventListener('beforeunload', function () {
    if (S.user) DB.setOff(S.user.uid);
    if (S.callActive) endCall(true);
    stopRing();
  });

})();
