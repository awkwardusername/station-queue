# Station Queue Web App

This is a Vite + React + TypeScript web application for managing queues at stations. It supports three roles:

- **User**: Can join queues for stations (no login, tracked by cookie).
- **Person**: Manages a station, can view and pop the queue (access via station-specific ID).
- **Administrator**: Can create stations (access via secret key).

## Features

- Users can join queues for multiple stations.
- Persons can view and pop the queue for their station.
- Admin can create new stations.
- Queue positions start from 100 for better user experience.
- Position numbers are unique and never reused, ensuring accurate tracking.
- Clean data management: all associated data is properly deleted when a station is removed.

## Getting Started

1. Install dependencies:

   ```pwsh
   npm install
   ```

2. Start the development server:

   ```pwsh
   npm run dev
   ```

## Next Steps

- Implement backend API (Node.js/Express) for queue and station management.
- Connect frontend to backend.
- Add cookie-based user tracking.

## Real-Time Updates

This application uses Ably for real-time updates. See [ABLY_SETUP.md](./ABLY_SETUP.md) for detailed instructions on setting up the Ably API keys.

---

This project is a work in progress. See `.github/copilot-instructions.md` for Copilot customization.
