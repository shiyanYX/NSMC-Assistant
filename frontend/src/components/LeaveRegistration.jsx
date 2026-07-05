import React, { useState, useEffect } from 'react';

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

function calcDuration(bDate, bTime, eDate, eTime) {
  if (!bDate || !eDate) return '';
  const b = new Date(bDate + 'T' + bTime.padStart(2, '0') + ':00');
  const e = new Date(eDate + 'T' + eTime.padStart(2, '0') + ':00');
  if (e < b) return '结束时间早于开始时间';
  const diffMs = e - b;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days}天${hours}小时`;
}

const setField = (setter) => (field, value) => setter(prev => ({ ...prev, [field]: value }));

export default function LeaveRegistration({ account }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [holidayInfo, setHolidayInfo] = useState(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [successMsg, setSuccessMsg] = useState('');

  // Template dialog
  const [showTplDialog, setShowTplDialog] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplFilter, setTplFilter] = useState('');
  const [templates, setTemplates] = useState([]);

  const sf = setField(setForm);

  useEffect(() => {
    if (account?.username) setTemplates(loadTemplates(account.username));
  }, [account?.username]);

  const durationText = calcDuration(form.leaveBeginDate, form.leaveBeginTime, form.leaveEndDate, form.leaveEndTime);

  // Login: single API call, backend auto-handles captcha
  const handleLogin = async () => {
    if (!account?.username || !account?.password) { setError('请在上级页面输入学号和密码'); return; }
    setLoading(true); setError('');
    try {
      const resp = await fetch('http://localhost:5000/api/xg2/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: account.username, password: account.password }),
      });
      const data = await resp.json();
      if (!data.success) { setError(data.message || 'xg2 登录失败'); return; }
      const info = data.data;
      setHolidayInfo(info);
      // Pre-fill dates
      sf('leaveBeginDate', info.begin_date || '');
      sf('leaveEndDate', info.end_date || '');
      sf('goDate', info.begin_date || '');
      sf('backDate', info.end_date || '');
      setLoggedIn(true);
    } catch (err) { setError('网络错误: ' + err.message); }
    finally { setLoading(false); }
  };

  // Submit
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
        body: JSON.stringify({ username: account.username, form_fields: fields }),
      });
      const data = await resp.json();
      if (!data.success) { setError(data.message || '提交失败'); return; }
      setSuccessMsg('✅ ' + data.message);
    } catch (err) { setError('网络错误: ' + err.message); }
    finally { setLoading(false); }
  };

  // Template mgmt
  const handleSaveTpl = () => {
    if (!tplName.trim()) return;
    const updated = [...templates, { id: Date.now(), name: tplName.trim(), fields: { ...form }, createdAt: new Date().toISOString() }];
    setTemplates(updated);
    saveTemplateList(account?.username || '', updated);
    setTplName('');
  };
  const handleLoadTpl = (tpl) => { setForm({ ...DEFAULT_FORM, ...tpl.fields }); setShowTplDialog(false); setSuccessMsg('✅ 已加载模板: ' + tpl.name); setTimeout(() => setSuccessMsg(''), 2000); };
  const handleDelTpl = (id) => { const u = templates.filter(t => t.id !== id); setTemplates(u); saveTemplateList(account?.username || '', u); };
  const filteredTemplates = tplFilter ? templates.filter(t => t.name.includes(tplFilter)) : templates;
  const TPL_DIALOG = (
    <div className="lr-overlay" onClick={() => setShowTplDialog(false)}>
      <div className="lr-dialog" onClick={e => e.stopPropagation()}>
        <h3>模板管理</h3>
        <div className="lr-dialog-row"><input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="输入模板名称..." className="lr-input lr-input-sm" /><button className="btn btn-primary" onClick={handleSaveTpl} disabled={!tplName.trim()}>保存当前</button></div>
        <hr />
        <input value={tplFilter} onChange={e => setTplFilter(e.target.value)} placeholder="搜索模板..." className="lr-input" style={{ width: '100%', marginBottom: 8, fontSize: 12, height: 28 }} />
        {filteredTemplates.length === 0 && <p className="lr-empty">暂无模板</p>}
        {filteredTemplates.map(t => (
          <div key={t.id} className="lr-tpl-row"><span className="lr-tpl-name">{t.name}</span><span className="lr-tpl-date">{new Date(t.createdAt).toLocaleDateString()}</span><button className="btn btn-text" onClick={() => handleLoadTpl(t)}>加载</button><button className="btn btn-text" style={{ color: 'var(--danger-fg)' }} onClick={() => handleDelTpl(t.id)}>删除</button></div>
        ))}
      </div>
    </div>
  );

  // ====== Not logged in yet ======
  if (!loggedIn) {
    return (
      <div className="lr-root">
        <div className="lr-login-card">
          <h2>节假日去向登记</h2>
          <p className="lr-login-desc">将使用学号 <strong>{account?.username}</strong> 登录 xg2 学工系统</p>
          {error && <div className="msg msg-error">✗ {error}</div>}
          <button className="btn btn-primary lr-btn-full" disabled={loading} onClick={handleLogin}>
            {loading ? '登录中...' : '开始登记'}
          </button>
        </div>
        <style>{CSS}</style>
      </div>
    );
  }

  // ====== Form ======
  return (
    <div className="lr-root">
      <div className="lr-header">
        <h2>节假日去向登记</h2>
        <div className="lr-header-actions">
          <button className="btn btn-outline" onClick={() => setShowTplDialog(true)}>模板</button>
          <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
            {loading ? '提交中...' : '提交登记'}
          </button>
        </div>
      </div>
      {successMsg && <div className="msg msg-success">{successMsg}</div>}
      {error && <div className="msg msg-error">✗ {error}</div>}

      {showTplDialog && TPL_DIALOG}

      {/* Holiday info */}
      <div className="lr-info-card">
        <div className="lr-info-title">{holidayInfo?.holiday_name}</div>
        <div className="lr-info-row"><span>放假：{holidayInfo?.begin_date} ~ {holidayInfo?.end_date}</span><span>登记截止：{holidayInfo?.leave_end_date}</span></div>
        {holidayInfo?.memo && <div className="lr-info-memo">{holidayInfo.memo}</div>}
        <div className="lr-info-student">学生：{holidayInfo?.student_name}</div>
      </div>

      {/* 去向时间 */}
      <Sect title="去向时间">
        <Row>开始 <D input={form.leaveBeginDate} onChange={v => sf('leaveBeginDate', v)} type="date" /> <Sel value={form.leaveBeginTime} onChange={v => sf('leaveBeginTime', v)} opts={HOURS} /> 至 <D input={form.leaveEndDate} onChange={v => sf('leaveEndDate', v)} type="date" /> <Sel value={form.leaveEndTime} onChange={v => sf('leaveEndTime', v)} opts={HOURS} /> {durationText && <span className="lr-duration">共 {durationText}</span>}</Row>
      </Sect>

      {/* 去向事由 */}
      <Sect title="去向事由">
        <Row>{LEAVE_TYPES.map(lt => <label key={lt.value} className="lr-radio-label"><input type="radio" checked={form.leaveType === lt.value} onChange={() => sf('leaveType', lt.value)} />{lt.label}</label>)}</Row>
        <Col label="事由说明"><textarea value={form.leaveThing} onChange={e => sf('leaveThing', e.target.value)} className="lr-textarea" rows={3} /></Col>
      </Sect>

      {/* 去向地点 */}
      <Sect title="去向地点"><Row><D input={form.outAddress} onChange={v => sf('outAddress', v)} placeholder="省/市/区 + 详细地址" style={{ flex: 1 }} /></Row></Sect>

      {/* 其他 */}
      <Sect title="其他信息">
        <Row>已告知家长 <label className="lr-radio-label"><input type="radio" checked={form.isTellRbl === '1'} onChange={() => sf('isTellRbl', '1')} />是</label><label className="lr-radio-label"><input type="radio" checked={form.isTellRbl === '0'} onChange={() => sf('isTellRbl', '0')} />否</label> 同行人数 <Sel value={form.withNumNo} onChange={v => sf('withNumNo', v)} opts={PEOPLE_COUNT} /></Row>
      </Sect>

      {/* 家长 */}
      <Sect title="家长或监护人信息">
        <Row>姓名 <D input={form.jhrName} onChange={v => sf('jhrName', v)} width={130} /> 联系电话 <D input={form.jhrPhone} onChange={v => sf('jhrPhone', v)} width={130} /></Row>
      </Sect>

      {/* 外出联系人 */}
      <Sect title="外出联系人">
        <Row>固定电话 <D input={form.outTel} onChange={v => sf('outTel', v)} width={130} /> 移动电话 <D input={form.outMoveTel} onChange={v => sf('outMoveTel', v)} width={130} /></Row>
        <Row>本人关系 <D input={form.relation} onChange={v => sf('relation', v)} width={130} /> 联系人姓名 <D input={form.outName} onChange={v => sf('outName', v)} width={130} /></Row>
      </Sect>

      {/* 本人联系方式 */}
      <Sect title="本人联系方式">
        <Row>本人手机 <D input={form.stuMoveTel} onChange={v => sf('stuMoveTel', v)} width={130} /> 其他方式 <D input={form.stuOtherTel} onChange={v => sf('stuOtherTel', v)} width={130} /></Row>
      </Sect>

      {/* 交通工具 */}
      <Sect title="往返交通工具">
        <Row>去程 <D input={form.goDate} onChange={v => sf('goDate', v)} type="date" /> <Sel value={form.goTime} onChange={v => sf('goTime', v)} opts={HOURS} /> 工具：{VEHICLES.map(v => <label key={v} className="lr-radio-label"><input type="radio" checked={form.goVehicle === v} onChange={() => sf('goVehicle', v)} />{v}</label>)}</Row>
        <Row>返程 <D input={form.backDate} onChange={v => sf('backDate', v)} type="date" /> <Sel value={form.backTime} onChange={v => sf('backTime', v)} opts={HOURS} /> 工具：{VEHICLES.map(v => <label key={v} className="lr-radio-label"><input type="radio" checked={form.backVehicle === v} onChange={() => sf('backVehicle', v)} />{v}</label>)}</Row>
      </Sect>

      <div className="lr-bottom">
        <button className="btn btn-outline" onClick={() => { setForm({ ...DEFAULT_FORM }); }}>重置</button>
        <button className="btn btn-outline" onClick={() => setShowTplDialog(true)}>加载模板</button>
        <button className="btn btn-primary" disabled={loading} onClick={handleSubmit}>
          {loading ? '提交中...' : '提交登记'}
        </button>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

// Mini helpers
function Sect({ title, children }) { return <div className="lr-section"><div className="lr-section-title">{title}</div>{children}</div>; }
function Row({ children }) { return <div className="lr-field-row">{children}</div>; }
function Col({ label, children }) { return <div className="lr-field-col"><label>{label}</label>{children}</div>; }
function D({ input, onChange, type, placeholder, width, style }) {
  return <input type={type || 'text'} value={input} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="lr-input" style={{ width: width || 150, ...style }} />;
}
function Sel({ value, onChange, opts }) {
  return <select value={value} onChange={e => onChange(e.target.value)} className="lr-select lr-select-sm">{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

const CSS = `
.lr-root { max-width: 900px; margin: 0 auto; }
.lr-login-card { max-width: 380px; margin: 40px auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; }
.lr-login-card h2 { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.lr-login-desc { font-size: 13px; color: var(--muted); margin: 0 0 20px; }
.lr-btn-full { width: 100%; height: 40px; }
.lr-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 8px; }
.lr-header h2 { font-size: 17px; font-weight: 600; margin: 0; }
.lr-header-actions { display: flex; gap: 8px; align-items: center; }
.lr-info-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 18px; margin-bottom: 16px; }
.lr-info-title { font-size: 15px; font-weight: 600; margin-bottom: 6px; color: var(--accent); }
.lr-info-row { display: flex; gap: 24px; font-size: 13px; color: var(--muted); }
.lr-info-memo { font-size: 12px; color: var(--muted); margin: 6px 0; line-height: 1.5; }
.lr-info-student { font-size: 13px; font-weight: 500; margin-top: 6px; }
.lr-section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 8px; }
.lr-section-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid var(--border); color: var(--accent); }
.lr-field-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.lr-field-row label { font-size: 12px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }
.lr-field-col { margin-bottom: 6px; }
.lr-field-col label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 2px; }
.lr-input, .lr-select { font: 13px/1.4 var(--font); color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; outline: none; padding: 4px 7px; height: 28px; }
.lr-input:focus, .lr-select:focus { border-color: var(--accent); }
.lr-select { cursor: pointer; }
.lr-select-sm { width: 60px; }
.lr-textarea { width: 100%; resize: vertical; font: 13px/1.4 var(--font); color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; outline: none; padding: 5px 7px; }
.lr-radio-label { display: inline-flex; align-items: center; gap: 2px; cursor: pointer; font-size: 13px; padding: 1px 5px; border-radius: 4px; }
.lr-radio-label input { accent-color: var(--accent); }
.lr-duration { font-size: 12px; color: var(--accent); font-weight: 500; }
.lr-bottom { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; padding-bottom: 20px; }

.lr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; display: flex; align-items: center; justify-content: center; }
.lr-dialog { background: var(--surface); border-radius: var(--radius); width: 420px; max-height: 70vh; padding: 20px; overflow-y: auto; }
.lr-dialog h3 { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
.lr-dialog hr { border: none; border-top: 1px solid var(--border); margin: 10px 0; }
.lr-dialog-row { display: flex; gap: 8px; align-items: center; }
.lr-input-sm { flex: 1; height: 28px; font-size: 12px; }
.lr-tpl-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border); }
.lr-tpl-name { flex: 1; font-size: 13px; font-weight: 500; }
.lr-tpl-date { font-size: 11px; color: var(--muted); }
.lr-empty { font-size: 13px; color: var(--muted); text-align: center; padding: 16px 0; }
`;
