/* Project PLAYBOOK DocBot - Word template aligned output
   This file overrides the basic draft generator so the output follows the uploaded
   MVP Procedure for Vendor Accreditation Procedure structure. */

function asArrayValue(id) {
  const v = state.answers[id];
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? labelFor(qById(id), x) : x);
  return [labelFor(qById(id), v)];
}

function textValue(id, fallback = 'No information provided.') {
  const value = a(id, fallback);
  return value || fallback;
}

function markdownBullets(items, fallback = 'No information provided.') {
  const arr = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!arr.length) return fallback;
  return arr.map(x => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n');
}

function mdRow(cells) {
  return `| ${cells.map(c => String(c ?? '').replace(/\n/g, '<br/>')).join(' | ')} |`;
}

function getSteps() {
  const steps = state.answers.criticalSteps || [];
  return steps.length ? steps : [{ owner: 'Owner TBD', action: 'Step description TBD' }];
}

function generatePolicyStatements() {
  const title = textValue('procedureTitle', 'the procedure');
  const policies = [
    `${title} must be initiated only when the defined trigger is present: ${textValue('triggerFreeText', textValue('trigger', 'TBD'))}.`,
    `Required inputs must be complete before the procedure proceeds: ${textValue('inputs')}.`,
    `Responsible roles must perform the procedure according to the documented sequence, evidence requirements, and approval points.`,
    `Exceptions must follow the documented escalation path and must be supported by evidence.`,
    `Outputs must be recorded, stored, and linked in the official repository before the request is closed.`,
    `Changes to this procedure must be assessed for impact on linked documents, forms, systems, training materials, controls, and KPIs.`
  ];
  return policies.map((p, i) => `${toRoman(i + 1)}. ${p}`).join('\n');
}

function toRoman(num) {
  const map = [['X',10],['IX',9],['V',5],['IV',4],['I',1]];
  let out = '';
  for (const [r, v] of map) while (num >= v) { out += r; num -= v; }
  return out;
}

function generateBusinessRequirements() {
  const rows = [
    `The procedure requires the following trigger before processing begins: ${textValue('triggerFreeText', textValue('trigger'))}.`,
    `The following inputs must be available before execution: ${textValue('inputs')}.`,
    `The procedure must produce the following outputs: ${textValue('outputs')}.`,
    `Decision points must be supported by criteria and evidence: ${textValue('decisionPoints')}.`,
    `Applicable exceptions and escalations must follow this rule: ${textValue('exceptions')}.`,
    `Approval and review requirements must be satisfied before publication or closure: ${textValue('approvers')}.`
  ];
  return rows.map((r, i) => `${String.fromCharCode(97 + i)}. ${r}`).join('\n');
}

function generateInformationRequirementsTable() {
  const rows = [];
  asArrayValue('inputs').forEach(x => rows.push(['Document / Data', x]));
  asArrayValue('records').forEach(x => rows.push(['Record / Evidence', x]));
  asArrayValue('systems').forEach(x => rows.push(['System / Tool', x]));
  asArrayValue('evidence').forEach(x => rows.push(['Evidence', x]));
  if (!rows.length) rows.push(['TBD', 'No information provided.']);
  return ['| Requirement Type | Requirement |','|---|---|', ...rows.map(mdRow)].join('\n');
}

function generateCapabilityRequirements() {
  const roles = asArrayValue('roles');
  const base = roles.length ? roles : ['Personnel assigned to this procedure'];
  return base.map((role, i) => `${String.fromCharCode(97 + i)}. ${role} must be capable of performing the assigned responsibilities, producing required evidence, and escalating exceptions according to this procedure.`).join('\n');
}

function generateProcessDetailsTable() {
  const header = ['| Step # | Procedure Step | Responsible Role | Inputs | Outputs | Systems Used | Actions | Decision / Condition | Control | Estimated Time |','|---|---|---|---|---|---|---|---|---|---|'];
  const systems = textValue('systems', 'TBD');
  const inputs = textValue('inputs', 'TBD');
  const outputs = textValue('outputs', 'TBD');
  const controls = textValue('controls', 'TBD');
  const sla = textValue('sla', 'TBD');
  const rows = getSteps().map((s, i) => mdRow([
    i + 1,
    s.action || 'Step description TBD',
    s.owner || 'Owner TBD',
    i === 0 ? inputs : 'Applicable input from prior step / supporting record',
    i === getSteps().length - 1 ? outputs : 'Completed activity / output passed to next step',
    systems,
    s.action || 'Perform the documented activity.',
    textValue('decisionPoints', 'Proceed when required conditions are satisfied.'),
    controls,
    sla
  ]));
  return [...header, ...rows].join('\n');
}

function generateRiskControlTable() {
  const risks = asArrayValue('risks');
  const controls = asArrayValue('controls');
  const rows = getSteps().map((s, i) => mdRow([
    s.action || 'Procedure step TBD',
    `R-${String(i + 1).padStart(3, '0')}`,
    risks[i % Math.max(risks.length, 1)] || 'Risk that the activity is incomplete, unauthorized, delayed, or unsupported by evidence.',
    `C-${String(i + 1).padStart(3, '0')}`,
    controls[i % Math.max(controls.length, 1)] || 'Completeness, review, approval, and evidence retention control.',
    `${s.owner || 'Responsible role'} must ensure the activity is performed completely, reviewed where required, and supported by retained evidence.`
  ]));
  return ['| Process Activity | Risk No. | Risk | Control No. | Control | Policy Statement |','|---|---|---|---|---|---|', ...rows].join('\n');
}

function generateSipocTable() {
  const steps = getSteps();
  const roles = asArrayValue('roles');
  const rows = steps.map((s, i) => mdRow([
    i === 0 ? (roles[0] || s.owner || 'Supplier TBD') : (steps[i - 1].owner || 'Prior step owner'),
    i === 0 ? textValue('inputs') : 'Output from prior step',
    `STEP ${i + 1} - ${s.action || 'Procedure step TBD'}`,
    i === steps.length - 1 ? textValue('outputs') : 'Step output / handoff',
    i === steps.length - 1 ? 'Process customer / downstream user' : (steps[i + 1]?.owner || 'Next step owner')
  ]));
  return ['| Supplier(s) | Inputs | Process | Outputs | Customers |','|---|---|---|---|---|', ...rows].join('\n');
}

function generateRaciTable() {
  const roles = asArrayValue('roles');
  const displayRoles = roles.length ? roles.slice(0, 8) : ['Process Owner', 'Responsible Performer', 'Reviewer', 'Approver'];
  const header = ['Procedure Step Name', ...displayRoles];
  const rows = getSteps().map((s) => {
    return mdRow([s.action || 'Procedure step TBD', ...displayRoles.map(role => {
      if ((s.owner || '').toLowerCase().includes(role.toLowerCase())) return 'A/R';
      if (role === textValue('documentOwner', '')) return 'A';
      return 'C/I';
    })]);
  });
  return [mdRow(header), mdRow(header.map(() => '---')), ...rows].join('\n');
}

function generateKpiTable() {
  const kpis = asArrayValue('kpis');
  const rows = (kpis.length ? kpis : ['Procedure turnaround time']).map(kpi => mdRow([
    kpi,
    `Measures performance of ${textValue('procedureTitle', 'the procedure')}.`,
    'Supports management monitoring, process discipline, and timely completion.',
    `${kpi} = actual result compared against defined target`,
    `Measured using available procedure records and status dates.`,
    textValue('sla', 'Target TBD')
  ]));
  return ['| Key Performance Indicator (KPI) | Requirement Description | Rationale | Formula | Operational Definition | Performance Target |','|---|---|---|---|---|---|', ...rows].join('\n');
}

function generateInterlinkingTable() {
  const docs = asArrayValue('relatedDocs');
  const rels = asArrayValue('relationshipTypes');
  const rows = (docs.length ? docs : ['Related document TBD']).map((doc, i) => mdRow([
    doc,
    'From / To',
    `This procedure must remain aligned with ${doc}.`,
    `Reference: ${textValue('procedureTitle', 'Procedure')} / Step ${Math.min(i + 1, getSteps().length)}`,
    rels[i % Math.max(rels.length, 1)] || 'Depends on / Enables',
    `If ${doc} changes, this procedure, related forms, controls, and training materials may require review.`
  ]));
  return ['| Related Process | Direction | Requirement Description | Reference | Relationship Type | Impact if Changed |','|---|---|---|---|---|---|', ...rows].join('\n');
}

function generateImpactAssessmentTable() {
  const impacts = asArrayValue('impactTriggers');
  const rows = (impacts.length ? impacts : ['Linked documents and records']).map(item => mdRow([
    `Change affecting ${item}`,
    item,
    `A change may require review of ${item} to maintain alignment and prevent outdated instructions.`,
    'M',
    'M',
    'Perform impact scan, notify owner, update affected artifact, and document closure.',
    textValue('documentOwner', 'Process Owner'),
    'Open'
  ]));
  return ['| Change Description | Affected Element | Impact Description | Severity | Likelihood | Mitigation | Owner | Status |','|---|---|---|---|---|---|---|---|', ...rows].join('\n');
}

function generateMetadataTable() {
  return ['| Element | Details |','|---|---|',
    mdRow(['Document Title', textValue('procedureTitle', 'Procedure Title TBD')]),
    mdRow(['Document Code or ID', 'TBD - assign through Document Register']),
    mdRow(['Version or Revision No.', '1.0']),
    mdRow(['Effective Date', 'TBD']),
    mdRow(['Supersedes or Replaces', 'TBD']),
    mdRow(['Process Owner', textValue('documentOwner', 'TBD')]),
    mdRow(['Prepared By', 'TBD']),
    mdRow(['Reviewed By', textValue('smes', 'TBD')]),
    mdRow(['Approved By', textValue('approvers', 'TBD')]),
    mdRow(['Process Level', textValue('processLevel', 'TBD')]),
    mdRow(['Review Frequency', textValue('reviewCycle', 'TBD')]),
    mdRow(['Access Level or Classification', textValue('confidentiality', 'Internal')]),
    mdRow(['Storage Location or Repository', 'SharePoint']),
    mdRow(['Retention Period', 'TBD']),
    mdRow(['Document Owner Contact', 'TBD']),
    mdRow(['Confidentiality Notice', 'Golden ABC INTERNAL'])
  ].join('\n');
}

function generateReferenceDocumentsTable() {
  const refs = [...asArrayValue('records'), ...asArrayValue('relatedDocs')];
  const rows = (refs.length ? refs : ['Reference document TBD']).map(ref => mdRow([ref, `Supports execution, evidence retention, or governance of ${textValue('procedureTitle', 'this procedure')}.`]));
  return ['| Reference Document | Description / Purpose |','|---|---|', ...rows].join('\n');
}

function generateTermsTable() {
  const terms = [...asArrayValue('roles'), ...asArrayValue('systems'), ...asArrayValue('outputs')].slice(0, 20);
  const rows = (terms.length ? terms : ['Term TBD']).map(term => mdRow([term, `Definition to be validated by the process owner for ${textValue('procedureTitle', 'this procedure')}.`, `Used in ${textValue('procedureTitle', 'the procedure')}.`]));
  return ['| Term / Acronym | Definition | Example |','|---|---|---|', ...rows].join('\n');
}

function generateProcedureMarkdown() {
  const title = textValue('procedureTitle', 'Procedure Title TBD');
  return `# Procedure of ${title}

## Table of Contents
1. Context  
2. Procedure Purpose  
3. Procedure Objective  
4. Procedure Scope  
5. Key Business Terms and Acronyms  
6. Reference Documents  
7. Procedure Steps  
8. Process and Procedure Requirements  
9. Process Details  
10. Process Flow Diagram  
11. Risk and Control Policies  
12. Escalation Management  
13. SIPOC Table  
14. RACI Table  
15. Performance Assessment  
16. Appendix and Reference Tables

# Context

## Procedure Purpose
${textValue('purposeFreeText', 'No purpose has been captured yet.')}

Selected purpose themes: ${textValue('purpose', 'TBD')}.

## Procedure Objective
The objective of this procedure is to ensure that ${title} is performed consistently, completely, and with the required governance review before the process reaches its defined outcome. It supports operational accuracy, accountability, evidence retention, and controlled execution across the assigned roles.

## Procedure Scope

### In-Scope
${textValue('scope')}

### Out-of-Scope
${textValue('outOfScope')}

# Key Business Terms and Acronyms
${generateTermsTable()}

# Reference Documents
${generateReferenceDocumentsTable()}

# Procedure Steps

## Related Policies, Conditions and Obligations
${generatePolicyStatements()}

# Process and Procedure Requirements

## A. Business and Decision Requirements
${generateBusinessRequirements()}

## B. Information, Files and System Requirements
${generateInformationRequirementsTable()}

## C. Capability and Skill Requirements
${generateCapabilityRequirements()}

# Process Details

**Start Event and Trigger:** ${textValue('triggerFreeText', textValue('trigger'))}

${generateProcessDetailsTable()}

**End Event and Outcome:** ${textValue('endPoint')}

# Process Flow Diagram
The process flow diagram must be generated from the validated procedure steps, roles, decision points, and handoffs. Where BPMN is used, lanes should reflect the responsible roles and decision gateways should reflect the captured decision points: ${textValue('decisionPoints', 'TBD')}.

# Risk and Control Policies
${generateRiskControlTable()}

# Escalation Management
| Level | Escalation Point | Scenario | Action |
|---|---|---|---|
| Level 1 | Process Owner or Immediate Supervisor | Operational issues, incomplete requests, minor delays | Review issue, validate details, and resolve or guide corrective action |
| Level 2 | Functional Lead or Department Manager | Approval delays, disputes, repeated data quality issues | Reassess request, enforce governance rules, and provide decision or direction |
| Level 3 | System Owner or IT Support | System errors, integration failures, or technical issues | Investigate system issue, apply fixes, and restore process flow |
| Level 4 | Management or Steering Committee | Critical delays, unresolved disputes, or high-impact risks | Make final decision, prioritize resolution, and enforce corrective measures |

# SIPOC Table
${generateSipocTable()}

# RACI Table
${generateRaciTable()}

# Performance Assessment
${generateKpiTable()}

# Appendix

## Interlinking Requirements Table
${generateInterlinkingTable()}

## Impact Assessment Table
${generateImpactAssessmentTable()}

## Revision History Table
| Version | Date | Description of Change | Author | Approved By |
|---|---|---|---|---|
| 1.0 | TBD | Initial draft generated from PLAYBOOK DocBot guided capture | TBD | ${textValue('approvers', 'TBD')} |

# Reference Tables

## Metadata Table
${generateMetadataTable()}

## Interlinking Requirements Table
${generateInterlinkingTable()}

## Impact Assessment Table
${generateImpactAssessmentTable()}
`;
}

function htmlEscape(s) { return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function markdownTableToHtml(tableMd) {
  const lines = tableMd.split('\n').filter(l => l.trim().startsWith('|'));
  if (!lines.length) return '';
  let html = '<table>';
  lines.forEach((line, idx) => {
    if (idx === 1 && /---/.test(line)) return;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    html += '<tr>' + cells.map(c => idx === 0 ? `<th>${htmlEscape(c)}</th>` : `<td>${htmlEscape(c).replace(/&lt;br\/&gt;/g, '<br/>')}</td>`).join('') + '</tr>';
  });
  html += '</table>';
  return html;
}

function markdownToWordHtml(markdown) {
  const blocks = markdown.split(/\n{2,}/);
  let body = '';
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('|')) { body += markdownTableToHtml(trimmed); continue; }
    if (trimmed.startsWith('# ')) { body += `<h1>${htmlEscape(trimmed.replace(/^# /,''))}</h1>`; continue; }
    if (trimmed.startsWith('## ')) { body += `<h2>${htmlEscape(trimmed.replace(/^## /,''))}</h2>`; continue; }
    if (trimmed.startsWith('### ')) { body += `<h3>${htmlEscape(trimmed.replace(/^### /,''))}</h3>`; continue; }
    if (/^(\d+\.|[-*]) /.test(trimmed.split('\n')[0])) {
      const items = trimmed.split('\n').map(x => x.replace(/^(\d+\.|[-*]) /,'')).filter(Boolean);
      body += '<ul>' + items.map(x => `<li>${htmlEscape(x)}</li>`).join('') + '</ul>'; continue;
    }
    body += `<p>${htmlEscape(trimmed).replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
  }
  return body;
}

function generateProcedureWordHtml() {
  const title = textValue('procedureTitle', 'Procedure Title TBD');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title>
  <style>
    @page { size: A4; margin: 0.7in; }
    body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #222; }
    h1 { color: #7a1f1f; font-size: 18pt; border-bottom: 1px solid #d9c8b4; padding-bottom: 5px; }
    h2 { color: #8b2d2d; font-size: 14pt; margin-top: 18pt; }
    h3 { color: #333; font-size: 12pt; margin-top: 12pt; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt 0; }
    th { background: #f2e8dc; color: #5a1b1b; font-weight: bold; }
    td, th { border: 1px solid #b8a895; padding: 5px; vertical-align: top; }
    p { line-height: 1.35; }
  </style></head><body>${markdownToWordHtml(generateProcedureMarkdown())}</body></html>`;
}

function exportProcedureWordFile() {
  downloadFile('playbook-procedure-template-output.doc', generateProcedureWordHtml(), 'application/msword');
  showToast('Exported Word-compatible procedure file using the MVP procedure template structure.');
}

function exportPackage() {
  const payload = {
    metadata: { generatedAt: new Date().toISOString(), app: 'Project PLAYBOOK DocBot', outputTemplate: 'MVP Procedure for Vendor Accreditation Procedure.docx' },
    answers: state.answers,
    procedureMarkdown: generateProcedureMarkdown(),
    processRollupMarkdown: generateProcessMarkdown()
  };
  downloadFile('playbook-docbot-export.json', JSON.stringify(payload, null, 2), 'application/json');
  downloadFile('playbook-procedure-draft.md', generateProcedureMarkdown(), 'text/markdown');
  downloadFile('playbook-process-rollup.md', generateProcessMarkdown(), 'text/markdown');
  downloadFile('playbook-procedure-template-output.doc', generateProcedureWordHtml(), 'application/msword');
  showToast('Exported JSON, Markdown, process roll-up, and Word-compatible template output.');
}

// Re-bind export buttons after app.js initialises.
(function bindTemplateExports() {
  const bind = () => {
    const exportBtn = $('exportBtn');
    if (exportBtn) exportBtn.onclick = exportPackage;
    const wordBtn = $('exportWordBtn');
    if (wordBtn) wordBtn.onclick = exportProcedureWordFile;
    renderOutputs();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
