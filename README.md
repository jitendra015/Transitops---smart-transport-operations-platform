# TransitOps - Smart Transport Operations Platform

A full-stack hackathon prototype built with **HTML/CSS/JS frontend**, **Node.js/Express backend**, and **MySQL database**.

## Features

- **Authentication & RBAC** - Secure login with 4 roles: Fleet Manager, Driver, Safety Officer, Financial Analyst
- **Dashboard** - Real-time KPIs: Active Vehicles, Fleet Utilization, Active Trips, Driver Status, Alerts
- **Vehicle Registry** - CRUD with unique registration validation, status tracking
- **Driver Management** - License tracking, safety scores, expiry alerts
- **Trip Management** - Full lifecycle (Draft → Dispatched → Completed/Cancelled) with automatic status transitions
- **Business Rules Enforced**:
  - Unique vehicle registration numbers
  - Retired/In Shop vehicles hidden from dispatch
  - Expired/suspended drivers blocked from trips
  - Cargo weight validation against vehicle capacity
  - Automatic vehicle/driver status updates on dispatch/complete/cancel
- **Maintenance Workflow** - Create records → auto-sets vehicle to "In Shop" → Close restores "Available"
- **Fuel & Expense Tracking** - Per-vehicle and per-trip logging
- **Reports & Analytics**:
  - Fuel Efficiency (km/L)
  - Operational Cost breakdown
  - Vehicle ROI calculation
  - Fleet Utilization visualization
  - CSV Export
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Dark Mode** - Toggle between light and dark themes

## Quick Start (5 minutes)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed (v16+)
- [MySQL](https://mysql.com/) running (local or remote)

### 2. Setup Database
```bash
# Create database and seed data
mysql -u root -p < database.sql
```
> Default password for demo accounts: `password123`

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 4. Install & Run
```bash
npm install
npm start
```

### 5. Open in Browser
Navigate to: `http://localhost:3000`

## Demo Accounts

| Email | Role | Password |
|-------|------|----------|
| admin@transitops.com | Fleet Manager | password123 |
| driver@transitops.com | Driver | password123 |
| safety@transitops.com | Safety Officer | password123 |
| finance@transitops.com | Financial Analyst | password123 |

## Golden Path Demo Workflow

1. **Login** as Fleet Manager
2. **Dashboard** - View KPIs and alerts
3. **Vehicles** - Add a new vehicle (e.g., Van-06, 600kg capacity)
4. **Drivers** - Add a new driver with valid license
5. **Trips** - Create trip with cargo weight ≤ vehicle capacity
6. **Dispatch** - Vehicle & driver status auto-change to "On Trip"
7. **Complete** - Enter actual distance & fuel consumed → statuses revert to "Available"
8. **Maintenance** - Create maintenance record → vehicle auto-goes "In Shop"
9. **Reports** - View fuel efficiency, operational costs, and vehicle ROI
10. **Export** - Download CSV reports

## Project Structure

```
transitops/
├── server.js           # Express API with all business logic
├── database.sql        # MySQL schema + seed data
├── package.json        # Dependencies
├── .env.example        # Environment template
├── public/
│   ├── index.html      # Single-page application
│   ├── style.css       # Modern responsive styling
│   └── app.js          # Frontend logic & API calls
└── README.md           # This file
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |
| GET | /api/dashboard/kpis | Dashboard statistics |
| GET/POST | /api/vehicles | Vehicle CRUD |
| GET/POST | /api/drivers | Driver CRUD |
| GET/POST | /api/trips | Trip management |
| PUT | /api/trips/:id/dispatch | Dispatch trip |
| PUT | /api/trips/:id/complete | Complete trip |
| PUT | /api/trips/:id/cancel | Cancel trip |
| GET/POST | /api/maintenance | Maintenance logs |
| PUT | /api/maintenance/:id/close | Close maintenance |
| GET/POST | /api/fuel-logs | Fuel tracking |
| GET/POST | /api/expenses | Expense tracking |
| GET | /api/reports/* | Analytics & reports |

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Database**: MySQL (mysql2/promise)
- **Auth**: Express Sessions
- **Styling**: Custom CSS with CSS Variables, Flexbox, Grid
- **Icons**: Font Awesome 6

## Hackathon Tips

- The app auto-seeds with 5 vehicles, 5 drivers, 3 trips, and sample expenses
- All business rules are enforced server-side (cannot be bypassed)
- Use the "Demo Accounts" badges on login screen for quick switching
- Dark mode toggle is in the top-right corner
- CSV export available on Reports page

## License

MIT - Built for hackathon demonstration purposes.
