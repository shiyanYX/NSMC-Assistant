import React, { useState, useEffect, useRef } from 'react';

/* ===== 验证码字符集（与 xg2 login.js 一致） ===== */
const CAPTCHA_CHARS = [
  '2','3','4','5','6','7','8','9',
  'b','c','e','f','g','h','j','k','m','n','p','r','s','t','u','v','w','x','y','z',
  'B','C','E','F','G','H','J','K','M','N','P','R','S','T','U','V','W','X','Y','Z',
];

function generateCaptcha() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return code;
}

/* ===== 去向事由类型 ===== */
const LEAVE_TYPES = [
  { value: '02045001', label: '求职' },
  { value: '02045002', label: '实习' },
  { value: '02045003', label: '返家' },
  { value: '02045004', label: '培训' },
  { value: '02045005', label: '旅游' },
  { value: '02045006', label: '病假' },
  { value: '02045007', label: '事假' },
  { value: '02045008', label: '留校' },
];

const VEHICLES = ['汽车', '火车', '飞机', '自行车', '其他'];
const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: `${i}点` }));
const PEOPLE_COUNT = Array.from({ length: 31 }, (_, i) => ({ value: String(i), label: `${i}人` }));

/* ===== 默认表单值 ===== */
const DEFAULT_FORM = {
  leaveBeginDate: '',
  leaveBeginTime: '08',
  leaveEndDate: '',
  leaveEndTime: '18',
  leaveType: '02045003',
  leaveThing: '',
  outAddress: '',
  isTellRbl: '1',
  withNumNo: '0',
  jhrName: '',
  jhrPhone: '',
  outTel: '',
  outMoveTel: '',
  relation: '',
  outName: '',
  stuMoveTel: '',
  stuOtherTel: '',
  goDate: '',
  goTime: '08',
  goVehicle: '汽车',
  backDate: '',
  backTime: '18',
  backVehicle: '汽车',
};

function loadTemplates(username) {
  try {
    const raw = localStorage.getItem(`leave_templates_${username}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTemplateList(username, templates) {
  localStorage.setItem(`leave_templates_${username}`, JSON.stringify(templates));
}

/* ===== 主组件 ===== */
export default function LeaveRegistration({ account }) {
  const [step, setStep] = useState('prepare'); // prepare | form | submitting | done
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login fields
  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [xg2Username, setXg2Username] = useState(account?.username || '');
  const [xg2Password, setXg2Password] = useState(account?.password || '');

  // Prep data
  const [prepData, setPrepData] = useState(null);

  // Holiday info
  const [holidayInfo, setHolidayInfo] = useState(null);

  // Form
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [successMsg, setSuccessMsg] = useState('');

  // Template management
  const [templates, setTemplates] = useState([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');

  // Auto-calculated duration
  const [durationText, setDurationText] = useState('');

  // Load templates on mount
  useEffect(() => {
    if (account?.username) {
      setTemplates(loadTemplates(account.username));
    }
  }, [account?.username]);

  // Auto-calc duration when dates/times change
  useEffect(() => {
    calcDuration();
  }, [form.leaveBeginDate, form.leaveBeginTime, form.leaveEndDate, form.leaveEndTime]);

  const calcDuration = () => {
    const { leaveBeginDate, leaveBeginTime, leaveEndDate, leaveEndTime } = form;
    if (!leaveBeginDate || !leaveEndDate) {
      setDurationText('');
      return;
    }
    const b = new Date(leaveBeginDate + 'T' + leaveBeginTime.padStart(2, '0') + ':00');
    const e = new Date(leaveEndDate + 'T' + leaveEndTime.padStart(2, '0') + ':00');
    if (e < b) { setDurationText('结束时间早于开始时间'); return; }
    const diffMs = e - b;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    setDurationText(`${days}天${hours}小时`);
  };

  const setFormField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const refreshCaptcha = () => {
    setCaptchaText(generateCaptcha());
    setCaptchaInput('');
  };

  // Step 1: Prepare login
  const handlePrepare = async () => {
    if (!xg2Username || !xg2Password) { setError('请输入学号和密码'); return; }
    setLoading(true); setError('');
    try {
      const resp = await fetch('http://localhost:5000/api/xg2/prepare', { method: 'POST' });
      const data = await resp.json();
      if (!data.success) { setError(data.message || '准备登录失败'); return; }
      setPrepData(data.data);
      // Generate captcha on client side too (matches server algorithm)
      const code = generateCaptcha();
      setCaptchaText(code);
    } catch (err) { setError('网络错误: ' + err.message); }
    finally { setLoading(false); }
  };

  // Step 2: Submit login
  const handleLogin = async () => {
    if (!captchaInput || captchaInput.toLowerCase() !== captchaText.toLowerCase()) {
      setError('验证码不匹配，请重新输入');
      refreshCaptcha();
      return;
    }
    setLoading(true); setError('');
    try {
      const resp = await fetch('http://localhost:5000/api/xg2/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: xg2Username,
          password: xg2Password,
          captcha: captchaInput,
        }),
      });
      const data = await resp.json();
      if (!data.success) { setError(data.message || 'xg2 登录失败'); refreshCaptcha(); return; }
      setHolidayInfo(data.data);
      // Pre-fill dates with holiday info
      setForm(prev => ({
        ...prev,
        leaveBeginDate: data.data.begin_date || '',
        leaveEndDate: data.data.end_date || '',
        goDate: data.data.begin_date || '',
        backDate: data.data.end_date || '',
      }));
      setStep('form');
      setSuccessMsg('✅ 登录成功');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) { setError('网络错误: ' + err.message); }
    finally { setLoading(false); }
  };

  // Step 3: Submit form
  const handleSubmit = async () => {
    setLoading(true); setError(''); setSuccessMsg('');
    try {
      const fields = {
        'Leave1$LeaveBeginDate': form.leaveBeginDate,
        'Leave1$LeaveBeginTime': form.leaveBeginTime,
        'Leave1$LeaveEndDate': form.leaveEndDate,
        'Leave1$LeaveEndTime': form.leaveEndTime,
        'Leave1$LeaveType': form.leaveType,
        'Leave1$LeaveThing': form.leaveThing,
        'Leave1$CTAreaBox1_ProvinceHid': '',
        'Leave1$CTAreaBox1_CityHid': '',
        'Leave1$CTAreaBox1_AreaHid': '',
        'Leave1$OutAddress': form.outAddress,
        'Leave1$IsTellRbl': form.isTellRbl,
        'Leave1$WithNumNo': form.withNumNo,
        'Leave1$JHRName': form.jhrName,
        'Leave1$JHRPhone': form.jhrPhone,
        'Leave1$OutTel': form.outTel,
        'Leave1$OutMoveTel': form.outMoveTel,
        'Leave1$Relation': form.relation,
        'Leave1$OutName': form.outName,
        'Leave1$StuMoveTel': form.stuMoveTel,
        'Leave1$StuOtherTel': form.stuOtherTel,
        'Leave1$GoDate': form.goDate,
        'Leave1$GoTime': form.goTime,
        'Leave1$GoVehicle': form.goVehicle,
        'Leave1$BackDate': form.backDate,
        'Leave1$BackTime': form.backTime,
        'Leave1$BackVehicle': form.backVehicle,
      };

      const resp = await fetch('http://localhost:5000/api/xg2/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: xg2Username,
          password: xg2Password,
          captcha: captchaInput,
          form_fields: fields,
        }),
      });
      const data = await resp.json();
      if (!data.success) { setError(data.message || '提交失败'); return; }
      setSuccessMsg('✅ ' + data.message);
      setStep('done');
    } catch (err) { setError('网络错误: ' + err.message); }
    finally { setLoading(false); }
  };

  // ===== Template functions =====
  const handleSaveTemplate = () => {
    if (!templateName.trim()) { setError('请输入模板名称'); return; }
    const newTpl = {
      id: Date.now(),
      name: templateName.trim(),
      fields: { ...form },
      createdAt: new Date().toISOString(),
    };
    const updated = [...templates, newTpl];
    setTemplates(updated);
    saveTemplateList(account?.username || '', updated);
    setTemplateName('');
    setTemplateFilter('');
    setError('');
  };

  const handleLoadTemplate = (tpl) => {
    setForm({ ...DEFAULT_FORM, ...tpl.fields });
    setShowTemplateDialog(false);
    setSuccessMsg(`✅ 已加载模板: ${tpl.name}`);
    setTimeout(() => setSuccessMsg(''), 2000);
  };

  const handleDeleteTemplate = (tplId) => {
    const updated = templates.filter(t => t.id !== tplId);
    setTemplates(updated);
    saveTemplateList(account?.username || '', updated);
  };

  const filteredTemplates = templateFilter
    ? templates.filter(t => t.name.includes(templateFilter))
    : templates;

  // ===== Render =====
  if (step === 'form' && holidayInfo) {
    return (
      <div className="lr-root">
        <div className="lr-header">
          <h2>节假日去向登记</h2>
          <div className="lr-header-actions">
            <button className="btn btn-outline" onClick={() => setShowTemplateDialog(true)}>📋 加载模板</button>
            <button className="btn btn-outline" onClick={() => { setTemplateName(''); setShowTemplateDialog(true); }}>💾 保存模板</button>
            <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
              {loading ? '提交中...' : '提交登记'}
            </button>
          </div>
        </div>

        {successMsg && <div className="msg msg-success">{successMsg}</div>}
        {error && <div className="msg msg-error">✗ {error}</div>}

        {/* Holiday info card */}
        <div className="lr-info-card">
          <div className="lr-info-title">{holidayInfo.holiday_name}</div>
          <div className="lr-info-row">
            <span>放假日期：{holidayInfo.begin_date} ~ {holidayInfo.end_date}</span>
            <span>登记截止：{holidayInfo.leave_end_date}</span>
          </div>
          {holidayInfo.memo && <div className="lr-info-memo">{holidayInfo.memo}</div>}
          <div className="lr-info-student">学生：{holidayInfo.student_name}</div>
        </div>

        {/* Template dialog */}
        {showTemplateDialog && (
          <div className="lr-overlay" onClick={() => setShowTemplateDialog(false)}>
            <div className="lr-dialog" onClick={e => e.stopPropagation()}>
              <h3>模板管理</h3>

              {/* Save */}
              <div className="lr-dialog-row">
                <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                  placeholder="输入新模板名称..." className="lr-input lr-input-sm" />
                <button className="btn btn-primary" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
                  保存当前表单
                </button>
              </div>

              <hr />

              {/* Load */}
              <input value={templateFilter} onChange={e => setTemplateFilter(e.target.value)}
                placeholder="搜索模板..." className="lr-input lr-input-sm" style={{ width: '100%', marginBottom: 8 }} />

              {filteredTemplates.length === 0 && <p className="lr-empty">暂无模板</p>}
              {filteredTemplates.map(tpl => (
                <div key={tpl.id} className="lr-tpl-row">
                  <span className="lr-tpl-name">{tpl.name}</span>
                  <span className="lr-tpl-date">{new Date(tpl.createdAt).toLocaleDateString()}</span>
                  <button className="btn btn-text" onClick={() => handleLoadTemplate(tpl)}>加载</button>
                  <button className="btn btn-text" style={{ color: 'var(--danger-fg)' }}
                    onClick={() => handleDeleteTemplate(tpl.id)}>删除</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <div className="lr-form">
          {/* Section: 去向时间 */}
          <div className="lr-section">
            <div className="lr-section-title">去向时间</div>
            <div className="lr-field-row">
              <label>开始日期</label>
              <input type="date" value={form.leaveBeginDate} onChange={e => setFormField('leaveBeginDate', e.target.value)}
                className="lr-input lr-input-date" />
              <label>时间</label>
              <select value={form.leaveBeginTime} onChange={e => setFormField('leaveBeginTime', e.target.value)}
                className="lr-select lr-select-sm">
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
              <label>至</label>
              <input type="date" value={form.leaveEndDate} onChange={e => setFormField('leaveEndDate', e.target.value)}
                className="lr-input lr-input-date" />
              <label>时间</label>
              <select value={form.leaveEndTime} onChange={e => setFormField('leaveEndTime', e.target.value)}
                className="lr-select lr-select-sm">
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
              {durationText && <span className="lr-duration">共 {durationText}</span>}
            </div>
          </div>

          {/* Section: 去向事由 */}
          <div className="lr-section">
            <div className="lr-section-title">去向事由</div>
            <div className="lr-field-row">
              {LEAVE_TYPES.map(lt => (
                <label key={lt.value} className="lr-radio-label">
                  <input type="radio" checked={form.leaveType === lt.value}
                    onChange={() => setFormField('leaveType', lt.value)} />
                  {lt.label}
                </label>
              ))}
            </div>
            <div className="lr-field-col">
              <label>事由说明</label>
              <textarea value={form.leaveThing} onChange={e => setFormField('leaveThing', e.target.value)}
                className="lr-textarea" rows={3} />
            </div>
          </div>

          {/* Section: 去向地点 */}
          <div className="lr-section">
            <div className="lr-section-title">去向地点</div>
            <div className="lr-field-row">
              <input value={form.outAddress} onChange={e => setFormField('outAddress', e.target.value)}
                placeholder="省/市/区 + 详细地址" className="lr-input" style={{ flex: 1 }} />
            </div>
          </div>

          {/* Section: 告知家长 + 同行 */}
          <div className="lr-section">
            <div className="lr-section-title">其他信息</div>
            <div className="lr-field-row">
              <label>已告知家长</label>
              <label className="lr-radio-label"><input type="radio" checked={form.isTellRbl === '1'}
                onChange={() => setFormField('isTellRbl', '1')} />是</label>
              <label className="lr-radio-label"><input type="radio" checked={form.isTellRbl === '0'}
                onChange={() => setFormField('isTellRbl', '0')} />否</label>
              <label style={{ marginLeft: 20 }}>同行人数</label>
              <select value={form.withNumNo} onChange={e => setFormField('withNumNo', e.target.value)}
                className="lr-select">
                {PEOPLE_COUNT.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Section: 家长信息 */}
          <div className="lr-section">
            <div className="lr-section-title">家长或监护人信息</div>
            <div className="lr-field-row">
              <label>姓名</label>
              <input value={form.jhrName} onChange={e => setFormField('jhrName', e.target.value)}
                className="lr-input lr-input-md" placeholder="家长姓名" />
              <label>联系电话</label>
              <input value={form.jhrPhone} onChange={e => setFormField('jhrPhone', e.target.value)}
                className="lr-input lr-input-md" placeholder="手机或固话" />
            </div>
          </div>

          {/* Section: 外出联系人 */}
          <div className="lr-section">
            <div className="lr-section-title">外出联系人</div>
            <div className="lr-field-row">
              <label>固定电话</label>
              <input value={form.outTel} onChange={e => setFormField('outTel', e.target.value)}
                className="lr-input lr-input-md" placeholder="可选" />
              <label>移动电话</label>
              <input value={form.outMoveTel} onChange={e => setFormField('outMoveTel', e.target.value)}
                className="lr-input lr-input-md" placeholder="必填" />
            </div>
            <div className="lr-field-row">
              <label>本人关系</label>
              <input value={form.relation} onChange={e => setFormField('relation', e.target.value)}
                className="lr-input lr-input-md" placeholder="如：父子" />
              <label>联系人姓名</label>
              <input value={form.outName} onChange={e => setFormField('outName', e.target.value)}
                className="lr-input lr-input-md" placeholder="必填" />
            </div>
          </div>

          {/* Section: 本人联系方式 */}
          <div className="lr-section">
            <div className="lr-section-title">本人联系方式</div>
            <div className="lr-field-row">
              <label>本人手机</label>
              <input value={form.stuMoveTel} onChange={e => setFormField('stuMoveTel', e.target.value)}
                className="lr-input lr-input-md" placeholder="必填" />
              <label>其他方式</label>
              <input value={form.stuOtherTel} onChange={e => setFormField('stuOtherTel', e.target.value)}
                className="lr-input lr-input-md" placeholder="可选" />
            </div>
          </div>

          {/* Section: 往返交通工具 */}
          <div className="lr-section">
            <div className="lr-section-title">往返交通工具</div>
            <div className="lr-field-row">
              <label>去程日期</label>
              <input type="date" value={form.goDate} onChange={e => setFormField('goDate', e.target.value)}
                className="lr-input lr-input-date" />
              <label>时间</label>
              <select value={form.goTime} onChange={e => setFormField('goTime', e.target.value)}
                className="lr-select lr-select-sm">
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
              <label>交通工具</label>
              {VEHICLES.map(v => (
                <label key={v} className="lr-radio-label">
                  <input type="radio" checked={form.goVehicle === v}
                    onChange={() => setFormField('goVehicle', v)} />{v}
                </label>
              ))}
            </div>
            <div className="lr-field-row">
              <label>返程日期</label>
              <input type="date" value={form.backDate} onChange={e => setFormField('backDate', e.target.value)}
                className="lr-input lr-input-date" />
              <label>时间</label>
              <select value={form.backTime} onChange={e => setFormField('backTime', e.target.value)}
                className="lr-select lr-select-sm">
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
              <label>交通工具</label>
              {VEHICLES.map(v => (
                <label key={v} className="lr-radio-label">
                  <input type="radio" checked={form.backVehicle === v}
                    onChange={() => setFormField('backVehicle', v)} />{v}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="lr-bottom">
          <button className="btn btn-outline" onClick={() => { setStep('prepare'); setForm({ ...DEFAULT_FORM }); }}>重新填写</button>
          <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading ? '提交中...' : '提交登记'}
          </button>
        </div>

        <style>{css}</style>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="lr-root">
        <div className="lr-done">
          <div className="lr-done-icon">✅</div>
          <h2>登记已提交</h2>
          <p>{successMsg || '节假日去向登记已成功提交'}</p>
          <button className="btn btn-primary" onClick={() => {
            setStep('prepare');
            setForm({ ...DEFAULT_FORM });
            setHolidayInfo(null);
          }}>再次登记</button>
        </div>
        <style>{css}</style>
      </div>
    );
  }

  // Step: prepare — login screen
  return (
    <div className="lr-root">
      <div className="lr-login-card">
        <h2>节假日去向登记</h2>
        <p className="lr-login-desc">请登录 xg2 学工系统以获取去向登记表</p>

        {error && <div className="msg msg-error">✗ {error}</div>}
        {successMsg && <div className="msg msg-success">{successMsg}</div>}

        <div className="lr-field-col">
          <label>学号</label>
          <input value={xg2Username} onChange={e => setXg2Username(e.target.value)}
            className="lr-input" placeholder="请输入学号" />
        </div>
        <div className="lr-field-col">
          <label>密码</label>
          <input type="password" value={xg2Password} onChange={e => setXg2Password(e.target.value)}
            className="lr-input" placeholder="请输入 xg2 密码" />
        </div>

        {prepData ? (
          <>
            <div className="lr-captcha-area">
              <div className="lr-captcha-text">{captchaText}</div>
              <button className="btn btn-text" onClick={refreshCaptcha}>换一张</button>
            </div>
            <div className="lr-field-col">
              <label>验证码</label>
              <input value={captchaInput} onChange={e => setCaptchaInput(e.target.value)}
                className="lr-input" placeholder="输入上方验证码" maxLength={4} />
            </div>
            <button className="btn btn-primary lr-btn-full" disabled={loading} onClick={handleLogin}>
              {loading ? '登录中...' : '登录 xg2'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary lr-btn-full" disabled={loading} onClick={handlePrepare}>
            {loading ? '获取中...' : '获取验证码'}
          </button>
        )}
      </div>
      <style>{css}</style>
    </div>
  );
}

/* ===== CSS ===== */
const css = `
.lr-root { max-width: 900px; margin: 0 auto; }

.lr-login-card {
  max-width: 380px; margin: 40px auto;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 28px;
}
.lr-login-card h2 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.lr-login-desc { font-size: 13px; color: var(--muted); margin: 0 0 20px; }

.lr-captcha-area {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
}
.lr-captcha-text {
  font: 700 28px/1 monospace; letter-spacing: 6px; padding: 10px 16px;
  background: oklch(50% 0.14 255 / 0.07); border-radius: var(--radius-sm);
  border: 1px solid var(--border); user-select: none; color: var(--accent);
  text-shadow: 0 0 2px currentColor;
}

.lr-btn-full { width: 100%; }

/* Form layout */
.lr-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;
}
.lr-header h2 { font-size: 17px; font-weight: 600; margin: 0; }
.lr-header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.lr-info-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 14px 18px; margin-bottom: 16px;
}
.lr-info-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; color: var(--accent); }
.lr-info-row { display: flex; gap: 24px; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
.lr-info-memo { font-size: 12px; color: var(--muted); margin: 6px 0; line-height: 1.5; }
.lr-info-student { font-size: 13px; font-weight: 500; margin-top: 6px; }

.lr-form { }
.lr-section {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: 12px 16px; margin-bottom: 10px;
}
.lr-section-title {
  font-size: 13px; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px;
  border-bottom: 1px solid var(--border); color: var(--accent);
}
.lr-field-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;
}
.lr-field-row label { font-size: 12px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }
.lr-field-col { margin-bottom: 8px; }
.lr-field-col label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 3px; }

.lr-input, .lr-select, .lr-textarea {
  font: 13px/1.4 var(--font); color: var(--fg);
  background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
  outline: none; padding: 5px 8px;
}
.lr-input:focus, .lr-select:focus, .lr-textarea:focus { border-color: var(--accent); }
.lr-input-md { width: 130px; }
.lr-input-date { width: 110px; }
.lr-select { height: 28px; cursor: pointer; }
.lr-select-sm { width: 65px; }
.lr-textarea { width: 100%; resize: vertical; }
.lr-radio-label {
  display: inline-flex; align-items: center; gap: 3px; cursor: pointer;
  font-size: 13px; padding: 2px 6px; border-radius: 4px; color: var(--fg);
}
.lr-radio-label input { accent-color: var(--accent); }
.lr-duration { font-size: 12px; color: var(--accent); font-weight: 500; }

.lr-bottom {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-bottom: 20px;
}

/* Dialog */
.lr-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100;
  display: flex; align-items: center; justify-content: center;
}
.lr-dialog {
  background: var(--surface); border-radius: var(--radius); width: 420px; max-height: 70vh;
  padding: 20px; overflow-y: auto;
}
.lr-dialog h3 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
.lr-dialog hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
.lr-dialog-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: center; }
.lr-input-sm { flex: 1; height: 28px; font-size: 12px; }

.lr-tpl-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 4px;
  border-bottom: 1px solid var(--border);
}
.lr-tpl-name { flex: 1; font-size: 13px; font-weight: 500; }
.lr-tpl-date { font-size: 11px; color: var(--muted); }
.lr-empty { font-size: 13px; color: var(--muted); text-align: center; padding: 16px 0; }

/* Done */
.lr-done { text-align: center; padding: 60px 20px; }
.lr-done-icon { font-size: 48px; margin-bottom: 12px; }
.lr-done h2 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
.lr-done p { font-size: 14px; color: var(--muted); margin: 0 0 20px; }
`;
