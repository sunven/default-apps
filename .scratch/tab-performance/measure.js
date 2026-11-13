(async () => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await document.fonts.ready;
  await pause(300);
  const timings = [];
  for (const view of ['文件类型', 'URL 协议', '文件类型', 'URL 协议', '文件类型', 'URL 协议']) {
    const button = Array.from(document.querySelectorAll('nav[aria-label="浏览入口"] button')).find(button => button.textContent === view);
    const start = performance.now();
    button.click();
    await frame();
    timings.push({ view, ms: Math.round(performance.now() - start), rows: document.querySelectorAll('.association-row').length });
    await pause(300);
  }
  return { pass: timings.every(item => item.ms < 100), timings };
})()
