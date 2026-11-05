const $ = id => document.getElementById(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let api, config, pending, controller, preview = new URLSearchParams(location.search).has('preview');
let frames = 0, lastFrame = performance.now(), maxFrameGap = 0, lastPing, maxPingMs = 0;
function frame(now) { frames++; maxFrameGap = Math.max(maxFrameGap, now - lastFrame); lastFrame = now; requestAnimationFrame(frame); }
requestAnimationFrame(frame);
function call(name, ...args) { return api.ByName(`main.ProbeService.${name}`, ...args); }
function result(message, error = false) { $('result').textContent = message; $('result').className = error ? 'error' : ''; }
function snapshots(items) {
  $('snapshot').replaceChildren(...items.map(item => {
    const row = document.createElement('tr'), key = document.createElement('td'), value = document.createElement('td');
    key.textContent = item.key; value.textContent = item.current || (item.resolved ? '未设置' : '类型尚未注册');
    row.append(key, value); return row;
  }));
  $('freshness').textContent = new Date().toLocaleTimeString();
}
function renderEvents(events) {
  $('events').textContent = events.map(event => JSON.stringify(event)).join('\n');
  $('event-count').textContent = `${events.length} 条记录`;
}
async function refresh() {
  snapshots(preview ? await fetch('snapshot.json').then(r => r.json()) : await call('Snapshot'));
}
function setBusy(busy) {
  $('synthetic').disabled = busy || preview;
  $('cancel').disabled = !busy;
  document.querySelectorAll('[data-fixture]').forEach(button => button.disabled = busy || !config.allowFixtures || preview);
  document.querySelectorAll('[data-pdf]').forEach(button => button.disabled = busy || !config.allowPDF || preview);
}
async function run(name, args, cancelAfterMs = -1) {
  if (pending) return;
  controller = new AbortController(); setBusy(true);
  pending = call(name, ...args).cancelOn(controller.signal);
  if (cancelAfterMs >= 0) {
    const cancelController = controller;
    setTimeout(() => cancelController.abort('scheduled cancellation of Go wait'), cancelAfterMs);
  }
  result('已提交请求，等待完成。系统确认请在原生窗口操作。');
  try { const value = await pending; result(`回调已到达：${JSON.stringify(value)}。请检查回读记录。`); }
  catch (err) { result(`等待结束：${String(err)}。已提交的原生请求可能仍在进行。`); }
  finally { pending = null; await pause(2200); setBusy(false); await refresh(); }
}
async function selfTest() {
  const report = { userAgent: navigator.userAgent, checks: [] };
  function check(name, passed) { report.checks.push({ name, passed }); if (!passed) throw Error(`检查失败：${name}`); }
  try {
    check('Wails main-thread ping', (await call('Ping')).mainThreadResponsive);
    for (const [name, args] of [['SetFixture', ['type', 'a']], ['SetPDF', ['preview']]]) {
      let denied = false;
      try { await call(name, ...args); } catch { denied = true; }
      check(`${name} denied in read-only mode`, denied);
    }
    for (let i = 0; i < 3; i++) {
      const abort = new AbortController();
      const task = call('Synthetic', 700).cancelOn(abort.signal);
      let wasCancelled = false;
      const outcome = task.catch(() => { wasCancelled = true; });
      let events;
      for (let attempt = 0; attempt < 30; attempt++) {
        events = await call('Events');
        if (events.filter(e => e.event === 'native-submitted').length === i + 1) break;
        await pause(20);
      }
      check(`synthetic ${i + 1} submitted`, events.filter(e => e.event === 'native-submitted').length === i + 1);
      await pause(50); abort.abort('read-only cancellation test'); await outcome;
      check(`promise ${i + 1} cancelled`, wasCancelled);
      await pause(900);
      events = await call('Events');
      check(`late native callback ${i + 1} retained`, events.filter(e => e.event === 'native-completion' && e.synthetic && e.lateAfterCancellation).length === i + 1);
      check(`main thread after cancellation ${i + 1}`, (await call('Ping')).mainThreadResponsive);
    }
    const value = await call('Synthetic', 200);
    check('uncancelled synthetic callback completes', value.synthetic && !value.lateAfterCancellation);
    const events = await call('Events');
    check('zero real setter submissions', !events.some(e => e.event === 'native-submitted' && !e.synthetic));
    check('WebKit animation progressed', frames > 20);
    report.passed = true;
    $('finding').textContent = '只读验证通过；真实系统确认与写入尚待测试。';
    result('只读 Wails / WebKit 检查通过，真实默认应用未修改。');
  } catch (err) { report.passed = false; report.error = String(err); result(String(err), true); }
  report.animationFrames = frames; report.maxFrameGapMs = maxFrameGap; report.maxPingMs = maxPingMs;
  await call('FrontendReport', report);
  renderEvents(await call('Events'));
}
async function fixtureSuite() {
  for (const kind of ['type', 'scheme']) {
    for (const target of ['a', 'b', 'copy', 'undeclared']) {
      await call('Note', `专用关联测试：${kind} → ${target}`);
      await run('SetFixture', [kind, target]);
      await call('FrontendReport', { phase: 'fixture-observed', kind, target, snapshot: await call('Snapshot') });
    }
  }
  await call('FrontendReport', { phase: 'fixture-suite-ended', animationFrames: frames, maxFrameGapMs: maxFrameGap, maxPingMs });
  result('专用关联测试已完成。请关闭窗口，启动器会注销测试应用并记录清理后的查询。');
}
async function boot() {
  if (preview) {
    config = { allowFixtures: false, allowPDF: false };
    $('mode').textContent = '只读预览 · 已记录的实机数据';
    $('finding').textContent = '这是已记录数据的浏览器预览；原生验证见 JSON 日志。';
    renderEvents(await fetch('events.json').then(r => r.json()));
    $('note-form').hidden = true; setBusy(false); await refresh(); return;
  }
  const runtime = await import('/wails/runtime.js'); api = runtime.Call;
  config = await call('Config');
  $('mode').textContent = config.allowPDF ? '专用关联 + PDF 测试模式' : config.allowFixtures ? '专用关联测试模式' : '只读模式';
  $('log-path').textContent = `记录文件：${config.logPath}`;
  await call('FrontendReport', { phase: 'ui-loaded', userAgent: navigator.userAgent });
  await refresh(); setBusy(false);
  setInterval(async () => {
    try {
      const started = performance.now(); lastPing = await call('Ping'); maxPingMs = Math.max(maxPingMs, performance.now() - started);
      $('heartbeat').textContent = lastPing.mainThreadResponsive ? `主线程响应 · ${lastPing.elapsedMs} ms` : '主线程未响应';
      renderEvents(await call('Events'));
    } catch (err) { result(`读取探针状态失败：${String(err)}`, true); }
  }, 500);
  if (config.selfTest) { await selfTest(); setTimeout(() => call('Quit'), 1000); }
  if (config.scenario) {
    const parts = config.scenario.split(':');
    if (config.scenario === 'fixture-suite') await fixtureSuite();
    else if (parts[0] === 'fixture' && parts.length === 3) await run('SetFixture', parts.slice(1), config.cancelAfterMs);
    else if (parts[0] === 'pdf' && parts.length === 2) await run('SetPDF', parts.slice(1), config.cancelAfterMs);
    else if (parts[0] === 'synthetic' && parts.length === 2) await run('Synthetic', [Number(parts[1])], config.cancelAfterMs);
    else result('未知场景，未发起请求。', true);
  }
}
$('refresh').onclick = () => refresh().catch(err => result(String(err), true));
$('synthetic').onclick = () => run('Synthetic', [6000]);
$('cancel').onclick = () => controller?.abort('human cancelled Go wait');
document.querySelectorAll('[data-fixture]').forEach(button => button.onclick = () => run('SetFixture', [$('kind').value, button.dataset.fixture]));
document.querySelectorAll('[data-pdf]').forEach(button => button.onclick = () => run('SetPDF', [button.dataset.pdf]));
$('note-form').onsubmit = async event => { event.preventDefault(); if ($('note').value.trim()) { await call('Note', $('note').value); $('note').value = ''; result('人工观察已记录。'); } };
boot().catch(err => result(`探针加载失败：${String(err)}`, true));
