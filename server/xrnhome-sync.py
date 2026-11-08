#!/usr/bin/env python3
"""xrnhome sync server: the home server's copy of the inventory, behind HTTP Basic auth.

One JSON document per user (the app's backup format, each item's photo named by its file name)
plus the photos themselves, and the laptop version of the app. The phone and the laptop both
write: each sends all its items after a change, with If-Match. A device that loses that race gets
412, fetches what's here, merges it into its own items and tries again, so the merging all happens
in the app and this server only ever holds whole lists. It also means a phone that never synced
(or was reinstalled) can't wipe the copy here by accident: it has to restore it, merge with it, or
say on purpose that its own items replace it (If-Match: *). Made to run on a small home server
next to Radicale, published under a path (/xrnhome) by a reverse proxy such as Tailscale Funnel,
which may or may not strip that prefix.
Standard library only, plus `bcrypt` to read an htpasswd file, so the calendar password is the
sync password.

    GET  /state               200, the document; ETag: "<version>" (0 while there is none)
                              If-None-Match: "<version>" -> 304 when unchanged
    PUT  /state               needs If-Match: "<version>" (or "*"); 200 with the new ETag, or
                              412 if the copy here isn't the one the device last saw
    GET  /photos              the names of the photos kept here, as a JSON list
    PUT  /photos/<name>       a photo's bytes
    GET  /photos/<name>       a photo
    GET  /health              200 "ok", no login (for monitoring)
    GET  /update/<file>       releases from scripts/release.mjs, in <data>/update: app.json and
                              the .apk it names; both need the login
    GET  /  (and what it asks for)
                              the laptop version, from `release.mjs --web`, in <data>/web. It
                              needs the login too, so the browser asks once and then sends it
                              with the app's own requests, and nothing has to store a password

Every write keeps the copy it replaces: the last KEEP_VERSIONS of them in history/, and the
first of each day in daily/ for KEEP_DAYS. A photo goes once none of those name it any more.

    python3 xrnhome-sync.py --data ~/xrnhome-sync/data --users ~/.config/xrn-sync/users
"""
import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY = 8 * 1024 * 1024
MAX_PHOTO = 15 * 1024 * 1024
FAIL_DELAY_S = 2  # after a wrong password, as Radicale does
AUTH_CACHE_S = 600  # a bcrypt check costs ~0.3s on a phone; don't pay it per request
FAIL_LIMIT = 10  # wrong logins from one address within FAIL_WINDOW_S, then 429 until they age out
FAIL_WINDOW_S = 15 * 60
KEEP_VERSIONS = 20
KEEP_DAYS = 60
PRUNE_EVERY_S = 600  # photos are swept at most this often per user
PHOTO_GRACE_S = 86400  # a photo this new stays even if nothing names it yet
PREFIX = "/xrnhome"
USER_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
# The same rule as the app's isSafePhotoName: a plain file name, no path, no leading dot.
PHOTO_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
PHOTO_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".gif": "image/gif",
}
UPDATE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\.(?:json|apk)")
UPDATE_TYPES = {
    ".json": "application/json; charset=utf-8",
    ".apk": "application/vnd.android.package-archive",
}
# Plain relative paths, each part a name that doesn't start with a dot.
WEB_PATH = re.compile(r"[A-Za-z0-9_@+~-][A-Za-z0-9._@+~-]*(?:/[A-Za-z0-9_@+~-][A-Za-z0-9._@+~-]*)*")
WEB_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}
# Whatever the app needs and nothing from anywhere else. Styles are inline because that's how
# react-native-web works; fetching data: and blob: is how a picked photo gets read to be sent.
WEB_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
           "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; "
           "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
# Their names change with their contents, so a copy never goes stale. Behind a login, so never
# in a shared cache.
FOREVER = "private, max-age=31536000, immutable"
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}

args = None
lock = threading.Lock()  # state.json, history/ and daily/
photo_lock = threading.Lock()
auth_cache = {}  # sha256(user:password) -> (user, expires, users-file mtime)
fail_lock = threading.Lock()
failures = {}  # client address -> monotonic times of its recent wrong logins
pruned = {}  # user -> time.monotonic() of the last photo sweep


def users_mtime():
    try:
        return os.stat(args.users).st_mtime
    except OSError:
        return 0


def check_login(header):
    """The user name for a valid `Authorization: Basic ...`, else None."""
    if not header or not header.startswith("Basic "):
        return None
    try:
        user, _, password = base64.b64decode(header[6:]).decode("utf-8").partition(":")
    except Exception:
        return None
    if not USER_NAME.fullmatch(user):  # it names a folder here
        return None
    key = hashlib.sha256(f"{user}:{password}".encode()).hexdigest()
    mtime = users_mtime()
    hit = auth_cache.get(key)
    if hit and hit[1] > time.time() and hit[2] == mtime:
        return hit[0]
    import bcrypt  # only needed once someone logs in

    try:
        with open(args.users, encoding="utf-8") as f:
            for line in f:
                name, _, hashed = line.strip().partition(":")
                if name == user and hashed and bcrypt.checkpw(password.encode(), hashed.encode()):
                    auth_cache[key] = (user, time.time() + AUTH_CACHE_S, mtime)
                    return user
    except (OSError, ValueError):
        pass
    return None


def client_address(handler):
    """The caller's address. Behind the local proxy (Funnel) that's the first X-Forwarded-For hop;
    the header is only trusted from a loopback peer, since anyone else could make it up."""
    peer = handler.client_address[0]
    forwarded = handler.headers.get("X-Forwarded-For")
    if forwarded and peer in ("127.0.0.1", "::1"):
        return forwarded.split(",")[0].strip()
    return peer


def locked_out(addr):
    now = time.monotonic()
    with fail_lock:
        recent = [t for t in failures.get(addr, ()) if now - t < FAIL_WINDOW_S]
        if recent:
            failures[addr] = recent
        else:
            failures.pop(addr, None)
        return len(recent) >= FAIL_LIMIT


def note_failure(addr):
    now = time.monotonic()
    with fail_lock:
        if len(failures) > 10000:  # a flood from many addresses: forget the stale ones
            for a in [a for a, ts in failures.items() if now - ts[-1] >= FAIL_WINDOW_S]:
                del failures[a]
        failures.setdefault(addr, []).append(now)


def user_dir(user, *parts):
    return os.path.join(args.data, "users", user, *parts)


def read_doc(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def read_state(user):
    return read_doc(user_dir(user, "state.json")) or {"version": 0, "data": {}}


def write_json(path, doc):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def keep_old(user, cur):
    """Files away the copy a write is about to replace, and drops what's past keeping."""
    if not cur.get("version"):
        return
    history = user_dir(user, "history")
    write_json(os.path.join(history, f"{cur['version']}.json"), cur)
    versions = sorted(int(n[:-5]) for n in os.listdir(history) if re.fullmatch(r"\d+\.json", n))
    for v in versions[:-KEEP_VERSIONS]:
        os.remove(os.path.join(history, f"{v}.json"))

    daily = user_dir(user, "daily")
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not os.path.exists(os.path.join(daily, f"{day}.json")):
        write_json(os.path.join(daily, f"{day}.json"), cur)
    days = sorted(n for n in os.listdir(daily) if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", n))
    for n in days[:-KEEP_DAYS]:
        os.remove(os.path.join(daily, n))


def photos_named(doc):
    data = (doc or {}).get("data")
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return set()
    return {i["photo"] for i in items if isinstance(i, dict) and isinstance(i.get("photo"), str)}


def prune_photos(user, force=False):
    """Deletes the photos that no kept copy names (and that aren't brand new)."""
    if not force and time.monotonic() - pruned.get(user, -PRUNE_EVERY_S) < PRUNE_EVERY_S:
        return
    pruned[user] = time.monotonic()
    folder = user_dir(user, "photos")
    if not os.path.isdir(folder):
        return
    with lock:
        named = photos_named(read_state(user))
        for sub in ("history", "daily"):
            d = user_dir(user, sub)
            if os.path.isdir(d):
                for n in os.listdir(d):
                    if n.endswith(".json"):
                        named |= photos_named(read_doc(os.path.join(d, n)))
    now = time.time()
    with photo_lock:
        for n in os.listdir(folder):
            path = os.path.join(folder, n)
            try:
                if n not in named and now - os.stat(path).st_mtime > PHOTO_GRACE_S:
                    os.remove(path)
            except OSError:
                pass


def etag_version(header):
    return (header or "").strip().removeprefix("W/").strip('"')


class Handler(BaseHTTPRequestHandler):
    server_version = "xrnhome-sync/1"
    timeout = 120  # seconds of silence before a connection is dropped, so a stalled client can't hold a thread

    def log_message(self, fmt, *a):
        who = self.headers.get("X-Forwarded-For", self.client_address[0]) if self.headers else "-"
        sys.stderr.write(f"{who} {fmt % a}\n")

    def route(self):
        path = self.path.partition("?")[0]
        if path == PREFIX or path.startswith(PREFIX + "/"):
            path = path[len(PREFIX):] or "/"
        return path

    def send(self, code, body=b"", ctype="text/plain; charset=utf-8", headers=None):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Cache-Control", "no-store")
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        if code != 304:
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and code != 304:
            self.wfile.write(body)

    def send_file(self, path, ctype, cache="no-store", csp=None):
        """A file streamed as is; the big ones are compressed already and run to megabytes."""
        try:
            f = open(path, "rb")
        except OSError:
            return self.send(404, "not found")
        with f:
            # Files are swapped in by rename, so the open file is one whole version.
            size = os.fstat(f.fileno()).st_size
            self.send_response(200)
            self.send_header("Cache-Control", cache)
            for k, v in {**SECURITY_HEADERS, **({"Content-Security-Policy": csp} if csp else {})}.items():
                self.send_header(k, v)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(size))
            self.end_headers()
            shutil.copyfileobj(f, self.wfile)

    def length(self, limit):
        """The request body's length, or None once an error has been answered."""
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.send(400, "bad Content-Length")
            return None
        if length <= 0 or length > limit:
            self.send(413, "body missing or too large")
            return None
        return length

    def login(self):
        addr = client_address(self)
        if locked_out(addr):
            time.sleep(FAIL_DELAY_S)
            self.send(429, "too many wrong passwords; try again later",
                      headers={"Retry-After": str(FAIL_WINDOW_S)})
            return None
        user = check_login(self.headers.get("Authorization"))
        if not user:
            if self.headers.get("Authorization"):
                note_failure(addr)
            time.sleep(FAIL_DELAY_S)
            self.send(401, "login required", headers={"WWW-Authenticate": 'Basic realm="xrnhome"'})
            return None
        with fail_lock:
            failures.pop(addr, None)
        return user

    def do_GET(self):
        path = self.route()
        if path == "/health":
            return self.send(200, "ok")
        if path.startswith("/update/"):
            name = path[len("/update/"):]
            # The login comes first, so a caller without one can't even tell which releases exist.
            if not self.login():
                return
            if not UPDATE_NAME.fullmatch(name):
                return self.send(404, "not found")
            return self.send_file(os.path.join(args.data, "update", name),
                                  UPDATE_TYPES[os.path.splitext(name)[1]])
        user = self.login()
        if not user:
            return
        if path not in ("/state", "/photos") and not path.startswith("/photos/"):
            return self.send_web(path)
        if path == "/photos":
            folder = user_dir(user, "photos")
            names = sorted(n for n in os.listdir(folder) if PHOTO_NAME.fullmatch(n)) if os.path.isdir(folder) else []
            return self.send(200, json.dumps(names), "application/json; charset=utf-8")
        if path.startswith("/photos/"):
            name = path[len("/photos/"):]
            if not PHOTO_NAME.fullmatch(name) or ".." in name:
                return self.send(404, "not found")
            ctype = PHOTO_TYPES.get(os.path.splitext(name)[1].lower(), "application/octet-stream")
            return self.send_file(user_dir(user, "photos", name), ctype, cache=FOREVER)
        with lock:
            doc = read_state(user)
        etag = {"ETag": f'"{doc["version"]}"'}
        if etag_version(self.headers.get("If-None-Match")) == str(doc["version"]):
            return self.send(304, headers=etag)
        body = json.dumps(doc.get("data") or {}, ensure_ascii=False, separators=(",", ":"))
        self.send(200, body, "application/json; charset=utf-8", {**etag, "X-Updated": doc.get("updated", "")})

    def send_web(self, path):
        """A file of the laptop version. The page can change under its one name; the rest are
        named after their contents."""
        name = path.lstrip("/") or "index.html"
        ctype = WEB_TYPES.get(os.path.splitext(name)[1].lower())
        if ctype is None or not WEB_PATH.fullmatch(name):
            return self.send(404, "not found")
        fresh = name.endswith(".html")
        self.send_file(os.path.join(args.data, "web", name), ctype,
                       cache="no-cache" if fresh else FOREVER, csp=WEB_CSP)

    def do_PUT(self):
        path = self.route()
        if path != "/state" and not path.startswith("/photos/"):
            return self.send(404, "not found")
        user = self.login()
        if not user:
            return
        if path.startswith("/photos/"):
            return self.put_photo(user, path[len("/photos/"):])
        length = self.length(MAX_BODY)
        if length is None:
            return
        try:
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                raise ValueError
        except ValueError:
            return self.send(400, 'body must be {"items": [...]}')
        want = (self.headers.get("If-Match") or "").strip()
        if not want:
            return self.send(428, "If-Match required")
        with lock:
            cur = read_state(user)
            if want != "*" and etag_version(want) != str(cur["version"]):
                return self.send(412, "changed since you read it", headers={"ETag": f'"{cur["version"]}"'})
            keep_old(user, cur)
            version = cur["version"] + 1
            write_json(user_dir(user, "state.json"), {
                "version": version,
                "updated": datetime.now(timezone.utc).isoformat(),
                "by": (self.headers.get("X-Device") or "")[:64],
                "data": data,
            })
        self.send(200, '{"ok":true}', "application/json", {"ETag": f'"{version}"'})
        prune_photos(user)

    def put_photo(self, user, name):
        if not PHOTO_NAME.fullmatch(name) or ".." in name:
            return self.send(400, "bad photo name")
        length = self.length(MAX_PHOTO)
        if length is None:
            return
        folder = user_dir(user, "photos")
        os.makedirs(folder, exist_ok=True)
        tmp = os.path.join(folder, f".{name}.{threading.get_ident()}.part")
        left = length
        try:
            with open(tmp, "wb") as f:
                while left > 0:
                    chunk = self.rfile.read(min(left, 65536))
                    if not chunk:
                        raise OSError("the upload stopped short")
                    f.write(chunk)
                    left -= len(chunk)
                f.flush()
                os.fsync(f.fileno())
            with photo_lock:
                os.replace(tmp, os.path.join(folder, name))
        except OSError:
            try:
                os.remove(tmp)
            except OSError:
                pass
            return self.send(400, "the upload stopped short")
        self.send(201, '{"ok":true}', "application/json")


def main():
    global args
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=5236)
    p.add_argument("--data", required=True, help="where the documents and photos live")
    p.add_argument("--users", required=True, help="htpasswd file with bcrypt hashes")
    args = p.parse_args()
    args.data = os.path.expanduser(args.data)
    args.users = os.path.expanduser(args.users)
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    srv.daemon_threads = True
    sys.stderr.write(f"xrnhome-sync on http://{args.host}:{args.port}, data in {args.data}\n")
    srv.serve_forever()


if __name__ == "__main__":
    main()
