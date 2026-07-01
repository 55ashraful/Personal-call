/* ================================================================
   firebase.js — সম্পূর্ণ রিয়েল Firebase + ZEGO লজিক
   কোনো ডেমো নেই, কোনো ফেক নেই
   ================================================================ */
var DB = (function () {
  var _a = null, _d = null, _ok = false;

  /* Firebase ইনিশিয়ালাইজ — কনফিগ না থাকলে র‍্যাখ থ্রো করবে */
  function init() {
    if (_ok) return true;
    if (!_C.fb.apiKey || !_C.fb.projectId) {
      throw new Error('Firebase কনফিগারেশন দেওয়া হয়নি। config.js এ আপনার credentials বসান।');
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

  /* অ্যাভাটার */
  function av(id) {
    return 'https://picsum.photos/seed/' + id + '/200/200.jpg';
  }

  /* ===== ফোন অথেনটিকেশন — রিয়েল OTP ফোনে যাবে ===== */
  async function phoneSendOTP(phone) {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('sendOtpBtn', {
        size: 'invisible',
        callback: function () {}
      });
    }
    var prov = new firebase.auth.PhoneAuthProvider();
    return await prov.verifyPhoneNumber(phone, window.recaptchaVerifier);
  }

  async function phoneVerify(vid, code) {
    var cred = await firebase.auth.PhoneAuthProvider.credential(vid, code);
    var res = await _a.signInWithCredential(cred);
    var doc = await _d.collection('users').doc(res.user.uid).get();
    if (!doc.exists) {
      /* নতুন ইউজার — ফোন নম্বর দিয়ে রেজিস্টার হলো */
      var n = 'ব্যবহারকারী_' + res.user.uid.substr(0, 5);
      await _d.collection('users').doc(res.user.uid).set({
        name: n,
        phone: res.user.phoneNumber,
        email: '',
        avatar: av(res.user.uid),
        online: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { uid: res.user.uid, name: n, phone: res.user.phoneNumber, email: '', avatar: av(res.user.uid), isNew: true };
    }
    return { uid: res.user.uid, ...doc.data(), isNew: false };
  }

  /* ===== ইমেইল রেজিস্টার ===== */
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

  /* ===== ইমেইল লগইন ===== */
  async function emailLogin(email, pass) {
    var c = await _a.signInWithEmailAndPassword(email, pass);
    return await _gu(c.user);
  }

  /* ===== গুগল লগইন ===== */
  async function googleLogin() {
    var p = new firebase.auth.GoogleAuthProvider();
    p.addScope('profile');
    p.addScope('email');
    var r = await _a.signInWithPopup(p);
    var doc = await _d.collection('users').doc(r.user.uid).get();
    if (!doc.exists) {
      var a = r.user.photoURL || av(r.user.uid);
      await _d.collection('users').doc(r.user.uid).set({
        name: r.user.displayName || 'ব্যবহারকারী',
        email: r.user.email || '', phone: r.user.phoneNumber || '',
        avatar: a, online: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { uid: r.user.uid, name: r.user.displayName || 'ব্যবহারকারী', email: r.user.email || '', phone: r.user.phoneNumber || '', avatar: a };
    }
    return await _gu(r.user);
  }

  /* ===== প্রোফাইল আপডেট ===== */
  async function updateProfile(uid, data) {
    if (!_d || !uid) return;
    await _d.collection('users').doc(uid).set(data, { merge: true });
  }

  /* ===== লগআউট ===== */
  async function logout(uid) {
    if (uid && _d) {
      try { await _d.collection('users').doc(uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); } catch (e) {}
    }
    if (_a) await _a.signOut();
  }

  /* ===== অনলাইন/অফলাইন ===== */
  function setOn(uid) {
    if (_d && uid) _d.collection('users').doc(uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
  }
  function setOff(uid) {
    if (_d && uid) _d.collection('users').doc(uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
  }

  /* ===== সব রিয়েল ইউজার লিসেনার ===== */
  function onUsers(uid, cb) {
    return _d.collection('users')
      .where(firebase.firestore.FieldPath.documentId(), '!=', uid)
      .onSnapshot(function (s) {
        cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
      }, function (err) { console.error('onUsers ত্রুটি:', err); });
  }

  /* ===== চ্যাট আইডি — দুইজনের uid সর্ট করে জয়েন ===== */
  function chatId(a, b) { return [a, b].sort().join('_'); }

  /* ===== রিয়েল মেসেজ পাঠানো ===== */
  async function sendMsg(cid, m) {
    if (!_d) return;
    await _d.collection('chats').doc(cid).collection('messages').add(m);
    await _d.collection('chats').doc(cid).set({
      lastMsg: { text: m.text, sid: m.senderId, ts: m.timestamp },
      parts: cid.split('_'),
      updated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  /* ===== রিয়েল মেসেজ লিসেনার ===== */
  function onMsgs(cid, cb) {
    return _d.collection('chats').doc(cid).collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot(function (s) {
        cb(s.docChanges().map(function (c) { return { t: c.type, d: { ...c.doc.data(), _id: c.doc.id } }; }));
      }, function (err) { console.error('onMsgs ত্রুটি:', err); });
  }

  /* ===== চ্যাট লিস্ট — আমার সাথে মেসেজ আছে এমন সব চ্যাট ===== */
  function onChatList(uid, cb) {
    return _d.collection('chats')
      .where('parts', 'array-contains', uid)
      .orderBy('updated', 'desc')
      .onSnapshot(function (s) {
        cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
      }, function (err) { console.error('onChatList ত্রুটি:', err); });
  }

  /* ===== টাইপিং ===== */
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

  /* ===== রিয়েল কল সিগন্যালিং ===== */
  async function mkCall(d) {
    if (!_d) return null;
    var id = 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    d.status = 'ringing';
    d.ts = firebase.firestore.FieldValue.serverTimestamp();
    d.roomId = 'rm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await _d.collection('calls').doc(id).set(d);
    return id;
  }

  function onIncCall(uid, cb) {
    return _d.collection('calls')
      .where('calleeId', '==', uid)
      .where('status', '==', 'ringing')
      .onSnapshot(function (s) {
        s.docChanges().forEach(function (c) {
          if (c.type === 'added') cb({ id: c.doc.id, ...c.doc.data() });
        });
      }, function (err) { console.error('onIncCall ত্রুটি:', err); });
  }

  function onCallUpd(cid, cb) {
    if (!_d) return function () {};
    return _d.collection('calls').doc(cid)
      .onSnapshot(function (d) {
        if (d.exists) cb(d.data());
      }, function () {});
  }

  async function updCall(cid, st) {
    if (_d && cid) try { await _d.collection('calls').doc(cid).update({ status: st }); } catch (e) {}
  }

  /* ===== গ্রুপ ===== */
  async function mkGroup(name, parts) {
    if (!_d) return null;
    var id = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    var data = {
      name: name, creator: parts[0], members: parts,
      avatar: av(id),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await _d.collection('groups').doc(id).set(data);
    return { id: id, ...data };
  }

  function onGroups(uid, cb) {
    return _d.collection('groups')
      .where('members', 'array-contains', uid)
      .onSnapshot(function (s) {
        cb(s.docs.map(function (d) { return { id: d.id, ...d.data() }; }));
      }, function (err) { console.error('onGroups ত্রুটি:', err); });
  }

  function groupChatId(gid) { return 'g_' + gid; }

  /* ===== অটো লগইন চেক ===== */
  function onAuth(cb) {
    if (!_a) return;
    _a.onAuthStateChanged(async function (u) {
      if (u) {
        try { cb(await _gu(u)); } catch (e) { console.error('onAuth ত্রুটি:', e); }
      }
    });
  }

  async function _gu(u) {
    var d = await _d.collection('users').doc(u.uid).get();
    if (d.exists) return { uid: u.uid, ...d.data() };
    return { uid: u.uid, name: u.displayName || 'ব্যবহারকারী', email: u.email || '', phone: u.phoneNumber || '', avatar: av(u.uid) };
  }

  /* ===== ZEGO কল ইনিশিয়ালাইজ ===== */
  async function initZego(roomId, userId, userName) {
    if (!_C.zg.appId || !_C.zg.appSign) return null;
    try {
      var zg = new ZegoExpressEngine(_C.zg.appId, _C.zg.appSign);
      await zg.loginRoom(roomId, '', { userID: userId, userName: userName });
      return zg;
    } catch (e) {
      console.error('ZEGO ত্রুটি:', e);
      return null;
    }
  }

  return {
    init: init,
    phoneSendOTP: phoneSendOTP,
    phoneVerify: phoneVerify,
    emailReg: emailReg,
    emailLogin: emailLogin,
    googleLogin: googleLogin,
    updateProfile: updateProfile,
    logout: logout,
    setOn: setOn,
    setOff: setOff,
    onUsers: onUsers,
    onChatList: onChatList,
    chatId: chatId,
    sendMsg: sendMsg,
    onMsgs: onMsgs,
    setTyping: setTyping,
    clearTyping: clearTyping,
    onTyping: onTyping,
    mkCall: mkCall,
    onIncCall: onIncCall,
    onCallUpd: onCallUpd,
    updCall: updCall,
    mkGroup: mkGroup,
    onGroups: onGroups,
    groupChatId: groupChatId,
    onAuth: onAuth,
    initZego: initZego,
    av: av,
    get auth() { return _a; },
    get db() { return _d; },
    get ok() { return _ok; }
  };
})();
