# WFM Club – Enterprise AI Schedule Generator

**React + Node.js + Azure SQL · Enterprise-Grade Workforce Management**

> Built by Gurpreet Singh · [wfmclubs.com](https://www.wfmclubs.com)

---

## Architecture

```
┌─────────────────────────────────────┐
│  React Frontend (Vite + TypeScript) │
│  • Google OAuth login               │
│  • Manager dashboard                │
│  • AI schedule generator (Erlang-A) │
│  • Agent management                 │
│  • Impact analysis                  │
│  • Agent portal (/agent-portal)     │
└─────────────┬───────────────────────┘
              │ REST API
┌─────────────▼───────────────────────┐
│  Node.js / Express Backend          │
│  • JWT auth (Google OAuth)          │
│  • Agents CRUD                      │
│  • Schedules CRUD + publish         │
│  • Agent portal invites             │
└─────────────┬───────────────────────┘
              │ Prisma ORM
┌─────────────▼───────────────────────┐
│  Azure SQL Database                 │
│  Users · Organizations · Agents     │
│  Schedules · Sessions               │
└─────────────────────────────────────┘
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- Docker (for local SQL Server, optional)

### 1. Clone & install

```bash
git clone <your-repo>

# Frontend
cd frontend && npm install

# Backend
cd ../backend && npm install
```

### 2. Configure environment

```bash
# Frontend
cp frontend/.env.example frontend/.env
# Set VITE_GOOGLE_CLIENT_ID

# Backend
cp backend/.env.example backend/.env
# Set DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID
```

### 3. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web application)
3. Add authorised redirect URIs: `http://localhost:3000`
4. Copy **Client ID** to both `.env` files

### 4. Database

**Option A – Local Docker SQL Server:**
```bash
docker compose up db -d
```

Then update `DATABASE_URL` in `backend/.env`:
```
DATABASE_URL="sqlserver://localhost:1433;database=wfm_db;user=sa;password=DevPassword123!;encrypt=false"
```

**Option B – Azure SQL Database:**
See [Azure deployment](#azure-deployment) section below.

```bash
# Push schema
cd backend
npx prisma db push
npx prisma generate
```

### 5. Run

```bash
# Terminal 1 – Backend
cd backend && npm run dev

# Terminal 2 – Frontend
cd frontend && npm run dev
```

Open: http://localhost:3000

---

## Azure Deployment

### 1. Create Azure resources

```bash
# Resource group
az group create --name wfm-rg --location uksouth

# Azure SQL Server + Database
az sql server create -n wfm-sql-server -g wfm-rg -l uksouth \
  --admin-user wfm_admin --admin-password YOUR_SECURE_PASS

az sql db create -s wfm-sql-server -g wfm-rg -n wfm_schedule_db \
  --edition GeneralPurpose --compute-model Serverless --family Gen5 \
  --min-capacity 0.5 --capacity 2 --auto-pause-delay 60

# Allow Azure services
az sql server firewall-rule create -s wfm-sql-server -g wfm-rg \
  -n AllowAzureServices --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# App Service for Backend
az appservice plan create -n wfm-plan -g wfm-rg --sku B2 --is-linux
az webapp create -n wfm-api -g wfm-rg -p wfm-plan --runtime "NODE:20-lts"

# Static Web App for Frontend
az staticwebapp create -n wfm-frontend -g wfm-rg -l uksouth
```

### 2. Configure backend app settings

```bash
az webapp config appsettings set -n wfm-api -g wfm-rg --settings \
  NODE_ENV=production \
  DATABASE_URL="sqlserver://wfm-sql-server.database.windows.net:1433;database=wfm_schedule_db;user=wfm_admin;password=YOUR_PASS;encrypt=true" \
  JWT_SECRET="your-production-secret" \
  ALLOWED_ORIGINS="https://your-static-app.azurestaticapps.net" \
  APP_URL="https://your-static-app.azurestaticapps.net"
```

### 3. Deploy

```bash
# Backend
cd backend
npm run build
az webapp deployment source config-zip -n wfm-api -g wfm-rg --src dist.zip

# Frontend – build with production API URL
cd frontend
VITE_GOOGLE_CLIENT_ID=<your-id> npm run build
# Upload dist/ to Azure Static Web Apps via GitHub Actions or CLI
```

---

## Project Structure

```
Scheduling_react/
├── frontend/                  # React app
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/          LoginPage.tsx
│   │   │   ├── layout/        Sidebar, Header, Layout
│   │   │   ├── scheduling/    Upload, Settings, Tables, Charts, Impact
│   │   │   └── agents/        AgentModal
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ScheduleGenerator.tsx  ← main scheduling flow (5 steps)
│   │   │   ├── AgentManagement.tsx
│   │   │   ├── AgentPortal.tsx        ← agent-facing view
│   │   │   ├── ScheduleHistory.tsx
│   │   │   └── Settings.tsx
│   │   ├── store/             Zustand stores
│   │   ├── utils/
│   │   │   ├── erlang.ts      Erlang-C/A calculations (TypeScript port)
│   │   │   └── scheduleEngine.ts  Full scheduling engine
│   │   └── types/index.ts
│   └── ...
├── backend/                   # Express API
│   ├── src/
│   │   ├── routes/            auth, agents, schedules
│   │   ├── middleware/        auth (JWT), errorHandler
│   │   └── config/            database (Prisma)
│   └── prisma/schema.prisma
├── docker-compose.yml
└── README.md
```

---

## Key Features

| Feature | Description |
|---|---|
| **Google OAuth** | One-click sign-in for managers and agents |
| **Erlang-A Engine** | Full TypeScript port running in-browser |
| **5-Step Wizard** | Upload → Settings → Review → Roster → Export |
| **Impact Analysis** | Simulate shift changes and see SLA delta instantly |
| **Agent Portal** | `/agent-portal` – agents view their own schedule |
| **Schedule History** | Save, publish, archive rosters |
| **CSV Export** | Download roster, breaks, projections |
| **Azure SQL** | Enterprise database via Prisma ORM |
| **Docker** | Full containerised local + production setup |

---

## Roadmap (Next Phase)

- [ ] Email invites via Azure Communication Services
- [ ] Shift swap requests (agent → manager approval)
- [ ] Real-time notifications (SignalR / WebSockets)
- [ ] Multi-organisation support
- [ ] Azure Blob Storage for schedule exports
- [ ] Mobile-responsive agent portal PWA
- [ ] Shift pattern templates per agent
- [ ] Intraday real-time adherence view
