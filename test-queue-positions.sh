# Queue Position Test Script
# This script will help test the queue position numbering that starts at 100

# 1. Start the server
npm run netlify:dev &
SERVER_PID=$!

# Wait for the server to start
echo "Waiting for server to start..."
sleep 5

# 2. Create a test station
echo "Creating test station..."
curl -X POST http://localhost:8888/.netlify/functions/api/admin/stations \
  -H "Content-Type: application/json" \
  -d '{"secret":"admin-secret","name":"Test Station"}'

# Extract station ID and manager ID from response
STATION_ID=$(curl -s http://localhost:8888/.netlify/functions/api/stations | jq -r '.[0].id')
MANAGER_ID=$(curl -s http://localhost:8888/.netlify/functions/api/stations | jq -r '.[0].managerId')

echo "Created station with ID: $STATION_ID and manager ID: $MANAGER_ID"

# 3. Add a few users to the queue
echo "Adding users to queue..."
for i in {1..5}
do
  curl -X POST "http://localhost:8888/.netlify/functions/api/queue/$STATION_ID" \
    -H "x-user-id: test-user-$i" \
    -H "Content-Type: application/json" \
    -d '{}'
  echo ""
done

# 4. Check the queue positions
echo "Checking queue positions..."
curl -s "http://localhost:8888/.netlify/functions/api/queue/$STATION_ID?managerId=$MANAGER_ID" | jq

# 5. Cleanup
echo "Stopping server..."
kill $SERVER_PID

echo "Test complete!"
