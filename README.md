# StayFitx Frontend

StayFitx is a specialized scheduling and management platform for gym trainers, built alongside the Nidavai backend.

## 🏗 Architecture Overview

The system is split into two parts:
1. **Frontend (This Repo)**: A Next.js application using TailwindCSS and Lucide React icons, designed with a dark-mode "glassmorphism" aesthetic.
2. **Backend**: A set of FastAPI endpoints built into the existing `libris-ai-backend` (Nidavai) repository under the `/api/gym` prefix. The backend uses a PostgreSQL database for storage and OpenAI GPT-4o for parsing screenshots.

## 🚀 Key Features

* **Admin Dashboard (`/admin`)**: Master control view for Syam. Displays daily/weekly/monthly schedules, tracks trainer capacities across the week, and allows creation of new trainer accounts.
* **AI-Powered Schedule Import (`/admin/import`)**: Syam receives WhatsApp screenshots of trainer schedules. This tool uploads the image, sends it to GPT-4o Vision to extract the client names, days, and times, and bulk-generates 90 days of recurring sessions instantly.
* **Trainer Portal (`/trainer`)**: Trainers log in to see their specific schedule, manage client rosters, book new recurring sessions, and cancel or reschedule specific days.
* **Role-Based Routing (`/`)**: Root page automatically redirects users to either `/admin` or `/trainer` based on their JWT token role.

## ⚙️ Environment Variables

For the frontend to talk to the backend, you must set the following in your `.env.local` or Vercel environment:
```
NEXT_PUBLIC_API_URL=https://libris-ai-backend.onrender.com
```
*(Use `http://localhost:8001` for local development if running the FastAPI server locally).*

## 🛠 What's Built So Far
- Complete authentication flow (JWT based).
- Full Admin Dashboard (Timeline views, Roster, Add Trainer modal).
- AI Schedule Importer (3-step flow: Name -> Upload -> AI Review & Confirm).
- Fully functional backend database schema with 6 tables (`gym_users`, `gym_trainers`, `gym_clients`, `gym_sessions`, `gym_recurring_series`, `gym_notifications`).

## 🔜 Next Steps / Future Work
- Finalize production deployment (connecting Vercel to Render).
- Implement Trainer-side features (Trainer portal UI is mocked/partially complete, needs wiring to backend endpoints).
- Fine-tune the GPT-4o parsing prompt if certain WhatsApp screenshots have unusual formatting.
