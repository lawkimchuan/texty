<?php
/**
 * Plain Text Editor — api.php
 * Single-file PHP backend for shared hosting.
 */

declare(strict_types=1);

// ── Configuration ──────────────────────────────────────────────────
const FILES_DIR  = __DIR__ . '/files';  // Where .txt files are stored
const MAX_BYTES  = 1_048_576;           // 1 MB max file size

// ── Bootstrap ──────────────────────────────────────────────────────
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Method not allowed', 405);
}

$action = trim($_GET['action'] ?? '');
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// Ensure files directory exists
if (!is_dir(FILES_DIR)) {
    mkdir(FILES_DIR, 0750, true);
    // Block direct HTTP access
    file_put_contents(FILES_DIR . '/.htaccess', "Order deny,allow\nDeny from all\n");
}

// ── Routing ────────────────────────────────────────────────────────
match ($action) {
    'save'   => handleSave($body),
    'load'   => handleLoad($body),
    'list'   => handleList(),
    'delete' => handleDelete($body),
    default  => respond(false, 'Unknown action', 400),
};

// ── Handlers ───────────────────────────────────────────────────────

function handleSave(array $body): void
{
    $filename = sanitizeFilename($body['filename'] ?? '');
    $content  = $body['content'] ?? '';

    if (!$filename)                     respond(false, 'Invalid filename', 400);
    if (!is_string($content))           respond(false, 'Invalid content', 400);
    if (strlen($content) > MAX_BYTES)   respond(false, 'File too large (max 1 MB)', 400);

    $path = resolveFilePath($filename);
    if ($path === null)                 respond(false, 'Invalid file path', 400);

    if (file_put_contents($path, $content, LOCK_EX) === false) {
        respond(false, 'Could not write file', 500);
    }

    respond(true, 'File saved');
}

function handleLoad(array $body): void
{
    $filename = sanitizeFilename($body['filename'] ?? '');
    if (!$filename) respond(false, 'Invalid filename', 400);

    $path = resolveFilePath($filename);
    if ($path === null || !is_file($path)) respond(false, 'File not found', 404);

    $content = file_get_contents($path);
    if ($content === false) respond(false, 'Could not read file', 500);

    respond(true, 'OK', 200, ['content' => $content]);
}

function handleList(): void
{
    $files = [];
    foreach (glob(FILES_DIR . '/*.txt') ?: [] as $f) {
        $files[] = basename($f);
    }
    sort($files);
    respond(true, 'OK', 200, ['files' => $files]);
}

function handleDelete(array $body): void
{
    $filename = sanitizeFilename($body['filename'] ?? '');
    if (!$filename) respond(false, 'Invalid filename', 400);

    $path = resolveFilePath($filename);
    if ($path === null || !is_file($path)) respond(false, 'File not found', 404);

    if (!unlink($path)) respond(false, 'Could not delete file', 500);

    respond(true, 'File deleted');
}

// ── File Path Helpers ──────────────────────────────────────────────

/**
 * Sanitize a filename: keep only safe characters, force .txt extension.
 * Returns empty string if the result is invalid.
 */
function sanitizeFilename(string $raw): string
{
    // Strip directory components
    $name = basename($raw);
    // Allow letters, digits, spaces, hyphens, underscores, dots
    $name = preg_replace('/[^\w\s.\-]/', '-', $name);
    // Collapse multiple dots (prevent ..)
    $name = preg_replace('/\.{2,}/', '.', $name);
    $name = trim($name, " .\t\n\r\0\x0B");
    if ($name === '') return '';
    // Force .txt extension
    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'txt') {
        $name .= '.txt';
    }
    // Max 200 chars
    if (strlen($name) > 200) return '';
    return $name;
}

/**
 * Resolve the full path and verify it's inside FILES_DIR.
 * Returns null if the path escapes the directory.
 */
function resolveFilePath(string $filename): ?string
{
    if ($filename === '') return null;
    $path = FILES_DIR . '/' . $filename;
    // Use realpath on the directory (not the file, which may not exist yet)
    $realDir  = realpath(FILES_DIR);
    $realPath = realpath(dirname($path));
    if ($realDir === false || $realPath === false) return null;
    if ($realPath !== $realDir) return null; // Path traversal attempt
    return $path;
}

// ── Response ───────────────────────────────────────────────────────

function respond(bool $ok, string $message, int $status = 200, array $data = []): never
{
    http_response_code($status);
    echo json_encode(['ok' => $ok, 'message' => $message, 'data' => $data ?: null]);
    exit;
}
