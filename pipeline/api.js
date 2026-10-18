/* Team Pipeline: sign-in, account menu and the connection to Jason's server (Google Apps Script).
   It gives the pipeline screens the same small interface they had inside Claude:
   claude.use('db' | 'user' | 'mcp'). */
(function () {
  'use strict';
  var CFG = window.PIPELINE_CONFIG || {};
  var API = CFG.apiUrl || '';
  var TOKEN_KEY = 'tp_token';
  var POLL_MS = 15000;

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  var ERRORS = {
    wrong_login: 'That email and password don’t match. Try again.',
    locked: 'Too many tries. Wait 15 minutes and try again.',
    invite_not_found: 'This invite link was already used or isn’t valid. Ask Jason for a new one.',
    invite_expired: 'This invite link has expired. Ask Jason for a new one.',
    password_too_short: 'Use at least 10 characters.',
    need_name_and_email: 'Add a name and a valid email.',
    not_allowed: 'Only Jason can do that.',
    network: 'Couldn’t reach the server. Check your connection and try again.'
  };
  function msg(code) { return ERRORS[code] || 'Something went wrong. Try again.'; }

  function call(action, payload) {
    if (!API) return Promise.reject(Object.assign(new Error('not_configured'), { code: 'not_configured' }));
    var body = Object.assign({ action: action, token: getToken() }, payload || {});
    return fetch(API, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .catch(function () { throw Object.assign(new Error('network'), { code: 'network' }); })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) {
          var code = (j && j.error) || 'error';
          var e = new Error(code); e.code = code === 'not_allowed' ? 'invalid_argument' : code; e.raw = code;
          if (code === 'not_signed_in') signedOut();
          throw e;
        }
        return j;
      });
  }

  /* ---------------- local copy of the data, kept fresh by polling ---------------- */
  var cache = new Map();
  var listeners = new Set();
  var cursor = 0;
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function parentOf(p) { var s = p.split('/'); s.pop(); return s.join('/'); }
  function docSnap(path) {
    var e = cache.get(path);
    return { exists: !!e, id: path.split('/').pop(), ref: { path: path }, data: function () { return e ? clone(e.data) : undefined; } };
  }
  function colSnap(col) {
    var docs = [];
    cache.forEach(function (v, k) { if (parentOf(k) === col) docs.push(docSnap(k)); });
    return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); } };
  }
  function apply(docs) {
    var changed = new Set();
    (docs || []).forEach(function (d) {
      if (!d || !d.path) return;
      var cur = cache.get(d.path);
      if (cur && cur.version > d.version) return;
      if (d.deleted || d.data == null) { if (cache.delete(d.path)) changed.add(d.path); }
      else { cache.set(d.path, { data: d.data, version: d.version }); changed.add(d.path); }
    });
    if (!changed.size) return;
    listeners.forEach(function (l) {
      var hit = false;
      changed.forEach(function (p) { if ((l.kind === 'doc' && p === l.path) || (l.kind === 'col' && parentOf(p) === l.path)) hit = true; });
      if (hit) try { l.cb(l.kind === 'doc' ? docSnap(l.path) : colSnap(l.path)); } catch (e) { console.error(e); }
    });
  }
  function listen(kind, path, cb) {
    var l = { kind: kind, path: path, cb: cb };
    listeners.add(l);
    setTimeout(function () { if (listeners.has(l)) cb(kind === 'doc' ? docSnap(path) : colSnap(path)); }, 0);
    return function () { listeners.delete(l); };
  }

  var syncing = null;
  function sync() {
    if (syncing) return syncing;
    syncing = call('sync', { since: cursor }).then(function (j) {
      apply(j.docs); if (j.cursor > cursor) cursor = j.cursor; setStatus('');
    }).catch(function (e) {
      if (e.code === 'network') setStatus('Offline. Changes will show when you’re back online.');
    }).then(function () { syncing = null; });
    return syncing;
  }
  function afterWrite(j) { if (j && j.doc) apply([j.doc]); return j; }

  function docRef(path) {
    return {
      path: path, id: path.split('/').pop(),
      get: function () { return call('get', { path: path }).then(function (j) { if (j.doc) apply([j.doc]); else apply([{ path: path, deleted: true, version: Infinity }]); return docSnap(path); }); },
      set: function (data) { return call('set', { path: path, data: data }).then(afterWrite); },
      update: function (patch) { return call('update', { path: path, patch: patch }).then(afterWrite); },
      delete: function () { return call('delete', { path: path }).then(function () { var c = cache.get(path); apply([{ path: path, deleted: true, version: (c ? c.version : 0) + 1 }]); }); },
      onSnapshot: function (cb) { return listen('doc', path, cb); }
    };
  }
  var db = {
    doc: docRef,
    collection: function (path) {
      return { path: path, doc: function (id) { return docRef(path + '/' + id); }, onSnapshot: function (cb) { return listen('col', path, cb); } };
    }
  };

  /* ---------------- who is signed in ---------------- */
  var me = null, team = [];
  var user = {
    id: function () { return Promise.resolve(me && me.uid); },
    isOwner: function () { return me && me.role === 'owner'; },
    canEdit: function () { return me && me.role === 'owner'; },
    me: function () { return Promise.resolve(me ? { id: me.uid, name: me.name, email: me.email } : null); },
    profiles: function (ids) {
      var out = {};
      (ids || []).forEach(function (id) { var t = team.filter(function (x) { return x.uid === id; })[0]; out[id] = { name: t ? t.name : '' }; });
      return Promise.resolve(out);
    }
  };

  /* ---------------- agent email, sent by the server from Jason's account ---------------- */
  var mcp = {
    callTool: function (server, tool, input) {
      if (tool !== 'send_message') return Promise.reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }));
      var to = Array.isArray(input.to) ? input.to[0] : input.to;
      return call('mail', { to: to, subject: input.subject, body: input.body });
    }
  };

  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });
  window.claude = { use: function (name) { return ready.then(function () { return name === 'db' ? db : name === 'user' ? user : name === 'mcp' ? mcp : null; }); } };

  function start() {
    return call('whoami').then(function (j) {
      me = j.me; team = j.team || [];
      return call('sync', { since: 0 });
    }).then(function (j) {
      apply(j.docs); cursor = j.cursor || 0;
      hideGate(); addAccountButton(); readyResolve();
      setInterval(function () { if (document.visibilityState === 'visible') sync(); }, POLL_MS);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(); });
    });
  }
  function signedOut() { setToken(''); if (!gateShown) location.reload(); }

  /* ---------------- sign-in screen ---------------- */
  var gateShown = false, gate = null;
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) n.append(c); });
    return n;
  }
  function hideGate() { if (gate) gate.remove(); gate = null; gateShown = false; }
  function showGate(build) {
    gateShown = true;
    if (!gate) { gate = el('div', { class: 'tp-gate', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sign in' }); document.body.append(gate); }
    gate.replaceChildren(el('div', { class: 'tp-card' }, [
      el('div', { class: 'tp-brand' }, [el('b', { text: 'Team Pipeline' }), el('span', { text: 'Jason Robinson & Suzanne Sanders · Prosperity Home Mortgage' })])
    ].concat(build())));
    var first = gate.querySelector('input'); if (first) first.focus();
  }
  function errLine() { return el('div', { class: 'tp-err', 'aria-live': 'polite' }); }

  function showLogin(note) {
    showGate(function () {
      var email = el('input', { type: 'email', id: 'tp-email', autocomplete: 'username', required: true });
      var pw = el('input', { type: 'password', id: 'tp-pw', autocomplete: 'current-password', required: true });
      var err = errLine(); if (note) err.textContent = note;
      var btn = el('button', { class: 'btn primary', type: 'submit', text: 'Sign in' });
      var f = el('form', { onsubmit: function (e) {
        e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Signing in…';
        call('login', { email: email.value, password: pw.value }).then(function (j) { setToken(j.token); return start(); })
          .catch(function (e2) { err.textContent = msg(e2.raw || e2.code); btn.disabled = false; btn.textContent = 'Sign in'; });
      } }, [el('label', {}, ['Email', email]), el('label', {}, ['Password', pw]), err, btn,
        el('p', { class: 'tp-small', text: 'Forgot your password? Ask Jason for a new invite link.' })]);
      return [f];
    });
  }

  function showInvite(code) {
    showGate(function () { return [el('p', { text: 'Checking your invite…' })]; });
    call('inviteInfo', { code: code }).then(function (info) {
      showGate(function () {
        var pw = el('input', { type: 'password', id: 'tp-new', autocomplete: 'new-password', minlength: '10', required: true });
        var pw2 = el('input', { type: 'password', id: 'tp-new2', autocomplete: 'new-password', required: true });
        var err = errLine();
        var btn = el('button', { class: 'btn primary', type: 'submit', text: 'Set password and sign in' });
        var f = el('form', { onsubmit: function (e) {
          e.preventDefault(); err.textContent = '';
          if (pw.value.length < 10) { err.textContent = msg('password_too_short'); return; }
          if (pw.value !== pw2.value) { err.textContent = 'The two passwords don’t match.'; return; }
          btn.disabled = true;
          call('acceptInvite', { code: code, password: pw.value }).then(function (j) {
            setToken(j.token); history.replaceState(null, '', location.pathname); return start();
          }).catch(function (e2) { err.textContent = msg(e2.raw || e2.code); btn.disabled = false; });
        } }, [
          el('p', { text: 'Welcome, ' + info.name + '! Set a password for ' + info.email + '.' }),
          el('label', {}, ['New password (10+ characters)', pw]), el('label', {}, ['Type it again', pw2]), err, btn]);
        return [f];
      });
    }).catch(function (e) { history.replaceState(null, '', location.pathname); showLogin(msg(e.raw || e.code)); });
  }

  /* ---------------- account menu: password, team (Jason only), sign out ---------------- */
  var statusEl = null;
  function setStatus(t) { if (statusEl) { statusEl.textContent = t; statusEl.hidden = !t; } }
  function addAccountButton() {
    var host = document.querySelector('.mast-in');
    if (!host || document.getElementById('tp-account')) return;
    var b = el('button', { class: 'btn tp-acct', id: 'tp-account', type: 'button', text: (me.name || 'Account').split(' ')[0], 'aria-haspopup': 'dialog', onclick: openAccount });
    host.append(b);
    statusEl = el('div', { class: 'tp-status', role: 'status', hidden: true });
    document.body.append(statusEl);
  }
  function openAccount() {
    var owner = me.role === 'owner';
    var wrap = el('div', { class: 'tp-gate', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Account', onclick: function (e) { if (e.target === wrap) wrap.remove(); } });
    var close = el('button', { class: 'btn', type: 'button', text: 'Close', onclick: function () { wrap.remove(); } });
    var card = el('div', { class: 'tp-card' }, [
      el('div', { class: 'tp-row' }, [el('div', {}, [el('b', { text: me.name }), el('div', { class: 'tp-small', text: me.email + (owner ? ' · Admin' : '') })]), close])
    ]);
    // change password
    var npw = el('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password' });
    var perr = errLine();
    card.append(el('div', { class: 'tp-sec' }, [el('h3', { text: 'Change password' }), npw, perr,
      el('button', { class: 'btn', type: 'button', text: 'Save new password', onclick: function () {
        perr.textContent = '';
        call('changePassword', { password: npw.value }).then(function () { npw.value = ''; perr.textContent = 'Password changed.'; })
          .catch(function (e) { perr.textContent = msg(e.raw || e.code); });
      } })]));
    if (owner) {
      var list = el('div', { class: 'tp-team' });
      var drawTeam = function () {
        list.replaceChildren.apply(list, team.map(function (t) {
          return el('div', { class: 'tp-row' }, [el('span', { text: t.name + ' · ' + t.email + (t.role === 'owner' ? ' (admin)' : '') }),
            t.uid === me.uid ? null : el('button', { class: 'btn ghost', type: 'button', text: 'Remove access', onclick: function (ev) {
              var b = ev.currentTarget;
              if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to remove'; return; }
              call('removeUser', { uid: t.uid }).then(function () { team = team.filter(function (x) { return x.uid !== t.uid; }); drawTeam(); });
            } })]);
        }));
      };
      drawTeam();
      var iname = el('input', { 'aria-label': 'Teammate name', placeholder: 'Name' });
      var iemail = el('input', { type: 'email', 'aria-label': 'Teammate email', placeholder: 'Email' });
      var ierr = errLine(), linkBox = el('div', { class: 'tp-link', hidden: true });
      card.append(el('div', { class: 'tp-sec' }, [el('h3', { text: 'Team' }), list,
        el('h3', { text: 'Invite a teammate' }),
        el('p', { class: 'tp-small', text: 'Makes a one-time link (good for 7 days). Send it to them; they set their own password. Use it again for someone who forgot their password.' }),
        iname, iemail, ierr,
        el('button', { class: 'btn primary', type: 'button', text: 'Create invite link', onclick: function () {
          ierr.textContent = ''; linkBox.hidden = true;
          call('invite', { name: iname.value, email: iemail.value }).then(function (j) {
            linkBox.hidden = false;
            var inp = el('input', { readonly: true, value: j.link, 'aria-label': 'Invite link' });
            linkBox.replaceChildren(inp, el('button', { class: 'btn', type: 'button', text: 'Copy link', onclick: function () {
              try { navigator.clipboard.writeText(j.link); ierr.textContent = 'Copied.'; } catch (e) { inp.select(); }
            } }));
            call('whoami').then(function (w) { team = w.team || team; drawTeam(); });
          }).catch(function (e) { ierr.textContent = msg(e.raw || e.code); });
        } }), linkBox]));
    }
    card.append(el('div', { class: 'tp-sec' }, [el('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: function () {
      call('logout').catch(function () {}).then(function () { setToken(''); location.reload(); });
    } })]));
    wrap.append(card); document.body.append(wrap);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    if (!API) { showGate(function () { return [el('p', { text: 'The pipeline server isn’t connected yet.' })]; }); return; }
    var inv = new URLSearchParams(location.search).get('invite');
    if (inv) { showInvite(inv); return; }
    if (!getToken()) { showLogin(); return; }
    start().catch(function (e) { if (e.code === 'network') showLogin(msg('network')); else { setToken(''); showLogin(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
