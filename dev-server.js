import app from './netlify/functions/api.js';

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`);
});
