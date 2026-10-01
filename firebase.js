/* ================================================================
   firebase.js — Auth + Firestore সিগন্যালিং + কন্টাক্ট + কল হিস্ট্রি
   ফিক্স: reCAPTCHA "already been rendered" এরর —
   প্রতিবার নতুন container element বানানো হয়, তাই এরর আর আসবে না
   ================================================================ */
var DB = (function () {
  var _a = null, _d = null, _ok = false;

  function init() {
    if (_ok) return true;
    if (typeof _C === 'undefined' || !_C.fb || !_C.fb.apiKey || !_C.fb.projectId) {
      throw new Error('Firebase কনফিগারেশন দেওয়া হয়নি। config.js ঠিক করুন।');
    }
    try {
      firebase.initializeApp(_C.fb);
      _a = firebase.auth();
      _d = firebase.firestore();
      _d.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      _ok = true;
      return true;
    } catch (e) {
      throw new Error('Firebase ইনিশিয়ালাইজ ব্যর্থ: ' + e.message);
    }
  }

  function av(id) {
    return 'https://picsum.photos/seed/' + id + '/200/200.jpg';
  }

  function normPhone(p) {
    p = String(p || '').replace(/[\s\-().]/g, '');
    if (p && p.charAt(0) !== '+') p = '+' + p;
    return p;
  }

  /* ================================================================
     ★ ফিক্সড: reCAPTCHA — প্রতিবার সম্পূর্ণ নতুন container ★
     ================================================================ */
  function freshRecaptchaContainer() {
    /* পুরনো verifier আছে সেটা বন্ধ করো */
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (e) {}
      window.recaptchaVerifier = null;
    }
    /* পুরনো container element পুরোপুরি মুছে ফেলো — এতে ভেতরের
       পুরনো reCAPTCHA iframe-ও চলে যায়, "already rendered" এরর আর হয় না */
    var old = document.getElementById('recaptcha-container');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    /* একদম নতুন container বানাও */
    var fresh = document.createElement('div');
    fresh.id = 'recaptcha-container';
    document.body.appendChild(fresh);
  }

  /* ================================================================
     ফোন OTP — signInWithPhoneNumber
     ================================================================ */
  async function phoneSendOTP(phone) {
    if (!_a) throw new Error('Firebase Auth রেডি নয়');
    phone = normPhone(phone);
    if (!/^\+\d{8,15}$/.test(phone)) {
      var fe = new Error('ভুল ফরম্যাট। দেশের কোডসহ দিন, যেমন: +8801749799622');
      fe.code = 'auth/invalid-phone-number';
      throw fe;
    }

    freshRecaptchaContainer(); /* ★ প্রতিবার নতুন container */

    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: function () {},
      'expired-callback': function () {}
    });

    try {
      await window.recaptchaVerifier.render();
      var cf = await _a.signInWithPhoneNumber(phone, window.recaptchaVerifier);
      window._confirmationResult = cf;
      return cf.verificationId;
    } catch (e) {
      /* ব্যর্থ হলেও পরিষ্কার — পরের চেষ্টা যেন ঠিকভাবে হয় */
      try { window.recaptchaVerifier.clear(); } catch (e2) {}
      window.recaptchaVerifier = null;
      var old = document.getElementById('recaptcha-container');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      console.error('OTP পাঠানো ত্রুটি:', e);
      throw e;
    }
  }

  async function phoneVerify(vid, code) {
    code = String(code).replace(/\D/g, '');
    var res;
    if (window._confirmationResult) {
      res = await window._confirmationResult.confirm(code);
    } else {
      var cred = firebase.auth.PhoneAuthProvider.credential(vid, code);
      res = await _a.signInWithCredential(cred);
    }
    var doc = await _d.collection('users').doc(res.user.uid).get();
    if (!doc.exists) {
      var n = 'ব্যবহারকারী_' + res.user.uid.substr(0, 5);
      await _d.collection('users').doc(res.user.uid).set({
        name: n,
        phone: res.user.phoneNumber || '',
        email: '',
        avatar: av(res.user.uid),
        online: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { uid: res.user.uid, name: n, phone: res.user.phoneNumber || '', email: '', avatar: av(res.user.uid), isNew: true };
    }
    return { uid: res.user.uid, ...doc.data(), isNew: false };
  }

  /* ===== ইমেইল ===== */
  async function emailReg(name, email, pass) {
    var c = await _a.createUserWithEmailAndPassword(email, pass);
    await c.user.updateProfile({ displayName: name });
    await _d.collection('users').doc(c.user.uid).set({
      name: name, email: email, phone: '',
      avatar: av(c.user.uid), online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { uid: c.user.uid, name: name, email: email, phone: '', avatar: av(c.user.uid) };
  }

  async function emailLogin(email, pass) {
    var c = await _a.signInWithEmailAndPassword(email, pass);
    return await _gu(c.user);
  }

  /* ===== গুগল ===== */
  async function googleLogin() {
    if (!_a) throw new Error('Firebase Auth রেডি নয়');
    var p = new firebase.auth.GoogleAuthProvider();
    p.addScope('profile');
    p.addScope('email');
    var r;
    try {
      r = await _a.signInWithPopup(p);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/cancelled-popup-request') {
        await _a.signInWithRedirect(p);
        return null;
      }
      throw e;
    }
    var u = r.user;
    var doc = await _d.collection('users').doc(u.uid).get();
    if (!doc.exists) {
      var a = u.photoURL || av(u.uid);
      var data = {
        name: u.displayName || 'ব্যবহারকারী',
        email: u.email || '', phone: u.phoneNumber || '',
        avatar: a, online: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await _d.collection('users').doc(u.uid).set(data);
      return { uid: u.uid, name: data.name, email: data.email, phone: data.phone, avatar: a };
    }
    return await _gu(u);
  }

  function handleRedirect() {
    if (!_a) return;
    _a.getRedirectResult().catch(function (e) { console.error('redirect ত্রুটি:', e); });
  }

  async function updateProfile(uid, data) {
    if (!_d || !uid) return;
    await _d.collection('users').doc(uid).set(data, { merge: true });
  }

  async function logout(uid) {
    if (uid && _d) {
      try { await _d.collection('users').doc(uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
    }
    if (_a) await _a.signOut();
  }

  function setOn(uid) {
    if (_d && uid) _d.collection('users').doc(uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
  }
  function setOff(uid) {
    if (_d && uid) _d.collection('users').doc(uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
  }

  function onUsers(uid, cb) {
    return _d.collection('users')
      .where(firebase.firestore.FieldPath.documentId(), '!=', uid)
      .onSnapshot(function (s) {
        cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
      }, function (err) { console.error('onUsers:', err); });
  }

  async function findByPhone(phone) {
    phone = normPhone(phone);
    if (!/^\+\d{8,15}$/.test(phone)) return null;
    var s = await _d.collection('users').where('phone', '==', phone).limit(1).get();
    if (s.empty) return null;
    var d = s.docs[0];
    return { id: d.id, ...d.data() };
  }

  async function addContact(uid, contact) {
    await _d.collection('users').doc(uid).collection('contacts').doc(contact.id).set({
      uid: contact.id,
      name: contact.name || 'কন্টাক্ট',
      phone: contact.phone || '',
      avatar: contact.avatar || av(contact.id),
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  async function removeContact(uid, cid) {
    await _d.collection('users').doc(uid).collection('contacts').doc(cid).delete().catch(function () {});
  }

  function onContacts(uid, cb) {
    return _d.collection('users').doc(uid).collection('contacts')
      .onSnapshot(function (s) {
        cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
      }, function (err) { console.error('onContacts:', err); });
  }

  function chatId(a, b) { return [a, b].sort().join('_'); }

  async function sendMsg(cid, m) {
    if (!_d) return;
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
      }, function (err) { console.error('onMsgs:', err); });
  }

  function onChatList(uid, cb) {
    return _d.collection('chats')
      .where('parts', 'array-contains', uid)
      .onSnapshot(function (s) {
        var arr = s.docs.map(function (d) { return { id: d.id, ...d.data() }; });
        arr.sort(function (x, y) {
          var tx = x.updated && x.updated.toMillis ? x.updated.toMillis() : 0;
          var ty = y.updated && y.updated.toMillis ? y.updated.toMillis() : 0;
          return ty - tx;
        });
        cb(arr);
      }, function (err) { console.error('onChatList:', err); });
  }

  function setTyping(cid, uid) { if (_d) _d.collection('chats').doc(cid).collection('typing').doc(uid).set({ ts: firebase.firestore.FieldValue.serverTimestamp() }); }
  function clearTyping(cid, uid) { if (_d) _d.collection('chats').doc(cid).collection('typing').doc(uid).delete().catch(function () {}); }
  function onTyping(cid, muid, cb) {
    if (!_d) return function () {};
    return _d.collection('chats').doc(cid).collection('typing')
      .onSnapshot(function (s) {
        var t = false;
        s.docs.forEach(function (d) { if (d.id !== muid) t = true; });
        cb(t);
      }, function () {});
  }

  /* ================================================================
     রিয়েল WebRTC কল সিগন্যালিং
     ================================================================ */
  async function mkCall(data, offer) {
    if (!_d) return null;
    var id = 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    await _d.collection('calls').doc(id).set({
      callerId: data.callerId,
      calleeId: data.calleeId,
      callerName: data.callerName || '',
      callerAvatar: data.callerAvatar || '',
      calleeName: data.calleeName || '',
      type: data.type,
      status: 'ringing',
      offer: offer,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    return id;
  }

  function watchCall(id, cb) {
    if (!_d) return function () {};
    return _d.collection('calls').doc(id)
      .onSnapshot(function (d) { if (d.exists) cb(d.data()); }, function () {});
  }

  async function updCall(id, patch) {
    if (_d && id) {
      try { await _d.collection('calls').doc(id).update(patch); } catch (e) {}
    }
  }

  async function addCandidate(id, side, cand) {
    if (!_d || !id) return;
    try { await _d.collection('calls').doc(id).collection('cands_' + side).add(cand); } catch (e) {}
  }

  function onCandidates(id, side, cb) {
    if (!_d) return function () {};
    return _d.collection('calls').doc(id).collection('cands_' + side)
      .onSnapshot(function (s) {
        s.docChanges().forEach(function (c) {
          if (c.type === 'added') cb(c.doc.data());
        });
      }, function () {});
  }

  function onIncCall(uid, cb) {
    return _d.collection('calls')
      .where('calleeId', '==', uid)
      .where('status', '==', 'ringing')
      .onSnapshot(function (s) {
        s.docChanges().forEach(function (c) {
          if (c.type === 'added') cb({ id: c.doc.id, ...c.doc.data() });
        });
      }, function (err) { console.error('onIncCall:', err); });
  }

  async function addCallLog(uid, log) {
    if (!_d || !uid) return;
    try { await _d.collection('users').doc(uid).collection('callHistory').add(log); } catch (e) {}
  }

  function onCallHistory(uid, cb) {
    return _d.collection('users').doc(uid).collection('callHistory')
      .orderBy('ts', 'desc').limit(40)
      .onSnapshot(function (s) {
        cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
      }, function (err) { console.error('onCallHistory:', err); });
  }

  function onAuth(cb) {
    if (!_a) return;
    _a.onAuthStateChanged(async function (u) {
      if (u) {
        try { cb(await _gu(u)); } catch (e) { console.error('onAuth:', e); }
      }
    });
  }

  async function _gu(u) {
    var d = await _d.collection('users').doc(u.uid).get();
    if (d.exists) return { uid: u.uid, ...d.data() };
    return { uid: u.uid, name: u.displayName || 'ব্যবহারকারী', email: u.email || '', phone: u.phoneNumber || '', avatar: av(u.uid) };
  }

  return {
    init: init,
    normPhone: normPhone,
    phoneSendOTP: phoneSendOTP,
    phoneVerify: phoneVerify,
    emailReg: emailReg,
    emailLogin: emailLogin,
    googleLogin: googleLogin,
    handleRedirect: handleRedirect,
    updateProfile: updateProfile,
    logout: logout,
    setOn: setOn,
    setOff: setOff,
    onUsers: onUsers,
    findByPhone: findByPhone,
    addContact: addContact,
    removeContact: removeContact,
    onContacts: onContacts,
    onChatList: onChatList,
    chatId: chatId,
    sendMsg: sendMsg,
    onMsgs: onMsgs,
    setTyping: setTyping,
    clearTyping: clearTyping,
    onTyping: onTyping,
    mkCall: mkCall,
    watchCall: watchCall,
    updCall: updCall,
    addCandidate: addCandidate,
    onCandidates: onCandidates,
    onIncCall: onIncCall,
    addCallLog: addCallLog,
    onCallHistory: onCallHistory,
    onAuth: onAuth,
    av: av,
    get auth() { return _a; },
    get db() { return _d; },
    get ok() { return _ok; }
  };
})();
