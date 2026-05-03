# Plaintext Editor

A minimalist, browser-based plain text editor with server-side file storage and offline support via PWA. No frameworks or external dependencies — vanilla JS, CSS, and PHP.

## Features

- **Distraction-free editing** with real-time word and character count
- **Open from device** — uses File System Access API on Chromium, with `<input type="file">` fallback for other browsers
- **Save to server** — stores `.txt` files on the backend
- **Download to device** — writes back to the original file handle on supported browsers, otherwise triggers a download
- **Server file browser** — sidebar listing all saved files with per-file delete
- **Light and dark themes** with system-appropriate styling, persisted across sessions
- **Responsive design** — sidebar collapses to a drawer on mobile
- **Offline support** — app shell loads from cache; API calls fail gracefully

## PWA

The app is installable as a Progressive Web App:

- Standalone display mode (no browser UI)
- Maskable icons at 192×192 and 512×512
- iOS home screen support (`apple-mobile-web-app-capable`)
- Service worker with cache-first strategy for the app shell and network-only for API calls

## Tech Stack

| Layer    | Technology                                          |
| -------- | --------------------------------------------------- |
| Frontend | HTML5, CSS3 (custom properties), Vanilla JS (ES6+)  |
| Backend  | PHP 7.1+ (single file, zero config)                 |
| Storage  | Server `files/` directory, `localStorage` for theme |
| Offline  | Service Worker (`sw.js`), Cache API                 |

## API

All requests `POST` to `api.php?action=<action>` with a JSON body. Responses follow the shape `{ ok: boolean, message: string, data: object|null }`.

| Action   | Description              |
| -------- | ------------------------ |
| `save`   | Save or overwrite a file |
| `load`   | Read file contents       |
| `list`   | List all server files    |
| `delete` | Delete a file            |

## Setup

### Requirements

- PHP 7.1+
- A web server (Apache, Nginx, etc.)
- HTTPS on production (required for PWA and File System Access API)
- Writable `files/` directory

### Installation

1. Clone or copy the project to your web server's document root.
2. Make the `files/` directory writable by the web server:
   ```bash
   chmod 755 files/
   ```
3. Open the app in a browser and start editing.

### Security Notes

- The `files/` directory is protected by `.htaccess` — direct HTTP access is denied. The directory is also created automatically by `api.php` if it does not exist.
- Filenames are sanitized on both the client and server to prevent path traversal.
- The API has no built-in authentication. Deploy behind a web server auth layer (e.g. HTTP Basic Auth) or restrict access by IP if the instance is not public.

## Project Structure

```
plaintext-editor/
├── index.html        # App shell: editor, toolbar, sidebar
├── app.js            # File operations, UI events, API helpers
├── api.php           # Single-file PHP backend: CRUD, validation
├── style.css         # CSS variables, light/dark themes, responsive layout
├── manifest.json     # PWA manifest
├── sw.js             # Service worker: cache-first shell, network-only API
├── files/            # Server-side file storage (protected from direct access)
└── icons/
    ├── icon-192.png  # Home screen icon
    └── icon-512.png  # Splash screen icon
```

## Browser Support

- Modern browsers with ES6+ support
- File System Access API (write-back to original file): Chromium-based browsers only
- PWA install prompt: Chromium and Firefox on Android; Safari on iOS via "Add to Home Screen"
