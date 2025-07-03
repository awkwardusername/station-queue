# Station Queue Web App

[![Netlify Status](https://api.netlify.com/api/v1/badges/bb4be188-c231-453f-9b58-b4cdcce7acdc/deploy-status)](https://app.netlify.com/projects/station-queue/deploys)

A real-time queue management system for stations, built with modern web technologies. Perfect for managing customer queues at service stations, government offices, banks, or any location requiring organized queue management.

## 🚀 Features

### User Features
- **No Login Required**: Users join queues instantly without registration (tracked by browser storage)
- **Multiple Queues**: Join multiple station queues simultaneously
- **Real-time Updates**: See your queue position update instantly via WebSocket connections
- **Notifications**: Get notified when your turn approaches
- **Mobile Responsive**: Works seamlessly on all devices

### Station Manager Features
- **Station Dashboard**: View and manage your station's queue in real-time
- **Queue Control**: Pop customers from the queue when served
- **Station-specific Access**: Secure access via unique station manager ID

### Administrator Features
- **Station Management**: Create and delete stations
- **System Overview**: Monitor all stations in the system
- **Secure Access**: Protected by admin secret key

### Technical Features
- **Real-time Communication**: Powered by Ably for instant updates
- **Fallback Polling**: Automatic fallback when WebSocket connection fails
- **Smart Queue Numbering**: Positions start from 100 for better UX
- **Data Integrity**: Cascading deletes ensure clean data management
- **Type Safety**: Full TypeScript implementation
- **Comprehensive Testing**: Unit tests for all components

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express 5, Netlify Functions
- **Database**: PostgreSQL/SQLite with Prisma ORM
- **Real-time**: Ably WebSocket connections
- **Styling**: Bootstrap 5
- **Testing**: Vitest, React Testing Library
- **Deployment**: Netlify

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (or SQLite for local development)
- Ably account for real-time features
- Netlify CLI (for local development with functions)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-username/station-queue.git
cd station-queue
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```bash
# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5432/station_queue"
# For SQLite: DATABASE_URL="file:./dev.db"

# Admin Secret (for admin panel access)
ADMIN_SECRET="your-admin-secret-key"

# API Configuration (optional)
VITE_API_URL=http://localhost:5000
VITE_API_TIMEOUT=30000
VITE_API_RETRY_ATTEMPTS=3
VITE_API_RETRY_DELAY=1000
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate --no-engine

# Run migrations
npx prisma migrate dev

# (Optional) Seed with sample data
npx prisma db seed
```

### 4. Ably Real-time Setup

This application uses two separate Ably API keys for security:

#### Backend API Key (Server-side publishing)
```bash
npm run set-backend-ably-key YOUR_BACKEND_ABLY_API_KEY
```

#### Frontend API Key (Client-side subscribing)
```bash
npm run set-frontend-ably-key YOUR_FRONTEND_ABLY_API_KEY
```

**Security Notes:**
- Backend key should have publish and subscribe capabilities
- Frontend key should be limited to subscribe-only permissions
- Keys are stored securely in the database

### 5. Start Development Server

```bash
npm run netlify:dev
```

The app will be available at:
- Frontend: http://localhost:5173
- API: http://localhost:8888/.netlify/functions/api


If you are on Windows or where the Netlify CLI does not work, you may need to run the following command to start the server:

```bash 
# Terminal 1: Start the development server
node dev-server.js
```

```bash
# Terminal 2: Start the frontend
npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- API: http://localhost:5000 (or as defined in your `.env` file)


## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## 🏗️ Building for Production

```bash
# Build the application
npm run build

# Preview production build locally
npm run preview
```

## 🚀 Deployment

### Netlify Deployment

1. **Connect Repository**: Link your GitHub repository to Netlify

2. **Configure Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`

3. **Set Environment Variables** in Netlify:
   - `DATABASE_URL`: Your production database connection string
   - `ADMIN_SECRET`: Your admin panel secret
   - `NODE_VERSION`: 18 (or higher)

4. **Configure Ably Keys**:
   After deployment, SSH into your production database and run:
   ```sql
   INSERT INTO "Config" (key, value) VALUES 
   ('ABLY_API_KEY', 'your-backend-key'),
   ('VITE_ABLY_API_KEY', 'your-frontend-key');
   ```

### Manual Deployment

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to your static hosting service

3. Deploy the `netlify/functions` to your serverless platform

## 📱 Usage Guide

### For Users
1. Visit the application URL
2. Select a station from the dropdown
3. Click "Join Queue"
4. Your queue number will be displayed
5. Wait for notifications when your turn approaches

### For Station Managers
1. Navigate to `/person` or click "Manage Station"
2. Enter your Station ID and Manager ID
3. View real-time queue updates
4. Click "Next Customer" to serve the next person

### For Administrators
1. Navigate to `/admin` or click "Admin Panel"
2. Enter the admin secret
3. Create new stations with unique names
4. Delete stations (automatically removes all queue data)

## 🛠️ Utility Scripts

```bash
# Reset all queue positions (useful for testing)
npm run reset-queue-positions

# Initialize last position counters
npm run init-last-positions

# Clean up orphaned position keys
npm run cleanup-orphaned-keys
```

## 🏗️ Project Structure

```
station-queue/
├── src/
│   ├── components/        # Reusable UI components
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── config/           # Configuration modules
│   ├── constants/        # Application constants
│   ├── __tests__/        # Test files
│   ├── App.tsx           # Main application component
│   ├── UserQueue.tsx     # User queue interface
│   ├── PersonQueue.tsx   # Station manager interface
│   └── AdminPanel.tsx    # Admin interface
├── netlify/
│   └── functions/        # Serverless API functions
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Database migrations
├── public/               # Static assets
└── dist/                # Production build output
```

## 🔧 Configuration

### API Configuration
The application automatically detects the environment and configures the API URL:
- **Development**: `http://localhost:5000`
- **Production**: `/.netlify/functions/api`

Override with `VITE_API_URL` environment variable if needed.

### Database Options
- **PostgreSQL** (recommended for production)
- **SQLite** (for local development)

Update the `provider` in `prisma/schema.prisma` to match your database.

## 🐛 Troubleshooting

### Common Issues

1. **Real-time updates not working**
   - Verify Ably keys are correctly set
   - Check browser console for WebSocket errors
   - Ensure frontend key has subscribe permissions

2. **Database connection errors**
   - Verify DATABASE_URL is correct
   - Run `npx prisma generate` after schema changes
   - Check database server is running

3. **Build failures**
   - Clear node_modules and package-lock.json
   - Run `npm install` again
   - Ensure Node.js version is 18+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Vite](https://vitejs.dev/)
- Real-time powered by [Ably](https://ably.com/)
- Deployed on [Netlify](https://netlify.com/)