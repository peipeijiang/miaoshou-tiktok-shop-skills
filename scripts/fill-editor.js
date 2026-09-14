const fs = require('fs');
const path = require('path');
const ROOT = '/Users/shane/Documents/ChatGPT/妙手';
const COPY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/selection/ja-copy.json'), 'utf8'));

const TARGETS = [
  { id: '3986730576', sourceId: '1053119261270', name: 'bread-rack' },
  { id: '3986737658', sourceId: '896801470833', name: 'glasses' },
  { id: '3986740774', sourceId: '1066703735247', name: 'beanie' },
];

function escapeForEval(s) { return JSON.stringify(s); }

async function fillOne(targetId, name) {
  const data = COPY.items[targetId];
  if (!data) throw new Error('no copy for ' + targetId);
  const expr = `(() => {
    const dlg = [...document.querySelectorAll('.collect-box-editor-dialog-V2')].find(el => el.offsetParent !== null);
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
    if (simpleTA) setReact(simpleTA, ${escapeForEval(data.simple)});
    const iframe = [...dlg.querySelectorAll('iframe[id^=tinymceId_]')][0];
    if (!iframe) return { error: 'no tiny iframe' };
    const editorId = iframe.id.replace('_ifr', '');
    if (!window.tinymce) return { error: 'no tinymce global' };
    const ed = window.tinymce.get(editorId);
    if (!ed) return { error: 'tinymce instance missing: ' + editorId };
    const existingImages = [...ed.getBody().querySelectorAll('img')].map((img, index) => ({
      index: index + 1,
      src: img.src,
    }));
    const approvedIndices = ${escapeForEval(data.approvedDescriptionImageIndices || [])};
    const approvedImages = existingImages.filter(image => approvedIndices.includes(image.index));
    if (approvedImages.length !== approvedIndices.length) {
      return {
        error: 'approved image count mismatch; run a new visual image audit',
        existingCount: existingImages.length,
        expectedApprovedCount: approvedIndices.length,
        matchedApprovedCount: approvedImages.length,
      };
    }
    const imageHtml = approvedImages.map((image, index) =>
      '<p style="text-align:center;margin:16px 0"><img src="' + image.src +
      '" alt="商品画像 ' + (index + 1) +
      '" style="max-width:100%;height:auto;display:block;margin:0 auto"></p>'
    ).join('');
    ed.setContent(${escapeForEval(data.detailHtml)} + imageHtml, { format: 'html' });
    ed.fire('change');
    ed.fire('input');
    ed.fire('keyup');
    ed.fire('blur');
    const packageSize = ${escapeForEval(data.packageSizeCm || [])};
    if (packageSize.length === 3) {
      ['长', '宽', '高'].forEach((placeholder, index) => {
        const input = [...dlg.querySelectorAll('input')].find(el => el.placeholder === placeholder);
        if (input) setReact(input, String(packageSize[index]));
      });
    }
    return {
      ok: true,
      titleLen: titleInput.value.length,
      simpleLen: simpleTA ? simpleTA.value.length : 0,
      detailLen: ed.getContent().length,
      existingImageCount: existingImages.length,
      approvedImageCount: approvedImages.length,
      editorId,
    };
  })()`;
  return await js(expr);
}

async function clickSave() {
  const expr = `(() => {
    const dlg = [...document.querySelectorAll('.collect-box-editor-dialog-V2')].find(el => el.offsetParent !== null);
    if (!dlg) return { error: 'no dialog' };
    const btn = [...dlg.querySelectorAll('button')].find(b => (b.innerText || '').trim() === '保存修改');
    if (!btn) return { error: 'no save button' };
    btn.click();
    return { ok: true };
  })()`;
  return await js(expr);
}

async function closeDialog() {
  await js(`(() => {
    const dlg = [...document.querySelectorAll('.collect-box-editor-dialog-V2')].find(el => el.offsetParent !== null);
    const c = dlg && dlg.querySelector('.jx-dialog__headerbtn');
    if (c) c.click();
    return true;
  })()`);
  await wait(1);
}

async function hasUnsavedWarning() {
  return await js(`(() => [...document.querySelectorAll('.jx-message-box')]
    .filter(el => el.offsetParent !== null)
    .some(el => (el.innerText || '').includes('还没保存修改')))()`);
}

async function verifyOne(targetId, data) {
  const opened = await openEditorFromTable(targetId);
  if (!opened.ok) return { ok: false, error: 'verification editor did not open' };
  const result = await js(`(() => {
    const dlg = [...document.querySelectorAll('.collect-box-editor-dialog-V2')].find(el => el.offsetParent !== null);
    if (!dlg) return { ok: false, error: 'no visible verification dialog' };
    const titleInput = [...dlg.querySelectorAll('input')][1];
    const iframe = dlg.querySelector('iframe[id^=tinymceId_]');
    const body = iframe && iframe.contentDocument && iframe.contentDocument.body;
    if (!body) return { ok: false, error: 'description iframe is not ready' };
    const expected = ${escapeForEval({
      title: data.title,
      imageCount: (data.approvedDescriptionImageIndices || []).length,
      forbiddenTerms: COPY.forbiddenDescriptionTerms || [],
    })};
    const html = body.innerHTML || '';
    const text = body.innerText || '';
    const imageCount = body.querySelectorAll('img').length;
    const forbiddenFound = expected.forbiddenTerms.filter(term => text.includes(term) || html.includes(term));
    const titleMatch = titleInput && titleInput.value === expected.title;
    return {
      ok: titleMatch && imageCount === expected.imageCount && forbiddenFound.length === 0 && text.trim().length > 50,
      titleMatch,
      imageCount,
      expectedImageCount: expected.imageCount,
      forbiddenFound,
      descriptionTextLength: text.length,
    };
  })()`);
  await closeDialog();
  return result;
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
    await closeDialog();
    cliLog('opening editor from TikTok collection box');
    const opened = await openEditorFromTable(t.sourceId);
    cliLog('open: ' + JSON.stringify(opened));
    if (!opened.ok) { results.push({ id: t.id, sourceId: t.sourceId, ok: false, stage: 'open' }); continue; }
    const fill = await fillOne(t.id, t.name);
    cliLog('fill: ' + JSON.stringify(fill));
    if (!fill.ok) { results.push({ id: t.id, ok: false, stage: 'fill', err: fill }); continue; }
    const saved = await clickSave();
    cliLog('save: ' + JSON.stringify(saved));
    await wait(4);
    await closeDialog();
    if (await hasUnsavedWarning()) {
      results.push({ id: t.id, sourceId: t.sourceId, ok: false, stage: 'save', error: 'unsaved changes warning appeared' });
      break;
    }
    const verify = await verifyOne(t.sourceId, COPY.items[t.id]);
    cliLog('verify: ' + JSON.stringify(verify));
    results.push({ id: t.id, sourceId: t.sourceId, ok: verify.ok, verify });
    if (!verify.ok) break;
  }
  cliLog('SUMMARY: ' + JSON.stringify(results));
})();
