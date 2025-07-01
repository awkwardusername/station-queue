# Setting Up Ably API Keys

This application uses two separate Ably API keys:

1. **Backend Ably API Key** (`ABLY_API_KEY`): Used by the server for publishing messages to Ably channels
2. **Frontend Ably API Key** (`VITE_ABLY_API_KEY`): Used by the client-side code for subscribing to Ably channels

## Setting Up the API Keys

### Backend API Key

To set up the backend Ably API key, run:

```bash
npm run set-backend-ably-key YOUR_BACKEND_ABLY_API_KEY
```

### Frontend API Key

To set up the frontend Ably API key, run:

```bash
npm run set-frontend-ably-key YOUR_FRONTEND_ABLY_API_KEY
```

## API Key Security

- The **backend API key** should have both publish and subscribe capabilities.
- The **frontend API key** should be limited to subscribe-only permissions for enhanced security.

## How It Works

- The backend uses its API key to publish messages to Ably channels.
- The frontend requests its own API key from the `/config/ably-key?frontend=true` endpoint.
- Both keys are stored in the database in the `Config` table with keys `ABLY_API_KEY` and `VITE_ABLY_API_KEY` respectively.

## Testing

### Checking Configured Keys

To verify that both keys are set correctly in the database, run:

```bash
npm run check-ably-keys
```

This will display masked versions of both keys for verification.

### Verifying Real-Time Functionality

1. Start the development server with `npm run dev` and `npm run netlify:dev`
2. Open the application in your browser
3. Check the browser console for Ably connection messages
4. Check the server console for Ably initialization messages
