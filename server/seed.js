const bcrypt = require('bcryptjs');
const { db, migrate, audit } = require('./db');
migrate();

function upsertOrg() {
  let org = db.prepare('SELECT * FROM organisations WHERE company_number = ?').get('12345678');
  if (!org) {
    const nextDue = new Date(); nextDue.setFullYear(nextDue.getFullYear() + 1);
    const id = db.prepare(`INSERT INTO organisations (name, company_number, director_email, status, security_score, next_reverification_due)
      VALUES (?, ?, ?, ?, ?, ?)`).run('Demo Construction Ltd', '12345678', 'director@demo.local', 'Verified', 'A', nextDue.toISOString().slice(0,10)).lastInsertRowid;
    org = db.prepare('SELECT * FROM organisations WHERE id = ?').get(id);
  }
  return org;
}

function upsertUser(orgId, name, email, password, role) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const hash = bcrypt.hashSync(password, 10);
  if (!existing) db.prepare('INSERT INTO users (organisation_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(orgId, name, email, hash, role);
}

const org = upsertOrg();
upsertUser(null, 'Pulse Platform Admin', 'admin@pulse.local', 'PulseAdmin123!', 'platform_admin');
upsertUser(org.id, 'Demo Owner', 'owner@demo.local', 'PulseOwner123!', 'organisation_owner');

const kpis = [
  ['Finance','Income','£42,000','+12%','normal'], ['Finance','Expenses','£34,000','+4%','normal'], ['Finance','Overdue invoices','3','£6,400','warning'], ['Finance','Cash position','£78,500','28 days runway','normal'],
  ['Projects','Active projects','6','2 at risk','warning'], ['Compliance','Compliance score','82%','Training expiries due','warning'], ['People','Employees','18','2 training expiries','normal'],
  ['Estate','Properties','3','1 inspection due','warning'], ['Energy','Monthly energy cost','£2,180','+8%','warning'], ['Operations','Open actions','14','5 overdue','warning'], ['Customer','Customer health','Good','91% retention','normal']
];
for (const [module,label,value,trend,risk] of kpis) {
  const exists = db.prepare('SELECT id FROM module_kpis WHERE organisation_id=? AND module=? AND label=?').get(org.id,module,label);
  if (!exists) db.prepare('INSERT INTO module_kpis (organisation_id,module,label,value,trend,risk) VALUES (?,?,?,?,?,?)').run(org.id,module,label,value,trend,risk);
}

const month = new Date().toISOString().slice(0,7);
const lines = [['income','Consultancy retainers',28000,30000,31500],['income','Construction project billing',12000,14500,10500],['expense','Payroll',22000,22500,22400],['expense','Subcontractors',9000,9500,8200],['expense','Software',1700,1900,2100]];
for (const l of lines) if (!db.prepare('SELECT id FROM budget_lines WHERE organisation_id=? AND month=? AND label=?').get(org.id,month,l[1])) db.prepare('INSERT INTO budget_lines (organisation_id,month,type,label,budget,forecast,actual) VALUES (?,?,?,?,?,?,?)').run(org.id,month,...l);

const projects = [['North Street Refurbishment','Construction','Stage 4 - Technical Design','At Risk',150000,45000,'Design review','2026-06-18'],['Ops Process Review','Consultancy',null,'Good',24000,12000,'Client workshop','2026-06-12'],['Studio Website','Design',null,'Excellent',8000,6000,'Launch approval','2026-06-21']];
for (const p of projects) if (!db.prepare('SELECT id FROM projects WHERE organisation_id=? AND name=?').get(org.id,p[0])) db.prepare('INSERT INTO projects (organisation_id,name,category,riba_stage,health,budget,invoiced,next_milestone,milestone_due) VALUES (?,?,?,?,?,?,?,?,?)').run(org.id,...p);

const comp = [['Training','First Aid Certificate - Alex Smith','People','Open','2026-06-30','Medium'],['Policy','Health & Safety Policy Review','Operations','Open','2026-07-05','High'],['RIDDOR','Incident reference follow-up','Compliance Lead','Open','2026-06-15','High'],['Risk Assessment','Site access RAMS review','Project Manager','Open','2026-06-11','Medium']];
for (const c of comp) if (!db.prepare('SELECT id FROM compliance_items WHERE organisation_id=? AND title=?').get(org.id,c[1])) db.prepare('INSERT INTO compliance_items (organisation_id,type,title,owner,status,due_date,risk_rating) VALUES (?,?,?,?,?,?,?)').run(org.id,...c);

const notices = [['Compliance','Training expiring','First Aid certificate expires this month','warning','2026-06-30'],['Finance','Invoices overdue','Three invoices remain overdue','warning','2026-06-10'],['Security','Annual reverification','Review directors, access and security settings','info',org.next_reverification_due]];
for (const n of notices) if (!db.prepare('SELECT id FROM notifications WHERE organisation_id=? AND title=?').get(org.id,n[1])) db.prepare('INSERT INTO notifications (organisation_id,module,title,body,severity,due_date) VALUES (?,?,?,?,?,?)').run(org.id,...n);

audit({ organisationId: org.id, action: 'SEED_DATA_CREATED', entityType: 'system' });
console.log('Seed complete. Demo accounts: admin@pulse.local / PulseAdmin123!, owner@demo.local / PulseOwner123!');
