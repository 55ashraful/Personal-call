  async function sendCodeViaEmail() {
    if (!emailJsReady()) {
      var e = new Error('EmailJS কনফিগার নেই');
      e.code = 'emailjs/not-configured';
      throw e;
    }
    S.emailCode = String(Math.floor(100000 + Math.random() * 900000));
    S.codeExp = Date.now() + 10 * 60 * 1000;

    /* ★ ফিক্স: publicKey সরাসরি send কলে পাঠানো হচ্ছে ★ */
    await emailjs.send(_C.email.serviceId, _C.email.templateId, {
      to_email: S.pendingReg.email,
      to_name: S.pendingReg.name,
      code: S.emailCode,
      app_name: 'Personal Call'
    }, { publicKey: _C.email.publicKey });
  }
