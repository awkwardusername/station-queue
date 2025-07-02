# Station Queue Web App

This project is a queue management system for stations, built with Vite, React, and TypeScript for the frontend, and Node.js/Express for the backend. It uses Prisma for database management and Netlify functions for serverless API endpoints. Ably is integrated for real-time queue updates.

## Roles

- **User:** Joins a queue without login (tracked by cookie).
- **Person:** Manages a station, views and pops the queue, accesses via station-specific ID.
- **Administrator:** Creates stations, manages system-wide settings, accesses via secret key.

## Features

- Users can join queues for multiple stations.
- Persons can view and pop the queue for their station.
- Administrators can create and delete stations.
- Queue positions start from 100 for better user experience.
- Position numbers are unique and never reused, ensuring accurate tracking.
- Clean data management: all associated data is properly deleted when a station is removed.
- Real-time updates via Ably.
- Backend API implemented with Node.js/Express and Prisma.
- Serverless endpoints via Netlify functions.

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

- Complete backend API for queue and station management.
- Connect frontend to backend.
- Add cookie-based user tracking.
- Expand admin and person features.
- Improve real-time queue handling.

## Real-Time Updates

This application uses Ably for real-time updates. See [ABLY_SETUP.md](./ABLY_SETUP.md) for detailed instructions on setting up the Ably API keys.

---

This project is a work in progress. See [.github/copilot-instructions.md](.github/copilot-instructions.md) for Copilot customization.
