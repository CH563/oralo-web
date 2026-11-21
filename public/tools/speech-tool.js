import { estimateTime, estimateBudget } from './speech-math.js';

const copy = JSON.parse(document.querySelector('#tool-copy').textContent);
const get = id => document.getElementById(id);
const form = get('speech-form');
const controls = get('calculator-controls');
const tabs = [...document.querySelectorAll('[data-tool-mode]')];
const dialog = get('tool-language-dialog');
const fields = {
  script: { script: 'speech-script', Rc: 'script-rc', Re: 'script-re', P: 'script-p' },
  budget: { language: 'budget-language', M: 'budget-m', Rc: 'budget-rc', Re: 'budget-re', P: 'budget-p' },
};
const inputError = id => get(id === 'speech-script' ? 'script-error' : `${id}-error`);
const format = (key, values) => copy[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
let mode = 'script';
let languageTarget = null;
let languageTrigger = null;

function announce(text) {
  get('tool-announcement').replaceChildren(document.createTextNode(text));
}
function clearErrors() {
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  for (const error of form.querySelectorAll('.tool-error')) { error.textContent = ''; error.hidden = true; }
}
function clearResult(message = copy.placeholder) {
  get('result-content').hidden = true;
  get('result-placeholder').hidden = false;
  get('result-state').textContent = message;
  for (const id of ['result-value', 'result-counts', 'result-parameters']) get(id).textContent = '';
  get('budget-limit').hidden = true;
}
function showPace(prefix, key, visible) {
  get(`${prefix}-${key}-field`).hidden = !visible;
  get(`${prefix}-${key}`).disabled = !visible;
}
function showBudgetPace() {
  const chinese = get('budget-language').value === 'zh';
  showPace('budget', 'rc', chinese);
  showPace('budget', 're', !chinese);
}
function selectMode(next) {
  mode = next;
  for (const tab of tabs) {
    const active = tab.dataset.toolMode === mode;
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    const panel = get(`${tab.dataset.toolMode}-panel`); panel.hidden = !active; panel.disabled = !active;
  }
  get('calculate').textContent = copy[mode === 'script' ? 'estimateButton' : 'budgetButton'];
  get('result-title').textContent = copy[mode === 'script' ? 'timeTitle' : 'budgetTitle'];
  showBudgetPace();
  showPace('script', 'rc', true); showPace('script', 're', true);
}
function invalidate() {
  clearErrors(); clearResult(copy.changed); announce('');
  if (mode === 'script') { showPace('script', 'rc', true); showPace('script', 're', true); }
  else showBudgetPace();
}
function resetState() {
  form.reset(); selectMode('script'); clearErrors(); clearResult(); announce('');
  languageTarget = null;
  if (dialog.open) dialog.close();
}
function hasChanges() {
  return [...form.querySelectorAll('input, textarea, select')].some(input => {
    const initial = input.tagName === 'SELECT' ? [...input.options].find(option => option.defaultSelected)?.value : input.defaultValue;
    return input.value !== initial;
  });
}
function showErrors(errors) {
  let first;
  for (const [key, id] of Object.entries(fields[mode])) {
    if (!errors[key]) continue;
    const input = get(id);
    input.setAttribute('aria-invalid', 'true');
    const error = inputError(id); error.textContent = errors[key].map(key => copy[key]).join(' '); error.hidden = false;
    first ??= input;
  }
  first?.focus();
  get('result-state').textContent = copy.errorSummary;
  announce(copy.errorSummary);
}
form.addEventListener('submit', event => {
  event.preventDefault();
  clearErrors(); clearResult();
  const values = Object.fromEntries(Object.entries(fields[mode]).map(([key, id]) => [key, get(id).value]));
  const result = mode === 'script' ? estimateTime(values) : estimateBudget(values);
  if (result.errors) { showErrors(result.errors); return; }
  get('result-placeholder').hidden = true;
  get('result-content').hidden = false;
  let summary;
  if (mode === 'script') {
    summary = format('timeResult', {minutes: result.minutes, seconds: result.remainder});
    get('result-value').textContent = summary;
    get('result-counts').textContent = format('counts', {...result, hanUnit:copy[result.H === 1 ? 'hanSingular' : 'hanPlural'], wordUnit:copy[result.E === 1 ? 'wordSingular' : 'wordPlural']});
    const lines = [];
    if (result.H) lines.push(format('chineseParam', result));
    if (result.E) lines.push(format('englishParam', result));
    lines.push(format('allowanceParam', result));
    get('result-parameters').textContent = lines.join(' ');
    showPace('script', 'rc', result.H > 0); showPace('script', 're', result.E > 0);
  } else {
    const key = result.language === 'zh' ? 'budgetZh' : 'budgetEn';
    summary = format(result.budget === 1 && copy[key + 'One'] ? key + 'One' : key, result);
    get('result-value').textContent = summary;
    get('result-parameters').textContent = format('budgetParams', {...result, R: result.rate, unit: copy[result.language === 'zh' ? 'chineseUnit' : 'englishUnit']});
    get('budget-limit').hidden = false;
  }
  announce(`${get('result-title').textContent}. ${summary}`);
  if (matchMedia('(max-width: 760px)').matches) document.querySelector('.tool-result').scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
});
form.addEventListener('input', invalidate);
form.addEventListener('change', invalidate);
// Composition events are deliberately left alone: Enter remains a newline in the textarea.
for (const tab of tabs) tab.addEventListener('click', () => {
  if (mode === tab.dataset.toolMode) return;
  selectMode(tab.dataset.toolMode); clearErrors(); clearResult(); announce('');
});
document.querySelector('.tool-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : mode === 'script' ? 1 : 0;
  tabs[index].click(); tabs[index].focus();
});
get('clear-tool').addEventListener('click', () => { resetState(); get('speech-script').focus(); announce(copy.cleared); });
for (const link of document.querySelectorAll('[data-language-link]')) link.addEventListener('click', event => {
  if (link.getAttribute('aria-current') === 'page') { event.preventDefault(); return; }
  if (!hasChanges()) return;
  event.preventDefault(); languageTarget = link.href; languageTrigger = link; dialog.showModal();
});
get('stay-language').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { languageTarget = null; languageTrigger?.focus(); });
get('change-language').addEventListener('click', () => {
  const destination = languageTarget;
  if (!destination) return;
  resetState(); window.location.assign(destination);
});
// Clear before a BFCache snapshot, and again on load/history restoration.
// No script, parameters or results are written to a URL, storage, logs or the network.
window.addEventListener('pagehide', resetState);
window.addEventListener('pageshow', resetState);
window.addEventListener('popstate', resetState);
resetState();
controls.disabled = false;
