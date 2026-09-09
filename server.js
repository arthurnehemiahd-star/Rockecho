// Minimal static file server for the Rockecho frontend.
// This is intentionally separate from the backend (../backend/server.js) —
// it knows nothing about databases, Replicate, or any API keys. It only
// serves index.html/app.js/style.css and points the browser at wherever
// the backend API is running (see config.js).
const path = require('path');
const express = require('express');

const app = express();
const port = Number(process.env.PORT || 5173);

app.use(express.static(__dirname));
// Any unknown path falls back to index.html (harmless here since this is a
// single-page app with no client-side routes yet, but keeps future routing
// from 404ing on a refresh).
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(port, () => {
  console.log(`Rockecho frontend running at http://localhost:${port}`);
});
