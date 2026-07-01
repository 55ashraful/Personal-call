/* ================================================================
   app.js — সম্পূর্ণ রিয়েল অ্যাপ লজিক
   কোনো ডেমো নেই, কোনো ফেক ডেটা নেই
   শুধু রিয়েল ফোন নম্বর, রিয়েল OTP, রিয়েল ইউজার
   ================================================================ */
(function () {
  'use strict';

  /* --- স্টেট --- */
  var S = {
    user: null,
    users: [],       /* রিয়েল ইউজার লিস্ট Firestore থেকে */
    chatList: [],    /* চ্যাট লিস্ট Firestore থেকে */
    chatMsgs: {},    /* cid → [msg] */
    groups: [],
    chatTarget: null,
    chatUnsub: null,
    typingUnsub: null,
    typingTimeout: null,
    chatListUnsub: null,
    callActive: false,
    callType: 'video',
    callPhase: 'idle',
    callTarget: null,
    callDocId: null,
    isMuted: false,
    isCamOff: false,
    isSpk: false,
    callStart: null,
    callTimerIv: null,
    unsubUsers: null,
    unsubCalls: null,
    unsubGroups: null,
    zegoInstance: null,
    localStream: null,
    ringCtx: null,
    ringIv: null,
    resendTimer: null,
    resendSec: 60,
    verificationId: null,
    phoneNum: '',
    isEmailReg: false
  };

  /* --- DOM --- */
  var q = function (s) { return document.querySelector(s); };
  var qa = function (s) { return document.querySelectorAll(s); };

  var D = {
    toast: q('#toast'), secOv: q('#secOverlay'),
    phoneScr: q('#phoneScr'), emailScr: q('#emailScr'), otpScr: q('#otpScr'),
    mainScr: q('#mainScr'), chatScr: q('#chatScr'), setScr: q('#setScr'), grpScr: q('#grpScr'),
    callScr: q('#callScr'), incPop: q('#incPop'),
    phoneIn: q('#phoneIn'), sendOtpBtn: q('#sendOtpBtn'), googleLoginBtn: q('#googleLoginBtn'), showEmailLogin: q('#showEmailLogin'),
    emailBack: q('#emailBack'), emailNameGrp: q('#emailNameGrp'), emailNameIn: q('#emailNameIn'),
    emailAddrIn: q('#emailAddrIn'), emailPassIn: q('#emailPassIn'), emailSubmitBtn: q('#emailSubmitBtn'), toggleEmailReg: q('#toggleEmailReg'),
    otpBack: q('#otpBack'), otpPhone: q('#otpPhone'), otpInputs: q('#otpInputs'),
    verifyOtpBtn: q('#verifyOtpBtn'), resendBtn: q('#resendBtn'), resendTimer: q('#resendTimer'),
    tabChats: q('#tabChats'), tabCalls: q('#tabCalls'), tabGroups: q('#tabGroups'),
    chatAv: q('#chatAv'), chatNameH: q('#chatNameH'), chatStatusP: q('#chatStatusP'),
    chatBackBtn: q('#chatBackBtn'), chatCallBtn: q('#chatCallBtn'), chatVidBtn: q('#chatVidBtn'),
    msgsC: q('#msgsC'), chatTa: q('#chatTa'), sendMsgBtn: q('#sendMsgBtn'),
    setBackBtn: q('#setBackBtn'), setList: q('#setList'),
    grpBackBtn: q('#grpBackBtn'), grpNameIn: q('#grpNameIn'), grpMembers: q('#grpMembers'), createGrpBtn: q('#createGrpBtn'),
    callBg: q('#callBg'), callVid: q('#callVid'), remVid: q('#remVid'), locVid: q('#locVid'), pipWrap: q('#pipWrap'),
    callInfo: q('#callInfo'), callAv: q('#callAv'), callNameH: q('#callNameH'), callStTxt: q('#callStTxt'), callTimer: q('#callTimer'), ringCircles: q('#ringCircles'),
    muteBtn: q('#muteBtn'), camBtn: q('#camBtn'), spkBtn: q('#spkBtn'), endBtn: q('#endBtn'),
    incAv: q('#incAv'), incName: q('#incName'), incType: q('#incType'), accBtn: q('#accBtn'), accIco: q('#accIco'), rejBtn: q('#rejBtn'),
    searchBtn: q('#searchBtn'), menuBtn: q('#menuBtn'), newChatFab: q('#newChatFab')
  };

  /* --- ইউটিলিটি --- */
  function toast(m, t) {
    D.toast.textContent = m;
    D.toast.className = 'show' + (t ? ' ' + t : '');
    clearTimeout(D.toast._t);
    D.toast._t = setTimeout(function () { D.toast.className = ''; }, 3500);
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

  function fmtTime(s) {
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    var today = new Date();
    if (d.toDateString() === today.toDateString()) return 'আজ';
    var y = new Date(today);
    y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'গতকাল';
    return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtTimeShort(ts) {
    return new Date(ts).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  /* ইউজার খোঁজা uid দিয়ে */
  function findUser(uid) {
    return S.users.find(function (u) { return u.id === uid; });
  }

  /* --- সিকিউরিটি --- */
  function enableSec() {
    D.secOv.classList.add('on');
    document.addEventListener('keydown', function (e) {
      if (e.key === 'PrintScreen') { e.preventDefault(); toast('স্ক্রিনশট নেওয়া নিষিদ্ধ', 'err'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); toast('সেভ করা নিষিদ্ধ', 'err'); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) { e.preventDefault(); }
      if (e.key === 'F12') { e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); toast('সোর্স কোড দেখা নিষিদ্ধ', 'err'); }
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('copy', function (e) { e.preventDefault(); });
    document.addEventListener('cut', function (e) { e.preventDefault(); });
    document.addEventListener('selectstart', function (e) { if (!e.target.closest('input,textarea')) e.preventDefault(); });
  }

  function disableSec() { D.secOv.classList.remove('on'); }

  /* --- সাউন্ড --- */
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
     লগইন ফ্লো — সব রিয়েল
     ================================================================ */

  /* ফোন OTP পাঠানো — রিয়েল ফোনে SMS যাবে */
  D.sendOtpBtn.addEventListener('click', async function () {
    var phone = D.phoneIn.value.trim();
    if (!phone || phone.length < 7) { toast('সঠিক ফোন নম্বর দিন', 'err'); return; }

    D.sendOtpBtn.disabled = true;
    D.sendOtpBtn.innerHTML = '<span class="sp"></span>';

    try {
      var vid = await DB.phoneSendOTP(phone);
      S.verificationId = vid;
      S.phoneNum = phone;
      D.otpPhone.textContent = phone;
      clearOTP();
      go(D.phoneScr, D.otpScr);
      startResendTimer();
    } catch (e) {
      var msg = 'OTP পাঠাতে সমস্যা হয়েছে';
      if (e.code === 'auth/invalid-phone-number') msg = 'ভুল ফোন নম্বর ফরম্যাট';
      if (e.code === 'auth/too-many-requests') msg = 'অনেকবার চেষ্টা করেছেন, কিছুক্ষণ পর আবার চেষ্টা করুন';
      toast(msg, 'err');
    }

    D.sendOtpBtn.disabled = false;
    D.sendOtpBtn.textContent = 'ভেরিফিকেশন কোড পাঠান';
  });

  /* OTP ভেরিফাই — রিয়েল কোড চেক হবে */
  D.verifyOtpBtn.addEventListener('click', async function () {
    var code = getOTP();
    if (code.length !== 6) { toast '৬ সংখ্যার কোড দিন', 'err'); return; }

    D.verifyOtpBtn.disabled = true;
    D.verifyOtpBtn.innerHTML = '<span class="sp"></span>';

    try {
      S.user = await DB.phoneVerify(S.verificationId, code);
      toast('সফলভাবে লগইন হয়েছে', 'ok');
      enterMain();
    } catch (e) {
      var msg = 'ভেরিফিকেশন ব্যর্থ';
      if (e.code === 'auth/invalid-verification-code') msg = 'ভুল ভেরিফিকেশন কোড, আবার চেষ্টা করুন';
      if (e.code === 'auth/code-expired') msg = 'কোডের মেয়াদ শেষ, আবার পাঠান';
      toast(msg, 'err');
    }

    D.verifyOtpBtn.disabled = false;
    D.verifyOtpBtn.textContent = 'ভেরিফাই করুন';
  });

  /* কোড পুনরায় পাঠানো */
  D.resendBtn.addEventListener('click', async function () {
    try {
      S.verificationId = await DB.phoneSendOTP(S.phoneNum);
      startResendTimer();
      toast('কোড পুনরায় পাঠানো হয়েছে', 'ok');
    } catch (e) { toast('আবার পাঠাতে সমস্যা', 'err'); }
  });

  D.otpBack.addEventListener('click', function () { back(D.otpScr, D.phoneScr); });

  /* ইমেইল নেভিগেশন */
  D.showEmailLogin.addEventListener('click', function () { go(D.phoneScr, D.emailScr, 'from-l'); });
  D.emailBack.addEventListener('click', function () { back(D.emailScr, D.phoneScr); });
  D.toggleEmailReg.addEventListener('click', function () {
    S.isEmailReg = !S.isEmailReg;
    D.emailNameGrp.style.display = S.isEmailReg ? 'block' : 'none';
    D.emailSubmitBtn.textContent = S.isEmailReg ? 'অ্যাকাউন্ট তৈরি করুন' : 'সাইন ইন করুন';
    D.toggleEmailReg.textContent = S.isEmailReg ? 'ইতিমধ্যে অ্যাকাউন্ট আছে? সাইন ইন' : 'নতুন অ্যাকাউন্ট তৈরি করুন';
  });

  /* ইমেইল সাবমিট */
  D.emailSubmitBtn.addEventListener('click', async function () {
    var name = D.emailNameIn.value.trim(),
        email = D.emailAddrIn.value.trim(),
        pass = D.emailPassIn.value;

    if (!email || !pass) { toast('ইমেইল ও পাসওয়ার্ড দিন', 'err'); return; }
    if (pass.length < 6) { toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে', 'err'); return; }
    if (S.isEmailReg && !name) { toast('নাম দিন', 'err'); return; }

    D.emailSubmitBtn.disabled = true;
    D.emailSubmitBtn.innerHTML = '<span class="sp"></span>';

    try {
      if (S.isEmailReg) {
        S.user = await DB.emailReg(name, email, pass);
      } else {
        S.user = await DB.emailLogin(email, pass);
      }
      toast('সফলভাবে লগইন হয়েছে', 'ok');
      enterMain();
    } catch (e) {
      var msg = 'লগইন ব্যর্থ';
      if (e.code === 'auth/user-not-found') msg = 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই';
      if (e.code === 'auth/wrong-password') msg = 'ভুল পাসওয়ার্ড';
      if (e.code === 'auth/email-already-in-use') msg = 'এই ইমেইল আগে থেকেই ব্যবহৃত';
      toast(msg, 'err');
    }

    D.emailSubmitBtn.disabled = false;
    D.emailSubmitBtn.textContent = S.isEmailReg ? 'অ্যাকাউন্ট তৈরি করুন' : 'সাইন ইন করুন';
  });

  /* গুগল লগইন */
  D.googleLoginBtn.addEventListener('click', async function () {
    D.googleLoginBtn.disabled = true;
    D.googleLoginBtn.innerHTML = '<span class="sp"></span>';

    try {
      S.user = await DB.googleLogin();
      toast('সফলভাবে লগইন হয়েছে', 'ok');
      enterMain();
    } catch (e) {
      toast('গুগল লগইন ব্যর্থ', 'err');
    }

    D.googleLoginBtn.disabled = false;
    D.googleLoginBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:20px;height:20px"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Google দিয়ে সাইন ইন করুন';
  });

  /* ================================================================
     মূল স্ক্রিনে প্রবেশ — রিয়েল ডেটা লোড করবে
     ================================================================ */
  function enterMain() {
    enableSec();
    DB.setOn(S.user.uid);

    /* রিয়েল ইউজার লিস্ট লিসেন করা — শুধু রিয়েল রেজিস্টার্ড ইউজার */
    S.unsubUsers = DB.onUsers(S.user.uid, function (users) {
      S.users = users;
      renderChatList();
    });

    /* রিয়েল চ্যাট লিস্ট লিসেন করা */
    S.chatListUnsub = DB.onChatList(S.user.uid, function (chats) {
      S.chatList = chats;
      renderChatList();
    });

    /* রিয়েল ইনকামিং কল লিসেন করা */
    S.unsubCalls = DB.onIncCall(S.user.uid, handleIncomingCall);

    /* রিয়েল গ্রুপ লিসেন করা */
    S.unsubGroups = DB.onGroups(S.user.uid, function (groups) {
      S.groups = groups;
      renderGroupList();
    });

    go(D.phoneScr, D.mainScr);
  }

  /* ================================================================
     চ্যাট লিস্ট রেন্ডার — শুধু রিয়েল চ্যাট
     ================================================================ */
  function renderChatList() {
    var html = '';

    if (S.chatList.length === 0) {
      /* কোনো চ্যাট না থাকলে সব রিয়েল ইউজার দেখাও যাতে কল/মেসেজ করা যায় */
      if (S.users.length === 0) {
        html = '<div class="empty-st"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg><p>এখনো কোনো ব্যবহারকারী নেই।<br>অন্য কেউ রেজিস্টার করলে এখানে দেখাবে।</p></div>';
      } else {
        S.users.forEach(function (u) {
          var statusTxt = u.online ? 'অনলাইন' : 'অফলাইন';
          html += '<div class="chat-row" data-uid="' + u.id + '">' +
            '<img class="av" src="' + u.avatar + '" alt="">' +
            '<div class="det"><h4>' + u.name + '</h4><p>' + statusTxt + '</p></div>' +
            '</div>';
        });
      }
    } else {
      /* আগে চ্যাট করা ইউজারগুলো উপরে */
      S.chatList.forEach(function (chat) {
        var parts = chat.parts;
        var otherUid = parts[0] === S.user.uid ? parts[1] : parts[0];
        var u = findUser(otherUid);
        if (!u) return; /* ইউজার ডিলিট হলে স্কিপ */

        var lastTxt = chat.lastMsg ? chat.lastMsg.text : 'কোনো মেসেজ নেই';
        var lastTime = chat.lastMsg && chat.lastMsg.ts ? fmtTimeShort(chat.lastMsg.ts) : '';
        var isOut = chat.lastMsg && chat.lastMsg.sid === S.user.uid;
        var tickHtml = isOut ? '<span class="tick">\u2713\u2713</span>' : '';
        var statusTxt = u.online ? 'অনলাইন' : 'অফলাইন';

        html += '<div class="chat-row" data-uid="' + u.id + '">' +
          '<img class="av" src="' + u.avatar + '" alt="">' +
          '<div class="det"><h4>' + u.name + ' ' + tickHtml + '</h4><p>' + lastTxt + '</p></div>' +
          '<div class="meta"><span class="time">' + lastTime + '</span></div>' +
          '</div>';
      });

      /* যাদের সাথে এখনো চ্যট হয়নি তাদের নিচে */
      var chattedUids = S.chatList.map(function (c) {
        var p = c.parts;
        return p[0] === S.user.uid ? p[1] : p[0];
      });
      S.users.forEach(function (u) {
        if (chattedUids.indexOf(u.id) === -1) {
          html += '<div class="chat-row" data-uid="' + u.id + '">' +
            '<img class="av" src="' + u.avatar + '" alt="">' +
            '<div class="det"><h4>' + u.name + '</h4><p>অনলাইন স্ট্যাটাস অনুযায়ী</p></div>' +
            '</div>';
        }
      });
    }

    D.tabChats.innerHTML = html;

    /* ক্লিক ইভেন্ট */
    D.tabChats.querySelectorAll('.chat-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var uid = row.getAttribute('data-uid');
        openChat(uid);
      });
    });
  }

  /* ================================================================
     গ্রুপ লিস্ট
     ================================================================ */
  function renderGroupList() {
    var html = '';
    S.groups.forEach(function (g) {
      html += '<div class="chat-row" data-gid="' + g.id + '">' +
        '<img class="av" src="' + g.avatar + '" alt="">' +
        '<div class="det"><h4>' + g.name + '</h4><p>সদস্য: ' + g.members.length + ' জন</p></div>' +
        '</div>';
    });
    D.tabGroups.innerHTML = html || '<div class="empty-st"><p>কোনো গ্রুপ নেই</p></div>';

    D.tabGroups.querySelectorAll('.chat-row').forEach(function (row) {
      row.addEventListener('click', function () { openGroupChat(row.getAttribute('data-gid')); });
    });
  }

  /* ================================================================
     চ্যাট ওপেন — রিয়েল মেসেজ লোড
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

    /* রিয়েল-টাইম মেসেজ লিসেনার */
    if (S.chatUnsub) S.chatUnsub();
    S.chatUnsub = DB.onMsgs(cid, function (changes) {
      changes.forEach(function (c) {
        if (c.t === 'added') {
          /* ডুপ্লিকেট চেক */
          var exists = S.chatMsgs[cid].some(function (m) { return m._id === c.d._id; });
          if (!exists) S.chatMsgs[cid].push(c.d);
        }
      });
      renderMessages(cid);
    });

    /* টাইপিং লিসেনার */
    if (S.typingUnsub) S.typingUnsub();
    S.typingUnsub = DB.onTyping(cid, S.user.uid, function (isTyping) {
      D.chatStatusP.textContent = isTyping ? 'টাইপ করছে...' : (user.online ? 'অনলাইন' : 'অফলাইন');
    });

    go(D.mainScr, D.chatScr, 'from-l');
    D.chatTa.focus();
  }

  function openGroupChat(gid) {
    var group = S.groups.find(function (g) { return g.id === gid; });
    if (!group) return;

    S.chatTarget = { type: 'group', gid: gid, group: group };
    D.chatAv.src = group.avatar;
    D.chatNameH.textContent = group.name;
    D.chatStatusP.textContent = 'সদস্য: ' + group.members.length + ' জন';

    var cid = DB.groupChatId(gid);
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

    go(D.mainScr, D.chatScr, 'from-l');
    D.chatTa.focus();
  }

  /* ================================================================
     মেসেজ রেন্ডার
     ================================================================ */
  function renderMessages(cid) {
    var msgs = S.chatMsgs[cid] || [];
    var html = '';
    var lastDate = '';

    msgs.forEach(function (m) {
      var dateStr = fmtDate(m.timestamp);
      if (dateStr !== lastDate) {
        html += '<div class="date-sep"><span>' + dateStr + '</span></div>';
        lastDate = dateStr;
      }

      var isOut = m.senderId === S.user.uid;
      var cls = isOut ? 'msg out' : 'msg in';
      var tickHtml = isOut ? '<span class="tick">\u2713\u2713</span>' : '';
      var senderName = '';

      /* গ্রুপে অন্যের নাম দেখাও */
      if (S.chatTarget && S.chatTarget.type === 'group' && !isOut) {
        var sender = findUser(m.senderId);
        senderName = sender ? '<div style="font-size:12px;color:var(--wa-teal);margin-bottom:2px">' + sender.name + '</div>' : '';
      }

      html += '<div class="' + cls + '">' + senderName +
        '<div class="bbl">' + m.text + '</div>' +
        '<div class="mt">' + fmtTimeShort(m.timestamp) + ' ' + tickHtml + '</div>' +
        '</div>';
    });

    D.msgsC.innerHTML = html;
    D.msgsC.scrollTop = D.msgsC.scrollHeight;
  }

  /* ================================================================
     মেসেজ পাঠানো — রিয়েল Firestore এ যাবে
     ================================================================ */
  D.chatTa.addEventListener('input', function () {
    D.sendMsgBtn.disabled = !D.chatTa.value.trim();
    D.chatTa.style.height = 'auto';
    D.chatTa.style.height = Math.min(D.chatTa.scrollHeight, 100) + 'px';

    if (S.chatTarget) {
      var cid = S.chatTarget.type === 'group' ? DB.groupChatId(S.chatTarget.gid) : DB.chatId(S.user.uid, S.chatTarget.uid);
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

    var cid = S.chatTarget.type === 'group' ? DB.groupChatId(S.chatTarget.gid) : DB.chatId(S.user.uid, S.chatTarget.uid);

    var msg = {
      senderId: S.user.uid,
      text: text,
      timestamp: Date.now()
    };

    /* রিয়েল মেসেজ Firestore এ সেভ হবে */
    DB.sendMsg(cid, msg);
    DB.clearTyping(cid, S.user.uid);

    D.chatTa.value = '';
    D.chatTa.style.height = 'auto';
    D.sendMsgBtn.disabled = true;
  }

  /* চ্যাট থেকে ফিরে আসা */
  D.chatBackBtn.addEventListener('click', function () {
    if (S.chatUnsub) { S.chatUnsub(); S.chatUnsub = null; }
    if (S.typingUnsub) { S.typingUnsub(); S.typingUnsub = null; }
    S.chatTarget = null;
    back(D.chatScr, D.mainScr);
  });

  /* ================================================================
     ট্যাব সুইচিং
     ================================================================ */
  qa('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      qa('.tab').forEach(function (t) { t.classList.remove('on'); });
      tab.classList.add('on');
      var target = tab.getAttribute('data-tab');
      D.tabChats.style.display = target === 'chats' ? '' : 'none';
      D.tabCalls.style.display = target === 'calls' ? '' : 'none';
      D.tabGroups.style.display = target === 'groups' ? '' : 'none';
      D.newChatFab.style.display = target === 'groups' ? '' : 'none';
    });
  });

  /* ================================================================
     কল হিস্ট্রি ট্যাব
     ================================================================ */
  function renderCallHistory() {
    D.tabCalls.innerHTML = '<div class="empty-st"><p>কল হিস্ট্রি এখানে দেখাবে</p></div>';
  }

  /* ================================================================
     সেটিংস
     ================================================================ */
  D.menuBtn.addEventListener('click', function () { renderSettings(); go(D.mainScr, D.setScr, 'from-l'); });
  D.setBackBtn.addEventListener('click', function () { back(D.setScr, D.mainScr); });

  function renderSettings() {
    var u = S.user;
    var html = '<div class="set-header">প্রোফাইল</div>';
    html += '<div class="set-item"><img src="' + u.avatar + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover"><div class="si-text"><h4>' + u.name + '</h4><p>' + (u.phone || u.email || '') + '</p></div></div>';

    /* নতুন ইউজার হলে নাম পরিবর্তন অপশন */
    if (u.isNew) {
      html += '<div class="set-item" id="editNameItem"><div class="si-icon" style="background:var(--wa-teal)"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></div><div class="si-text"><h4>নাম পরিবর্তন করুন</h4><p>আপনার নাম সেট করুন</p></div></div>';
    }

    html += '<div class="set-divider"></div>';
    html += '<div class="set-header">অ্যাকাউন্ট</div>';
    html += '<div class="set-item" id="logoutItem"><div class="si-icon" style="background:var(--wa-danger)"><svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg></div><div class="si-text"><h4>লগআউট</h4><p>অ্যাকাউন্ট থেকে বের হোন</p></div></div>';

    D.setList.innerHTML = html;

    /* নাম পরিবর্তন */
    var editItem = q('#editNameItem');
    if (editItem) {
      editItem.addEventListener('click', function () {
        var newName = prompt('আপনার নাম:', u.name);
        if (newName && newName.trim()) {
          DB.updateProfile(u.uid, { name: newName.trim() });
          u.name = newName.trim();
          toast('নাম আপডেট হয়েছে', 'ok');
          renderSettings();
        }
      });
    }

    /* লগআউট */
    var logoutItem = q('#logoutItem');
    if (logoutItem) {
      logoutItem.addEventListener('click', async function () {
        try {
          if (S.unsubUsers) S.unsubUsers();
          if (S.unsubCalls) S.unsubCalls();
          if (S.unsubGroups) S.unsubGroups();
          if (S.chatListUnsub) S.chatListUnsub();
          await DB.logout(S.user.uid);
          S.user = null;
          S.chatMsgs = {};
          S.chatList = [];
          S.groups = [];
          disableSec();
          back(D.setScr, D.phoneScr);
          toast('লগআউট হয়েছে', 'ok');
        } catch (e) {
          toast('লগআউট ব্যর্থ', 'err');
        }
      });
    }
  }

  /* ================================================================
     গ্রুপ তৈরি
     ================================================================ */
  D.newChatFab.addEventListener('click', function () { renderGroupForm(); go(D.mainScr, D.grpScr, 'from-l'); });
  D.grpBackBtn.addEventListener('click', function () { back(D.grpScr, D.mainScr); });

  function renderGroupForm() {
    var html = '';
    S.users.forEach(function (u) {
      html += '<div class="gm"><label><input type="checkbox" value="' + u.id + '"><img src="' + u.avatar + '" alt="">' + u.name + '</label></div>';
    });
    D.grpMembers.innerHTML = html || '<div class="empty-st"><p>গ্রুপে যোগ করার মতো কোনো ইউজার নেই</p></div>';
    D.grpNameIn.value = '';
  }

  D.createGrpBtn.addEventListener('click', async function () {
    var name = D.grpNameIn.value.trim();
    if (!name) { toast('গ্রুপের নাম দিন', 'err'); return; }

    var checked = D.grpMembers.querySelectorAll('input:checked');
    if (checked.length === 0) { toast('কমপক্ষে একজন সদস্য নির্বাচন করুন', 'err'); return; }

    var parts = [S.user.uid];
    checked.forEach(function (c) { parts.push(c.value); });

    D.createGrpBtn.disabled = true;
    D.createGrpBtn.innerHTML = '<span class="sp"></span>';

    try {
      await DB.mkGroup(name, parts);
      toast('গ্রুপ তৈরি হয়েছে', 'ok');
      back(D.grpScr, D.mainScr);
    } catch (e) {
      toast('গ্রুপ তৈরি ব্যর্থ', 'err');
    }

    D.createGrpBtn.disabled = false;
    D.createGrpBtn.textContent = 'গ্রুপ তৈরি করুন';
  });

  /* ================================================================
     রিয়েল কল সিস্টেম
     ================================================================ */
  function startCall(uid, type) {
    var user = findUser(uid);
    if (!user) { toast('ইউজার পাওয়া যায়নি', 'err'); return; }

    S.callActive = true;
    S.callType = type;
    S.callPhase = 'ringing';
    S.callTarget = user;
    S.isMuted = false;
    S.isCamOff = false;
    S.isSpk = false;

    D.callBg.style.backgroundImage = 'url(' + user.avatar + ')';
    D.callAv.src = user.avatar;
    D.callNameH.textContent = user.name;
    D.callStTxt.textContent = 'কল করা হচ্ছে...';
    D.callTimer.style.display = 'none';
    D.callVid.style.display = 'none';
    D.ringCircles.style.display = 'flex';
    D.callInfo.style.display = '';
    D.muteBtn.classList.remove('off');
    D.camBtn.classList.remove('off');
    D.spkBtn.classList.remove('off');

    D.callScr.classList.remove('slide-up');
    D.callScr.classList.add('on');

    playRing();

    /* Firestore এ কল ডকুমেন্ট তৈরি — অপর পাশে নোটিফিকেশন যাবে */
    DB.mkCall({
      callerId: S.user.uid,
      calleeId: uid,
      callerName: S.user.name,
      callerAvatar: S.user.avatar,
      calleeName: user.name,
      type: type
    }).then(function (docId) {
      S.callDocId = docId;
      if (docId) {
        /* কল স্ট্যাটাস ট্র্যাক করা */
        DB.onCallUpd(docId, function (data) {
          if (data.status === 'accepted') {
            S.callPhase = 'connected';
            stopRing();
            playTone(880, 1200, 0.25);
            D.callStTxt.textContent = 'সংযুক্ত';
            D.ringCircles.style.display = 'none';
            startCallTimer();
            if (type === 'video') setupVideoCall();
          } else if (data.status === 'rejected' || data.status === 'ended') {
            endCall();
          }
        });
      }
    }).catch(function () {
      toast('কল করতে সমস্যা', 'err');
      endCall();
    });
  }

  function startCallTimer() {
    S.callStart = Date.now();
    D.callTimer.style.display = '';
    S.callTimerIv = setInterval(function () {
      var elapsed = Math.floor((Date.now() - S.callStart) / 1000);
      D.callTimer.textContent = fmtTime(elapsed);
    }, 1000);
  }

  function setupVideoCall() {
    D.callVid.style.display = '';
    D.callInfo.style.display = 'none';
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (stream) {
      S.localStream = stream;
      D.locVid.srcObject = stream;

      /* ZEGO দিয়ে রিমোট স্ট্রিম পাবে */
      var roomId = 'rm_pending';
      DB.onCallUpd(S.callDocId, function (data) {
        if (data.roomId && data.roomId !== roomId) {
          roomId = data.roomId;
          DB.initZego(roomId, S.user.uid, S.user.name).then(function (zg) {
            if (zg) {
              S.zegoInstance = zg;
              zg.startPublishingStream('local_' + S.user.uid, stream);
              zg.on('IMRecvBroadcastMessage', function (msg) {
                /* পিয়ার স্ট্রিম আইডি পেলে প্লে করো */
              });
            }
          });
        }
      });
    }).catch(function () {
      toast('ক্যামেরা/মাইক অ্যাক্সেস দিন', 'err');
    });
  }

  function endCall() {
    stopRing();
    playTone(600, 300, 0.25);
    if (S.callTimerIv) { clearInterval(S.callTimerIv); S.callTimerIv = null; }
    if (S.localStream) { S.localStream.getTracks().forEach(function (t) { t.stop(); }); S.localStream = null; }
    if (S.zegoInstance) { try { S.zegoInstance.logoutRoom(); } catch (e) {} S.zegoInstance = null; }
    if (S.callDocId) { DB.updCall(S.callDocId, 'ended'); }

    D.locVid.srcObject = null;
    D.remVid.srcObject = null;

    S.callActive = false;
    S.callPhase = 'idle';
    S.callTarget = null;
    S.callDocId = null;

    D.callScr.classList.remove('on');
  }

  /* কল কন্ট্রোল */
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
    S.isSpk = !S.isSpk;
    D.spkBtn.classList.toggle('off', S.isSpk);
  });
  D.endBtn.addEventListener('click', endCall);

  /* চ্যাট থেকে কল */
  D.chatCallBtn.addEventListener('click', function () { if (S.chatTarget && S.chatTarget.uid) startCall(S.chatTarget.uid, 'audio'); });
  D.chatVidBtn.addEventListener('click', function () { if (S.chatTarget && S.chatTarget.uid) startCall(S.chatTarget.uid, 'video'); });

  /* ================================================================
     ইনকামিং কল — রিয়েল, অন্য ইউজার থেকে আসবে
     ================================================================ */
  function handleIncomingCall(call) {
    if (S.callActive) { DB.updCall(call.id, 'ended'); return; }

    S.callDocId = call.id;
    S.callType = call.type;
    S.callPhase = 'incoming';

    var caller = findUser(call.callerId);
    var name = caller ? caller.name : (call.callerName || 'অজানা');
    var avatar = caller ? caller.avatar : (call.callerAvatar || DB.av(call.callerId));

    D.incAv.src = avatar;
    D.incName.textContent = name;
    D.incType.textContent = call.type === 'video' ? 'ভিডিও কল' : 'অডিও কল';
    D.accIco.innerHTML = call.type === 'video'
      ? '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>'
      : '<path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>';

    D.incPop.classList.add('on');
    playRing();

    S.callTarget = caller || { id: call.callerId, name: name, avatar: avatar };
  }

  /* একসেপ্ট */
  D.accBtn.addEventListener('click', function () {
    D.incPop.classList.remove('on');
    stopRing();

    S.callActive = true;
    S.callPhase = 'connected';
    playTone(880, 1200, 0.25);

    D.callBg.style.backgroundImage = 'url(' + (S.callTarget.avatar || '') + ')';
    D.callAv.src = S.callTarget.avatar || '';
    D.callNameH.textContent = S.callTarget.name || '';
    D.callStTxt.textContent = 'সংযুক্ত';
    D.callTimer.style.display = '';
    D.ringCircles.style.display = 'none';

    D.callScr.classList.remove('slide-up');
    D.callScr.classList.add('on');

    /* Firestore এ accepted মার্ক করা — কলারকে জানাবে */
    DB.updCall(S.callDocId, 'accepted');

    /* কল স্ট্যাটাস ট্র্যাক */
    DB.onCallUpd(S.callDocId, function (data) {
      if (data.status === 'ended') endCall();
    });

    startCallTimer();
    if (S.callType === 'video') setupVideoCall();
  });

  /* রিজেক্ট */
  D.rejBtn.addEventListener('click', function () {
    D.incPop.classList.remove('on');
    stopRing();
    playTone(600, 300, 0.25);
    DB.updCall(S.callDocId, 'rejected');
    S.callDocId = null;
    S.callPhase = 'idle';
    S.callTarget = null;
  });

  /* ================================================================
     খুঁজুন
     ================================================================ */
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
     ইনিশিয়ালাইজেশন — কনফিগ না থাকলে শুরুই হবে না
     ================================================================ */
  try {
    DB.init();
    /* অটো লগইন চেক — আগে লগইন থাকলে আবার লগইন করতে হবে না */
    DB.onAuth(function (user) {
      if (user) {
        S.user = user;
        enterMain();
      }
    });
  } catch (e) {
    /* Firebase কনফিগ না থাকলে এখানে আসবে */
    document.getElementById('phoneScr').innerHTML =
      '<div class="login-card">' +
      '<div class="login-logo"><svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>' +
      '<h1 style="color:var(--wa-danger)">সেটআপ প্রয়োজন</h1>' +
      '<p class="sub">config.js ফাইলে আপনার Firebase ক্রেডেনশিয়াল বসান।<br>কোনো ডেমো নেই — সব রিয়েল।</p>' +
      '</div>';
  }

  /* পেজ আনলোডে অফলাইন মার্ক */
  window.addEventListener('beforeunload', function () {
    if (S.user) DB.setOff(S.user.uid);
    stopRing();
  });

})();
