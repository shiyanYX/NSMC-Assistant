const isTauri = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__);

let _invoke = null;
async function getInvoke() {
  if (_invoke) return _invoke;
  if (isTauri) {
    // Try module import first (desktop dev/prod)
    try {
      const mod = await import('@tauri-apps/api/core');
      _invoke = mod.invoke;
      return _invoke;
    } catch (_) {}
    // Fallback: use IPC bridge directly (mobile)
    const ipc = window.__TAURI_INTERNALS__;
    if (ipc && typeof ipc.invoke === 'function') {
      _invoke = (cmd, args) => ipc.invoke(cmd, args);
      return _invoke;
    }
  }
  return null;
}

const BACKEND_URL = 'http://localhost:5000/api';

function tauriError(err) {
  if (typeof err === 'string') return err;
  if (err?.message) return err.message;
  return String(err);
}

export async function apiLogin(username, password) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('login', { username, password });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '登录失败');
  return data.data;
}

export async function apiGetScore(username, password, name, term) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('get_score', { username, password, name, term });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/score`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, name, term }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '获取成绩失败');
  return data.data;
}

export async function apiEvaluationList(username, password) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('evaluation_list', { username, password });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/evaluation/list`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '获取评价列表失败');
  return data.data;
}

export async function apiEvaluationSubmit(username, password, teacher, do_submit) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('evaluation_submit', { username, password, teacher, do_submit });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/evaluation/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, teacher, do_submit }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '提交评价失败');
  return { success: true, message: data.message || '提交成功' };
}

export async function apiXg2Login(username, password) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('xg2_login', { username, password });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/xg2/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'xg2 登录失败');
  return data.data;
}

export async function apiXg2EditForm(username) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('xg2_edit_form', { username });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/xg2/edit-form`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '获取编辑页失败');
  return data.data;
}

export async function apiXg2Submit(username, form_fields) {
  const invoke = await getInvoke();
  if (invoke) {
    try {
      return await invoke('xg2_submit', { username, form_fields });
    } catch (e) {
      throw new Error(tauriError(e));
    }
  }
  const res = await fetch(`${BACKEND_URL}/xg2/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, form_fields }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || '提交失败');
  return data.message || '提交成功';
}

export { isTauri };
