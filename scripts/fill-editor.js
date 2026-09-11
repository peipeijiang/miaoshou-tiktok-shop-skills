const fs = require('fs');
const path = require('path');
const ROOT = '/Users/shane/Documents/ChatGPT/妙手';
const COPY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/selection/ja-copy.json'), 'utf8'));

const TARGETS = [
  { id: '3986730576', name: 'bread-rack' },
  { id: '3986737658', name: 'glasses' },
  { id: '3986740774', name: 'beanie' },
];

function escapeForEval(s) { return JSON.stringify(s); }

async function fillOne(targetId, name) {
  const data = COPY.items[targetId];
  if (!data) throw new Error('no copy for ' + targetId);
  const expr = `(() => {
    const dlg = document.querySelector('.collect-box-editor-dialog-V2');
    if (!dlg) return { error: 'no dialog' };
    const setReact = (el, val) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const titleInput = [...dlg.querySelectorAll('input')].find(i => i.placeholder === '' && (i.value || '').length > 4);
    if (!titleInput) return { error: 'no title input' };
    setReact(titleInput, ${escapeForEval(data.title)});
    const simpleTA = [...dlg.querySelectorAll('textarea')].find(t => t.className.includes('jx-textarea__inner'));
    if (!simpleTA) return { error: 'no simple textarea' };
    setReact(simpleTA, ${escapeForEval(data.simple)});
    const iframe = [...dlg.querySelectorAll('iframe[id^=tinymceId_]')][0];
    if (!iframe) return { error: 'no tiny iframe' };
    const editorId = iframe.id.replace('_ifr', '');
    if (!window.tinymce) return { error: 'no tinymce global' };
    const ed = window.tinymce.get(editorId);
    if (!ed) return { error: 'tinymce instance missing: ' + editorId };
    ed.setContent(${escapeForEval(data.detailHtml)}, { format: 'html' });
    ed.fire('change');
    ed.fire('input');
    ed.fire('keyup');
    ed.fire('blur');
    return { ok: true, titleLen: titleInput.value.length, simpleLen: simpleTA.value.length, detailLen: ed.getContent().length, editorId };
  })()`;
  return await js(expr);
}

async function clickSave() {
  const expr = `(() => {
    const dlg = document.querySelector('.collect-box-editor-dialog-V2');
    if (!dlg) return { error: 'no dialog' };
    const btn = [...dlg.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '保存修改');
    if (!btn) return { error: 'no save button' };
    btn.click();
    return { ok: true };
  })()`;
  return await js(expr);
}

async function closeDialog() {
  await js(`(() => { const c = document.querySelector('.collect-box-editor-dialog-V2 .jx-dialog__headerbtn'); if (c) c.click(); return true; })()`);
  await wait(1);
}

async function openEditorFromTable(targetId) {
  const expr = `(() => {
    const target = ${JSON.stringify(targetId)};
    const rows = [...document.querySelectorAll('.vue-recycle-scroller__item-view')];
    for (const r of rows) {
      if ((r.innerText || '').includes(target)) {
        const editBtn = [...r.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '编辑');
        if (editBtn) { editBtn.click(); return { ok: true, via: 'table' }; }
      }
    }
    return { ok: false, rowsChecked: rows.length };
  })()`;
  const res = await js(expr);
  if (res.ok) await wait(3);
  return res;
}

(async () => {
  await useOrCreateTaskSpace(25);
  const results = [];
  for (const t of TARGETS) {
    cliLog('=== ' + t.id + ' ' + t.name + ' ===');
    const dlgOpen = await js(`(() => { const e=document.querySelector('.collect-box-editor-dialog-V2'); return !!(e && e.offsetParent!==null); })()`);
    if (!dlgOpen) {
      // Force close any stale hidden dialog first
      await closeDialog();
      await wait(1);
      cliLog('opening editor from collection box');
      const opened = await openEditorFromTable(t.id);
      cliLog('open: ' + JSON.stringify(opened));
      if (!opened.ok) { results.push({ id: t.id, ok: false, stage: 'open' }); continue; }
  }
    const fill = await fillOne(t.id, t.name);
    cliLog('fill: ' + JSON.stringify(fill));
    if (!fill.ok) { results.push({ id: t.id, ok: false, stage: 'fill', err: fill }); continue; }
    const saved = await clickSave();
    cliLog('save: ' + JSON.stringify(saved));
    await wait(3);
    await closeDialog();
    await wait(2);
    results.push({ id: t.id, ok: true });
  }
  cliLog('SUMMARY: ' + JSON.stringify(results));
})();
