# Pulse Platform

A self-hostable MVP of Pulse: a business operating system and insights layer for finance, projects, compliance, people, estate, energy, operations, customer intelligence, notifications, audit logging and platform administration.

## Features included

- Dark navy Pulse SaaS UI with responsive cards
- Login/auth with JWT
- Role-aware access: platform admin, organisation owner/admin, standard user
- Organisation onboarding and manual verification workflow
- Admin centre: organisations, contracts, security, audit logs
- Annual reverification tracking
- MFA/security controls and security score model
- Dashboard module across Finance, Projects, Compliance, People, Estate, Energy, Operations and Customer
- Finance module with budget vs forecast vs actual lines and AI executive summary mock
- Projects module with RIBA-stage construction support and project health scoring
- Compliance module with training, H&S tasks, incidents, RIDDOR, risk, policy, document and obligation structures
- People, Estate, Energy, Operations and Customer modules
- Global AI Concierge endpoint and UI
- Notifications centre
- Immutable audit-log table pattern
- Integration framework stubs for Xero and TrueLayer

## Local setup

```bash
npm install
npm run seed
npm run dev
```

Open the Vite URL shown in your terminal.

## Demo accounts

- Platform Admin: `admin@pulse.local` / `PulseAdmin123!`
- Organisation Owner: `owner@demo.local` / `PulseOwner123!`

## Production deployment

```bash
npm install
npm run seed
npm run build
npm start
```

Set environment variables in your host:

```bash
JWT_SECRET=replace-with-a-long-random-secret
DATABASE_PATH=./data/pulse.sqlite
PORT=3000
```

For production, put the app behind HTTPS, configure backups for the SQLite database, and set persistent disk storage for `/data` and `/uploads`.

## Integration notes

The integration framework is intentionally modular. Add OAuth/API clients in `server/integrations.js`, persist tokens in the `integrations` table, and normalise provider data into the Pulse insight models.
