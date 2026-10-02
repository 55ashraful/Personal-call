/* ================================================================
   firebase.js — Auth + Firestore + ImgBB আপলোড + WebRTC সিগন্যালিং
   নতুন: uploadImage() — চ্যাটে ছবি পাঠানোর জন্য (প্রোফাইল ছবিও এটা দিয়েই)
   ================================================================ */
var DB = (function () {
  var _a = null, _d = null, _ok = false;

  function init() {
    if (_ok) return true;
    if (typeof _C === 'undefined' || !_C.fb || !_C.fb.apiKey) {
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

  function av(id) { return 'https://picsum.photos/seed/' + id + '/200/200.jpg'; }

  function normPhone(p) {
    p = String(p || '').replace(/[\s\-().]/g, '');
    if (p && p.charAt(0) !== '+') p = '+' + p;
    return p;
  }

  /* ================================================================
     ★ ImgBB ছবি আপলোড (সাইজ প্যারামিটারসহ) ★
     ১) ছবি canvas দিয়ে ছোট করা হয় (দ্রুত + কম ডাটা)
     ২) base64 করে ImgBB API-তে পাঠানো
     ৩) হোস্ট করা URL রিটার্ন
     ================================================================ */
  function resizeImage(file, maxSize) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxSize / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * scale);
        cv.height = Math.round(h * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (blob) {
          if (blob) res(blob); else rej(new Error('ছবি প্রসেস ব্যর্থ'));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('ছবি পড়া যায়নি')); };
      img.src = url;
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result.split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  /* ★ সাধারণ ছবি আপলোড — maxSize দিয়ে ঠিক করা যায়
     চ্যাটের ছবি: 1280 (বড়, পরিষ্কার দেখা যায়)
     প্রোফাইল ছবি: 512 (ছোট, দ্রুত) */
  async function uploadImage(file, maxSize) {
    if (!_C.imgbb || !_C.imgbb.apiKey) {
      throw new Error('ImgBB API key নেই — config.js ঠিক করুন');
    }
    var blob = await resizeImage(file, maxSize || 1280);
    var b64 = await blobToBase64(blob);
    var fd = new FormData();
    fd.append('key', _C.imgbb.apiKey);
    fd.append('image', b64);
    var resp = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
    var j = await resp.json();
    if (j && j.success && j.data) {
      return j.data.display_url || j.data.url;
    }
    throw new Error('ছবি আপলোড ব্যর্থ — আবার চেষ্টা করুন');
  }

  /* প্রোফাইল ছবি — uploadImage এর ছোট সংস্করণ */
  async function uploadAvatar(file) {
    return uploadImage(file, 512);
  }

  /* ================================================================
     রেজিস্ট্রেশন (ইমেইল ভেরিফাই হওয়ার পর)
     ================================================================ */
  async function phoneExists(phone) {
    var s = await _d.collection('users').where('phone', '==', normPhone(phone)).limit(1).get();
    return !s.empty;
  }

  async function registerAccount(name, phone, email, pass) {
    var c = await _a.createUserWithEmailAndPassword(email, pass);
    await c.user.updateProfile({ displayName: name });
    await _d.collection('users').doc(c.user.uid).set({
      name: name,
      phone: normPhone(phone),
      email: email,
      avatar: av(c.user.uid),
      online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { uid: c.user.uid, name: name, phone: normPhone(phone), email: email, avatar: av(c.user.uid), isNew: true };
  }

  async function emailLogin(email, pass) {
    var c = await _a.signInWithEmailAndPassword(email, pass);
    return await _gu(c.user);
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

  /* নম্বর দিয়ে ইউজার খোঁজা (ডায়ালারের জন্য) */
  async function findByPhone(phone) {
    phone = normPhone(phone);
    if (!/^\+\d{8,15}$/.test(phone)) return null;
    var s = await _d.collection('users').where('phone', '==', phone).limit(1).get();
    if (s.empty) return null;
    var d = s.docs[0];
    return { id: d.id, ...d.data() };
  }

  /* ===== কন্টাক্ট ===== */
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

  /* ===== চ্যাট ===== */
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
     calls/{id} = {callerId, calleeId, type, status, offer, answer}
     calls/{id}/cands_caller ও cands_callee — ICE ক্যান্ডিডেট
     ================================================================ */
  async function mkCall(data, offer) {
    if (!_d) return null;
    var id = 'cl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    await _d.collection('calls').doc(id).set({
      callerId: data.callerId, calleeId: data.calleeId,
      callerName: data.callerName || '', callerAvatar: data.callerAvatar || '',
      calleeName: data.calleeName || '',
      type: data.type, status: 'ringing', offer: offer,
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
    if (_d && id) { try { await _d.collection('calls').doc(id).update(patch); } catch (e) {} }
  }

  async function addCandidate(id, side, cand) {
    if (!_d || !id) return;
    try { await _d.collection('calls').doc(id).collection('cands_' + side).add(cand); } catch (e) {}
  }

  function onCandidates(id, side, cb) {
    if (!_d) return function () {};
    return _d.collection('calls').doc(id).collection('cands_' + side)
      .onSnapshot(function (s) {
        s.docChanges().forEach(function (c) { if (c.type === 'added') cb(c.doc.data()); });
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

  /* ===== কল হিস্ট্রি ===== */
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

  /* ===== অটো লগইন চেক ===== */
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
    av: av,
    uploadImage: uploadImage,
    uploadAvatar: uploadAvatar,
    phoneExists: phoneExists,
    registerAccount: registerAccount,
    emailLogin: emailLogin,
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
    get auth() { return _a; },
    get db() { return _d; },
    get ok() { return _ok; }
  };
})();
