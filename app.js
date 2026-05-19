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
    if (v[0] && typeof v[0] === 'object') return v.map((x, i) => `${i + 1}. ${x.owner || 'Owner TBD'} - ${x.action || 'Step TBD'}`).join('; ');
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
  state.answers[q.id] = state.tempValue;
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
