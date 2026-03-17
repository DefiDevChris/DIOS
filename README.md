<p align="center">
  <img src="apps/desktop/public/icon.png" alt="DIOS Studio" width="128" height="128">
</p>

<h1 align="center">DIOS Studio</h1>

<p align="center">
  <strong>Inspection Management for Independent Inspectors</strong><br>
  Manage agencies, operators, scheduling, invoicing, expenses, and documents — all from one app.
</p>

<p align="center">
  <a href="#download--install">Download</a> &nbsp;·&nbsp;
  <a href="#first-launch">Getting Started</a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#google-integration">Google Integration</a> &nbsp;·&nbsp;
  <a href="#faq">FAQ</a>
</p>

---

## Download & Install

Go to the [**Releases**](../../releases) page and download the installer for your platform:

| Platform | File | Instructions |
|----------|------|--------------|
| **Windows** | `DIOS Studio Setup 1.0.0.exe` | Double-click to install. Windows may show a SmartScreen warning — click **More info → Run anyway**. |
| **macOS** | `DIOS Studio-1.0.0.dmg` | Open the `.dmg` and drag DIOS Studio to your Applications folder. |
| **Linux** | `DIOS Studio-1.0.0.AppImage` | Make it executable (`chmod +x`) and double-click to run. |

> No developer tools, terminal commands, or accounts required. Just download, install, and start working.

---

## First Launch

### Step 1 — Setup Wizard

When you open DIOS Studio for the first time, a setup wizard will guide you through:

1. **Choose a storage folder** — Pick where your inspection documents will be saved on your computer. A default location is suggested automatically.
2. Click **Complete Setup** — that's it.

### Step 2 — Onboarding

Next, you'll fill in your business profile:

1. **Business Information** — Your business name, address, phone, and email. Your address is used to calculate driving distances to each operator.
2. **Email Signature** — An HTML signature auto-generated from your business info. You can customize it.
3. **First Agency** — Add your first certifying agency with billing rates and contact info. You can add more agencies later in Settings.

### Step 3 — Start Working

You're ready to go. Add your operators (farms, handlers, processors), schedule inspections, and manage invoices. Everything runs locally on your computer — no internet connection required.

---

## Features

### Inspection Workflow

A 6-step workflow guides each inspection from start to finish:

**Scheduled → Prep → Inspected → Report → Invoiced → Paid**

Each step has a modal where you log hours, complete checklists, and enter notes. A visual progress bar on each operator's page shows where every inspection stands.

### Operators & Agencies

- Add operators (farms, handlers, processors) and link them to certifying agencies
- Track contact info, addresses, status, and operation type
- Import operators in bulk via CSV
- See round-trip driving distance and time from your home base

### Invoicing

- Invoices are auto-generated from inspection data — hours, mileage, drive time, per diem, and expenses
- Edit line items before sending
- Email invoices directly through Gmail with PDF attachments
- Per-agency billing rates — flat rate, hourly, per-type overrides, mileage reimbursement
- Track invoice status: Not Complete → Sent → Paid

### Expenses & Receipts

- Scan receipts with your camera — OCR automatically extracts vendor and amount
- Categorize expenses and link them to inspections
- All expenses flow into tax reports

### Route Planning

- Plan multi-stop inspection trips with cumulative mileage and drive time
- See nearby operators sorted by distance for efficient trip bundling
- Free routing — no API keys needed

### Reports & Tax

- Year-end tax summary with mileage deduction, income, and expense categories
- Schedule C PDF export
- KPI dashboards with income and expense breakdowns

### Documents

- Upload and organize documents per operator
- Store locally on your computer
- Back up to Google Drive automatically when connected

---

## Google Integration

Signing in with Google is **optional** but unlocks powerful features. Click **Sign in with Google** on the login screen.

| Feature | What You Get |
|---------|-------------|
| **Google Sheets** | A master spreadsheet is auto-created in your Drive with all inspections, operators, and expenses — updated automatically |
| **Google Drive** | Browse and upload files organized by agency, operator, and year |
| **Gmail** | Send invoices directly from the app with PDF attachments and agency-specific email templates |
| **Google Calendar** | Sync inspection dates to your calendar |

> Your data stays in your own Google account. DIOS Studio does not store your data on any external server.

---

## Cloud Sync (Optional)

For real-time backup and multi-device access, you can connect a free Firebase project:

1. Go to **Settings → Data & Integrations**
2. Follow the step-by-step guide to create a Firebase project
3. Enable Cloud Sync

When Firebase isn't configured, cloud sync features are hidden and the app works fully offline.

---

## System Requirements

| | Minimum |
|---|---------|
| **Windows** | Windows 10 or later (64-bit) |
| **macOS** | macOS 11 (Big Sur) or later |
| **Linux** | Ubuntu 20.04+ / Fedora 38+ or equivalent (64-bit) |
| **Storage** | ~200 MB for the application, plus space for your documents |
| **Internet** | Not required. Only needed for Google features and cloud sync. |

---

## FAQ

**Do I need an account to use DIOS Studio?**
No. The app works fully offline with no account. Sign in with Google only if you want Drive, Gmail, Sheets, and Calendar integration.

**Where is my data stored?**
All data is stored locally on your computer in a SQLite database. Documents are saved to the folder you chose during setup (default: `~/DIOS Studio/`). Nothing is sent to external servers unless you enable Cloud Sync.

**Can I use this on multiple computers?**
Yes — enable Cloud Sync with a free Firebase project and your data will stay in sync across devices.

**Is my data safe?**
Your data is stored locally and backed up to your own Google account (if connected). DIOS Studio does not have access to your data. Regular backups of your storage folder are recommended.

**How do I update the app?**
The app checks for updates automatically and notifies you when a new version is available. You can also download the latest version from the [Releases](../../releases) page.

**I see a SmartScreen warning on Windows. Is this safe?**
Yes. The app is not code-signed (this costs ~$200/year). Windows shows this warning for any unsigned application. Click **More info → Run anyway** to proceed.

**How do I report a bug or request a feature?**
Open an issue on the [Issues](../../issues) page.

---

## License

All rights reserved.
