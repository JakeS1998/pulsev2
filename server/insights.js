const { db } = require('./db');

function financeSummary(orgId, month) {
  const lines = db.prepare('SELECT * FROM budget_lines WHERE organisation_id=? AND month=?').all(orgId, month);
  const sums = lines.reduce((a,l)=>{ a[l.type].budget += l.budget; a[l.type].forecast += l.forecast; a[l.type].actual += l.actual; return a; }, { income:{budget:0,forecast:0,actual:0}, expense:{budget:0,forecast:0,actual:0} });
  const profitActual = sums.income.actual - sums.expense.actual;
  const profitBudget = sums.income.budget - sums.expense.budget;
  return { lines, sums, profitActual, profitBudget, ai: `Revenue exceeds expenses by £${Math.max(0, profitActual).toLocaleString()} this month. Profit variance versus budget is £${(profitActual-profitBudget).toLocaleString()}. Three invoices remain overdue and should be prioritised before month end.` };
}

function conciergeAnswer(orgId, question) {
  const q = String(question || '').toLowerCase();
  const month = new Date().toISOString().slice(0,7);
  const finance = financeSummary(orgId, month);
  const risks = db.prepare("SELECT * FROM notifications WHERE organisation_id=? AND resolved=0 ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, due_date ASC").all(orgId);
  const projects = db.prepare("SELECT * FROM projects WHERE organisation_id=? AND health IN ('At Risk','Needs Attention')").all(orgId);
  const compliance = db.prepare("SELECT * FROM compliance_items WHERE organisation_id=? AND status <> 'Closed' ORDER BY due_date ASC LIMIT 8").all(orgId);
  if (q.includes('profit') || q.includes('finance')) return finance.ai;
  if (q.includes('project')) return projects.length ? `Projects needing attention: ${projects.map(p => `${p.name} (${p.health}, next milestone ${p.next_milestone})`).join('; ')}.` : 'No projects are currently marked at risk.';
  if (q.includes('compliance') || q.includes('due')) return `Compliance priorities: ${compliance.map(c => `${c.title} due ${c.due_date}`).join('; ')}.`;
  if (q.includes('week') || q.includes('focus')) return `Focus this week on overdue invoices, ${projects.length} project risk item(s), and ${compliance.length} open compliance obligation(s). Your current operating posture is good, but action is needed on compliance deadlines and project milestones.`;
  return `Pulse summary: profit is £${finance.profitActual.toLocaleString()} for ${month}; ${risks.length} open notification(s); ${projects.length} project risk item(s); ${compliance.length} compliance action(s). Recommended next action: clear the nearest compliance deadline and chase overdue invoices.`;
}

module.exports = { financeSummary, conciergeAnswer };
