(function () {
  'use strict';

  var S = {
    user: null,
    users: [],
    chatList: [],
    chatMsgs: {},
    contacts: [],
    callHistory: [],
    groups: [],
    chatTarget: null,
    chatUnsub: null,
    typingUnsub: null,
    typingTimeout: null,
    chatListUnsub: null,
    contactsUnsub: null,
    historyUnsub: null,
    unsubUsers: null,
    unsubCalls: null,
    dialUser: null,
    /* কল */
    callActive: false,
    callType: 'video',
    callPhase: 'idle',
    callTarget: null,
    callDocId: null,
    iAmCaller: false,
    wasConnected: false,
    pc: null,
    callUnsub: null,
    candUnsub: null,
    outTimeout: null,
    incTimeout: null,
    isMuted: false,
    isCamOff: false,
    callStart: null,
    callTimerIv: null,
    localStream: null,
    ringCtx: null,
    ringIv: null,
    resendTimer: null,
    resendSec: 60,
    verificationId: null,
    phoneNum: '',
    isEmailReg: false
  };

  /* STUN + ফ্রি TURN — NAT-এর পেছনেও কানেক্ট হওয়ার সম্ভাবনা বাড়ায় */
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
    phoneIn: q('#phoneIn'), sendOtpBtn: q('#sendOtpBtn'), googleLoginBtn: q('#googleLoginBtn'), showEmailLogin: q('#showEmailLogin'),
    emailBack: q('#emailBack'), emailNameGrp: q('#emailNameGrp'), emailNameIn: q('#emailNameIn'),
    emailAddrIn: q('#emailAddrIn'), emailPassIn: q('#emailPassIn'), emailSubmitBtn: q('#emailSubmitBtn'), toggleEmailReg: q('#toggleEmailReg'),
    otpBack: q('#otpBack'), otpPhone: q('#otpPhone'), otpInputs: q('#otpInputs'),
    verifyOtpBtn: q('#verifyOtpBtn'), resendBtn: q('#resendBtn'), resendTimer: q('#resendTimer'),
    tabChats: q('#tabChats'), tabCalls: q('#tabCalls'), tabContacts: q('#tabContacts'),
    dialFab: q('#dialFab'), dialBack: q('#dialBack'), dialNumIn: q('#dialNumIn'),
    keypad: q('#keypad'), dialSearchBtn: q('#dialSearchBtn'), dialResult: q('#dialResult'),
    chatAv: q('#chatAv'), chatNameH: q('#chatNameH'), chatStatusP: q('#chatStatusP'),
    chatBackBtn: q('#chatBackBtn'), chatCallBtn: q('#chatCallBtn'), chatVidBtn: q('#chatVidBtn'),
    msgsC: q('#msgsC'), chatTa: q('#chatTa'), sendMsgBtn: q('#sendMsgBtn'),
    setBackBtn: q('#setBackBtn'), setList: q('#setList'),
    callBg: q('#callBg'), callVid: q('#callVid'), remVid: q('#remVid'), locVid: q('#locVid'), pipWrap: q('#pipWrap'),
    remAudio: q('#remAudio'),
    callInfo: q('#callInfo'), callAv: q('#callAv'), callNameH: q('#callNameH'), callStTxt: q('#callStTxt'), callTimer: q('#callTimer'), ringCircles: q('#ringCircles'),
    muteBtn: q('#muteBtn'), camBtn: q('#camBtn'), spkBtn: q('#spkBtn'), endBtn: q('#endBtn'),
    incAv: q('#incAv'), incName: q('#incName'), incType: q('#incType'), accBtn: q('#accBtn'), accIco: q('#accIco'), rejBtn: q('#rejBtn'),
    searchBtn: q('#searchBtn'), menuBtn: q('#menuBtn')
  };

  function toast(m, t) {
    D.toast.textContent = m;
    D.toast.className = 'show' + (t ? ' ' + t : '');
    clearTimeout(D.toast._t);
    D.toast._t = setTimeout(function () { D.toast.className = ''; }, 5000);
  }

  function authErrMsg(e) {
    console.error('ত্রুটি:', e);
    var code = e && e.code ? e.code : '';
    var map = {
      'auth/unauthorized-domain': 'Firebase Console → Authentication → Settings → Authorized domains এ এই ডোমেইন যোগ করুন',
      'auth/operation-not-allowed': 'Firebase Console → Authentication → Sign-in method এ Phone ও Google চালু করুন',
      'auth/invalid-app-credential': 'আসল SMS-এর জন্য Blaze প্ল্যান লাগবে। টেস্টের জন্য Console → Sign-in method → Phone → "Phone numbers for testing"-এ একটা নম্বর+কোড যোগ করুন',
      'auth/captcha-check-failed': 'reCAPTCHA ব্যর্থ — পেজ রিফ্রেশ করে আবার চেষ্টা করুন',
      'auth/invalid-phone-number': 'ভুল নম্বর ফরম্যাট। যেমন: +8801749799622',
      'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পর চেষ্টা করুন',
      'auth/quota-exceeded': 'SMS কোটা শেষ',
      'auth/popup-blocked': 'পপআপ ব্লক হয়েছে — অনুমতি দিন',
      'auth/popup-closed-by-user': 'পপআপ বন্ধ করা হয়েছে',
      'auth/network-request-failed': 'ইন্টারনেট সমস্যা',
      'auth/invalid-verification-code': 'ভুল কোড, আবার চেষ্টা করুন',
      'auth/code-expired': 'কোডের মেয়াদ শেষ, আবার পাঠান',
      'auth/user-not-found': 'এই ইমেইলে অ্যাকাউন্ট নেই',
      'auth/wrong-password': 'ভুল পাসওয়ার্ড',
      'auth/invalid-email': 'ভুল ইমেইল ফরম্যাট',
      'auth/email-already-in-use': 'ইমেইলটি আগেই ব্যবহৃত',
      'auth/weak-password': 'পাসওয়ার্ড দুর্বল — ৬ অক্ষর দিন'
    };
    return map[code] || ('ত্রুটি: ' + (code || (e && e.message) || 'অজানা'));
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

  /* --- সিকিউরিটি --- */
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

  /* --- রিংটোন --- */
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

  /* --- OTP ইনপুট --- */
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

  /* ================================================================
     লগইন
     ================================================================ */
  D.sendOtpBtn.addEventListener('click', async function () {
    var phone = D.phoneIn.value.trim();
    if (!phone || phone.length < 7) { toast('দেশের কোডসহ নম্বর দিন (যেমন: +8801749799622)', 'err'); return; }
    D.sendOtpBtn.disabled = true;
    D.sendOtpBtn.innerHTML = '<span class="sp"></span>';
    try {
      S.verificationId = await DB.phoneSendOTP(phone);
      S.phoneNum = phone;
      D.otpPhone.textContent = phone;
      clearOTP();
      go(D.phoneScr, D.otpScr);
      startResendTimer();
      toast('কোড পাঠানো হয়েছে — SMS চেক করুন', 'ok');
    } catch (e) { toast(authErrMsg(e), 'err'); }
    D.sendOtpBtn.disabled = false;
    D.sendOtpBtn.textContent = 'ভেরিফিকেশন কোড পাঠান';
  });

  D.verifyOtpBtn.addEventListener('click', async function () {
    var code = getOTP();
    if (code.length !== 6) { toast('৬ সংখ্যার কোড দিন', 'err'); return; }
    D.verifyOtpBtn.disabled = true;
    D.verifyOtpBtn.innerHTML = '<span class="sp"></span>';
    try {
      S.user = await DB.phoneVerify(S.verificationId, code);
      toast('সফলভাবে লগইন হয়েছে', 'ok');
      enterMain();
    } catch (e) { toast(authErrMsg(e), 'err'); }
    D.verifyOtpBtn.disabled = false;
    D.verifyOtpBtn.textContent = 'ভেরিফাই করুন';
  });

  D.resendBtn.addEventListener('click', async function () {
    try {
      S.verificationId = await DB.phoneSendOTP(S.phoneNum);
      startResendTimer(); clearOTP();
      toast('কোড পুনরায় পাঠানো হয়েছে', 'ok');
    } catch (e) { toast(authErrMsg(e), 'err'); }
  });

  D.otpBack.addEventListener('click', function () { back(D.otpScr, D.phoneScr); });
  D.showEmailLogin.addEventListener('click', function () { go(D.phoneScr, D.emailScr, 'from-l'); });
  D.emailBack.addEventListener('click', function () { back(D.emailScr, D.phoneScr); });
  D.toggleEmailReg.addEventListener('click', function () {
    S.isEmailReg = !S.isEmailReg;
    D.emailNameGrp.style.display = S.isEmailReg ? 'block' : 'none';
    D.emailSubmitBtn.textContent = S.isEmailReg ? 'অ্যাকাউন্ট তৈরি করুন' : 'সাইন ইন করুন';
    D.toggleEmailReg.textContent = S.isEmailReg ? 'ইতিমধ্যে অ্যাকাউন্ট আছে? সাইন ইন' : 'নতুন অ্যাকাউন্ট তৈরি করুন';
  });

  D.emailSubmitBtn.addEventListener('click', async function () {
    var name = D.emailNameIn.value.trim();
    var email = D.emailAddrIn.value.trim();
    var pass = D.emailPassIn.value;
    if (!email || !pass) { toast('ইমেইল ও পাসওয়ার্ড দিন', 'err'); return; }
    if (pass.length < 6) { toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর', 'err'); return; }
    if (S.isEmailReg && !name) { toast('নাম দিন', 'err'); return; }
    D.emailSubmitBtn.disabled = true;
    D.emailSubmitBtn.innerHTML = '<span class="sp"></span>';
    try {
      S.user = S.isEmailReg ? await DB.emailReg(name, email, pass) : await DB.emailLogin(email, pass);
      toast('সফলভাবে লগইন হয়েছে', 'ok');
      enterMain();
    } catch (e) { toast(authErrMsg(e), 'err'); }
    D.emailSubmitBtn.disabled = false;
    D.emailSubmitBtn.textContent = S.isEmailReg ? 'অ্যাকাউন্ট তৈরি করুন' : 'সাইন ইন করুন';
  });

  D.googleLoginBtn.addEventListener('click', async function () {
    D.googleLoginBtn.disabled = true;
    D.googleLoginBtn.innerHTML = '<span class="sp"></span>';
    try {
      var u = await DB.googleLogin();
      if (u) { S.user = u; toast('সফলভাবে লগইন হয়েছে', 'ok'); enterMain(); }
    } catch (e) { toast(authErrMsg(e), 'err'); }
    D.googleLoginBtn.disabled = false;
    D.googleLoginBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Google দিয়ে সাইন ইন করুন';
  });

  /* ================================================================
     মূল স্ক্রিন
     ================================================================ */
  function enterMain() {
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

    go(D.phoneScr, D.mainScr);
  }

  /* ================================================================
     চ্যাট লিস্ট
     ================================================================ */
  function renderChatList() {
    var html = '';
    if (S.chatList.length === 0) {
      if (S.users.length === 0) {
        html = '<div class="empty-st"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg><p>এখনো কোনো ব্যবহারকারী নেই।<br>অন্য কেউ রেজিস্টার করলে এখানে দেখাবে।</p></div>';
      } else {
        S.users.forEach(function (u) {
          html += '<div class="chat-row" data-uid="' + u.id + '">' +
            '<img class="av" src="' + esc(u.avatar) + '" alt="">' +
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
          '<img class="av" src="' + esc(u.avatar) + '" alt="">' +
          '<div class="det"><h4>' + esc(u.name) + ' ' + tickHtml + '</h4><p>' + esc(lastTxt) + '</p></div>' +
          '<div class="meta"><span class="time">' + lastTime + '</span></div></div>';
      });
      var chattedUids = S.chatList.map(function (c) {
        var p = c.parts; return p[0] === S.user.uid ? p[1] : p[0];
      });
      S.users.forEach(function (u) {
        if (chattedUids.indexOf(u.id) === -1) {
          html += '<div class="chat-row" data-uid="' + u.id + '">' +
            '<img class="av" src="' + esc(u.avatar) + '" alt="">' +
            '<div class="det"><h4>' + esc(u.name) + '</h4><p>চ্যাট শুরু করুন</p></div></div>';
        }
      });
    }
    D.tabChats.innerHTML = html;
    D.tabChats.querySelectorAll('.chat-row').forEach(function (row) {
      row.addEventListener('click', function () { openChat(row.getAttribute('data-uid')); });
    });
  }

  /* ================================================================
     কন্টাক্ট লিস্ট (WhatsApp-এর মতো)
     ================================================================ */
  var CALL_SVG = '<svg viewBox="0 0 24 24"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>';
  var VID_SVG = '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
  var CHAT_SVG = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  var DEL_SVG = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';

  function renderContacts() {
    var html = '<div class="sec-label">আমার কন্টাক্ট (' + S.contacts.length + ')</div>';
    if (S.contacts.length === 0) {
      html += '<div class="empty-st"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg><p>নিচের <b>+</b> বাটনে চাপ দিয়ে<br>ফোনের মতো নম্বর ডায়াল করে<br>কন্টাক্ট যোগ করুন</p></div>';
    }
    S.contacts.forEach(function (c) {
      var live = findUser(c.uid);
      var st = live ? (live.online ? 'অনলাইন' : 'অফলাইন') : 'অ্যাপে নেই';
      html += '<div class="chat-row" data-uid="' + c.uid + '">' +
        '<img class="av" src="' + esc(c.avatar) + '" alt="">' +
        '<div class="det"><h4>' + esc(c.name) + '</h4><p>' + esc(c.phone || '') + ' • ' + st + '</p></div>' +
        '<button class="mini-act" data-act="audio" title="অডিও কল">' + CALL_SVG + '</button>' +
        '<button class="mini-act" data-act="video" title="ভিডিও কল">' + VID_SVG + '</button>' +
        '<button class="mini-act red" data-act="del" title="মুছুন">' + DEL_SVG + '</button>' +
        '</div>';
    });
    D.tabContacts.innerHTML = html;

    D.tabContacts.querySelectorAll('.chat-row').forEach(function (row) {
      var uid = row.getAttribute('data-uid');
      row.addEventListener('click', function (e) {
        var btn = e.target.closest('.mini-act');
        if (btn) {
          e.stopPropagation();
          var act = btn.getAttribute('data-act');
          if (act === 'del') { DB.removeContact(S.user.uid, uid); toast('কন্টাক্ট মুছে ফেলা হয়েছে', 'ok'); return; }
          var c = S.contacts.find(function (x) { return x.uid === uid; });
          if (!c) return;
          if (!findUser(uid)) { toast('এই নম্বরের মালিক এখনো অ্যাপে জয়েন করেনি', 'err'); return; }
          startCall(uid, act === 'video' ? 'video' : 'audio');
          return;
        }
        openChat(uid);
      });
    });
  }

  /* ================================================================
     কল হিস্ট্রি
     ================================================================ */
  function renderCallHistory() {
    var html = '<div class="sec-label">সাম্প্রতিক কল</div>';
    if (S.callHistory.length === 0) {
      html += '<div class="empty-st"><p>এখনো কোনো কল হয়নি</p></div>';
    }
    S.callHistory.forEach(function (h) {
      var dirIcon = h.dir === 'out'
        ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:' + (h.status === 'completed' ? 'var(--wa-teal)' : 'var(--wa-danger)') + ';transform:rotate(45deg)"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>'
        : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:' + (h.status === 'completed' ? 'var(--wa-teal)' : 'var(--wa-danger)') + ';transform:rotate(225deg)"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
      var dirTxt = h.dir === 'out' ? 'আউটগোয়িং' : (h.status === 'completed' ? 'ইনকামিং' : 'মিসড কল');
      var statusTxt = h.status === 'completed' ? (h.dur ? dirTxt + ' • ' + fmtTime(h.dur) : dirTxt) : dirTxt;
      html += '<div class="chat-row" data-uid="' + h.withUid + '" data-type="' + h.type + '">' +
        '<img class="av" src="' + esc(h.avatar) + '" alt="">' +
        '<div class="det"><h4>' + esc(h.name) + '</h4><p style="display:flex;align-items:center;gap:5px">' + dirIcon + ' ' + statusTxt + '</p></div>' +
        '<div class="meta"><span class="time">' + (h.ts ? fmtDate(h.ts) : '') + '</span></div>' +
        '<button class="mini-act" data-act="redial">' + CALL_SVG + '</button></div>';
    });
    D.tabCalls.innerHTML = html;
    D.tabCalls.querySelectorAll('.chat-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        var uid = row.getAttribute('data-uid');
        var type = row.getAttribute('data-type') || 'audio';
        if (!findUser(uid)) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }
        startCall(uid, type);
      });
    });
  }

  /* ================================================================
     ডায়ালার — ফোনের ডায়াল প্যাডের মতো
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
    var num = DB.normPhone(D.dialNumIn.value);
    if (!/^\+\d{8,15}$/.test(num)) { toast('সঠিক নম্বর দিন (দেশের কোডসহ)', 'err'); return; }
    D.dialSearchBtn.disabled = true;
    D.dialSearchBtn.textContent = 'খোঁজা হচ্ছে...';
    D.dialResult.innerHTML = '';
    try {
      var u = await DB.findByPhone(num);
      if (!u) {
        D.dialResult.innerHTML = '<div class="dial-card"><p style="margin:0">এই নম্বরে কোনো অ্যাকাউন্ট নেই।<br><span style="font-size:12px">নম্বরটির মালিক অ্যাপে রেজিস্টার করলে দেখা যাবে</span></p></div>';
        return;
      }
      S.dialUser = u;
      D.dialResult.innerHTML =
        '<div class="dial-card">' +
        '<img src="' + esc(u.avatar) + '" alt="">' +
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
     চ্যাট
     ================================================================ */
  function openChat(uid) {
    var user = findUser(uid);
    if (!user) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }
    S.chatTarget = { type: 'dm', uid: uid, user: user };
    D.chatAv.src = user.avatar;
    D.chatNameH.textContent = user.name;
    D.chatStatusP.textContent = user.online ? 'অনলাইন' : 'অফলাইন';

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
    D.chatTa.focus();
  }

  function renderMessages(cid) {
    var msgs = S.chatMsgs[cid] || [];
    var html = '', lastDate = '';
    msgs.forEach(function (m) {
      var ds = fmtDate(m.timestamp);
      if (ds !== lastDate) { html += '<div class="date-sep"><span>' + ds + '</span></div>'; lastDate = ds; }
      var isOut = m.senderId === S.user.uid;
      var tickHtml = isOut ? '<span class="tick">\u2713\u2713</span>' : '';
      html += '<div class="' + (isOut ? 'msg out' : 'msg in') + '">' +
        '<div class="bbl">' + esc(m.text) + '</div>' +
        '<div class="mt">' + fmtTimeShort(m.timestamp) + ' ' + tickHtml + '</div></div>';
    });
    D.msgsC.innerHTML = html;
    D.msgsC.scrollTop = D.msgsC.scrollHeight;
  }

  D.chatTa.addEventListener('input', function () {
    D.sendMsgBtn.disabled = !D.chatTa.value.trim();
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
    D.sendMsgBtn.disabled = true;
  }

  D.chatBackBtn.addEventListener('click', function () {
    if (S.chatUnsub) { S.chatUnsub(); S.chatUnsub = null; }
    if (S.typingUnsub) { S.typingUnsub(); S.typingUnsub = null; }
    S.chatTarget = null;
    back(D.chatScr, D.mainScr);
  });

  /* ================================================================
     ট্যাব
     ================================================================ */
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

  /* ================================================================
     সেটিংস
     ================================================================ */
  D.menuBtn.addEventListener('click', function () { renderSettings(); go(D.mainScr, D.setScr, 'from-l'); });
  D.setBackBtn.addEventListener('click', function () { back(D.setScr, D.mainScr); });

  function renderSettings() {
    var u = S.user;
    var html = '<div class="set-header">প্রোফাইল</div>';
    html += '<div class="set-item"><img src="' + esc(u.avatar) + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover"><div class="si-text"><h4>' + esc(u.name) + '</h4><p>' + esc(u.phone || u.email || '') + '</p></div></div>';
    html += '<div class="set-item" id="editNameItem"><div class="si-icon" style="background:var(--wa-teal)"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div><div class="si-text"><h4>নাম পরিবর্তন করুন</h4><p>আপনার নাম সেট করুন</p></div></div>';
    html += '<div class="set-divider"></div><div class="set-header">অ্যাকাউন্ট</div>';
    html += '<div class="set-item" id="logoutItem"><div class="si-icon" style="background:var(--wa-danger)"><svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg></div><div class="si-text"><h4>লগআউট</h4><p>অ্যাকাউন্ট থেকে বের হোন</p></div></div>';
    D.setList.innerHTML = html;

    q('#editNameItem').addEventListener('click', function () {
      var newName = prompt('আপনার নাম:', u.name);
      if (newName && newName.trim()) {
        DB.updateProfile(u.uid, { name: newName.trim() });
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
        back(D.setScr, D.phoneScr);
        toast('লগআউট হয়েছে', 'ok');
      } catch (e) { toast('লগআউট ব্যর্থ', 'err'); }
    });
  }

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

  /* ================================================================
     ★★★ রিয়েল WebRTC কল সিস্টেম (WhatsApp-এর মতো) ★★★
     ================================================================ */

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

  /* PeerConnection তৈরি — রিমোট স্ট্রিম + ICE হ্যান্ডলিং */
  function createPC(callId, mySide) {
    var pc = new RTCPeerConnection(RTC_CFG);

    if (S.localStream) {
      S.localStream.getTracks().forEach(function (t) { pc.addTrack(t, S.localStream); });
    }

    pc.ontrack = function (e) {
      var remote = e.streams[0];
      if (S.callType === 'video') {
        D.remVid.srcObject = remote;
      } else {
        D.remAudio.srcObject = remote; /* অডিও কলে শোনা যাবে */
      }
    };

    pc.onicecandidate = function (e) {
      if (e.candidate) DB.addCandidate(callId, mySide, e.candidate.toJSON());
    };

    pc.onconnectionstatechange = function () {
      var st = pc.connectionState;
      console.log('PC স্টেট:', st);
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
      } else if (st === 'disconnected') {
        /* সাময়িক বিচ্ছিন্ন — কিছু করা লাগে না, ICE reconnect করে */
      }
    };
    return pc;
  }

  /* ===== কল শুরু (কলার) ===== */
  async function startCall(uid, type) {
    if (S.callActive) { toast('ইতিমধ্যে একটা কল চলছে', 'err'); return; }
    var user = findUser(uid);
    if (!user) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }

    S.callActive = true;
    S.callType = type;
    S.callPhase = 'calling';
    S.callTarget = user;
    S.iAmCaller = true;
    S.wasConnected = false;
    S.isMuted = false; S.isCamOff = false;

    D.callBg.style.backgroundImage = 'url(' + user.avatar + ')';
    D.callAv.src = user.avatar;
    D.callNameH.textContent = user.name;
    D.callStTxt.textContent = 'কল করা হচ্ছে...';
    D.ringCircles.style.display = 'flex';
    D.callScr.classList.remove('slide-up');
    D.callScr.classList.add('on');

    /* মাইক/ক্যামেরা */
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

    /* কল আইডি আগেই বানাই — ICE ক্যান্ডিডেট সাথে সাথে সেভ করতে পারি */
    S.callDocId = 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    var pc = S.pc = createPC(S.callDocId, 'caller');

    try {
      var offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
      await pc.setLocalDescription(offer);

      S.callDocId = await DB.mkCall({
        callerId: S.user.uid,
        calleeId: uid,
        callerName: S.user.name,
        callerAvatar: S.user.avatar,
        calleeName: user.name,
        type: type
      }, { type: offer.type, sdp: offer.sdp });

      playRing();

      /* উত্তরের জন্য অপেক্ষা */
      S.callUnsub = DB.watchCall(S.callDocId, async function (data) {
        if (data.status === 'rejected') {
          stopRing();
          toast('কল কাটা হয়েছে', 'err');
          endCall(false, true);
        } else if (data.status === 'ended' && !S.wasConnected) {
          stopRing();
          toast('কেউ ধরেনি', 'err');
          endCall(false, true);
        } else if (data.answer && !pc.currentRemoteDescription) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            D.callStTxt.textContent = 'সংযোগ হচ্ছে...';
          } catch (e) { console.error('setRemoteDescription:', e); }
        }
      });

      /* কলির ICE ক্যান্ডিডেট */
      S.candUnsub = DB.onCandidates(S.callDocId, 'callee', function (c) {
        if (S.pc) S.pc.addIceCandidate(new RTCIceCandidate(c)).catch(function () {});
      });

      /* ৪৫ সেকেন্ডে উত্তর না পেলে বাতিল */
      S.outTimeout = setTimeout(function () {
        if (S.callPhase !== 'idle' && !S.wasConnected) {
          DB.updCall(S.callDocId, { status: 'noanswer' });
          stopRing();
          toast('কেউ ধরেনি', 'err');
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

  /* ===== ইনকামিং কল ===== */
  function handleIncomingCall(call) {
    if (S.callActive || S.callPhase === 'incoming') { DB.updCall(call.id, { status: 'busy' }); return; }

    S.callDocId = call.id;
    S.callType = call.type;
    S.callPhase = 'incoming';
    S.iAmCaller = false;
    S.wasConnected = false;
    S.callTarget = { uid: call.callerId, name: call.callerName, avatar: call.callerAvatar };

    D.incAv.src = call.callerAvatar || DB.av(call.callerId);
    D.incName.textContent = call.callerName || 'অজানা';
    D.incType.textContent = call.type === 'video' ? 'ভিডিও কল' : 'অডিও কল';
    D.accIco.innerHTML = call.type === 'video' ? VID_SVG : CALL_SVG;

    D.incPop.classList.add('on');
    playRing();

    /* ৪০ সেকেন্ডে না ধরলে মিসড */
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

  /* ===== কল একসেপ্ট (কলি) ===== */
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

      /* কলারের ICE ক্যান্ডিডেট */
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

  /* ===== কল শেষ ===== */
  function endCall(byRemote, skipLog) {
    var dur = S.wasConnected && S.callStart ? Math.floor((Date.now() - S.callStart) / 1000) : 0;

    if (!byRemote && S.callDocId) DB.updCall(S.callDocId, { status: 'ended' });
    if (!skipLog) writeCallLog(S.iAmCaller ? 'out' : 'in', S.wasConnected ? 'completed' : (S.iAmCaller ? 'noanswer' : 'missed'), dur);

    stopRing();
    playTone(600, 300, 0.25);
    cleanupPC();
    resetCallUI();

    S.callActive = false;
    S.callPhase = 'idle';
    S.callTarget = null;
    S.callDocId = null;
    S.wasConnected = false;
    S.callStart = null;
  }

  function writeCallLog(dir, status, dur) {
    if (!S.callTarget || !S.user) return;
    DB.addCallLog(S.user.uid, {
      withUid: S.callTarget.uid || S.callTarget.id,
      name: S.callTarget.name || 'অজানা',
      avatar: S.callTarget.avatar || DB.av(S.callTarget.uid || S.callTarget.id),
      type: S.callType,
      dir: dir,
      status: status,
      dur: dur,
      ts: Date.now()
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
  D.spkBtn.addEventListener('click', function () {
    D.spkBtn.classList.toggle('off', D.spkBtn.classList.contains('off'));
    /* স্পিকার মোবাইল ব্রাউজারে সাধারণত অটো */
  });

  D.chatCallBtn.addEventListener('click', function () { if (S.chatTarget && S.chatTarget.uid) startCall(S.chatTarget.uid, 'audio'); });
  D.chatVidBtn.addEventListener('click', function () { if (S.chatTarget && S.chatTarget.uid) startCall(S.chatTarget.uid, 'video'); });

  /* ================================================================
     ইনিশিয়ালাইজ
     ================================================================ */
  try {
    DB.init();
    DB.handleRedirect();
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
