const $ = (id) => document.getElementById(id);

const state = {
  index: 0,
  answers: JSON.parse(localStorage.getItem('playbookDocbotAnswers') || '{}'),
  tempValue: null
};

const qaChecks = PLAYBOOK_SCHEMA.qaChecks;

function resolveOptions(q) {
  if (q.optionsFrom) return PLAYBOOK_SCHEMA[q.optionsFrom].map(v => ({ value: v, label: v, impact: `${v} will be reflected in the relevant PLAYBOOK section.` }));
  return q.options || [];
}

function getQuestion() { return PLAYBOOK_QUESTIONS[state.index]; }
function save() { localStorage.setItem('playbookDocbotAnswers', JSON.stringify(state.answers)); }
function showToast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }

function render() {
  const q = getQuestion();
  $('stageLabel').textContent = q.stage;
  $('questionText').textContent = q.question;
  $('questionHelper').textContent = q.helper;
  $('questionCounter').textContent = `${state.index + 1} / ${PLAYBOOK_QUESTIONS.length}`;
  state.tempValue = state.answers[q.id] ?? (q.type === 'multi' || q.type === 'tags' || q.type === 'steps' ? [] : '');
  renderAnswerArea(q);
  renderValidation(q);
  renderSummary();
  renderOutputs();
  renderProgress();
}

function renderAnswerArea(q) {
  const area = $('answerArea');
  area.className = 'answer-area';
  area.innerHTML = '';
  if (q.type === 'single' || q.type === 'multi') {
    const options = resolveOptions(q);
    options.forEach(opt => {
      const selected = q.type === 'multi' ? (state.tempValue || []).includes(opt.value) : state.tempValue === opt.value;
      const card = document.createElement('label');
      card.className = `option-card ${selected ? 'selected' : ''}`;
      card.innerHTML = `<input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" ${selected ? 'checked' : ''}/><div><strong>${opt.label}</strong><small>${opt.impact || ''}</small></div>`;
      card.onclick = (e) => {
        e.preventDefault();
        if (q.type === 'multi') {
          const set = new Set(state.tempValue || []);
          set.has(opt.value) ? set.delete(opt.value) : set.add(opt.value);
          state.tempValue = [...set];
        } else {
          state.tempValue = opt.value;
        }
        renderAnswerArea(q); renderValidation(q);
      };
      area.appendChild(card);
    });
    return;
  }
  if (q.type === 'text') {
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.placeholder = q.placeholder || '';
    textarea.value = state.tempValue || '';
    textarea.oninput = () => { state.tempValue = textarea.value; renderValidation(q); };
    area.appendChild(textarea);
    return;
  }
  if (q.type === 'tags') {
    const input = document.createElement('input');
    input.className = 'form-control';
    input.placeholder = q.placeholder || 'Type and press Enter';
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        state.tempValue = [...new Set([...(state.tempValue || []), input.value.trim()])];
        input.value = '';
        renderAnswerArea(q); renderValidation(q);
      }
    };
    area.appendChild(input);
    const row = document.createElement('div'); row.className = 'tag-row';
    (state.tempValue || []).forEach(tag => {
      const pill = document.createElement('span'); pill.className = 'tag';
      pill.innerHTML = `${tag}<button title="Remove">×</button>`;
      pill.querySelector('button').onclick = () => { state.tempValue = state.tempValue.filter(x => x !== tag); renderAnswerArea(q); renderValidation(q); };
      row.appendChild(pill);
    });
    area.appendChild(row);
    return;
  }
  if (q.type === 'steps') {
    const wrapper = document.createElement('div'); wrapper.className = 'step-list';
    const steps = state.tempValue && state.tempValue.length ? state.tempValue : [{ action: '', owner: '' }];
    state.tempValue = steps;
    steps.forEach((step, idx) => {
      const row = document.createElement('div'); row.className = 'step-row';
      row.innerHTML = `<span>${idx + 1}</span><input class="mini" placeholder="Activity / step" value="${escapeHtml(step.action || '')}"/><input class="mini" placeholder="Responsible role" value="${escapeHtml(step.owner || '')}"/><button class="ghost" title="Remove">×</button>`;
      row.children[1].oninput = (e) => { state.tempValue[idx].action = e.target.value; renderValidation(q); };
      row.children[2].oninput = (e) => { state.tempValue[idx].owner = e.target.value; renderValidation(q); };
      row.children[3].onclick = () => { state.tempValue.splice(idx, 1); renderAnswerArea(q); renderValidation(q); };
      wrapper.appendChild(row);
    });
    const add = document.createElement('button'); add.className = 'secondary'; add.textContent = 'Add another step';
    add.onclick = () => { state.tempValue.push({ action: '', owner: '' }); renderAnswerArea(q); };
    area.appendChild(wrapper); area.appendChild(add);
  }
}

function renderValidation(q) {
  const val = state.tempValue;
  let msg = 'Provide an answer, then confirm. The chatbot will map your response to the correct PLAYBOOK section.';
  if (q.type === 'single') {
    const opt = resolveOptions(q).find(o => o.value === val);
    if (opt) msg = `Confirmed interpretation: ${opt.label}. ${opt.impact}`;
  } else if (q.type === 'multi') {
    const opts = resolveOptions(q).filter(o => (val || []).includes(o.value));
    if (opts.length) msg = `You selected ${opts.length} item(s). Documentation impact: ${opts.map(o => o.impact).join(' ')}`;
  } else if (q.type === 'text' && val) {
    msg = `This will be written into the ${q.stage} section. Check that the wording is specific enough for a new user to understand without asking the process owner.`;
  } else if (q.type === 'tags' && val?.length) {
    msg = `These ${val.length} item(s) will become structured metadata/list entries. They can also support SharePoint filters, ownership, and impact assessment.`;
  } else if (q.type === 'steps') {
    const filled = (val || []).filter(s => s.action || s.owner).length;
    if (filled) msg = `You have ${filled} procedure step(s). Each step should have an activity and responsible role so the SOP is repeatable and auditable.`;
  }
  $('validationText').textContent = msg;
}

function renderProgress() {
  const answered = Object.values(state.answers).filter(v => Array.isArray(v) ? v.length : !!v).length;
  const pct = Math.round((answered / PLAYBOOK_QUESTIONS.length) * 100);
  $('completionText').textContent = `${pct}%`;
  $('progressBar').style.width = `${pct}%`;
  $('progressHint').textContent = pct < 50 ? 'Keep capturing core scope, roles, triggers, and procedure flow.' : pct < 90 ? 'Good progress. Finish risks, controls, evidence, KPIs, and approvers.' : 'Ready for drafting and process roll-up review.';
}

function renderSummary() {
  const box = $('answerSummary');
  const entries = PLAYBOOK_QUESTIONS.filter(q => state.answers[q.id] && (!Array.isArray(state.answers[q.id]) || state.answers[q.id].length));
  if (!entries.length) { box.innerHTML = '<p class="empty">No information captured yet.</p>'; return; }
  box.innerHTML = entries.map(q => `<div class="summary-item"><strong>${q.stage}</strong><span>${formatAnswer(q, state.answers[q.id])}</span></div>`).join('');
}

function formatAnswer(q, val) {
  if (q.type === 'steps') return val.map((s, i) => `${i + 1}. ${s.action || 'Step'} (${s.owner || 'Owner TBD'})`).join('<br/>');
  if (Array.isArray(val)) return val.join(', ');
  const opt = resolveOptions(q).find(o => o.value === val);
  return opt ? opt.label : String(val);
}

function renderOutputs() {
  $('procedureOutput').textContent = generateProcedureMarkdown();
  $('processOutput').textContent = generateProcessMarkdown();
  renderTierCards();
}

function renderTierCards() {
  const tierCards = $('tierCards');
  if (!tierCards.dataset.rendered) {
    tierCards.innerHTML = PLAYBOOK_SCHEMA.tiers.map(t => `
      <div class="tier-card">
        <span class="pill">${t.id}</span>
        <h4>${t.name}</h4>
        <p>${t.purpose}</p>
        <small><strong>Must include:</strong> ${t.mustInclude}</small><br/>
        <small><strong>Do not duplicate:</strong> ${t.mustNotDuplicate}</small><br/>
        <small><strong>Approval:</strong> ${t.approval} | <strong>Review:</strong> ${t.reviewCycle}</small>
      </div>`).join('');
    $('qaChecklist').innerHTML = qaChecks.map(x => `<li>${x}</li>`).join('');
    tierCards.dataset.rendered = 'true';
  }
}


function labelFor(q, val) {
  const opt = resolveOptions(q).find(o => o.value === val);
  return opt ? opt.label : String(val);
}
function qById(id) { return PLAYBOOK_QUESTIONS.find(q => q.id === id) || {}; }
function a(id, fallback = 'TBD') {
  const v = state.answers[id];
  if (Array.isArray(v)) {
    if (!v.length) return fallback;
    if (v[0] && typeof v[0] === 'object') return v.map((x, i) => `${i + 1}. ${x.action || x.item || 'Item TBD'} (${x.owner || 'Owner TBD'}${x.timeline ? ', ' + x.timeline : ''})`).join('; ');
    return v.map(x => labelFor(qById(id), x)).join(', ');
  }
  return v ? labelFor(qById(id), v) : fallback;
}
function stepLines() {
  const steps = state.answers.criticalSteps || [];
  return steps.length ? steps.map((s, i) => `${i + 1}. **${s.owner || 'Owner TBD'}** - ${s.action || 'Step description TBD'}`).join('\n') : '1. **Owner TBD** - Step description TBD';
}
function tableRows(items, columns = 3) {
  const arr = items && items.length ? items : ['TBD'];
  return arr.map(x => {
    const label = typeof x === 'string' ? x : JSON.stringify(x);
    return columns === 4 ? `| ${label} | TBD | TBD | TBD |` : `| ${label} | TBD | TBD |`;
  }).join('\n');
}
function metadataRows() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = [
    ['Document Tier', 'T4 - Procedure / SOP'],
    ['Document Type', 'Procedure / SOP'],
    ['Document ID', 'TBD - follow Document Register naming convention'],
    ['Document Title', a('procedureTitle')],
    ['Process Domain', a('processDomain')],
    ['Process Level', a('processLevel')],
    ['Linked Process', a('linkedProcess')],
    ['Parent Document', a('linkedProcess')],
    ['Governing Policy / Rule Reference', a('parentPolicy')],
    ['Document Owner', a('documentOwner')],
    ['SME', a('smes')],
    ['Approver Type', 'Process Owner or SME'],
    ['Document Status', 'Working Draft'],
    ['Version', 'Draft 0.1'],
    ['Prepared Date', today],
    ['Review Cycle', a('reviewCycle', 'Semi-Annual')],
    ['Confidentiality', a('confidentiality')],
    ['System(s)', a('systems')],
    ['Supporting References', a('relatedDocs')]
  ];
  return rows.map(r => `| ${r[0]} | ${r[1]} |`).join('\n');
}
function generateProcedureMarkdown() {
  return `# ${a('procedureTitle', 'Procedure / SOP Title TBD')}

## 1. Document Control and SharePoint Metadata
| Field | Details |
|---|---|
${metadataRows()}

## 2. Purpose / Objective
${a('purposeFreeText', 'TBD')}

Purpose themes selected: ${a('purpose')}.

## 3. Governing Rule / Policy Reference
This procedure shall be performed in line with the following governing policy, rule, or parent document: **${a('parentPolicy')}**.

Note for PLAYBOOK drafting: do not copy the full T2 policy text here. Keep only the summary or reference needed to guide execution.

## 4. Scope
**Covered:** ${a('scope')}

**Out of Scope / Exclusions:** ${a('outOfScope')}

## 5. Trigger and End Point
**Trigger / Starting Point:** ${a('triggerFreeText', a('trigger'))}

**End Point / Output:** ${a('endPoint')}

## 6. Inputs and Prerequisites
${a('inputs')}

## 7. Outputs
${a('outputs')}

## 8. Systems, Tools, Forms, and Records
**Systems Used:** ${a('systems')}

**Forms / Records Used:** ${a('records')}

## 9. Roles and Responsibilities
| Role | Primary Responsibility | Key Evidence / Output |
|---|---|---|
${tableRows(state.answers.roles)}

## 10. RACI Starter View
Accountability pattern selected: **${a('raci')}**.

| Activity / Decision | Responsible | Accountable | Consulted / Informed |
|---|---|---|---|
${(state.answers.criticalSteps || [{action: 'TBD', owner: 'Owner TBD'}]).map(s => `| ${s.action || 'Step TBD'} | ${s.owner || 'Owner TBD'} | ${a('documentOwner')} | ${a('smes')} |`).join('\n')}

## 11. Numbered Procedure Steps
${stepLines()}

## 12. Decision Points
${a('decisionPoints')}

## 13. Exceptions and Escalation
${a('exceptions')}

## 14. Timeline / SLA
${a('sla')}

## 15. Key Risks
${a('risks')}

## 16. Control Points
Control types selected: ${a('controls')}.

| Control Point | Control Type | Responsible Role | Evidence |
|---|---|---|---|
| Completeness and validity check before processing | ${a('controls')} | ${a('documentOwner')} / Reviewer | ${a('evidence')} |
| Exception review and approval before closure | Exception approval / Manual review | ${a('documentOwner')} | Exception log / approval record |
| Evidence retention in official repository | Preventive / Detective | Process performer / Owner | SharePoint record / linked reference |

## 17. Evidence and Records Retention
${a('evidence')}

## 18. KPIs and Monitoring
${a('kpis')}

## 19. Interlinking Requirements
Related documents and references: ${a('relatedDocs')}.

Relationship types: ${a('relationshipTypes')}.

## 20. Impact Assessment Summary
If this T4 Procedure / SOP changes, assess impact to: ${a('impactTriggers')}.

## 21. Approval and Review
This document should be reviewed and approved by: ${a('approvers')}.

Review cycle: ${a('reviewCycle', 'Semi-Annual')}.

## 22. Publish Readiness / QA Gate
Before publication, confirm that mandatory SharePoint metadata is complete, the Document Register entry is ready, parent/child Document Links are active, and supporting references are stored in the correct library.`;
}

function generateProcessMarkdown() {
  const title = a('linkedProcess', `${a('processDomain')} Process Document`);
  return `# ${title}

## 1. Document Control and SharePoint Metadata
| Field | Details |
|---|---|
| Document Tier | T3 - Process Document |
| Document Type | Process Document |
| Process Domain | ${a('processDomain')} |
| Process Level | L3 Process |
| Parent Document | ${a('parentPolicy')} |
| Document Owner | ${a('documentOwner')} |
| SME | ${a('smes')} |
| Source Procedure / SOP | ${a('procedureTitle')} |
| Review Cycle | Semi-Annual / Annual |
| Status | Draft roll-up generated from T4 capture |

## 2. Governing Policy Summary
This process is governed by: **${a('parentPolicy')}**.

PLAYBOOK note: T3 should include only the governing policy summary. Full policy text remains in T2.

## 3. Process Purpose
${a('purposeFreeText', 'TBD')}

Purpose themes: ${a('purpose')}.

## 4. Scope and Boundaries
**Starts when:** ${a('triggerFreeText', a('trigger'))}

**Ends when:** ${a('endPoint')}

**Covered:** ${a('scope')}

**Excluded:** ${a('outOfScope')}

## 5. Enterprise Process Architecture Mapping
| Level | Draft Mapping |
|---|---|
| L1 | ${a('processDomain')} |
| L2 | ${a('processDomain')} Process Group |
| L3 | ${title} |
| L4 | ${a('procedureTitle')} |
| L5 | Linked Work Instructions / task-level guidance TBD |

## 6. SIPOC Draft
| Supplier | Input | Process | Output | Customer |
|---|---|---|---|---|
| ${a('roles')} | ${a('inputs')} | ${title} | ${a('outputs')} | Downstream process users / management |

## 7. Process Flow and Linked Procedures
Primary linked T4 Procedure / SOP: **${a('procedureTitle')}**.

Major activity flow captured from procedure:
${stepLines()}

## 8. Roles and Governance
Roles involved: ${a('roles')}.

Document owner: ${a('documentOwner')}.

SMEs / reviewers: ${a('smes')}.

Approvers / governance reviewers: ${a('approvers')}.

## 9. Key Risks and Control Themes
Risks: ${a('risks')}.

Control themes: ${a('controls')}.

## 10. KPIs and Management Monitoring
${a('kpis')}

## 11. Systems, Data, and Records
Systems/tools: ${a('systems')}.

Forms / records: ${a('records')}.

Evidence and retention: ${a('evidence')}.

## 12. Interlinking and Impact Assessment
Related documents: ${a('relatedDocs')}.

Relationship types: ${a('relationshipTypes')}.

Potential downstream impact if changed: ${a('impactTriggers')}.

## 13. Process Owner Review Notes
Before converting this roll-up into the official T3 Process Document, validate the end-to-end process boundaries, cross-functional handoffs, parent T2 policy summary, child T4/T5 links, KPIs, active Document Links, and Flow E impact-assessment readiness.`;
}

function confirmAnswer() {
  const q = getQuestion();
  if (q.type === 'steps') state.tempValue = (state.tempValue || []).filter(s => s.action || s.owner);
  if (q.type === 'timelineMatrix') state.tempValue = (state.tempValue || []).filter(r => r.item || r.timeline || r.owner);
  state.answers[q.id] = state.tempValue;
  rememberCurrentDocument();
  save();
  if (state.index < PLAYBOOK_QUESTIONS.length - 1) state.index += 1;
  render();
}

function skipAnswer() { if (state.index < PLAYBOOK_QUESTIONS.length - 1) { state.index += 1; render(); } }
function back() { if (state.index > 0) { state.index -= 1; render(); } }

function exportPackage() {
  const payload = {
    metadata: { generatedAt: new Date().toISOString(), app: 'Project PLAYBOOK DocBot' },
    answers: state.answers,
    procedureMarkdown: generateProcedureMarkdown(),
    processRollupMarkdown: generateProcessMarkdown()
  };
  downloadFile('playbook-docbot-export.json', JSON.stringify(payload, null, 2), 'application/json');
  downloadFile('playbook-procedure-draft.md', generateProcedureMarkdown(), 'text/markdown');
  downloadFile('playbook-process-rollup.md', generateProcessMarkdown(), 'text/markdown');
  showToast('Exported JSON, procedure draft, and process roll-up markdown.');
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function copyText(text) { navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard.')); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function loadSample() {
  state.answers = {
    docMode: 't4-to-t3',
    processDomain: 'Procurement',
    processLevel: 'L4 Subprocess / Activity Cluster',
    linkedProcess: 'Vendor Accreditation Process',
    parentPolicy: 'Vendor Accreditation Policy / Procurement and Sourcing Policy',
    procedureTitle: 'Vendor Accreditation Procedure',
    documentOwner: 'Purchasing Head',
    smes: ['Buyer', 'Regulatory Reviewer', 'Finance Reviewer', 'Vendor Master Custodian'],
    purpose: ['Standardize ways of working', 'Clarify roles, ownership, and handoffs', 'Strengthen controls and documentation discipline'],
    purposeFreeText: 'Defines the standard method for vendor accreditation, evaluator review, approval decision, condition monitoring, and vendor master update before a vendor is used in procurement transactions.',
    scope: 'Covers accreditation of new, recurring, and risk-based vendors before vendor master creation or use in procurement transactions.',
    outOfScope: 'Contract drafting, payment processing, post-payment dispute handling, and vendor performance management are outside this procedure and should be covered by separate documents.',
    trigger: ['business-need', 'approval-needed'],
    triggerFreeText: 'A requesting department or buyer identifies the need to engage a vendor and initiates accreditation before vendor master creation or procurement use.',
    endPoint: 'Accreditation decision is issued, vendor master is created or updated, and records are stored in the official repository.',
    inputs: ['Vendor Accreditation Request', 'Supplier Information Sheet', 'Vendor documents', 'Scope of work', 'Risk classification'],
    outputs: ['Approved vendor record', 'Conditional approval notice', 'Rejected vendor notice', 'Vendor master update', 'Accreditation repository folder'],
    systems: ['SharePoint repository', 'SAP vendor master', 'Email approval', 'Accreditation tracker'],
    records: ['Vendor Accreditation Request', 'Supplier Information Sheet', 'Evaluation checklist', 'Approval notice', 'Exception log'],
    roles: ['Requestor', 'Buyer', 'Purchasing Head', 'Regulatory Reviewer', 'Finance Reviewer', 'Vendor Master Custodian'],
    raci: 'cross-functional',
    criticalSteps: [
      { owner: 'Requestor / Buyer', action: 'Identify vendor need and prepare required vendor information.' },
      { owner: 'Buyer', action: 'Create accreditation request and request the applicable document pack.' },
      { owner: 'Evaluators', action: 'Perform regulatory, technical, finance, and category-specific review based on vendor risk.' },
      { owner: 'Buyer', action: 'Consolidate evaluator outputs and confirm repository completeness.' },
      { owner: 'Purchasing Head', action: 'Render final accreditation decision and document conditions where applicable.' },
      { owner: 'Vendor Master Custodian', action: 'Create or update vendor master after approval and close the request.' }
    ],
    decisionPoints: ['Accreditation Lite / Full / Enhanced / Provisional', 'Approved / Approved with Conditions / Pending / Rejected'],
    exceptions: 'Incomplete documents are returned to the requestor. Urgent or provisional requests require documented conditions, expiry date, and approval by the Purchasing Head.',
    sla: 'Completeness check and evaluator aging should be monitored in the accreditation tracker. Exact SLA remains TBD for process owner confirmation.',
    risks: ['Compliance breach', 'Unauthorized transaction', 'Vendor or third-party risk', 'Unclear accountability', 'Incomplete or inaccurate records'],
    controls: ['Preventive', 'Detective', 'Manual review', 'Approval control', 'Completeness check'],
    evidence: ['Approved form', 'SharePoint record', 'Email approval', 'Checklist', 'Exception log'],
    kpis: ['Cycle time', 'Pending aging requests', 'Exception rate', 'Conditional approvals past due', 'Vendors without complete document pack'],
    relatedDocs: ['Vendor Accreditation Policy', 'Vendor Master Creation Work Instruction', 'Vendor Accreditation Form', 'Procurement Authority Matrix'],
    relationshipTypes: ['Policy-governs-Process', 'Process-implements-Procedure/SOP', 'Procedure/SOP-references-WI', 'Procedure/SOP-uses-Form-or-Record'],
    impactTriggers: ['work-instructions', 'forms-records', 'training', 'system-workflow', 'kpi-dashboard'],
    approvers: ['Purchasing Head', 'Finance Reviewer', 'Regulatory Reviewer', 'Process Owner'],
    confidentiality: 'Internal',
    reviewCycle: 'Semi-Annual'
  };
  state.index = 0; save(); render(); showToast('Sample Vendor Accreditation capture loaded.');
}

async function improveWithAI() {
  const key = sessionStorage.getItem('OPENAI_API_KEY');
  if (!key) { showToast('Add an API key first for local testing.'); return; }
  $('aiOutput').textContent = 'Calling OpenAI...';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: 'You are a Project PLAYBOOK documentation assistant. Improve drafts without inventing facts. Keep gaps as TBD.' },
          { role: 'user', content: `Improve this procedure draft for clarity, control language, and governance readiness. Do not invent missing facts.\n\n${generateProcedureMarkdown()}` }
        ], temperature: 0.2
      })
    });
    const data = await res.json();
    $('aiOutput').textContent = data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
  } catch (err) { $('aiOutput').textContent = `Error: ${err.message}`; }
}

function initEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active'); $(btn.dataset.view).classList.add('active'); renderOutputs();
  });
  $('confirmBtn').onclick = confirmAnswer; $('skipBtn').onclick = skipAnswer; $('backBtn').onclick = back;
  $('resetBtn').onclick = () => { if (confirm('Clear all captured information?')) { state.answers = {}; state.index = 0; save(); render(); } };
  $('loadSampleBtn').onclick = loadSample; $('exportBtn').onclick = exportPackage;
  $('copyProcedureBtn').onclick = () => copyText(generateProcedureMarkdown());
  $('copyProcessBtn').onclick = () => copyText(generateProcessMarkdown());
  $('saveApiKeyBtn').onclick = () => { sessionStorage.setItem('OPENAI_API_KEY', $('apiKeyInput').value.trim()); showToast('Saved for this browser session only.'); };
  $('aiImproveBtn').onclick = improveWithAI;
}

initEvents(); render();


/* ------------------------------
   v4 Dynamic Guidance Overrides
   These overrides make the chatbot behave like an AI-guided interviewer:
   - draft purpose statement from earlier answers
   - suggest selectable answers from prior responses
   - validate logic after every answer
   - allow custom input when suggested choices are incomplete
-------------------------------- */

function isChoiceType(q) {
  return ['single', 'multi', 'smartSingle', 'smartMulti'].includes(q.type);
}

function isArrayType(q) {
  return ['multi', 'tags', 'steps', 'smartMulti', 'timelineMatrix'].includes(q.type);
}

function render() {
  const q = getQuestion();
  $('stageLabel').textContent = q.stage;
  $('questionText').textContent = q.question;
  $('questionHelper').textContent = buildSmartHelper(q);
  $('questionCounter').textContent = `${state.index + 1} / ${PLAYBOOK_QUESTIONS.length}`;

  if (state.answers[q.id] !== undefined) {
    state.tempValue = state.answers[q.id];
  } else if (q.type === 'generated') {
    state.tempValue = generateDraftFor(q);
  } else if (isArrayType(q)) {
    state.tempValue = [];
  } else {
    state.tempValue = '';
  }

  renderAnswerArea(q);
  renderValidation(q);
  renderSummary();
  renderOutputs();
  renderProgress();
}

function buildSmartHelper(q) {
  let helper = q.helper || '';
  const downstream = inferDownstreamContext();
  if (q.id === 'outputs') {
    helper += `\n\nDownstream context: The likely next user of this procedure output is ${downstream.customer}. The output should therefore be something that ${downstream.customer} can actually use, verify, store, or act on.`;
  }
  if (q.type === 'smartSingle') helper += '\n\nSelection rule: Select one answer only.';
  if (q.type === 'smartMulti') helper += '\n\nSelection rule: You may select multiple answers. Use the additional textbox only when the choices are incomplete.';
  return helper;
}

function resolveOptions(q) {
  if (!q) return [];
  if (q.generator) return smartOptions(q.generator, q).map(normalizeOption);
  if (q.optionsFrom) return PLAYBOOK_SCHEMA[q.optionsFrom].map(v => ({ value: v, label: v, impact: `${v} will be reflected in the relevant PLAYBOOK section.` }));
  return (q.options || []).map(normalizeOption);
}

function normalizeOption(opt) {
  if (typeof opt === 'string') return { value: opt, label: opt, impact: 'This will be used as structured document content.' };
  return { value: opt.value ?? opt.label, label: opt.label ?? opt.value, impact: opt.impact || 'This will be used as structured document content.' };
}

function renderAnswerArea(q) {
  const area = $('answerArea');
  area.className = 'answer-area';
  area.innerHTML = '';

  if (q.type === 'generated') {
    const draft = generateDraftFor(q);
    const box = document.createElement('div');
    box.className = 'smart-context';
    box.innerHTML = `<strong>Chatbot draft based on your prior answers</strong><p>${escapeHtml(draft)}</p><small>You can accept this as-is, or edit it below.</small>`;
    area.appendChild(box);

    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.value = state.tempValue || draft;
    textarea.oninput = () => { state.tempValue = textarea.value; renderValidation(q); };
    area.appendChild(textarea);

    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Regenerate from prior answers';
    btn.onclick = () => { state.tempValue = generateDraftFor(q); renderAnswerArea(q); renderValidation(q); };
    area.appendChild(btn);
    return;
  }

  if (isChoiceType(q)) {
    const options = resolveOptions(q);
    const grid = document.createElement('div');
    grid.className = 'suggestion-grid';
    options.forEach(opt => {
      const current = q.type === 'smartMulti' || q.type === 'multi' ? (state.tempValue || []).includes(opt.value) : state.tempValue === opt.value;
      const card = document.createElement('label');
      card.className = `option-card ${current ? 'selected' : ''}`;
      card.innerHTML = `<input type="${(q.type === 'smartMulti' || q.type === 'multi') ? 'checkbox' : 'radio'}" ${current ? 'checked' : ''}/><div><strong>${escapeHtml(opt.label)}</strong><small>${escapeHtml(opt.impact || '')}</small></div>`;
      card.onclick = (e) => {
        e.preventDefault();
        if (q.type === 'smartMulti' || q.type === 'multi') {
          const set = new Set(state.tempValue || []);
          set.has(opt.value) ? set.delete(opt.value) : set.add(opt.value);
          state.tempValue = [...set];
        } else {
          state.tempValue = opt.value;
        }
        renderAnswerArea(q); renderValidation(q);
      };
      grid.appendChild(card);
    });
    area.appendChild(grid);

    if (q.allowCustom) renderCustomChoiceInput(area, q);
    return;
  }

  if (q.type === 'text') {
    const suggestions = smartTextSuggestions(q.id);
    if (suggestions.length) {
      const panel = document.createElement('div');
      panel.className = 'smart-context';
      panel.innerHTML = `<strong>Suggested wording starters</strong><p>Click one to use it, then edit only what is not accurate.</p>`;
      area.appendChild(panel);
      const grid = document.createElement('div');
      grid.className = 'suggestion-grid';
      suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'option-card text-option';
        btn.innerHTML = `<div><strong>${escapeHtml(s.label)}</strong><small>${escapeHtml(s.impact || 'Suggested from the information already captured.')}</small></div>`;
        btn.onclick = () => { state.tempValue = s.value; renderAnswerArea(q); renderValidation(q); };
        grid.appendChild(btn);
      });
      area.appendChild(grid);
    }
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.placeholder = q.placeholder || 'Short keywords are okay. The chatbot will expand them in the draft.';
    textarea.value = state.tempValue || '';
    textarea.oninput = () => { state.tempValue = textarea.value; renderValidation(q); };
    area.appendChild(textarea);
    return;
  }

  if (q.type === 'tags') {
    const smart = smartOptions(q.id, q);
    if (smart.length) {
      q.allowCustom = true;
      const tempType = q.type;
      q.type = 'smartMulti';
      renderAnswerArea(q);
      q.type = tempType;
      return;
    }
    renderTagInput(area, q);
    return;
  }

  if (q.type === 'timelineMatrix') {
    renderTimelineMatrix(area, q);
    return;
  }

  if (q.type === 'steps') {
    renderSmartSteps(area, q);
  }
}

function renderCustomChoiceInput(area, q) {
  const custom = document.createElement('div');
  custom.className = 'custom-box';
  custom.innerHTML = `<label>${escapeHtml(q.customLabel || 'Add other answer')}</label><div class="custom-row"><input class="form-control" placeholder="Type missing answer here"/><button class="secondary">Add</button></div>`;
  const input = custom.querySelector('input');
  const button = custom.querySelector('button');
  button.onclick = () => {
    const v = input.value.trim();
    if (!v) return;
    if (q.type === 'smartSingle') {
      state.tempValue = v;
    } else {
      state.tempValue = [...new Set([...(state.tempValue || []), v])];
    }
    input.value = '';
    renderAnswerArea(q); renderValidation(q);
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); button.click(); } };
  area.appendChild(custom);

  if (Array.isArray(state.tempValue) && state.tempValue.length) {
    const row = document.createElement('div');
    row.className = 'tag-row';
    state.tempValue.forEach(tag => {
      const pill = document.createElement('span');
      pill.className = 'tag';
      pill.innerHTML = `${escapeHtml(labelFor(q, tag))}<button title="Remove">×</button>`;
      pill.querySelector('button').onclick = () => { state.tempValue = state.tempValue.filter(x => x !== tag); renderAnswerArea(q); renderValidation(q); };
      row.appendChild(pill);
    });
    area.appendChild(row);
  }
}

function renderTagInput(area, q) {
  const input = document.createElement('input');
  input.className = 'form-control';
  input.placeholder = q.placeholder || 'Type a short keyword and press Enter';
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      state.tempValue = [...new Set([...(state.tempValue || []), input.value.trim()])];
      input.value = '';
      renderAnswerArea(q); renderValidation(q);
    }
  };
  area.appendChild(input);
  const row = document.createElement('div'); row.className = 'tag-row';
  (state.tempValue || []).forEach(tag => {
    const pill = document.createElement('span'); pill.className = 'tag';
    pill.innerHTML = `${escapeHtml(tag)}<button title="Remove">×</button>`;
    pill.querySelector('button').onclick = () => { state.tempValue = state.tempValue.filter(x => x !== tag); renderAnswerArea(q); renderValidation(q); };
    row.appendChild(pill);
  });
  area.appendChild(row);
}


function renderTimelineMatrix(area, q) {
  const wrapper = document.createElement('div');
  wrapper.className = 'timeline-list';
  const suggested = smartOptions('timelineItems').map(x => ({
    item: x.item || x.value,
    timeline: x.timeline || '',
    owner: x.owner || state.answers.documentOwner || 'Process Owner',
    trigger: x.trigger || x.impact || ''
  }));
  const rows = state.tempValue && state.tempValue.length ? state.tempValue : suggested;
  state.tempValue = rows.length ? rows : [{ item: '', timeline: '', owner: '', trigger: '' }];

  const note = document.createElement('div');
  note.className = 'smart-context';
  note.innerHTML = '<strong>Timeline/SLA builder</strong><p>The bot listed the activities that normally need timing rules. Fill in the approved target if known. Use TBD for items that need process owner confirmation.</p>';
  area.appendChild(note);

  state.tempValue.forEach((row, idx) => {
    const div = document.createElement('div');
    div.className = 'timeline-row';
    div.innerHTML = `
      <div class="timeline-index">${idx + 1}</div>
      <div class="timeline-fields">
        <label>Activity needing timeline/SLA</label>
        <input class="form-control" value="${escapeHtml(row.item || '')}" placeholder="Example: Completeness check" />
        <label>Timeline / SLA target</label>
        <input class="form-control" value="${escapeHtml(row.timeline || '')}" placeholder="Example: Within 2 business days, or TBD" />
        <label>Owner / escalation point</label>
        <input class="form-control" value="${escapeHtml(row.owner || '')}" placeholder="Example: Purchasing Head" />
        <small>${escapeHtml(row.trigger || 'This item was suggested based on your procedure flow.')}</small>
      </div>
      <button class="ghost" title="Remove">×</button>`;
    div.querySelectorAll('input')[0].oninput = e => { state.tempValue[idx].item = e.target.value; renderValidation(q); };
    div.querySelectorAll('input')[1].oninput = e => { state.tempValue[idx].timeline = e.target.value; renderValidation(q); };
    div.querySelectorAll('input')[2].oninput = e => { state.tempValue[idx].owner = e.target.value; renderValidation(q); };
    div.querySelector('button').onclick = () => { state.tempValue.splice(idx, 1); renderAnswerArea(q); renderValidation(q); };
    wrapper.appendChild(div);
  });
  const add = document.createElement('button');
  add.className = 'secondary';
  add.textContent = 'Add another timeline/SLA item';
  add.onclick = () => { state.tempValue.push({ item: '', timeline: '', owner: '', trigger: '' }); renderAnswerArea(q); };
  area.appendChild(wrapper);
  area.appendChild(add);
}

function renderSmartSteps(area, q) {
  const wrapper = document.createElement('div'); wrapper.className = 'step-list';
  const suggested = smartOptions('criticalSteps').map(x => ({ owner: x.owner, action: x.action }));
  const steps = state.tempValue && state.tempValue.length ? state.tempValue : suggested.slice(0, 5);
  state.tempValue = steps.length ? steps : [{ action: '', owner: '' }];

  const note = document.createElement('div');
  note.className = 'smart-context';
  note.innerHTML = '<strong>Suggested starter flow</strong><p>The bot created a starter flow from your trigger, inputs, roles, outputs, and endpoint. Edit the activity and owner as needed.</p>';
  area.appendChild(note);

  state.tempValue.forEach((step, idx) => {
    const row = document.createElement('div'); row.className = 'step-row';
    row.innerHTML = `<span>${idx + 1}</span><input class="mini" placeholder="Activity / step" value="${escapeHtml(step.action || '')}"/><input class="mini" placeholder="Responsible role" value="${escapeHtml(step.owner || '')}"/><button class="ghost" title="Remove">×</button>`;
    row.children[1].oninput = (e) => { state.tempValue[idx].action = e.target.value; renderValidation(q); };
    row.children[2].oninput = (e) => { state.tempValue[idx].owner = e.target.value; renderValidation(q); };
    row.children[3].onclick = () => { state.tempValue.splice(idx, 1); renderAnswerArea(q); renderValidation(q); };
    wrapper.appendChild(row);
  });
  const add = document.createElement('button'); add.className = 'secondary'; add.textContent = 'Add another step';
  add.onclick = () => { state.tempValue.push({ action: '', owner: '' }); renderAnswerArea(q); };
  area.appendChild(wrapper); area.appendChild(add);
}

function renderValidation(q) {
  const result = validateAnswer(q, state.tempValue);
  const icon = result.level === 'error' ? 'Needs clarification' : result.level === 'warning' ? 'Check logic' : 'Looks logical';
  $('validationText').innerHTML = `<strong>${icon}:</strong> ${escapeHtml(result.message)}${result.details?.length ? '<ul>' + result.details.map(d => `<li>${escapeHtml(d)}</li>`).join('') + '</ul>' : ''}`;
  $('validationBox').className = `validation-box ${result.level || 'ok'}`;
}

function validateAnswer(q, val) {
  const details = [];
  let level = 'ok';

  const empty = val === undefined || val === '' || (Array.isArray(val) && val.length === 0) || (q.type === 'steps' && (!val || val.every(s => !s.action && !s.owner)));
  if (empty) return { level: 'warning', message: 'No answer yet. Choose from the suggested options or add a short keyword if the choices are incomplete.', details };

  if (q.type === 'smartSingle') {
    if (Array.isArray(val) && val.length > 1) return { level: 'error', message: 'This question requires one answer only. A procedure needs one clear start or endpoint to avoid confusion.', details };
    details.push('This will be written as a single boundary statement in the procedure.');
  }

  if (q.type === 'smartMulti' || q.type === 'multi') {
    details.push(`You selected ${Array.isArray(val) ? val.length : 1} item(s). These will become structured entries in the relevant PLAYBOOK section.`);
  }

  if (q.id === 'purposeFreeText') {
    if (String(val).length < 60) {
      level = 'warning';
      details.push('The purpose statement is short. It may still be okay if the title and scope are clear, but the final draft may need richer context.');
    }
    details.push('This purpose was drafted from prior answers, so the user does not need to write a full formal statement.');
  }

  if (q.id === 'triggerFreeText') {
    const trigger = arr('trigger').join(' ').toLowerCase();
    const start = String(val).toLowerCase();
    if (trigger.includes('scheduled') && !/(scheduled|cycle|periodic|calendar|monthly|weekly|daily|annual)/.test(start)) {
      level = 'warning';
      details.push('You selected a scheduled trigger earlier, but this start point does not mention a schedule or cycle.');
    }
    if (trigger.includes('system') && !/(system|workflow|sap|portal|tool|transaction)/.test(start)) {
      level = 'warning';
      details.push('You selected a system-workflow trigger earlier, but this start point does not mention a system, workflow, or transaction.');
    }
  }

  if (q.id === 'endPoint') {
    const outputs = arr('outputs').join(' ').toLowerCase();
    const endpoint = String(val).toLowerCase();
    if (outputs && !tokenOverlap(outputs, endpoint)) {
      level = 'warning';
      details.push('The endpoint does not appear to match the outputs already captured. Check whether the procedure truly ends at this point.');
    }
    details.push('The endpoint should create clear closure evidence and a handoff to the next process.');
  }

  if (q.id === 'outputs') {
    const downstream = inferDownstreamContext();
    details.push(`Downstream implication: ${downstream.customer} will likely use these outputs for ${downstream.use}.`);
    if (arr('inputs').some(x => arr('outputs').includes(x))) {
      level = 'warning';
      details.push('One or more outputs match the inputs. That can be valid, but usually a procedure transforms inputs into a new record, approval, decision, or updated status.');
    }
  }

  if (q.id === 'decisionPoints') {
    const selected = arrFromValue(val).join(' ').toLowerCase();
    if (!/(approve|reject|complete|valid|exception|threshold|condition|eligible|proceed|not proceed|risk)/.test(selected)) {
      level = 'warning';
      details.push('Decision points should normally have a criterion, authority, and evidence. Your selected items may need clearer decision wording.');
    }
    details.push('Each selected decision point will become a candidate control and approval requirement.');
  }

  if (q.id === 'exceptions') {
    const selected = arrFromValue(val).join(' ').toLowerCase();
    if (!/(escalat|approve|return|reject|hold|log|expiry|condition|evidence|owner|manager|head)/.test(selected)) {
      level = 'warning';
      details.push('Exception handling should define what happens next, who has authority, and what evidence is kept.');
    }
  }

  if (q.id === 'sla') {
    const rows = Array.isArray(val) ? val : [];
    const missingItem = rows.filter(r => !r.item).length;
    const missingTimeline = rows.filter(r => r.item && !r.timeline).length;
    if (missingItem) {
      level = 'warning';
      details.push('Some timeline rows do not identify the activity being measured.');
    }
    if (missingTimeline) {
      level = 'warning';
      details.push('Some activities do not have a timeline. Use TBD when the approved target is not yet known.');
    }
    details.push('Each timeline item should eventually have: activity, target timeline, owner/escalation point, and start/end basis.');
  }

  if (q.id === 'kpis') {
    const selected = arrFromValue(val).join(' ').toLowerCase();
    if (!/(cycle|sla|aging|pending|complete|exception|evidence|accuracy|rate|timeliness|rework)/.test(selected)) {
      level = 'warning';
      details.push('A KPI should measure time, quality, completeness, aging, exception control, or output accuracy. Check whether the selected item is truly measurable.');
    }
    details.push('Selected KPIs will be treated as management monitoring candidates, not final approved scorecard metrics.');
  }

  if (q.id === 'relatedDocs') {
    details.push('These are proposed links. Final interlinking should be validated after related procedures/processes are documented in the repository.');
    if (arrFromValue(val).some(x => /downstream procedure using/i.test(x))) {
      level = 'warning';
      details.push('One selected link is a placeholder for a downstream procedure. Replace it with the exact document title once available.');
    }
  }

  if (q.id === 'controls') {
    const risks = arr('risks');
    if (risks.length && !arrFromValue(val).length) {
      level = 'error';
      details.push('Risks were selected earlier, so at least one control type should be selected.');
    }
  }

  if (q.id === 'evidence') {
    if (arr('controls').length && !arrFromValue(val).length) {
      level = 'error';
      details.push('Controls need evidence. Select records that prove the control was performed.');
    }
  }

  if (q.type === 'steps') {
    const incomplete = (val || []).filter(s => !s.action || !s.owner);
    if (incomplete.length) {
      level = 'warning';
      details.push('Some steps are missing either an activity or responsible role.');
    }
    if ((val || []).length < 3) {
      level = 'warning';
      details.push('Most T4 procedures need at least start, perform/review, and close steps.');
    }
  }

  if (level === 'ok' && !details.length) details.push('The answer is usable and will be mapped to the correct section of the PLAYBOOK output.');
  return { level, message: q.type === 'generated' ? 'The chatbot drafted this from prior answers. Review only for factual accuracy.' : 'The response is consistent enough to proceed.', details };
}

function confirmAnswer() {
  const q = getQuestion();
  if (q.type === 'steps') state.tempValue = (state.tempValue || []).filter(s => s.action || s.owner);
  if (q.type === 'timelineMatrix') state.tempValue = (state.tempValue || []).filter(r => r.item || r.timeline || r.owner);
  const result = validateAnswer(q, state.tempValue);
  if (result.level === 'error') {
    showToast('Please resolve the logic issue before continuing.');
    renderValidation(q);
    return;
  }
  state.answers[q.id] = state.tempValue;
  rememberCurrentDocument();
  save();
  if (state.index < PLAYBOOK_QUESTIONS.length - 1) state.index += 1;
  render();
}

function formatAnswer(q, val) {
  if (q.type === 'steps') return val.map((s, i) => `${i + 1}. ${s.action || 'Step'} (${s.owner || 'Owner TBD'})`).join('<br/>');
  if (q.type === 'timelineMatrix') return val.map((r, i) => `${i + 1}. ${r.item || 'Timeline item'} - ${r.timeline || 'TBD'} (${r.owner || 'Owner TBD'})`).join('<br/>');
  if (Array.isArray(val)) return val.map(x => labelFor(q, x)).join(', ');
  const opt = resolveOptions(q).find(o => o.value === val);
  return opt ? opt.label : String(val);
}

function labelFor(q, val) {
  if (val && typeof val === 'object') {
    if (val.item || val.timeline) return `${val.item || 'Timeline item'} - ${val.timeline || 'TBD'} (${val.owner || 'Owner TBD'})`;
    return JSON.stringify(val);
  }
  const opt = resolveOptions(q).find(o => o.value === val);
  return opt ? opt.label : String(val);
}

function a(id, fallback = 'TBD') {
  const v = state.answers[id];
  if (Array.isArray(v)) {
    if (!v.length) return fallback;
    if (v[0] && typeof v[0] === 'object') return v.map((x, i) => `${i + 1}. ${x.action || x.item || 'Item TBD'} (${x.owner || 'Owner TBD'}${x.timeline ? ', ' + x.timeline : ''})`).join('; ');
    return v.map(x => labelFor(qById(id), x)).join(', ');
  }
  return v ? labelFor(qById(id), v) : fallback;
}

function arr(id) {
  const v = state.answers[id];
  return arrFromValue(v);
}

function arrFromValue(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : (x.action || x.owner || JSON.stringify(x))).filter(Boolean);
  return [String(v)];
}

function tokenOverlap(a, b) {
  const stop = new Set(['the','and','or','of','to','in','is','are','a','an','for','with','by','after','before','this','that','procedure','process']);
  const aw = new Set(String(a).split(/\W+/).map(x => x.toLowerCase()).filter(x => x.length > 3 && !stop.has(x)));
  const bw = String(b).split(/\W+/).map(x => x.toLowerCase()).filter(x => x.length > 3 && !stop.has(x));
  return bw.some(x => aw.has(x));
}

function compactText(v, fallback = 'TBD') {
  if (Array.isArray(v)) return v.join(', ');
  return v || fallback;
}

function generateDraftFor(q) {
  if (q.generator === 'purposeStatement') {
    const title = state.answers.procedureTitle || 'this Procedure / SOP';
    const domain = state.answers.processDomain || 'the applicable process domain';
    const linked = state.answers.linkedProcess || 'the related T3 process';
    const owner = state.answers.documentOwner || 'the accountable process owner';
    const policy = state.answers.parentPolicy || 'applicable governing policy and rules';
    const themes = arr('purpose').join(', ') || 'consistent execution, accountability, control, and documentation discipline';
    const trigger = state.answers.triggerFreeText || labelFor(qById('trigger'), arr('trigger')[0] || '') || 'the defined trigger occurs';
    return `${title} exists to define the standard method for performing the procedure within ${domain}, aligned with ${linked} and ${policy}. It clarifies when the procedure starts, who is responsible, what information and evidence are required, which decisions or controls must be performed, and when the activity is considered complete. The procedure supports ${themes.toLowerCase()} and helps ${owner} maintain consistent execution, traceable records, and controlled handoffs to downstream users.`;
  }
  return '';
}

function smartTextSuggestions(id) {
  return smartOptions(id).map(normalizeOption);
}

function smartOptions(generator, q = {}) {
  const title = state.answers.procedureTitle || 'the procedure';
  const domain = state.answers.processDomain || 'the process domain';
  const linked = state.answers.linkedProcess || 'the linked process';
  const owner = state.answers.documentOwner || 'Process Owner';
  const policy = state.answers.parentPolicy || 'governing policy';
  const roles = [...new Set([...arr('roles'), owner, ...arr('smes')].filter(Boolean))];
  const inputs = arr('inputs');
  const outputs = arr('outputs');
  const systems = arr('systems');
  const records = arr('records');
  const risks = arr('risks');
  const controls = arr('controls');
  const priorDocs = getPriorDocumentSuggestions();

  const baseRoleOptions = ['Requestor', 'Process Owner', 'Reviewer / Evaluator', 'Approver', 'Records Custodian', 'System Owner / IT Support'];
  const genericInputOptions = ['Approved request or business need', 'Required supporting documents', 'Applicable policy or authority reference', 'Complete data fields or form', 'Prior approval or endorsement', 'System-generated request or transaction'];
  const genericOutputOptions = ['Approved request or decision record', 'Updated system record', 'Completed checklist or validation result', 'Notification to downstream user', 'Filed evidence in official repository', 'Exception or rejection notice'];
  const genericRecords = ['Request form', 'Checklist', 'Approval record', 'Email endorsement', 'Exception log', 'SharePoint repository record', 'System transaction log'];
  const genericSystems = ['SharePoint repository', 'Email / Outlook', 'Microsoft Teams', 'SAP', 'Excel tracker', 'Power Automate workflow'];

  switch (generator) {
    case 'processDomain':
      return ['Procurement', 'Finance', 'Human Capital', 'Store Operations', 'Logistics', 'Merchandising', 'IT', 'Legal', 'Sales Operations'];
    case 'linkedProcess':
      return [
        `${domain} Management Process`,
        `${title.replace(/procedure|sop/ig, '').trim()} Process`,
        `${domain} Request-to-Closure Process`,
        `${domain} Governance and Monitoring Process`
      ];
    case 'parentPolicy':
      return [
        `${domain} Policy`,
        `${domain} Governance Policy`,
        `Delegation of Authority / Approval Matrix`,
        `${policy}`
      ];
    case 'scope':
      return [
        { value: `Activities from trigger to documented completion of ${title}`, label: `From trigger to completion of ${title}`, impact: 'Defines the full operating boundary of the T4 procedure.' },
        { value: `Preparation, review, approval, execution, evidence filing, and closure activities`, label: 'Preparation, review, approval, execution, evidence filing, and closure', impact: 'Covers the usual T4 procedure lifecycle.' },
        { value: `Roles, handoffs, decision points, controls, evidence, exceptions, and escalation related to ${linked}`, label: 'Roles, handoffs, decisions, controls, evidence, exceptions, and escalation', impact: 'Ensures the SOP is executable and auditable.' },
        ...inputs.slice(0,4).map(x => ({ value: `Use and validation of input: ${x}`, label: `Use and validation of ${x}`, impact: 'Treats this input as part of the procedure boundary.' })),
        ...outputs.slice(0,4).map(x => ({ value: `Creation or update of output: ${x}`, label: `Creation/update of ${x}`, impact: 'Connects scope to the procedure output.' }))
      ];
    case 'outOfScope':
      return [
        { value: 'Policy-making, policy approval, or changes to the governing T2 policy', label: 'Policy-making or T2 policy changes', impact: 'Avoids putting policy ownership inside a procedure.' },
        { value: 'Enterprise process architecture design or T1 hierarchy changes', label: 'T1 EPA or enterprise architecture changes', impact: 'Keeps the procedure at T4 level.' },
        { value: 'Screen-by-screen system instructions that belong in a T5 Work Instruction', label: 'Screen-by-screen system instructions', impact: 'Prevents the SOP from becoming a work instruction.' },
        { value: 'Downstream activities after the documented output has been handed off', label: 'Downstream activities after handoff', impact: 'Avoids overlap with the next process.' },
        { value: 'System configuration, access provisioning, or technical troubleshooting unless specifically part of the procedure', label: 'System configuration or technical troubleshooting', impact: 'Prevents ownership confusion with IT/System Owner.' }
      ];
    case 'triggerStart':
      return [
        ...arr('trigger').map(t => ({ value: triggerStatement(t, title), label: triggerStatement(t, title), impact: 'Suggested from your selected trigger.' })),
        { value: `A requestor or responsible role submits the required information to start ${title}.`, label: `Required information is submitted to start ${title}`, impact: 'Good when the procedure starts from intake.' },
        { value: `The responsible role receives a complete request and begins review or processing.`, label: 'Complete request is received and review/processing begins', impact: 'Good when completeness is the true start point.' }
      ];
    case 'endPoint':
      return [
        ...outputs.slice(0,5).map(o => ({ value: `${o} is completed, approved where required, stored in the official repository, and handed off to the next user.`, label: `${o} is completed, stored, and handed off`, impact: 'Endpoint aligns to an output already selected.' })),
        { value: `The final decision is communicated, required records are filed, and the request is closed.`, label: 'Final decision communicated, records filed, request closed', impact: 'Good for approval or evaluation procedures.' },
        { value: `The system record is created or updated and evidence is retained in the official repository.`, label: 'System record updated and evidence retained', impact: 'Good for SAP/SharePoint/system-driven procedures.' }
      ];
    case 'inputs':
      return [
        ...genericInputOptions,
        `${title} request details`,
        `${linked} reference or parent process requirement`,
        `${policy} requirement or authority basis`
      ].map(x => ({ value: x, label: x, impact: 'Input must be available before the procedure can start.' }));
    case 'outputs':
      return [
        ...genericOutputOptions,
        ...records.map(r => `Completed ${r}`),
        ...systems.map(s => `Updated ${s} record`),
        `${title} completion status`
      ].map(x => ({ value: x, label: x, impact: downstreamImpact(x) }));
    case 'systems':
      return [...new Set([...genericSystems, ...systems])].map(x => ({ value: x, label: x, impact: 'Selecting this means changes may require access, workflow, or system-owner impact review.' }));
    case 'records':
      return [...new Set([...genericRecords, ...records, ...inputs.map(i => `${i} record`), ...outputs.map(o => `${o} evidence`)])].map(x => ({ value: x, label: x, impact: 'This record supports evidence retention and auditability.' }));
    case 'roles':
      return [...new Set([...baseRoleOptions, ...roles])].map(x => ({ value: x, label: x, impact: 'This role will appear in RACI and responsibility sections.' }));
    case 'criticalSteps':
      return suggestSteps(title, roles, inputs, outputs, systems);
    case 'decisionPoints':
      return [
        { value: 'Is the request or input complete and valid before processing?', label: 'Completeness and validity decision', impact: 'Criteria: required fields/documents complete. Authority: responsible reviewer. Evidence: checklist or validation record.' },
        { value: 'Does the request meet policy, threshold, or eligibility requirements?', label: 'Policy / threshold / eligibility decision', impact: 'Criteria: policy or threshold met. Authority: process owner or approver. Evidence: approval basis.' },
        { value: 'Should the request proceed, be returned, placed on hold, approved with conditions, or rejected?', label: 'Proceed / return / hold / conditional approval / reject decision', impact: 'Criteria and outcome should be documented.' },
        { value: 'Is an exception approval required before continuing?', label: 'Exception approval decision', impact: 'Links decision point to exception authority and evidence.' },
        { value: 'Is the final output complete, approved, stored, and ready for downstream handoff?', label: 'Closure and handoff decision', impact: 'Confirms completion evidence and downstream readiness.' }
      ];
    case 'exceptions':
      return [
        { value: 'Incomplete or invalid inputs are returned to the requestor with missing requirements identified.', label: 'Incomplete / invalid inputs', impact: 'Requires return notice and corrected submission evidence.' },
        { value: 'Urgent processing requires documented justification, approval authority, expiry date or condition, and monitoring.', label: 'Urgent or provisional processing', impact: 'Prevents informal bypass of normal controls.' },
        { value: 'Conflicting reviewer feedback is escalated to the Process Owner or Functional Head for decision.', label: 'Conflicting reviewer feedback', impact: 'Clarifies authority when reviewers disagree.' },
        { value: 'System issue or access issue is escalated to the System Owner or IT Support and tracked until resolved.', label: 'System or access issue', impact: 'Separates process exception from technical issue.' },
        { value: 'SLA breach or aging item is reported to the accountable owner for follow-up and closure.', label: 'SLA breach / aging item', impact: 'Supports monitoring and governance escalation.' }
      ];
    case 'timelineItems': {
      const stepItems = (state.answers.criticalSteps || []).slice(0, 8).map(s => ({
        value: s.action || 'Procedure step',
        item: s.action || 'Procedure step',
        timeline: '',
        owner: s.owner || owner,
        impact: 'Suggested from your numbered procedure steps.'
      }));
      return [
        ...stepItems,
        { value: 'Request intake / acknowledgement', item: 'Request intake / acknowledgement', timeline: 'TBD', owner, impact: 'Needed when requests must be acknowledged or logged.' },
        { value: 'Completeness check', item: 'Completeness check', timeline: 'TBD', owner, impact: 'Needed when incomplete inputs can delay or weaken the process.' },
        { value: 'Reviewer assessment / validation', item: 'Reviewer assessment / validation', timeline: 'TBD', owner: roles.find(r => /review|eval|valid|approv/i.test(r)) || owner, impact: 'Needed when another role reviews, validates, or evaluates information.' },
        { value: 'Approval decision', item: 'Approval decision', timeline: 'TBD', owner: roles.find(r => /approv|head|owner|manager/i.test(r)) || owner, impact: 'Needed when the procedure requires approval authority.' },
        { value: 'Exception resolution / escalation', item: 'Exception resolution / escalation', timeline: 'TBD', owner, impact: 'Needed when exceptions, incomplete items, or SLA breaches may occur.' },
        { value: 'Closure notification and evidence filing', item: 'Closure notification and evidence filing', timeline: 'TBD', owner: roles.find(r => /custodian|record|owner/i.test(r)) || owner, impact: 'Needed so downstream users know the procedure is complete and evidence is retained.' }
      ];
    }
    case 'kpis': {
      const timelineRows = Array.isArray(state.answers.sla) ? state.answers.sla : [];
      const hasExceptions = arr('exceptions').length > 0;
      const hasEvidence = arr('evidence').length > 0 || records.length > 0;
      const hasApprovals = `${arr('decisionPoints').join(' ')} ${arr('approvers').join(' ')}`.match(/approv|decision|authority/i);
      const base = [
        { value: `${title} end-to-end cycle time`, label: 'End-to-end cycle time', impact: 'Probe: When does the clock start and stop? Use this if management needs to know if the whole procedure is fast enough.' },
        { value: 'SLA compliance rate', label: 'SLA compliance rate', impact: 'Probe: Did the activity finish within the target timeline? Use this if one or more SLA items were defined.' },
        { value: 'Pending / aging request count', label: 'Pending / aging request count', impact: 'Probe: What items are open beyond normal aging? Use this if delays need daily or weekly visibility.' },
        { value: 'Incomplete submission / rework rate', label: 'Incomplete submission / rework rate', impact: 'Probe: Are users submitting complete requirements the first time?' },
        { value: 'Exception rate and unresolved exception aging', label: 'Exception rate / unresolved exception aging', impact: 'Probe: Are exceptions common, unresolved, or being used as informal bypasses?' },
        { value: 'Records / evidence completeness rate', label: 'Records / evidence completeness rate', impact: 'Probe: Can the owner prove the procedure was followed?' }
      ];
      const dynamic = [
        ...outputs.slice(0, 4).map(o => ({ value: `${o} completion accuracy`, label: `${o} completion accuracy`, impact: 'Probe: Is the output complete, correct, approved, and usable by downstream users?' })),
        ...timelineRows.filter(r => r.item).slice(0, 5).map(r => ({ value: `${r.item} SLA compliance`, label: `${r.item} SLA compliance`, impact: `Probe: Track whether ${r.item} is completed within ${r.timeline || 'the approved timeline / TBD target'}.` })),
        ...(hasApprovals ? [{ value: 'Approval aging and approval rework rate', label: 'Approval aging / approval rework', impact: 'Probe: Are approvals delayed or returned because the request lacks basis/evidence?' }] : []),
        ...(hasExceptions ? [{ value: 'Exception closure rate', label: 'Exception closure rate', impact: 'Probe: Are exceptions closed with authority, reason, and evidence?' }] : []),
        ...(hasEvidence ? [{ value: 'Evidence filing timeliness', label: 'Evidence filing timeliness', impact: 'Probe: Is evidence stored in the official repository on time?' }] : [])
      ];
      return [...base, ...dynamic];
    }
    case 'relatedDocs':
      return [
        ...priorDocs,
        { value: state.answers.linkedProcess || `Parent T3 Process Document`, label: state.answers.linkedProcess || 'Parent T3 Process Document', impact: 'Required for hierarchy and roll-up.' },
        { value: state.answers.parentPolicy || `Governing T2 Policy`, label: state.answers.parentPolicy || 'Governing T2 Policy', impact: 'Shows the governing rule.' },
        { value: `Related T5 Work Instruction for system or task-level steps`, label: 'Related T5 Work Instruction', impact: 'Needed if users require screen-by-screen guidance.' },
        ...records.slice(0,5).map(r => ({ value: r, label: r, impact: 'This form or record should be linked as a reference.' })),
        ...systems.slice(0,4).map(sys => ({ value: `${sys} user guide or work instruction`, label: `${sys} user guide / WI`, impact: 'System-related references should be linked if users need screen-level guidance.' })),
        ...outputs.slice(0,4).map(o => ({ value: `Downstream procedure using ${o}`, label: `Downstream procedure using ${o}`, impact: 'Suggested because this output likely triggers another process/procedure.' })),
        { value: 'Training or communication material', label: 'Training / communication material', impact: 'May require update when the procedure changes.' }
      ];
    case 'approvers':
      return [...new Set([owner, 'Process Owner', 'Functional Head', ...arr('smes'), ...roles.filter(r => /(head|owner|manager|approver|reviewer|custodian|system)/i.test(r)), controls.length ? 'Control Owner / Reviewer' : '', risks.length ? 'Risk or Compliance Reviewer' : '', systems.length ? 'System Owner' : ''].filter(Boolean))].map(x => ({ value: x, label: x, impact: 'This role will be routed for review/approval before publication.' }));
    default:
      return [];
  }
}


function getPriorDocumentSuggestions() {
  const history = JSON.parse(localStorage.getItem('playbookDocbotDocumentHistory') || '[]');
  const currentDomain = String(state.answers.processDomain || '').toLowerCase();
  const currentLinked = String(state.answers.linkedProcess || '').toLowerCase();
  return history
    .filter(d => d && d.title && d.title !== state.answers.procedureTitle)
    .filter(d => !currentDomain || String(d.domain || '').toLowerCase() === currentDomain || tokenOverlap(currentLinked, d.linked || d.title || ''))
    .slice(-8)
    .reverse()
    .map(d => ({
      value: d.title,
      label: d.title,
      impact: `Suggested from prior locally saved capture${d.domain ? ' under ' + d.domain : ''}. Validate if this document is actually upstream, downstream, governing, or referenced.`
    }));
}

function rememberCurrentDocument() {
  const title = state.answers.procedureTitle;
  if (!title) return;
  const history = JSON.parse(localStorage.getItem('playbookDocbotDocumentHistory') || '[]');
  const entry = {
    title,
    domain: state.answers.processDomain || '',
    linked: state.answers.linkedProcess || '',
    outputs: arr('outputs'),
    records: arr('records'),
    updatedAt: new Date().toISOString()
  };
  const filtered = history.filter(d => d.title !== title);
  filtered.push(entry);
  localStorage.setItem('playbookDocbotDocumentHistory', JSON.stringify(filtered.slice(-50)));
}

function triggerStatement(t, title) {
  const map = {
    'business-need': `A business need or request is identified and ${title} must be performed.`,
    'approval-needed': `An approval or authorization is required before the activity can proceed.`,
    'system-workflow': `A system transaction or workflow is initiated and requires processing or validation.`,
    'scheduled-cycle': `A scheduled or periodic cycle begins and the assigned owner starts the activity.`,
    'exception-event': `An exception, issue, or non-standard condition occurs and requires handling.`
  };
  return map[t] || `A triggering event occurs and ${title} begins.`;
}

function downstreamImpact(output) {
  const d = inferDownstreamContext();
  return `${d.customer} will likely use this for ${d.use}.`;
}

function inferDownstreamContext() {
  const title = `${state.answers.procedureTitle || ''} ${state.answers.linkedProcess || ''}`.toLowerCase();
  if (/vendor|supplier|accredit/.test(title)) return { customer: 'Purchasing, Vendor Master Custodian, and requesting business users', use: 'vendor setup, vendor use decision, and repository evidence' };
  if (/purchase|pr|po|procure|sourcing/.test(title)) return { customer: 'Purchasing, Finance, Warehouse/Receiving, and the requestor', use: 'PO processing, receipt, invoice matching, and monitoring' };
  if (/invoice|payment|ap|finance/.test(title)) return { customer: 'Finance, Approvers, and the requesting department', use: 'payment processing, accounting records, and audit trail' };
  if (/hire|employee|hr|human/.test(title)) return { customer: 'Human Capital, hiring managers, payroll, and employees', use: 'employee lifecycle processing, payroll setup, and personnel records' };
  if (/inventory|warehouse|logistics|stock/.test(title)) return { customer: 'Warehouse, Store Operations, Finance, and Inventory Control', use: 'stock movement, reconciliation, variance review, and reporting' };
  return { customer: 'the next process owner or downstream user', use: 'processing, validation, decision-making, evidence retention, or monitoring' };
}

function suggestSteps(title, roles, inputs, outputs, systems) {
  const requestor = roles.find(r => /request/i.test(r)) || 'Requestor / Initiator';
  const owner = state.answers.documentOwner || roles.find(r => /owner|head|manager/i.test(r)) || 'Process Owner';
  const reviewer = roles.find(r => /review|evaluator|finance|regulatory|checker/i.test(r)) || 'Reviewer / Evaluator';
  const custodian = roles.find(r => /custodian|record|master|admin/i.test(r)) || 'Records Custodian';
  return [
    { owner: requestor, action: `Identify need and prepare required information for ${title}.` },
    { owner: owner, action: `Receive request and confirm whether the procedure is applicable and complete.` },
    { owner: reviewer, action: `Review required inputs, criteria, risks, and supporting evidence.` },
    { owner: owner, action: `Resolve exceptions, obtain required approvals, and confirm decision.` },
    { owner: custodian, action: `Update required records or systems and file evidence in the official repository.` },
    { owner: owner, action: `Notify downstream users and close the request.` }
  ];
}


/* ------------------------------
   v6 Natural AI Conversation Mode
   Replaces the form-like question flow with a conversational interviewer.
   Users can answer with keywords; the bot interprets, validates, and asks probes.
-------------------------------- */
const APP_VERSION = 'v7-startup-scoping';
if (localStorage.getItem('playbookDocbotVersion') !== APP_VERSION) {
  localStorage.removeItem('playbookDocbotConversation');
  localStorage.removeItem('playbookDocbotAnswers');
  localStorage.setItem('playbookDocbotVersion', APP_VERSION);
}

const naturalState = {
  initialized: false,
  messages: JSON.parse(localStorage.getItem('playbookDocbotConversation') || '[]'),
  selectedChips: []
};

function setupNaturalMode() {
  if (naturalState.initialized) return;
  naturalState.initialized = true;
  const sendBtn = $('sendChatBtn');
  const input = $('conversationInput');
  if (sendBtn) sendBtn.onclick = sendNaturalAnswer;
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendNaturalAnswer();
      }
    });
  }
  if ($('clarifyBtn')) $('clarifyBtn').onclick = explainCurrentQuestion;
  if ($('skipBtn')) $('skipBtn').onclick = () => {
    addMessage('user', 'Skip this for now.');
    addMessage('ai', `Okay. I will mark **${getQuestion().section}** as TBD and we can validate it later before publishing.`);
    state.answers[getQuestion().id] = qDefaultTbd(getQuestion());
    advanceNatural();
  };
  if ($('backBtn')) $('backBtn').onclick = () => {
    if (state.index > 0) {
      state.index -= 1;
      addMessage('system', `Moved back to: ${getQuestion().section}`);
      askNaturalQuestion(true);
    }
  };
  if ($('resetBtn')) $('resetBtn').onclick = () => {
    if (confirm('Clear all captured information and conversation?')) {
      state.answers = {}; state.index = 0; naturalState.messages = []; naturalState.selectedChips = [];
      localStorage.removeItem('playbookDocbotConversation'); save(); render();
    }
  };
}

function render() {
  setupNaturalMode();
  const q = getQuestion();
  if ($('stageLabel')) $('stageLabel').textContent = q.stage || 'AI Interview';
  if ($('questionText')) $('questionText').textContent = stripHtml(naturalQuestionText(q));
  if ($('questionHelper')) $('questionHelper').textContent = q.helper || 'Answer with keywords, short phrases, or click suggestions. The chatbot will convert your answer into PLAYBOOK-ready documentation language.';
  if ($('questionCounter')) $('questionCounter').textContent = `${state.index + 1} / ${PLAYBOOK_QUESTIONS.length}`;
  renderMessages();
  renderSuggestionChips(q);
  renderSummary();
  renderOutputs();
  renderProgress();
  if (!naturalState.messages.length) {
    addMessage('ai', `Hi. I’ll guide you like a documentation assistant, not a form. Let’s start with the most important scoping decision first.`);
    askNaturalQuestion(true);
  } else if (!hasCurrentQuestionMessage(q.id)) {
    askNaturalQuestion(true);
  }
}

function hasCurrentQuestionMessage(questionId) {
  const marker = `data-q=\"${questionId}\"`;
  return naturalState.messages.some(m => m.role === 'ai-question' && String(m.html || '').includes(marker));
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function addMessage(role, html) {
  naturalState.messages.push({ role, html, at: new Date().toISOString() });
  naturalState.messages = naturalState.messages.slice(-120);
  localStorage.setItem('playbookDocbotConversation', JSON.stringify(naturalState.messages));
  renderMessages();
}

function renderMessages() {
  const box = $('chatMessages');
  if (!box) return;
  box.innerHTML = naturalState.messages.map(m => {
    const roleClass = m.role === 'user' ? 'user' : (m.role === 'system' ? 'system' : 'ai');
    return `<div class="message ${roleClass}">${m.html}</div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function askNaturalQuestion(force = false) {
  const q = getQuestion();
  const last = naturalState.messages[naturalState.messages.length - 1];
  const marker = `data-q="${q.id}"`;
  if (!force && last && last.html && last.html.includes(marker)) return;
  naturalState.selectedChips = [];
  const probes = buildProbes(q);
  const intro = `<span style="display:none" ${marker}></span><strong>${q.stage}: ${q.section}</strong>${naturalQuestionText(q)}${probes.length ? `<ul class="probe-list">${probes.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}<small>${naturalAnswerHint(q)}</small>`;
  naturalState.messages.push({ role: 'ai-question', html: intro, at: new Date().toISOString() });
  localStorage.setItem('playbookDocbotConversation', JSON.stringify(naturalState.messages));
  renderMessages();
  renderSuggestionChips(q);
}

function naturalQuestionText(q) {
  const title = state.answers.procedureTitle || 'this procedure';
  switch (q.id) {
    case 'docMode': return 'Before we start, what are you trying to document: a Process Document or a Procedure Document? Pick one so I can adjust the level of detail.';
    case 'processDomain': return 'Which business area owns this? Just type the function name.';
    case 'linkedProcess': return 'What bigger process does this belong to? A rough name is enough.';
    case 'parentPolicy': return 'What policy, rule, DOA, memo, contract, or standard governs this? Keywords are fine.';
    case 'procedureTitle': return 'What activity are we documenting? Give me a working title or keywords.';
    case 'documentOwner': return 'Who is accountable for keeping this document correct and updated? Use a role, not a person.';
    case 'smes': return 'Who should I consult to make this accurate? List roles separated by comma.';
    case 'purposeFreeText': return `Based on what you gave me, I can draft the purpose for **${title}**. Type “accept” if okay, or type corrections in keywords.`;
    case 'scope': return 'What should this procedure cover? Select suggestions or type simple keywords.';
    case 'outOfScope': return 'What should this procedure not cover, so we avoid duplicating policy, process, or work instructions?';
    case 'triggerFreeText': return 'What exact event starts the work? One clear start point only.';
    case 'endPoint': return 'When is the work truly done? One clear completion point only.';
    case 'inputs': return 'What must be available before people can start? Forms, approvals, documents, system data, or request details.';
    case 'outputs': return 'What does this procedure produce that another person or process will use?';
    case 'criticalSteps': return 'Walk me through the work in rough sequence. Keywords are enough, like: request, check docs, review, approve, update SAP, notify.';
    case 'decisionPoints': return 'Where does someone decide approve/reject/return/escalate/classify? Pick or type the decision keywords.';
    case 'exceptions': return 'What can go wrong or require special handling? Incomplete docs, urgent request, approval delay, system issue, and similar items.';
    case 'sla': return 'For each major activity, tell me the target timeline if known. You can type: completeness check = 2 days; approval = 5 days.';
    case 'kpis': return 'How should management know if this procedure is working? I’ll suggest KPIs based on your answers.';
    case 'relatedDocs': return 'What documents should this connect to? I’ll suggest likely policies, process docs, WIs, forms, records, and downstream procedures.';
    default: return q.question || 'Tell me the key information for this section.';
  }
}

function naturalAnswerHint(q) {
  if (q.id === 'docMode') return 'Select one only: Process Document or Procedure Document. You can also type process or procedure.';
  if (['single','smartSingle'].includes(q.type)) return 'Select one suggestion or type one short answer.';
  if (['multi','smartMulti','tags'].includes(q.type)) return 'Select multiple suggestions or type keywords separated by comma.';
  if (q.type === 'steps') return 'Use rough sequence only. The bot will turn it into numbered procedure steps.';
  if (q.type === 'timelineMatrix') return 'Use item = timeline format, or type TBD if the SLA is not yet approved.';
  if (q.type === 'generated') return 'Type accept, revise, or short corrections.';
  return 'A short phrase is enough. No need to write a formal statement.';
}

function buildProbes(q) {
  const probes = [];
  if (q.id === 'scope') probes.push('What activity starts and ends inside this document?', 'Which roles actually perform the work?', 'What output must exist when this is done?');
  if (q.id === 'inputs') probes.push('Can the work start without this item?', 'Is this input observable or only assumed?', 'Who provides it?');
  if (q.id === 'outputs') probes.push('Who uses the output next?', 'Is it a record, decision, system update, approval, or notification?');
  if (q.id === 'decisionPoints') probes.push('What is the basis or criteria?', 'Who has authority to decide?', 'What evidence proves the decision?');
  if (q.id === 'exceptions') probes.push('Who can approve the exception?', 'What evidence must be retained?', 'When should it be escalated?');
  if (q.id === 'sla') probes.push('Which activities create delay risk?', 'Which handoffs need aging monitoring?', 'What timeline is approved versus assumed?');
  if (q.id === 'kpis') probes.push('Do we need to measure speed, quality, compliance, aging, exceptions, or evidence completeness?', 'Can the KPI be generated from a tracker, system, or SharePoint record?');
  if (q.id === 'relatedDocs') probes.push('What upstream policy governs this?', 'What downstream process uses the output?', 'What T5 work instruction or form supports execution?');
  return probes;
}

function renderSuggestionChips(q) {
  const chipBox = $('suggestionChips');
  if (!chipBox) return;
  const opts = getNaturalOptions(q).slice(0, 14);
  if (!opts.length) { chipBox.innerHTML = ''; return; }
  chipBox.innerHTML = opts.map(o => `<button class="suggestion-chip ${naturalState.selectedChips.includes(o.value) ? 'selected' : ''}" data-value="${escapeHtml(o.value)}" title="${escapeHtml(o.impact || '')}">${escapeHtml(o.label || o.value)}</button>`).join('');
  chipBox.querySelectorAll('.suggestion-chip').forEach(btn => {
    btn.onclick = () => {
      const val = btn.dataset.value;
      if (['single','smartSingle'].includes(q.type)) {
        naturalState.selectedChips = [val];
        $('conversationInput').value = val;
      } else {
        const set = new Set(naturalState.selectedChips);
        set.has(val) ? set.delete(val) : set.add(val);
        naturalState.selectedChips = [...set];
        $('conversationInput').value = naturalState.selectedChips.join(', ');
      }
      renderSuggestionChips(q);
    };
  });
}

function getNaturalOptions(q) {
  if (q.type === 'generated') return [{ value: 'accept', label: 'Accept chatbot draft', impact: 'Uses the AI-drafted statement based on prior answers.' }, { value: 'revise', label: 'I need to revise', impact: 'Type corrections as keywords.' }];
  if (q.type === 'steps') return suggestSteps(state.answers.procedureTitle || 'the procedure', arr('roles'), arr('inputs'), arr('outputs'), arr('systems')).map(s => ({ value: `${s.owner}: ${s.action}`, label: s.action.replace(/\.$/, ''), impact: `Owner: ${s.owner}` }));
  if (q.type === 'timelineMatrix') return smartOptions('timelineItems').map(o => ({ value: `${o.item || o.value} = ${o.timeline || 'TBD'}`, label: `${o.item || o.value}: ${o.timeline || 'TBD'}`, impact: o.impact || '' }));
  if (q.generator) return smartOptions(q.generator, q).map(normalizeOption);
  return resolveOptions(q).map(normalizeOption);
}

function sendNaturalAnswer() {
  const input = $('conversationInput');
  const raw = (input?.value || '').trim();
  const q = getQuestion();
  if (!raw && naturalState.selectedChips.length) input.value = naturalState.selectedChips.join(', ');
  const finalRaw = (input?.value || '').trim();
  if (!finalRaw) { addMessage('system', 'Please type a keyword, short phrase, or select a suggestion before sending.'); return; }
  addMessage('user', escapeHtml(finalRaw));
  const interpreted = interpretNaturalAnswer(q, finalRaw);
  const issue = validateNaturalAnswer(q, interpreted.value, finalRaw);
  if (issue.blocking) {
    addMessage('ai', `<strong>I need to clarify this before we move on.</strong>${issue.message}<small>Try answering with a more specific keyword or select one of the suggested choices.</small>`);
    return;
  }
  state.answers[q.id] = interpreted.value;
  rememberCurrentDocument();
  save();
  addMessage('ai', `<strong>Captured and interpreted.</strong>${interpreted.explanation}${issue.message ? `<small>${issue.message}</small>` : ''}`);
  input.value = '';
  naturalState.selectedChips = [];
  advanceNatural();
}

function advanceNatural() {
  if (state.index < PLAYBOOK_QUESTIONS.length - 1) state.index += 1;
  renderSummary(); renderOutputs(); renderProgress();
  askNaturalQuestion(true);
  renderSuggestionChips(getQuestion());
}

function interpretNaturalAnswer(q, raw) {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const opts = getNaturalOptions(q);
  let value;
  if (q.type === 'generated') {
    const draft = generateDraftFor(q);
    value = /^(accept|ok|okay|yes|approved|looks good)$/i.test(text) ? draft : (/revise/i.test(text) ? draft : text);
    return { value, explanation: `I will use this as the drafted statement for **${q.section}**.` };
  }
  if (['single','smartSingle'].includes(q.type)) {
    const matched = bestOptionMatches(text, opts);
    value = matched[0]?.value || text;
    return { value, explanation: `I read this as: **${escapeHtml(labelFor(q, value))}**. This will set the single controlling answer for **${q.section}**.` };
  }
  if (['multi','smartMulti'].includes(q.type)) {
    const parts = splitKeywords(text);
    const matched = [];
    parts.forEach(p => {
      const m = bestOptionMatches(p, opts)[0];
      if (m) matched.push(m.value); else matched.push(cleanKeyword(p));
    });
    value = [...new Set(matched.filter(Boolean))];
    return { value, explanation: `I converted your keywords into ${value.length} selectable item(s): **${escapeHtml(value.join(', '))}**.` };
  }
  if (q.type === 'tags') {
    value = splitKeywords(text).map(cleanKeyword).filter(Boolean);
    return { value, explanation: `I captured these as role/tag entries: **${escapeHtml(value.join(', '))}**.` };
  }
  if (q.type === 'steps') {
    value = parseSteps(text);
    return { value, explanation: `I converted your rough sequence into ${value.length} numbered procedure step(s). You can refine the step wording later in the generated draft.` };
  }
  if (q.type === 'timelineMatrix') {
    value = parseTimelineMatrix(text);
    return { value, explanation: `I captured ${value.length} timeline/SLA item(s). Items marked TBD should be validated by the process owner.` };
  }
  value = text;
  return { value, explanation: `I captured this as short-form input for **${q.section}** and will expand it into formal document wording where needed.` };
}

function bestOptionMatches(text, opts) {
  const t = normalizeText(text);
  return opts
    .map(o => ({ ...o, score: optionScore(t, normalizeText(`${o.label || ''} ${o.value || ''}`)) }))
    .filter(o => o.score > 0)
    .sort((a,b) => b.score - a.score);
}
function optionScore(a,b) {
  if (!a || !b) return 0;
  if (b.includes(a) || a.includes(b)) return 100;
  const aw = a.split(' ').filter(w => w.length > 2);
  const bw = new Set(b.split(' ').filter(w => w.length > 2));
  return aw.filter(w => bw.has(w)).length * 10;
}
function normalizeText(s) { return String(s).toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim(); }
function splitKeywords(s) { return String(s).split(/[;\n,]+|\s\+\s/).map(x => x.trim()).filter(Boolean); }
function cleanKeyword(s) { return String(s).replace(/^[-•\d.)\s]+/,'').trim(); }

function parseSteps(text) {
  const parts = splitKeywords(text).map(cleanKeyword).filter(Boolean);
  const roles = arr('roles');
  const defaultOwner = state.answers.documentOwner || roles[0] || 'Process Owner';
  return parts.map((p, i) => {
    let owner = defaultOwner;
    let action = p;
    if (p.includes(':')) {
      const [o, ...rest] = p.split(':'); owner = o.trim() || defaultOwner; action = rest.join(':').trim() || p;
    } else if (/request|initiat|submit/i.test(p)) owner = roles.find(r => /request|initiator|proponent/i.test(r)) || 'Requestor / Initiator';
    else if (/review|check|validat|assess/i.test(p)) owner = roles.find(r => /review|checker|finance|regulatory|evaluator/i.test(r)) || 'Reviewer / Evaluator';
    else if (/approv|decid|endorse/i.test(p)) owner = roles.find(r => /approv|head|owner|manager/i.test(r)) || defaultOwner;
    else if (/record|file|update|sap|system|master/i.test(p)) owner = roles.find(r => /custodian|admin|master|system|buyer/i.test(r)) || defaultOwner;
    return { owner, action: action.charAt(0).toUpperCase() + action.slice(1) };
  });
}

function parseTimelineMatrix(text) {
  const rows = [];
  const defaults = smartOptions('timelineItems').map(o => ({ item: o.item || o.value, timeline: o.timeline || 'TBD', owner: o.owner || state.answers.documentOwner || 'Process Owner', trigger: o.impact || '' }));
  const parts = splitKeywords(text);
  if (/^(tbd|unknown|not sure)$/i.test(text)) return defaults;
  parts.forEach(p => {
    const [left, ...rest] = p.split(/=|:/);
    const item = cleanKeyword(left);
    const timeline = cleanKeyword(rest.join(':')) || (p.match(/\b\d+\s*(day|days|hour|hours|week|weeks|working days)\b/i)?.[0] || 'TBD');
    if (item) rows.push({ item, timeline, owner: state.answers.documentOwner || 'Process Owner', trigger: 'User-provided timeline/SLA' });
  });
  return rows.length ? rows : defaults;
}

function validateNaturalAnswer(q, value, raw) {
  const msg = [];
  let blocking = false;
  if (!value || (Array.isArray(value) && !value.length)) {
    return { blocking: true, message: 'I could not detect a usable answer.' };
  }
  if (['text'].includes(q.type) && String(value).length < 3) {
    blocking = true; msg.push('That is too short to interpret reliably. Give me at least one specific keyword or role.');
  }
  if (q.id === 'documentOwner' && /jonald|francis|mardie|babet|lace|jerome|sandra/i.test(String(value))) {
    msg.push('PLAYBOOK documents should normally use a role/function as owner, not a person name. I will keep this, but validate whether the role title should be used instead.');
  }
  if (q.id === 'triggerFreeText' && splitKeywords(raw).length > 1) {
    blocking = true; msg.push('This looks like more than one start point. A procedure should have one clear start event. Pick the actual first event only.');
  }
  if (q.id === 'endPoint' && splitKeywords(raw).length > 1) {
    blocking = true; msg.push('This looks like more than one endpoint. Pick the event that proves the procedure is complete.');
  }
  if (q.id === 'outputs' && arr('inputs').some(i => String(value).toLowerCase().includes(String(i).toLowerCase()))) {
    msg.push('One of the outputs appears similar to an input. Check whether it is truly produced by the procedure, or merely received at the start.');
  }
  if (q.id === 'criticalSteps' && Array.isArray(value) && value.length < 3) {
    msg.push('This may be too few steps for a useful T4 SOP. The draft can still proceed, but the process owner should validate whether intermediate review, approval, filing, or notification steps are missing.');
  }
  if (q.id === 'kpis' && Array.isArray(value) && value.some(v => /happy|good|nice|smooth/i.test(v))) {
    blocking = true; msg.push('That sounds like a desired outcome, not a measurable KPI. Use measurable items like cycle time, aging, exception rate, completeness rate, or SLA compliance.');
  }
  if (q.id === 'relatedDocs') {
    msg.push('These are proposed links only. Final interlinking should be validated once the related T2/T3/T4/T5 documents are available in the repository.');
  }
  return { blocking, message: msg.join(' ') };
}

function qDefaultTbd(q) {
  if (['multi','smartMulti','tags'].includes(q.type)) return ['TBD'];
  if (q.type === 'steps') return [{ owner: 'TBD', action: 'TBD' }];
  if (q.type === 'timelineMatrix') return smartOptions('timelineItems').map(o => ({ item: o.item || o.value, timeline: 'TBD', owner: o.owner || 'TBD', trigger: o.impact || '' }));
  return 'TBD';
}

function explainCurrentQuestion() {
  const q = getQuestion();
  addMessage('ai', `<strong>Why this matters:</strong>${escapeHtml(q.helper || 'This information is needed to produce a complete PLAYBOOK document and support SharePoint metadata, QA checks, routing, and future impact assessment.')}<small>Section mapped: ${escapeHtml(q.section || q.stage)}</small>`);
}

// Re-initialize v6 mode after all legacy functions are loaded.
setupNaturalMode();
render();
