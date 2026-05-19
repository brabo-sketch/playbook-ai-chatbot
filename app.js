/* Project PLAYBOOK DocBot v8
   Fail-safe conversational interviewer.
   This replaces the broken hybrid form/chat script from v7.
*/

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'playbookDocbot_v8_state';

const state = {
  index: 0,
  answers: {},
  messages: [],
  selectedChips: []
};

function boot() {
  try {
    if (!window.PLAYBOOK_SCHEMA && typeof PLAYBOOK_SCHEMA === 'undefined') {
      throw new Error('PLAYBOOK_SCHEMA is missing. Check that playbook_schema.js is uploaded before app.js.');
    }
    const saved = safeJson(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.version === 8) {
      state.index = saved.index || 0;
      state.answers = saved.answers || {};
      state.messages = saved.messages || [];
    }
    bindEvents();
    if (!state.messages.length) startConversation();
    renderAll();
  } catch (err) {
    console.error(err);
    showStartupError(err.message || String(err));
  }
}

function safeJson(text) {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 8, index: state.index, answers: state.answers, messages: state.messages }));
}

function startConversation() {
  state.index = 0;
  state.messages = [];
  addMessage('ai', currentOpeningText());
}

function currentQuestion() {
  return PLAYBOOK_QUESTIONS[Math.min(state.index, PLAYBOOK_QUESTIONS.length - 1)];
}

function currentOpeningText() {
  const q = currentQuestion();
  return `<strong>${escapeHtml(q.question)}</strong><br>${escapeHtml(q.helper || '')}<br><small>You may click one of the suggested choices or type a short keyword response.</small>`;
}

function bindEvents() {
  $('sendChatBtn')?.addEventListener('click', submitCurrentAnswer);
  $('conversationInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCurrentAnswer();
    }
  });
  $('resetBtn')?.addEventListener('click', () => {
    if (!confirm('Clear the current conversation and captured information?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state.index = 0; state.answers = {}; state.messages = []; state.selectedChips = [];
    startConversation(); renderAll();
  });
  $('backBtn')?.addEventListener('click', () => {
    if (state.index > 0) {
      state.index -= 1;
      state.selectedChips = [];
      addMessage('ai', `Let’s go back. <strong>${escapeHtml(currentQuestion().question)}</strong>`);
      saveState(); renderAll();
    }
  });
  $('skipBtn')?.addEventListener('click', () => {
    const q = currentQuestion();
    state.answers[q.id] = qDefault(q);
    addMessage('user', 'Skip / ask later');
    addMessage('ai', `Noted. I marked this as <strong>TBD</strong> so the process owner can confirm later.`);
    nextQuestion();
  });
  $('clarifyBtn')?.addEventListener('click', () => {
    const q = currentQuestion();
    addMessage('ai', `<strong>Why I’m asking:</strong> ${escapeHtml(q.helper || 'This is needed to complete the PLAYBOOK document and metadata.')}<br><small>Mapped section: ${escapeHtml(q.section || q.stage || '')}</small>`);
    renderMessages();
  });
  $('loadSampleBtn')?.addEventListener('click', loadSample);
  $('copyProcedureBtn')?.addEventListener('click', () => copyText($('procedureOutput')?.textContent || ''));
  $('copyProcessBtn')?.addEventListener('click', () => copyText($('processOutput')?.textContent || ''));
  $('exportBtn')?.addEventListener('click', exportPackageFallback);
  $('exportWordBtn')?.addEventListener('click', () => {
    if (typeof exportProcedureWordFile === 'function') exportProcedureWordFile();
    else downloadFile('playbook-procedure-draft.md', generateProcedureMarkdown(), 'text/markdown');
  });
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.view)?.classList.add('active');
    });
  });
}

function submitCurrentAnswer() {
  const input = $('conversationInput');
  const raw = (input?.value || '').trim();
  const q = currentQuestion();

  if (!raw && !state.selectedChips.length && q.type !== 'generated') {
    addMessage('ai', `Please answer the question first. You can click a suggested choice or type a short keyword response.`);
    renderMessages();
    return;
  }

  const parsed = parseAnswer(q, raw, state.selectedChips);
  const validation = validateAnswer(q, parsed, raw);

  if (validation.blocking) {
    addMessage('user', raw || state.selectedChips.join(', '));
    addMessage('ai', `<strong>I need to clarify this before moving on.</strong><br>${escapeHtml(validation.message)}<br><small>Please revise your answer. Short keywords are okay.</small>`);
    state.selectedChips = [];
    if (input) input.value = '';
    saveState(); renderAll();
    return;
  }

  state.answers[q.id] = parsed;
  addMessage('user', raw || formatValue(parsed));
  addMessage('ai', buildConfirmation(q, parsed, validation.message));
  state.selectedChips = [];
  if (input) input.value = '';
  nextQuestion();
}

function nextQuestion() {
  if (state.index < PLAYBOOK_QUESTIONS.length - 1) {
    state.index += 1;
    addMessage('ai', currentOpeningText());
  } else {
    addMessage('ai', `We have enough information to prepare the first draft. Open the <strong>Generated Draft</strong> tab to review the output.`);
  }
  saveState();
  renderAll();
}

function parseAnswer(q, raw, chips) {
  const options = getOptions(q);
  const selectedLabels = chips.length ? chips : splitKeywords(raw);

  if (q.type === 'generated') {
    return raw || generatePurposeStatement();
  }
  if (q.type === 'single' || q.type === 'smartSingle') {
    const match = matchOption(raw || selectedLabels[0], options);
    return match ? match.value : clean(raw || selectedLabels[0]);
  }
  if (q.type === 'multi' || q.type === 'smartMulti') {
    const result = [];
    selectedLabels.forEach(x => {
      const match = matchOption(x, options);
      result.push(match ? match.value : clean(x));
    });
    return unique(result.filter(Boolean));
  }
  if (q.type === 'tags') return unique(splitKeywords(raw));
  if (q.type === 'steps') return parseSteps(raw);
  if (q.type === 'timelineMatrix') return parseTimeline(raw);
  return clean(raw);
}

function validateAnswer(q, value, raw) {
  const msg = [];
  let blocking = false;
  if (!value || (Array.isArray(value) && !value.length)) return { blocking: true, message: 'I could not detect a usable answer.' };

  if (q.id === 'docMode') {
    const v = String(value).toLowerCase();
    if (!/t3|t4|process|procedure/.test(v)) {
      blocking = true;
      msg.push('The first answer must identify the documentation scope: Process Document, Procedure Document, or Procedure first then roll up to Process Document.');
    }
  }
  if (q.id === 'documentOwner' && /,| and |\/|;/.test(String(value))) {
    msg.push('This looks like multiple owners. A document may have several SMEs, but accountability should normally point to one role or function.');
  }
  if (['triggerFreeText','endPoint'].includes(q.id) && Array.isArray(splitKeywords(raw)) && splitKeywords(raw).length > 1) {
    blocking = true;
    msg.push(q.id === 'triggerFreeText'
      ? 'A procedure should have one clear starting point. Select or type only the event that starts the procedure.'
      : 'A procedure should have one clear endpoint. Select or type only the event that proves the procedure is complete.');
  }
  if (q.id === 'outputs') {
    const inputs = arr('inputs').map(x => String(x).toLowerCase());
    const overlap = arrValue(value).some(o => inputs.some(i => i && String(o).toLowerCase().includes(i)));
    if (overlap) msg.push('One output appears similar to an input. Validate whether it is truly produced by the procedure or merely received at the start.');
  }
  if (q.id === 'criticalSteps' && Array.isArray(value) && value.length < 3) {
    msg.push('This may be too few steps for a useful T4 SOP. Check if review, approval, filing, notification, or exception handling steps are missing.');
  }
  if (q.id === 'sla') {
    msg.push('SLA items marked TBD should be confirmed by the process owner before publication.');
  }
  if (q.id === 'relatedDocs') {
    msg.push('These are proposed links only. Final interlinking should be validated after more PLAYBOOK documents are completed.');
  }
  return { blocking, message: msg.join(' ') };
}

function buildConfirmation(q, value, warning) {
  let text = `<strong>Captured:</strong> ${escapeHtml(formatAnswer(q, value))}<br>`;
  text += `<strong>Documentation impact:</strong> This will populate the ${escapeHtml(q.section || q.stage)} section and related SharePoint metadata where applicable.`;
  if (warning) text += `<br><strong>Check:</strong> ${escapeHtml(warning)}`;
  return text;
}

function addMessage(sender, html) {
  state.messages.push({ sender, html, ts: new Date().toISOString() });
}

function renderAll() {
  renderQuestionHeader();
  renderMessages();
  renderChips();
  renderSummary();
  renderProgress();
  renderOutputs();
  renderTierCards();
}

function renderQuestionHeader() {
  const q = currentQuestion();
  if ($('stageLabel')) $('stageLabel').textContent = q.stage || 'AI Interview';
  if ($('questionText')) $('questionText').textContent = q.question || 'Question';
  if ($('questionHelper')) $('questionHelper').textContent = q.helper || 'Answer using keywords or short phrases.';
  if ($('questionCounter')) $('questionCounter').textContent = `${state.index + 1} / ${PLAYBOOK_QUESTIONS.length}`;
  if ($('currentTarget')) $('currentTarget').textContent = targetText();
}

function renderMessages() {
  const box = $('chatMessages');
  if (!box) return;
  box.innerHTML = state.messages.map(m => `<div class="msg ${m.sender}"><div>${m.html}</div></div>`).join('');
  box.scrollTop = box.scrollHeight;
}

function renderChips() {
  const box = $('suggestionChips');
  if (!box) return;
  const q = currentQuestion();
  const options = getOptions(q);
  if (!options.length && q.type !== 'generated') {
    box.innerHTML = '';
    return;
  }
  if (q.type === 'generated') {
    const draft = generatePurposeStatement();
    box.innerHTML = `<button class="chip" data-value="${escapeAttr(draft)}">Use drafted purpose statement</button>`;
  } else {
    box.innerHTML = options.map(o => {
      const selected = state.selectedChips.includes(o.label || o.value);
      return `<button class="chip ${selected ? 'selected' : ''}" data-value="${escapeAttr(o.label || o.value)}">${escapeHtml(o.label || o.value)}${o.note ? `<small>${escapeHtml(o.note)}</small>` : ''}</button>`;
    }).join('');
  }
  box.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => handleChipClick(btn.dataset.value || ''));
  });
}

function handleChipClick(value) {
  const q = currentQuestion();
  const input = $('conversationInput');
  if (q.type === 'single' || q.type === 'smartSingle' || q.type === 'generated') {
    state.selectedChips = [value];
    if (input) input.value = value;
    submitCurrentAnswer();
    return;
  }
  const exists = state.selectedChips.includes(value);
  state.selectedChips = exists ? state.selectedChips.filter(x => x !== value) : [...state.selectedChips, value];
  if (input) input.value = state.selectedChips.join(', ');
  renderChips();
}

function renderSummary() {
  const box = $('answerSummary');
  if (!box) return;
  const rows = PLAYBOOK_QUESTIONS.filter(q => hasAnswer(q.id));
  if (!rows.length) { box.innerHTML = '<p class="empty">No information captured yet.</p>'; return; }
  box.innerHTML = rows.map(q => `<div class="summary-item"><strong>${escapeHtml(q.stage || q.section)}</strong><span>${escapeHtml(formatAnswer(q, state.answers[q.id]))}</span></div>`).join('');
}

function renderProgress() {
  const answered = PLAYBOOK_QUESTIONS.filter(q => hasAnswer(q.id)).length;
  const pct = Math.round((answered / PLAYBOOK_QUESTIONS.length) * 100);
  if ($('completionText')) $('completionText').textContent = `${pct}%`;
  if ($('progressBar')) $('progressBar').style.width = `${pct}%`;
  if ($('progressHint')) $('progressHint').textContent = pct < 35 ? 'Start with scope, owner, trigger, and outputs.' : pct < 75 ? 'Now complete steps, risks, controls, evidence, and SLA.' : 'Ready to review draft outputs and interlinking.';
}

function renderOutputs() {
  if ($('procedureOutput')) $('procedureOutput').textContent = generateProcedureMarkdown();
  if ($('processOutput')) $('processOutput').textContent = generateProcessMarkdown();
}

function renderTierCards() {
  const tierCards = $('tierCards');
  if (!tierCards || tierCards.dataset.rendered) return;
  tierCards.innerHTML = PLAYBOOK_SCHEMA.tiers.map(t => `<div class="tier-card"><span class="pill">${escapeHtml(t.id)}</span><h4>${escapeHtml(t.name)}</h4><p>${escapeHtml(t.purpose)}</p><small><strong>Must include:</strong> ${escapeHtml(t.mustInclude)}</small><br><small><strong>Approval:</strong> ${escapeHtml(t.approval)} | <strong>Review:</strong> ${escapeHtml(t.reviewCycle)}</small></div>`).join('');
  if ($('qaChecklist')) $('qaChecklist').innerHTML = (PLAYBOOK_SCHEMA.qaChecks || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
  tierCards.dataset.rendered = 'true';
}

function getOptions(q) {
  if (!q) return [];
  if (q.optionsFrom && PLAYBOOK_SCHEMA[q.optionsFrom]) return PLAYBOOK_SCHEMA[q.optionsFrom].map(v => ({ value: v, label: v, impact: `${v} will be reflected in the PLAYBOOK document.` }));
  if (q.options) return q.options;
  if (q.generator) return smartOptions(q.generator);
  return [];
}

function smartOptions(generator) {
  const title = val('procedureTitle', 'this procedure');
  const domain = val('processDomain', 'the process domain');
  const owner = val('documentOwner', 'Process Owner');
  const linked = val('linkedProcess', 'linked process');
  const systems = arr('systems');
  const records = arr('records');
  const outputs = arr('outputs');
  const roles = arr('roles');
  const steps = arr('criticalSteps').map(s => typeof s === 'object' ? (s.action || '') : String(s));

  const base = {
    scope: [
      `Activities needed to execute ${title}`,
      `Handoffs within ${domain}`,
      `Required inputs, reviews, approvals, records, and closure activities`,
      `Roles and responsibilities of ${owner}`
    ],
    outOfScope: [
      'Policy ownership and policy approval rules',
      'System configuration or technical development',
      'Screen-level work instructions unless specifically documented as T5 WI',
      'Downstream activities after the defined endpoint'
    ],
    triggerStart: [
      `Request or need for ${title} is received`,
      `Required input package is submitted to ${owner}`,
      `System/workflow transaction is initiated`,
      `Scheduled cycle or monitoring event starts`
    ],
    endPoint: [
      'Required approval is completed and recorded',
      'Final output is issued to the downstream user/process',
      'System record is updated and evidence is filed',
      'Requester/proponent is notified of completion'
    ],
    inputs: [
      'Approved request or business need',
      'Completed request form or instruction',
      'Supporting documents and evidence',
      'Required master data or reference list',
      'Applicable policy or approval authority'
    ],
    outputs: [
      'Approved request / decision record',
      'Updated system record',
      'Completed form or document pack',
      'Notification to downstream user/process',
      `Output used by ${linked}`
    ],
    systems: ['Email / Outlook', 'Microsoft Teams', 'SharePoint repository', 'SAP', 'Excel tracker', 'Approval workflow tool'],
    records: ['Request form', 'Approval email / workflow log', 'Supporting document pack', 'Review checklist', 'Exception approval record', 'Final output file'],
    roles: [owner, 'Requestor / Proponent', 'Reviewer / Evaluator', 'Approver', 'Records Custodian', 'System Owner / Admin'],
    decisionPoints: [
      'Are required inputs complete?',
      'Does the request meet policy or authority criteria?',
      'Can the request proceed based on reviewer assessment?',
      'Is exception approval required?',
      'Is the output ready for release or system update?'
    ],
    exceptions: [
      'Incomplete or missing requirements: return to requestor and log pending item',
      'Approval delay: escalate to functional lead based on SLA',
      'Policy exception: require documented approval from authorized approver',
      'System issue: escalate to system owner / IT and retain evidence',
      'Disputed result: escalate to process owner for decision'
    ],
    kpis: [
      'Turnaround time / cycle time from start to closure',
      'SLA compliance rate',
      'Aging of open or pending requests',
      'Completeness rate of submitted requirements',
      'Exception rate and recurring exception themes',
      'Rework or return rate due to incomplete information',
      'Evidence completeness / audit readiness rate'
    ],
    relatedDocs: [
      val('parentPolicy', 'Governing T2 policy'),
      val('linkedProcess', 'Parent T3 Process Document'),
      `${title} T5 Work Instruction, if screen-level steps are required`,
      ...records,
      ...systems.map(s => `${s} user guide / access reference`),
      ...outputs.map(o => `Downstream procedure using: ${o}`)
    ],
    approvers: [owner, ...arr('smes'), 'Functional Head', 'Process Owner', 'System Owner', 'Risk/Compliance Reviewer']
  };

  if (generator === 'timelineItems') {
    const items = [
      { item: 'Request intake / initial review', timeline: 'TBD', owner },
      { item: 'Completeness check', timeline: 'TBD', owner },
      { item: 'Reviewer assessment / validation', timeline: 'TBD', owner: roles.find(r => /review|evaluat|finance|regulatory/i.test(r)) || 'Reviewer' },
      { item: 'Approval decision', timeline: 'TBD', owner: roles.find(r => /approv|head|manager/i.test(r)) || 'Approver' },
      { item: 'Exception resolution / escalation', timeline: 'TBD', owner },
      { item: 'Output release / notification', timeline: 'TBD', owner },
      { item: 'Evidence filing / repository update', timeline: 'TBD', owner: roles.find(r => /record|custodian/i.test(r)) || owner }
    ];
    steps.forEach(s => { if (s) items.push({ item: s, timeline: 'TBD', owner }); });
    return uniqueBy(items, x => x.item).map(x => ({ value: x.item, label: `${x.item} = ${x.timeline}`, note: `Owner: ${x.owner}`, ...x }));
  }

  return unique(base[generator] || []).filter(Boolean).map(x => ({ value: x, label: x, impact: `${x} will be included in the ${generator} section.` }));
}

function matchOption(text, options) {
  if (!text) return null;
  const needle = String(text).toLowerCase().trim();
  if (!needle) return null;
  return options.find(o => [o.value, o.label].some(v => String(v).toLowerCase() === needle)) ||
    options.find(o => [o.value, o.label].some(v => String(v).toLowerCase().includes(needle) || needle.includes(String(v).toLowerCase())));
}

function generatePurposeStatement() {
  const title = val('procedureTitle', 'This procedure');
  const domain = val('processDomain', 'the relevant function');
  const linked = val('linkedProcess', 'the related process');
  const owner = val('documentOwner', 'the process owner');
  const themes = arr('purpose').join(', ') || 'standardize execution, clarify accountabilities, strengthen controls, and support consistent documentation';
  return `${title} exists to guide ${domain} users in performing the required activities consistently and completely within ${linked}. It defines the trigger, inputs, roles, steps, decision points, evidence, controls, and outputs needed to ${themes.toLowerCase()}. The procedure supports ${owner} in maintaining clear accountability, repeatable execution, and audit-ready records.`;
}

function parseSteps(text) {
  const parts = splitKeywords(text);
  const roles = arr('roles');
  const owner = val('documentOwner', roles[0] || 'Process Owner');
  if (!parts.length) return [];
  return parts.map(p => {
    let stepOwner = owner;
    let action = p;
    if (p.includes(':')) {
      const [o, ...rest] = p.split(':');
      stepOwner = clean(o) || owner;
      action = clean(rest.join(':')) || p;
    } else if (/request|submit|initiat/i.test(p)) stepOwner = roles.find(r => /request|proponent/i.test(r)) || 'Requestor / Proponent';
    else if (/review|check|validat|assess/i.test(p)) stepOwner = roles.find(r => /review|evaluat|finance|regulatory/i.test(r)) || 'Reviewer / Evaluator';
    else if (/approv|decid|endorse/i.test(p)) stepOwner = roles.find(r => /approv|head|manager/i.test(r)) || 'Approver';
    else if (/file|record|update|sap|system/i.test(p)) stepOwner = roles.find(r => /custodian|system|admin|buyer/i.test(r)) || owner;
    return { owner: stepOwner, action: sentenceCase(action) };
  });
}

function parseTimeline(text) {
  if (!text || /^tbd$/i.test(text.trim())) return smartOptions('timelineItems').map(o => ({ item: o.item || o.value, timeline: 'TBD', owner: o.owner || val('documentOwner'), trigger: 'For process owner confirmation' }));
  return splitKeywords(text).map(p => {
    const [left, ...rest] = p.split(/=|:/);
    return { item: clean(left), timeline: clean(rest.join(':')) || 'TBD', owner: val('documentOwner'), trigger: 'User provided' };
  }).filter(x => x.item);
}

function generateProcedureMarkdown() {
  const steps = arr('criticalSteps');
  return `# ${val('procedureTitle', 'Procedure Title TBD')}

## Context

### Procedure Purpose
${val('purposeFreeText', generatePurposeStatement())}

### Procedure Objective
This procedure aims to ensure that ${val('procedureTitle', 'the activity')} is performed consistently, completely, and with the required approvals, controls, and evidence.

### Procedure Scope
**In-Scope:** ${arr('scope').join('; ') || 'TBD'}

**Out-of-Scope:** ${arr('outOfScope').join('; ') || 'TBD'}

## Key Business Terms and Acronyms
| Term / Acronym | Definition | Example |
|---|---|---|
| ${val('processDomain', 'Process Domain')} | Functional area responsible for this procedure. | ${val('documentOwner', 'Process Owner')} owns the document. |

## Reference Documents
${bullets(arr('relatedDocs').length ? arr('relatedDocs') : [val('parentPolicy'), val('linkedProcess')])}

## Procedure Steps

### Related Policies, Conditions and Obligations
- The procedure starts when: ${val('triggerFreeText', val('trigger'))}.
- Required inputs must be complete before processing: ${arr('inputs').join('; ') || 'TBD'}.
- The procedure ends when: ${val('endPoint')}.
- Exceptions must be escalated and supported by evidence.

### Process and Procedure Requirements
**Information, Files and System Requirements:** ${[...arr('inputs'), ...arr('systems'), ...arr('records')].join('; ') || 'TBD'}

**Capability and Skill Requirements:** Roles involved include ${arr('roles').join(', ') || 'TBD'}.

### Process Details
| Step # | Procedure Step | Responsible Role | Inputs | Outputs | Systems Used | Decision / Condition | Control | Estimated Time |
|---|---|---|---|---|---|---|---|---|
${steps.length ? steps.map((s, i) => `| ${i + 1} | ${s.action || 'TBD'} | ${s.owner || 'TBD'} | ${i === 0 ? arr('inputs').join(', ') || 'TBD' : 'Prior step output'} | ${i === steps.length - 1 ? arr('outputs').join(', ') || 'TBD' : 'Step output'} | ${arr('systems').join(', ') || 'TBD'} | ${arr('decisionPoints').join('; ') || 'TBD'} | ${arr('controls').join(', ') || 'TBD'} | ${formatTimeline()} |`).join('\n') : '| 1 | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |'}

## Process Flow Diagram
To be prepared using BPMN after the procedure steps are validated.

## Risk and Control Policies
| Risk | Control | Evidence |
|---|---|---|
${(arr('risks').length ? arr('risks') : ['TBD']).map((r, i) => `| ${r} | ${arr('controls')[i] || arr('controls')[0] || 'TBD'} | ${arr('evidence')[i] || arr('evidence')[0] || 'TBD'} |`).join('\n')}

## Escalation Management
${bullets(arr('exceptions'))}

## SIPOC Table
| Suppliers | Inputs | Process | Outputs | Customers |
|---|---|---|---|---|
| ${arr('roles')[0] || 'Supplier TBD'} | ${arr('inputs').join(', ') || 'TBD'} | ${val('procedureTitle', 'Procedure')} | ${arr('outputs').join(', ') || 'TBD'} | Downstream user/process TBD |

## RACI Table
| Activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
${steps.length ? steps.map(s => `| ${s.action || 'TBD'} | ${s.owner || 'TBD'} | ${val('documentOwner')} | ${arr('smes').join(', ') || 'TBD'} | ${arr('outputs').join(', ') || 'TBD'} |`).join('\n') : '| TBD | TBD | TBD | TBD | TBD |'}

## Performance Assessment
${bullets(arr('kpis'))}

## Appendix

### Metadata Table
| Element | Details |
|---|---|
| Document Title | ${val('procedureTitle')} |
| Document Tier | ${val('docMode').includes('T3') || val('docMode').includes('Process') ? 'T3 Process Document' : 'T4 Procedure / SOP'} |
| Process Domain | ${val('processDomain')} |
| Linked Process | ${val('linkedProcess')} |
| Process Owner | ${val('documentOwner')} |
| Review Cycle | ${val('reviewCycle')} |
| Confidentiality | ${val('confidentiality')} |

### Interlinking Requirements Table
${bullets(arr('relatedDocs'))}

### Impact Assessment Table
${bullets(arr('impactTriggers'))}

### Revision History Table
| Version | Date | Description of Change | Author | Approved By |
|---|---|---|---|---|
| 1.0 | TBD | Initial draft generated through PLAYBOOK DocBot | TBD | TBD |
`;
}

function generateProcessMarkdown() {
  return `# ${val('linkedProcess', 'Process Document Roll-up TBD')}

## Process Purpose
This T3 process roll-up is based on the captured procedure information for ${val('procedureTitle', 'the procedure')}.

## Scope
${arr('scope').join('; ') || 'TBD'}

## Major Activities
${bullets(arr('criticalSteps').map(s => typeof s === 'object' ? `${s.owner}: ${s.action}` : s))}

## Inputs and Outputs
**Inputs:** ${arr('inputs').join(', ') || 'TBD'}

**Outputs:** ${arr('outputs').join(', ') || 'TBD'}

## Roles
${bullets(arr('roles'))}

## Risks and Controls
${bullets([...arr('risks'), ...arr('controls')])}

## KPIs
${bullets(arr('kpis'))}

## Proposed Related Documents
${bullets(arr('relatedDocs'))}
`;
}

function formatTimeline() {
  const sla = arr('sla');
  if (!sla.length) return 'TBD';
  return sla.map(x => typeof x === 'object' ? `${x.item}: ${x.timeline}` : x).join('; ');
}

function loadSample() {
  state.answers = {
    docMode: 'Procedure / SOP Document (T4)',
    processDomain: 'Purchasing',
    processLevel: 'L4 Subprocess / Activity Cluster',
    linkedProcess: 'Vendor Management Process',
    parentPolicy: 'Vendor Accreditation Policy',
    procedureTitle: 'Vendor Accreditation Procedure',
    documentOwner: 'Purchasing Head',
    smes: ['Buyer', 'Regulatory Reviewer', 'Finance Reviewer', 'Vendor Master Custodian'],
    purpose: ['Standardize ways of working', 'Strengthen controls and documentation discipline'],
    purposeFreeText: 'Vendor Accreditation Procedure exists to guide Purchasing and reviewing functions in evaluating and approving vendors before vendor master creation.',
    scope: ['Vendor document collection', 'Completeness checking', 'Reviewer assessment', 'Approval and vendor master update'],
    outOfScope: ['System configuration', 'Post-accreditation vendor performance monitoring'],
    trigger: ['Business need or request arises'],
    triggerFreeText: 'Potential vendor needs to be accredited',
    endPoint: 'Vendor master is created and proponent is notified',
    inputs: ['Vendor application documents', 'Financial statements', 'Regulatory documents'],
    outputs: ['Approved accreditation record', 'SAP vendor code', 'Notification to proponent'],
    systems: ['Email / Outlook', 'SharePoint repository', 'SAP'],
    records: ['Vendor document pack', 'Assessment email', 'Approval email'],
    roles: ['Buyer', 'Purchasing Head', 'Finance Reviewer', 'Regulatory Reviewer', 'Vendor Master Custodian'],
    criticalSteps: parseSteps('Buyer: request documents, Buyer: check completeness, Finance Reviewer: assess financial documents, Regulatory Reviewer: assess compliance documents, Purchasing Head: approve recommendation, Vendor Master Custodian: create SAP vendor code, Buyer: notify proponent'),
    decisionPoints: ['Are required inputs complete?', 'Can the request proceed based on reviewer assessment?', 'Is the output ready for release or system update?'],
    exceptions: ['Incomplete or missing requirements: return to requestor and log pending item', 'Approval delay: escalate to functional lead based on SLA'],
    sla: parseTimeline('Completeness check=2 working days; Finance review=1 working day; Regulatory review=1 working day; Approval=3 to 5 working days'),
    risks: ['Incomplete or inaccurate records', 'Unauthorized transaction', 'Operational delay'],
    controls: ['Completeness check', 'Manual review', 'Approval control'],
    evidence: ['Approval record', 'System audit trail', 'Checklist / review sheet'],
    kpis: ['Turnaround time / cycle time from start to closure', 'SLA compliance rate', 'Completeness rate of submitted requirements'],
    relatedDocs: ['Vendor Accreditation Policy', 'Vendor Management Process', 'SAP Vendor Master Work Instruction'],
    relationshipTypes: ['Process-implements-Procedure/SOP', 'Procedure/SOP-references-WI'],
    impactTriggers: ['Linked T5 Work Instructions', 'Forms / records / templates', 'Training / communication materials'],
    approvers: ['Purchasing Head', 'Finance Reviewer', 'Regulatory Reviewer'],
    confidentiality: 'Internal',
    reviewCycle: 'Semi-Annual'
  };
  state.messages = [];
  state.index = Math.min(PLAYBOOK_QUESTIONS.length - 1, 10);
  addMessage('ai', 'Sample Vendor Accreditation Procedure has been loaded. You can continue the interview or review the generated draft.');
  saveState(); renderAll();
}

function qById(id) { return PLAYBOOK_QUESTIONS.find(q => q.id === id) || {}; }
function labelFor(q, value) {
  const opt = getOptions(q).find(o => o.value === value || o.label === value);
  return opt ? (opt.label || opt.value) : String(value ?? '');
}
function a(id, fallback = 'TBD') { return val(id, fallback); }
function val(id, fallback = 'TBD') {
  const v = state.answers[id];
  if (v === undefined || v === null || v === '') return fallback;
  if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? (x.action ? `${x.owner || 'Owner TBD'}: ${x.action}` : `${x.item || 'Item'} ${x.timeline ? '= ' + x.timeline : ''}`) : labelFor(qById(id), x)).join(', ');
  return labelFor(qById(id), v);
}
function arr(id) { return arrValue(state.answers[id]); }
function arrValue(v) { if (!v) return []; return Array.isArray(v) ? v : [v]; }
function hasAnswer(id) { const v = state.answers[id]; return Array.isArray(v) ? v.length > 0 : !!v; }
function qDefault(q) { return q.type === 'timelineMatrix' ? parseTimeline('TBD') : (['multi','smartMulti','tags'].includes(q.type) ? ['TBD'] : 'TBD'); }
function splitKeywords(text) { return String(text || '').split(/;|,|\n|\u2022|- /).map(clean).filter(Boolean); }
function clean(s) { return String(s || '').replace(/^[-•\d.\s]+/, '').trim(); }
function unique(arr) { return [...new Set(arr.map(x => typeof x === 'string' ? x.trim() : x).filter(Boolean))]; }
function uniqueBy(arr, keyFn) { const seen = new Set(); return arr.filter(x => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; }); }
function sentenceCase(s) { const x = clean(s); return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }
function formatValue(v) { return Array.isArray(v) ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(', ') : String(v); }
function formatAnswer(q, v) {
  if (q.type === 'steps') return arrValue(v).map((s, i) => `${i + 1}. ${s.owner || 'Owner TBD'}: ${s.action || 'TBD'}`).join(' | ');
  if (q.type === 'timelineMatrix') return arrValue(v).map(x => `${x.item}: ${x.timeline}`).join(' | ');
  if (Array.isArray(v)) return v.map(x => labelFor(q, x)).join(', ');
  return labelFor(q, v);
}
function bullets(items) { const list = arrValue(items).filter(Boolean); return list.length ? list.map(x => `- ${typeof x === 'object' ? JSON.stringify(x) : x}`).join('\n') : '- TBD'; }
function targetText() { const m = val('docMode', 'Procedure / SOP capture with process roll-up readiness'); return m; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
function showToast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }
function showStartupError(msg) {
  const box = $('chatMessages') || document.body;
  box.innerHTML = `<div class="msg ai"><div><strong>Startup error:</strong> ${escapeHtml(msg)}<br><small>Make sure index.html, app.js, and playbook_schema.js are uploaded in the same GitHub repository root folder.</small></div></div>`;
}
function copyText(text) { navigator.clipboard?.writeText(text); showToast('Copied to clipboard.'); }
function downloadFile(filename, content, mime) { const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function exportPackageFallback() {
  const payload = { generatedAt: new Date().toISOString(), answers: state.answers, procedureMarkdown: generateProcedureMarkdown(), processRollupMarkdown: generateProcessMarkdown() };
  downloadFile('playbook-docbot-export.json', JSON.stringify(payload, null, 2), 'application/json');
  downloadFile('playbook-procedure-draft.md', generateProcedureMarkdown(), 'text/markdown');
  downloadFile('playbook-process-rollup.md', generateProcessMarkdown(), 'text/markdown');
  showToast('Exported JSON and Markdown files.');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
