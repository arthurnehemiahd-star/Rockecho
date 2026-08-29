# Rockecho

A simple, self-contained web app for discovering and previewing tracks.

## Structure

```
Rockecho/
├── index.html      # Main page markup
├── style.css        # Styling
├── script.js         # Interactivity
└── README.md         # This file
```

## Running it

No build step required. Just open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Next steps

- Wire up a real audio/data source (currently uses placeholder sample data in `script.js`)
- Add routing/pages if this grows beyond a single view
- Consider a framework (React, etc.) if the app's complexity grows
