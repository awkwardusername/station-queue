<!-- Workspace-specific Copilot instructions for this project. See https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This project is a queue management system for stations, built with Vite, React, and TypeScript for the frontend, and Node.js/Express for the backend. It uses Prisma for database management and Netlify functions for serverless API endpoints. Ably is integrated for real-time queue updates.

**Roles:**
- **User:** Joins a queue without login (tracked by cookie).
- **Person:** Manages a station, views and pops the queue, accesses via station-specific ID.
- **Administrator:** Creates stations, manages system-wide settings, accesses via secret key.

Queues and stations are managed in-memory and/or via the database. The system supports real-time updates and is designed for easy deployment and local development.
