const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, migrate, audit } = require('./db');
const { authRequired, requireRole, login, safeUser } = require('./auth');
const { financeSummary, conciergeAnswer } = require('./insights');
const { listProviders, syncProvider } = require('./integrations');

migrate();
const app = express();
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

function orgGuard(req, res, next) {
  if (req.user.role === 'platform_admin') return next();
  const org = db.prepare('SELECT * FROM organisations WHERE id=?').get(req.user.organisation_id);
  if (!org) return res.status(403).json({ error: 'Organisation missing' });
  if (org.status !== 'Verified') return res.status(403).json({ error: 'Organisation must be verified before modules are available', status: org.status });
  next();
}

app.post('/api/auth/login', login);
app.get('/api/me', authRequired, (req,res)=>{
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  const org = user.organisation_id ? db.prepare('SELECT * FROM organisations WHERE id=?').get(user.organisation_id) : null;
  res.json({ user: safeUser(user), organisation: org });
});

app.post('/api/onboarding', (req,res)=>{
  const { name, email, password, company_number, company_name, director_email } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  const orgId = db.prepare('INSERT INTO organisations (name, company_number, director_email, status) VALUES (?,?,?,?)').run(company_name, company_number, director_email, 'Pending Verification').lastInsertRowid;
  const userId = db.prepare('INSERT INTO users (organisation_id,name,email,password_hash,role) VALUES (?,?,?,?,?)').run(orgId,name,email,hash,'organisation_owner').lastInsertRowid;
  audit({ organisationId: orgId, userId, action: 'ORGANISATION_ONBOARDING_SUBMITTED', entityType:'organisation', entityId:String(orgId), ip:req.ip, changes:req.body });
  res.json({ ok:true, organisation_id: orgId, status:'Pending Verification' });
});

app.get('/api/dashboard', authRequired, orgGuard, (req,res)=>{
  const orgId = req.user.role === 'platform_admin' ? Number(req.query.organisation_id) : req.user.organisation_id;
  const kpis = db.prepare('SELECT * FROM module_kpis WHERE organisation_id=?').all(orgId);
  const notifications = db.prepare('SELECT * FROM notifications WHERE organisation_id=? AND resolved=0 ORDER BY due_date ASC').all(orgId);
  const modules = ['Finance','Projects','Compliance','People','Estate','Energy','Operations','Customer'].map(name => ({ name, kpis: kpis.filter(k => k.module === name), alerts: notifications.filter(n => n.module === name) }));
  res.json({ modules, notifications });
});

app.get('/api/finance', authRequired, orgGuard, (req,res)=>res.json(financeSummary(req.user.organisation_id, req.query.month || new Date().toISOString().slice(0,7))));
app.post('/api/finance/lines', authRequired, orgGuard, (req,res)=>{ const { month,type,label,budget,forecast,actual }=req.body; const id=db.prepare('INSERT INTO budget_lines (organisation_id,month,type,label,budget,forecast,actual) VALUES (?,?,?,?,?,?,?)').run(req.user.organisation_id,month,type,label,budget||0,forecast||0,actual||0).lastInsertRowid; audit({organisationId:req.user.organisation_id,userId:req.user.id,action:'BUDGET_LINE_CREATED',entityType:'budget_line',entityId:String(id),ip:req.ip,changes:req.body}); res.json({id}); });
app.get('/api/projects', authRequired, orgGuard, (req,res)=>res.json(db.prepare('SELECT * FROM projects WHERE organisation_id=?').all(req.user.organisation_id)));
app.get('/api/compliance', authRequired, orgGuard, (req,res)=>res.json(db.prepare('SELECT * FROM compliance_items WHERE organisation_id=? ORDER BY due_date ASC').all(req.user.organisation_id)));
app.get('/api/notifications', authRequired, orgGuard, (req,res)=>res.json(db.prepare('SELECT * FROM notifications WHERE organisation_id=? ORDER BY resolved ASC, due_date ASC').all(req.user.organisation_id)));
app.post('/api/concierge', authRequired, orgGuard, (req,res)=>res.json({ answer: conciergeAnswer(req.user.organisation_id, req.body.question) }));
app.get('/api/integrations', authRequired, orgGuard, (req,res)=>res.json({ providers: listProviders(), connected: db.prepare('SELECT provider,status,last_sync_at FROM integrations WHERE organisation_id=?').all(req.user.organisation_id) }));
app.post('/api/integrations/:provider/sync', authRequired, orgGuard, (req,res)=>res.json(syncProvider(req.params.provider)));

app.get('/api/admin/organisations', authRequired, requireRole('platform_admin'), (req,res)=>res.json(db.prepare('SELECT * FROM organisations ORDER BY created_at DESC').all()));
app.patch('/api/admin/organisations/:id/status', authRequired, requireRole('platform_admin'), (req,res)=>{ db.prepare('UPDATE organisations SET status=? WHERE id=?').run(req.body.status, req.params.id); audit({organisationId:Number(req.params.id),userId:req.user.id,action:'ORGANISATION_STATUS_UPDATED',entityType:'organisation',entityId:req.params.id,ip:req.ip,changes:req.body}); res.json({ok:true}); });
app.post('/api/admin/organisations/:id/contracts', authRequired, requireRole('platform_admin'), upload.single('contract'), (req,res)=>{ const id=db.prepare('INSERT INTO contracts (organisation_id, filename, stored_path, uploaded_by) VALUES (?,?,?,?)').run(req.params.id, req.file.originalname, req.file.path, req.user.id).lastInsertRowid; audit({organisationId:Number(req.params.id),userId:req.user.id,action:'SIGNED_CONTRACT_UPLOADED',entityType:'contract',entityId:String(id),ip:req.ip,changes:{filename:req.file.originalname}}); res.json({id}); });
app.get('/api/admin/audit', authRequired, requireRole('platform_admin'), (req,res)=>res.json(db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 250').all()));
app.post('/api/security/mfa-disable', authRequired, requireRole('organisation_owner','organisation_admin'), (req,res)=>{ if (!req.body.confirmed) return res.status(400).json({error:'Confirmation checkbox required'}); db.prepare('UPDATE organisations SET mfa_required=0, security_score=? WHERE id=?').run('B', req.user.organisation_id); audit({organisationId:req.user.organisation_id,userId:req.user.id,action:'MFA_DISABLED',entityType:'organisation',entityId:String(req.user.organisation_id),ip:req.ip,changes:{password_rotation_days:90}}); res.json({ok:true, password_rotation_days:90}); });

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_,res)=>res.sendFile(path.join(dist,'index.html'))); }
const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log(`Pulse running on port ${port}`));
