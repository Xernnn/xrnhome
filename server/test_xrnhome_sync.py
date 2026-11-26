"""Tests for xrnhome-sync.py: the If-Match rule, photos, kept copies, releases, logins.

    python3 -m unittest server/test_xrnhome_sync.py     (from the repo root; needs bcrypt)
"""
import base64
import hashlib
import http.client
import importlib.util
import io
import json
import os
import socket
import struct
import tempfile
import threading
import time
import unittest
import unittest.mock
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("xrnhome_sync", os.path.join(HERE, "xrnhome-sync.py"))
srv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(srv)

RIGHT = "secret"


def snapshot(*names, photo=None):
    return {"app": "xrnhome", "schemaVersion": 2,
            "items": [{"id": str(i), "name": n, "photo": photo} for i, n in enumerate(names)]}


class SyncServerTest(unittest.TestCase):
    def setUp(self):
        import bcrypt

        self.tmp = tempfile.TemporaryDirectory()
        users = os.path.join(self.tmp.name, "users")
        with open(users, "w") as f:
            f.write("alex:" + bcrypt.hashpw(RIGHT.encode(), bcrypt.gensalt(4)).decode() + "\n")
        self.data = os.path.join(self.tmp.name, "data")
        srv.args = type("Args", (), {"data": self.data, "users": users})()
        srv.FAIL_DELAY_S = 0
        srv.failures.clear()
        srv.checking.clear()
        srv.auth_cache.clear()
        srv.refused.clear()
        srv.pruned.clear()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
        self.httpd.daemon_threads = True
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def call(self, method, path, body=None, headers=None, password=RIGHT, raw=False):
        data = body if raw else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, method=method, data=data)
        if password is not None:
            req.add_header("Authorization", "Basic " + base64.b64encode(f"alex:{password}".encode()).decode())
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, r.read(), r.headers
        except urllib.error.HTTPError as e:
            with e:
                return e.code, e.read(), e.headers

    def put_web(self, name, text):
        path = os.path.join(self.data, "web", name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(text)

    def test_the_laptop_page_is_behind_the_login(self):
        self.put_web("index.html", "<html>")
        for path in ("/xrnhome/", "/xrnhome", "/"):
            status, _, headers = self.call("GET", path, password=None)
            self.assertEqual(401, status, path)
            self.assertIn("Basic", headers["WWW-Authenticate"])
        self.assertEqual(b"<html>", self.call("GET", "/xrnhome/")[1])
        self.assertEqual(b"<html>", self.call("GET", "/xrnhome")[1])

    def test_the_laptop_page_can_load_its_own_files_and_nothing_else(self):
        self.put_web("index.html", "<html>")
        self.put_web("_expo/static/js/web/App-abc.js", "app()")
        status, body, headers = self.call("GET", "/xrnhome/_expo/static/js/web/App-abc.js")
        self.assertEqual((200, b"app()"), (status, body))
        self.assertIn("javascript", headers["Content-Type"])
        self.assertIn("script-src 'self'", headers["Content-Security-Policy"])
        self.assertNotIn("unsafe-eval", headers["Content-Security-Policy"])

    def test_the_page_is_never_stale_but_its_named_files_can_be_kept(self):
        self.put_web("index.html", "<html>")
        self.put_web("a-1.js", "x")
        self.assertEqual("no-cache", self.call("GET", "/xrnhome/")[2]["Cache-Control"])
        self.assertIn("immutable", self.call("GET", "/xrnhome/a-1.js")[2]["Cache-Control"])

    def test_the_laptop_page_reaches_nothing_outside_its_folder(self):
        self.put_web("index.html", "<html>")
        self.put_web("../secret.json", "{}")
        self.put_web(".hidden.js", "x")
        self.put_web("notes.txt", "x")
        for path in ("/xrnhome/../secret.json", "/xrnhome/%2e%2e/secret.json", "/xrnhome/a/../../secret.json",
                     "/xrnhome/.hidden.js", "/xrnhome/notes.txt", "/xrnhome//etc/passwd.json"):
            self.assertEqual(404, self.call("GET", path)[0], path)

    def head(self, path, login=True):
        """The whole answer to a HEAD request, read to the end: a body sent anyway shows up in it."""
        auth = b"Authorization: Basic " + base64.b64encode(f"alex:{RIGHT}".encode()) + b"\r\n" if login else b""
        with socket.create_connection(("127.0.0.1", self.httpd.server_address[1]), timeout=10) as s:
            s.sendall(b"HEAD " + path.encode() + b" HTTP/1.1\r\nHost: x\r\nConnection: close\r\n" + auth + b"\r\n")
            return b"".join(iter(lambda: s.recv(4096), b""))

    def test_head_is_a_get_without_the_body(self):
        # curl -I on the laptop page got 501 "Unsupported method", which xrnhub's log page shows as
        # an error. send_file streams the page's files itself, so it has to leave them out too.
        self.put_web("index.html", "<html>")
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        for path, login, status, header in (("/health", False, b"200", b"Content-Length: 2"),
                                            ("/xrnhome/", True, b"200", b"Content-Length: 6"),
                                            ("/state", True, b"200", b'ETag: "1"'),
                                            ("/xrnhome/", False, b"401", b"WWW-Authenticate: Basic")):
            answer = self.head(path, login)
            self.assertRegex(answer, rb"^HTTP/1\.[01] " + status + rb" ", path)
            self.assertIn(header, answer, path)
            self.assertTrue(answer.endswith(b"\r\n\r\n"), (path, answer[-40:]))

    def cut_upload(self, reset):
        """A PUT /state whose body stops half way, then the connection closes, as a reverse proxy
        closes it when the device's side drops: with [reset], hard, before any answer can come back."""
        body = json.dumps(snapshot("a" * 4000)).encode()
        login = base64.b64encode(f"alex:{RIGHT}".encode())
        head = (b"PUT /state HTTP/1.1\r\nHost: x\r\nAuthorization: Basic " + login +
                b'\r\nIf-Match: "0"\r\nContent-Length: ' + str(len(body)).encode() + b"\r\n\r\n")
        with unittest.mock.patch("sys.stderr", new_callable=io.StringIO) as log:
            with socket.create_connection(("127.0.0.1", self.httpd.server_address[1]), timeout=10) as s:
                s.sendall(head + body[:len(body) // 2])
                if reset:
                    s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
                    answer = b""
                else:
                    s.shutdown(socket.SHUT_WR)
                    answer = b"".join(iter(lambda: s.recv(4096), b""))
            for _ in range(300):  # the handler finishes on its own thread
                if any(word in log.getvalue() for word in ("dropped", "Traceback", '" 400 ')):
                    break
                time.sleep(0.01)
            time.sleep(0.1)
        return answer, log.getvalue()

    def test_an_upload_cut_short_is_answered_as_such_and_writes_nothing(self):
        # The half that came was parsed as a snapshot, and the 400 said the body must be {"items": ...}.
        answer, log = self.cut_upload(reset=False)
        self.assertRegex(answer, rb"^HTTP/1\.[01] 400 ")
        self.assertIn(b"the upload stopped short", answer)
        self.assertNotIn("Traceback", log)
        self.assertEqual('"0"', self.call("GET", "/state")[2]["ETag"])

    def test_a_caller_that_hangs_up_is_one_line_in_the_log_not_a_traceback(self):
        _, log = self.cut_upload(reset=True)
        self.assertNotIn("Traceback", log)
        self.assertIn("connection dropped: ConnectionResetError", log)
        self.assertEqual('"0"', self.call("GET", "/state")[2]["ETag"])

    def test_nothing_is_served_before_a_web_build_is_published(self):
        self.assertEqual(404, self.call("GET", "/xrnhome/")[0])

    def test_an_empty_server_takes_a_first_sync(self):
        status, body, headers = self.call("GET", "/xrnhome/state")
        self.assertEqual((200, {}, '"0"'), (status, json.loads(body), headers["ETag"]))
        status, _, headers = self.call("PUT", "/xrnhome/state", snapshot("Milk"), {"If-Match": '"0"'})
        self.assertEqual((200, '"1"'), (status, headers["ETag"]))
        status, body, headers = self.call("GET", "/state")
        self.assertEqual(["Milk"], [i["name"] for i in json.loads(body)["items"]])
        self.assertEqual('"1"', headers["ETag"])

    def test_a_phone_that_never_synced_cant_overwrite(self):
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        status, _, headers = self.call("PUT", "/state", snapshot(), {"If-Match": '"0"'})
        self.assertEqual((412, '"1"'), (status, headers["ETag"]))
        self.assertEqual(428, self.call("PUT", "/state", snapshot())[0])
        status, _, headers = self.call("PUT", "/state", snapshot("Eggs"), {"If-Match": "*"})
        self.assertEqual((200, '"2"'), (status, headers["ETag"]))

    def test_a_write_is_known_by_its_id_under_the_writes_after_it(self):
        # A device whose answer never arrived finds its write by this, even once another device
        # has written on top of it.
        self.assertIsNone(self.call("GET", "/state")[2]["X-Writes"])
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"', "X-Write-Id": "1731-phone"})
        self.call("PUT", "/state", snapshot("Milk", "Eggs"), {"If-Match": '"1"', "X-Write-Id": "1732-laptop"})
        status, _, _ = self.call("PUT", "/state", snapshot("Bread"), {"If-Match": '"1"', "X-Write-Id": "1733-late"})
        self.assertEqual(412, status)  # a write that wasn't taken isn't anyone's
        status, _, headers = self.call("GET", "/state")
        self.assertEqual((200, "1:1731-phone, 2:1732-laptop"), (status, headers["X-Writes"]))

    def test_a_write_with_no_id_or_a_bad_one_is_taken_as_before(self):
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"', "X-Write-Id": "1731-phone"})
        status, _, headers = self.call("PUT", "/state", snapshot("Eggs"), {"If-Match": '"1"'})
        self.assertEqual((200, '"2"'), (status, headers["ETag"]))
        for i, bad in enumerate(("a,b", "../x", "x" * 65)):
            status, _, _ = self.call("PUT", "/state", snapshot("Bread"), {"If-Match": f'"{2 + i}"', "X-Write-Id": bad})
            self.assertEqual(200, status, bad)
        status, body, headers = self.call("GET", "/state")
        self.assertEqual(("1:1731-phone", ["Bread"]), (headers["X-Writes"], [i["name"] for i in json.loads(body)["items"]]))

    def test_only_the_last_writes_ids_are_kept(self):
        keep, srv.KEEP_WRITES = srv.KEEP_WRITES, 3
        try:
            for n in range(5):
                self.call("PUT", "/state", snapshot("Milk"), {"If-Match": f'"{n}"', "X-Write-Id": f"w{n}"})
        finally:
            srv.KEEP_WRITES = keep
        self.assertEqual("3:w2, 4:w3, 5:w4", self.call("GET", "/state")[2]["X-Writes"])

    def test_a_page_on_another_site_cant_write_with_the_browsers_password(self):
        # The laptop version signs in with the browser's own box, so the browser keeps the
        # password and sends it with whatever another site's page sends here.
        for elsewhere in ({"Sec-Fetch-Site": "cross-site", "Origin": "https://evil.example"},
                          {"Sec-Fetch-Site": "same-site", "Origin": "https://other.homeserver.example"},
                          {"Origin": "https://evil.example"}):  # a browser from before Sec-Fetch-Site
            self.assertEqual(403, self.call("PUT", "/state", snapshot("Junk"), {"If-Match": "*", **elsewhere})[0])
            self.assertEqual(403, self.call("PUT", "/photos/junk.jpg", b"x", elsewhere, raw=True)[0])
        self.assertEqual((b"{}", []), (self.call("GET", "/state")[1], json.loads(self.call("GET", "/photos")[1])))
        # Reads, the laptop version (behind the proxy too) and the phone still do.
        self.assertEqual(200, self.call("GET", "/state", headers={"Sec-Fetch-Site": "cross-site"})[0])
        port = self.httpd.server_address[1]
        for ours in ({"Sec-Fetch-Site": "same-origin", "Origin": "https://homeserver.example"},
                     {"Origin": f"http://127.0.0.1:{port}"},
                     {"Origin": "https://HomeServer.example", "X-Forwarded-Host": "homeserver.example:443"},
                     {}):
            self.assertEqual(200, self.call("PUT", "/state", snapshot("Milk"), {"If-Match": "*", **ours})[0], ours)

    def test_unchanged_answers_304(self):
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        status, body, _ = self.call("GET", "/state", headers={"If-None-Match": '"1"'})
        self.assertEqual((304, b""), (status, body))

    def test_the_state_must_be_a_snapshot(self):
        self.assertEqual(400, self.call("PUT", "/state", [1, 2], {"If-Match": '"0"'})[0])
        self.assertEqual(400, self.call("PUT", "/state", {"items": 3}, {"If-Match": '"0"'})[0])
        self.assertEqual(413, self.call("PUT", "/state", b"", {"If-Match": '"0"'}, raw=True)[0])

    def test_a_snapshot_too_deep_to_write_back_is_refused_before_anything_is_written(self):
        # json.loads takes a few thousand levels (tens of thousands on Python 3.14), json.dump only
        # about a thousand. A snapshot in between was taken, the copy it replaced was filed as an
        # earlier one, and then writing it raised RecursionError: the connection closed with no
        # answer, after a write that never happened.
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        deep = b'{"items":[{"id":"0","tags":' + b"[" * 2000 + b"]" * 2000 + b"}]}"
        status, body, _ = self.call("PUT", "/state", deep, {"If-Match": '"1"'}, raw=True)
        self.assertEqual((400, True), (status, b"nested" in body))
        # Past what even json.loads takes, on either version: its RecursionError is no ValueError.
        deeper = b'{"items":' + b"[" * 100_000 + b"]" * 100_000 + b"}"
        self.assertEqual(400, self.call("PUT", "/state", deeper, {"If-Match": '"1"'}, raw=True)[0])
        status, body, headers = self.call("GET", "/state")
        self.assertEqual(('"1"', ["Milk"]), (headers["ETag"], [i["name"] for i in json.loads(body)["items"]]))
        folder = os.path.join(self.data, "users", "alex")
        self.assertEqual(["state.json"], os.listdir(folder))  # no earlier copy filed, no state.json.tmp

    def test_a_snapshot_nested_up_to_the_limit_is_taken(self):
        def nested(depth):  # {"items": [{"tags": [[...]]}]}: the object holding items is level 1
            return b'{"items":[{"id":"0","tags":' + b"[" * (depth - 3) + b"]" * (depth - 3) + b"}]}"
        status, _, headers = self.call("PUT", "/state", nested(srv.MAX_DEPTH), {"If-Match": '"0"'}, raw=True)
        self.assertEqual((200, '"1"'), (status, headers["ETag"]))
        status, _, _ = self.call("PUT", "/state", nested(srv.MAX_DEPTH + 1), {"If-Match": '"1"'}, raw=True)
        self.assertEqual(400, status)

    def test_photos_go_up_and_come_back(self):
        self.assertEqual((200, []), (lambda r: (r[0], json.loads(r[1])))(self.call("GET", "/photos")))
        jpeg = b"\xff\xd8\xff" + os.urandom(5000)
        status, _, _ = self.call("PUT", "/photos/1730-abc.jpg", jpeg, {"Content-Type": "application/octet-stream"}, raw=True)
        self.assertEqual(201, status)
        self.assertEqual(["1730-abc.jpg"], json.loads(self.call("GET", "/photos")[1]))
        status, body, headers = self.call("GET", "/photos/1730-abc.jpg")
        self.assertEqual((200, jpeg, "image/jpeg"), (status, body, headers["Content-Type"]))
        self.assertEqual(404, self.call("GET", "/photos/nope.jpg")[0])

    def test_one_users_photos_stop_at_their_cap(self):
        # Every photo up to 15 MB, as many as were sent, kept at least 60 days: a client (or a
        # stolen login) could fill the disk every other service on the phone shares.
        count, size = srv.MAX_PHOTOS, srv.MAX_PHOTOS_BYTES
        srv.MAX_PHOTOS, srv.MAX_PHOTOS_BYTES = 3, 250
        try:
            put = lambda name, n: self.call("PUT", f"/photos/{name}", b"x" * n, raw=True)[0]
            self.assertEqual([201, 201], [put("a.jpg", 100), put("b.jpg", 100)])
            self.assertEqual(507, put("c.jpg", 100))  # 300 bytes
            self.assertEqual(201, put("b.jpg", 150))  # in b's place: 250
            self.assertEqual(507, put("c.jpg", 1))
            self.assertEqual(201, put("a.jpg", 50))  # in a's place: 200
            self.assertEqual(201, put("c.jpg", 50))  # 250
            srv.MAX_PHOTOS_BYTES = 10000
            self.assertEqual(507, put("d.jpg", 1))  # a fourth photo
            self.assertEqual(["a.jpg", "b.jpg", "c.jpg"], json.loads(self.call("GET", "/photos")[1]))
        finally:
            srv.MAX_PHOTOS, srv.MAX_PHOTOS_BYTES = count, size

    def test_photo_names_stay_in_their_folder(self):
        for name in ("..%2Fusers", ".hidden.jpg", "a/b.jpg", "a..b.jpg"):
            self.assertIn(self.call("PUT", f"/photos/{name}", b"x", raw=True)[0], (400, 404), name)
        self.assertEqual(404, self.call("GET", "/photos/..%2F..%2Fusers")[0])

    def test_an_unparseable_request_gets_an_answer(self):
        with socket.create_connection(("127.0.0.1", self.httpd.server_address[1]), timeout=10) as s:
            s.sendall(b"GARBAGE\r\n\r\n")
            self.assertIn(b"400", s.recv(200))

    def test_the_log_shows_a_callers_control_characters_escaped(self):
        # The request line and X-Forwarded-For are the caller's. Written raw, an escape sequence
        # rewrote the terminal, and a \r started a line of its own where xrnhub reads the log.
        forged = b'2026-11-06_01:09:14.23919 198.51.100.66 "POST /api/changes HTTP/1.1" 200 -'
        with unittest.mock.patch("sys.stderr", new_callable=io.StringIO) as log:
            for raw in (b"GET /a\x1b[2Jb HTTP/1.1\r\nX-Forwarded-For: 203.0.113.70\x1b]0;hi\x07\r\n\r\n",
                        b"GET /a\r" + forged + b" HTTP/1.1\r\n\r\n"):
                with socket.create_connection(("127.0.0.1", self.httpd.server_address[1]), timeout=10) as s:
                    s.sendall(raw)
                    while s.recv(4096):
                        pass
        text = log.getvalue()
        self.assertIn("203.0.113.70\\x1b]0;hi\\x07", text)
        self.assertIn("/a\\x1b[2Jb", text)
        self.assertIn("/a\\x0d2026-11-06", text)
        self.assertEqual([], [c for c in text if c != "\n" and (ord(c) < 0x20 or 0x7F <= ord(c) < 0xA0)])

    def test_no_answer_names_the_python_version(self):
        # The Server header said "<name>/1 Python/3.x.y" on every answer, error pages included.
        for method in ("GET", "PATCH"):  # PATCH: http.server's own 501 page
            conn = http.client.HTTPConnection("127.0.0.1", self.httpd.server_address[1], timeout=10)
            conn.request(method, "/health")
            res = conn.getresponse()
            res.read()
            conn.close()
            self.assertNotIn("Python", res.getheader("Server"), method)

    def test_everything_but_health_needs_the_login(self):
        self.assertEqual((200, b"ok"), self.call("GET", "/health", password=None)[:2])
        for path in ("/state", "/photos", "/photos/a.jpg", "/update/app.json", "/update/xrnhome-1.apk"):
            self.assertEqual(401, self.call("GET", path, password=None)[0], path)
            self.assertEqual(401, self.call("GET", path, password="nope")[0], path)

    def guess(self, forwarded, n=0):
        return self.call("GET", "/state", password=f"guess{n}", headers={"X-Forwarded-For": forwarded})[0]

    def test_a_made_up_forwarded_hop_is_not_a_new_address(self):
        for i in range(10):  # what a proxy that appends would pass on: the caller's own header first
            self.assertEqual(401, self.guess(f"198.51.100.{i}, 203.0.113.20", i))
        self.assertEqual(429, self.guess("198.51.100.200, 203.0.113.20", 10))
        self.assertEqual(401, self.guess("203.0.113.20, 203.0.113.21"))  # another caller isn't held

    def test_an_ipv6_guesser_is_its_64_not_each_address_in_it(self):
        for i in range(10):
            self.assertEqual(401, self.guess(f"2001:db8:1:2::{i + 1:x}", i))
        self.assertEqual(429, self.guess("2001:db8:1:2:aaaa::1", 10))
        self.assertEqual(401, self.guess("2001:db8:1:3::1"))  # the /64 next door isn't held
        self.assertEqual(401, self.guess("::ffff:203.0.113.40"))  # an IPv4 caller written as IPv6
        self.assertIn("203.0.113.40", srv.failures)  # ...is counted as that IPv4 address

    def test_a_name_that_isnt_there_costs_a_check_like_one_that_is(self):
        import bcrypt

        def checks(login):
            header = "Basic " + base64.b64encode(login.encode()).decode()
            with unittest.mock.patch.object(bcrypt, "checkpw", wraps=bcrypt.checkpw) as checkpw:
                self.assertIsNone(srv.check_login(header))
            return checkpw.call_count
        self.assertEqual(1, checks("alex:nope"))
        self.assertEqual(1, checks("nobody:nope"))  # none: the answer came sooner, and said so
        self.assertIsNone(srv.check_login("Basic " + base64.b64encode(b"nobody:secret").decode()))

    def test_the_same_wrong_password_again_costs_no_second_check(self):
        # A device still sending the password from before it was changed counts once against the
        # lockout, by design, but each of its tries ran bcrypt again, a third of a second of the
        # old phone's CPU every time.
        import bcrypt

        users = srv.args.users
        with unittest.mock.patch.object(bcrypt, "checkpw", wraps=bcrypt.checkpw) as checkpw:
            answers = [self.call("GET", "/state", password="before-the-change")[0] for _ in range(4)]
            self.assertEqual(([401] * 4, 1), (answers, checkpw.call_count))
            self.assertEqual(401, self.call("GET", "/state", password="another guess")[0])
            self.assertEqual(2, checkpw.call_count)  # a new one is checked
            # The users file changes, to the password that device has: it's checked again, and right.
            with open(users, "w") as f:
                f.write("alex:" + bcrypt.hashpw(b"before-the-change", bcrypt.gensalt(4)).decode() + "\n")
            os.utime(users, (time.time() + 5, time.time() + 5))
            self.assertEqual(200, self.call("GET", "/state", password="before-the-change")[0])

    def timed(self, addr, password):
        start = time.monotonic()
        status = self.call("GET", "/state", password=password, headers={"X-Forwarded-For": addr})[0]
        return status, time.monotonic() - start

    def test_a_request_with_no_password_isnt_held(self):
        # The hold after a wrong password slows a guesser down. One that sent no password, as the
        # browser's first try at the laptop version does, guessed nothing and was held all the same.
        srv.FAIL_DELAY_S = 0.5
        try:
            got, took = self.timed("203.0.113.60", None)
            self.assertEqual(401, got)
            self.assertLess(took, 0.4)
            got, took = self.timed("203.0.113.60", "nope")
            self.assertEqual(401, got)
            self.assertGreaterEqual(took, 0.5)
        finally:
            srv.FAIL_DELAY_S = 0

    def test_a_locked_out_address_is_answered_at_once(self):
        # Its login isn't checked, so holding the 429 slowed no guess down: it only parked a
        # thread for every request a flood sent.
        srv.failures["203.0.113.61"] = {str(i): (time.monotonic(), "alex") for i in range(srv.FAIL_LIMIT)}
        srv.FAIL_DELAY_S = 0.5
        try:
            for password in (None, "nope", RIGHT):
                got, took = self.timed("203.0.113.61", password)
                self.assertEqual(429, got)
                self.assertLess(took, 0.4, password)
        finally:
            srv.FAIL_DELAY_S = 0

    def test_only_a_few_wrong_logins_are_held_at_once(self):
        # Each held answer is a thread on the old phone. Many connections sending bad passwords
        # each held one for the whole delay.
        srv.FAIL_DELAY_S = 0.5
        held, srv.held = srv.held, threading.BoundedSemaphore(2)
        took = []
        try:
            burst = [threading.Thread(target=lambda n=n: took.append(self.timed(f"203.0.113.{100 + n}", "nope")[1]))
                     for n in range(6)]
            for t in burst:
                t.start()
            for t in burst:
                t.join()
        finally:
            srv.held = held
            srv.FAIL_DELAY_S = 0
        self.assertEqual(6, len(took))
        self.assertEqual(2, len([t for t in took if t >= 0.5]))

    def test_wrong_passwords_lock_the_address_out(self):
        srv.FAIL_LIMIT = 3
        try:
            for wrong in ("nope", "nope2", "nope3"):
                self.assertEqual(401, self.call("GET", "/state", password=wrong)[0])
            self.assertEqual(429, self.call("GET", "/state")[0])
        finally:
            srv.FAIL_LIMIT = 10

    def test_guesses_sent_all_at_once_are_counted_before_they_are_checked(self):
        # Checking one takes a while (bcrypt, 0.3s on the phone). Counted only once they had
        # failed, a burst sent together was all under the limit, and all of it got checked.
        srv.FAIL_LIMIT = 3
        real, checked, answers = srv.check_login, [], []

        def slow(header):
            checked.append(header)
            time.sleep(0.3)
            return real(header)

        srv.check_login = slow
        try:
            burst = [threading.Thread(target=lambda n=n: answers.append(self.call("GET", "/state", password=f"guess{n}")[0]))
                     for n in range(12)]
            for t in burst:
                t.start()
            for t in burst:
                t.join()
            self.assertEqual(3, len(checked))
            self.assertEqual([401] * 3 + [429] * 9, sorted(answers))
            self.assertEqual(429, self.call("GET", "/state")[0])
        finally:
            srv.check_login = real
            srv.FAIL_LIMIT = 10

    def test_an_old_password_sent_again_and_again_counts_once(self):
        # A device that still has the login from before the password changed isn't
        # someone guessing, and the address it locks out is everyone's behind Funnel.
        srv.FAIL_LIMIT = 3
        try:
            for _ in range(10):
                self.assertEqual(401, self.call("GET", "/state", password="old")[0])
            self.assertEqual(200, self.call("GET", "/state")[0])
        finally:
            srv.FAIL_LIMIT = 10

    def add_user(self, name, password):
        import bcrypt

        with open(srv.args.users, "a") as f:
            f.write(f"{name}:" + bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode() + "\n")

    def as_user(self, name, password, addr="203.0.113.80"):
        header = "Basic " + base64.b64encode(f"{name}:{password}".encode()).decode()
        return self.call("GET", "/state", password=None,
                         headers={"Authorization": header, "X-Forwarded-For": addr})[0]

    def test_a_right_login_clears_only_its_own_names_mistakes(self):
        # Any right login cleared its whole address's count: a second account (or a device
        # signing in) behind the same address gave a guesser all its guesses back.
        self.add_user("guest", "guestpass")
        for n in range(srv.FAIL_LIMIT - 1):
            self.assertEqual(401, self.as_user("alex", f"guess{n}"))
        self.assertEqual(200, self.as_user("guest", "guestpass"))
        self.assertEqual(401, self.as_user("alex", "guess-last"))
        self.assertEqual(429, self.as_user("alex", "one-more"))

    def test_a_right_password_clears_that_names_own_mistakes(self):
        for n in range(srv.FAIL_LIMIT - 1):
            self.assertEqual(401, self.as_user("alex", f"typo{n}"))
        self.assertEqual(200, self.as_user("alex", RIGHT))
        for n in range(srv.FAIL_LIMIT - 1):
            self.assertEqual(401, self.as_user("alex", f"again{n}"))

    def test_a_device_syncing_with_a_known_password_clears_nothing(self):
        # A device sends its password with every request. Once it's known right that's a session,
        # not a sign-in, and it cleared the count for its whole address every 30 seconds.
        self.assertEqual(200, self.as_user("alex", RIGHT))
        for n in range(srv.FAIL_LIMIT - 1):
            self.assertEqual(401, self.as_user("alex", f"guess{n}"))
        self.assertEqual(200, self.as_user("alex", RIGHT))
        self.assertEqual(401, self.as_user("alex", "guess-last"))
        self.assertEqual(429, self.as_user("alex", "one-more"))

    def test_a_login_being_checked_is_no_wrong_one(self):
        # Every login took a place in the count before it was checked: two devices signing in at
        # once at an address with a few mistakes behind it got 429 with the right password.
        self.add_user("guest", "guestpass")
        for n in range(srv.FAIL_LIMIT - 1):
            self.assertEqual(401, self.as_user("nobody", f"guess{n}"))
        real, answers = srv.check_login, []

        def slow(header):
            time.sleep(0.3)
            return real(header)

        srv.check_login = slow
        try:
            both = [threading.Thread(target=lambda u=u, p=p: answers.append(self.as_user(u, p)))
                    for u, p in (("alex", RIGHT), ("guest", "guestpass"))]
            for t in both:
                t.start()
            for t in both:
                t.join()
        finally:
            srv.check_login = real
        self.assertEqual([200, 200], answers)

    def test_releases_come_from_the_update_folder(self):
        os.makedirs(os.path.join(self.data, "update"))
        with open(os.path.join(self.data, "update", "app.json"), "w") as f:
            json.dump({"versionCode": 7, "apk": "xrnhome-7.apk"}, f)
        with open(os.path.join(self.data, "update", "xrnhome-7.apk"), "wb") as f:
            f.write(b"PK" + b"0" * 100)
        status, body, _ = self.call("GET", "/xrnhome/update/app.json")
        self.assertEqual((200, 7), (status, json.loads(body)["versionCode"]))
        status, body, headers = self.call("GET", "/update/xrnhome-7.apk")
        self.assertEqual((200, 102), (status, len(body)))
        self.assertEqual("application/vnd.android.package-archive", headers["Content-Type"])
        self.assertEqual(404, self.call("GET", "/update/../users")[0])
        self.assertEqual(404, self.call("GET", "/update/notes.txt")[0])

    def test_each_write_keeps_the_copy_it_replaced(self):
        v = '"0"'
        for n in range(srv.KEEP_VERSIONS + 5):
            _, _, headers = self.call("PUT", "/state", snapshot(f"item {n}"), {"If-Match": v})
            v = headers["ETag"]
        history = sorted(int(n[:-5]) for n in os.listdir(os.path.join(self.data, "users", "alex", "history")))
        self.assertEqual(srv.KEEP_VERSIONS, len(history))
        self.assertEqual(srv.KEEP_VERSIONS + 4, history[-1])
        daily = os.listdir(os.path.join(self.data, "users", "alex", "daily"))
        self.assertEqual(1, len(daily))
        with open(os.path.join(self.data, "users", "alex", "daily", daily[0])) as f:
            self.assertEqual("item 0", json.load(f)["data"]["items"][0]["name"])

    def test_a_copy_replaced_after_a_rollback_stays_in_the_history(self):
        # state.json put back from the day's first copy, version 1 (by hand, or by read_state after
        # damage), while the history held 5 to 24. The copy the next write replaced was filed as
        # 1.json and, the lowest number, deleted at once; until the version passed 24, every
        # replaced copy went the same way.
        v = '"0"'
        for n in range(srv.KEEP_VERSIONS + 5):
            v = self.call("PUT", "/state", snapshot(f"item {n}"), {"If-Match": v})[2]["ETag"]
        folder = os.path.join(self.data, "users", "alex")
        history = os.path.join(folder, "history")
        numbers = lambda: sorted(int(n[:-5]) for n in os.listdir(history))  # noqa: E731
        self.assertEqual(list(range(5, 25)), numbers())
        daily = os.path.join(folder, "daily")
        with open(os.path.join(daily, os.listdir(daily)[0]), encoding="utf-8") as f:
            first = f.read()
        with open(os.path.join(folder, "state.json"), "w", encoding="utf-8") as f:
            f.write(first)
        self.assertEqual(200, self.call("PUT", "/state", snapshot("after the rollback"), {"If-Match": '"1"'})[0])
        self.assertEqual([1] + list(range(6, 25)), numbers())  # the oldest filed goes instead: 5.json
        self.assertEqual(200, self.call("PUT", "/state", snapshot("and again"), {"If-Match": '"2"'})[0])
        self.assertEqual([1, 2] + list(range(7, 25)), numbers())
        with open(os.path.join(history, "1.json"), encoding="utf-8") as f:
            self.assertEqual("item 0", json.load(f)["data"]["items"][0]["name"])

    def test_photos_nothing_names_any_more_are_swept(self):
        folder = os.path.join(self.data, "users", "alex", "photos")
        for name in ("kept.jpg", "old.jpg", "new.jpg"):
            self.call("PUT", f"/photos/{name}", b"x", raw=True)
        old = time.time() - srv.PHOTO_GRACE_S - 60
        for name in ("kept.jpg", "old.jpg"):
            os.utime(os.path.join(folder, name), (old, old))
        self.call("PUT", "/state", snapshot("Milk", photo="kept.jpg"), {"If-Match": '"0"'})
        srv.prune_photos("alex", force=True)
        self.assertEqual(["kept.jpg", "new.jpg"], sorted(os.listdir(folder)))

    def old_photos(self, *names):
        folder = os.path.join(self.data, "users", "alex", "photos")
        old = time.time() - srv.PHOTO_GRACE_S - 60
        for name in names:
            self.call("PUT", f"/photos/{name}", b"x", raw=True)
            os.utime(os.path.join(folder, name), (old, old))
        return folder

    def test_the_sweep_reads_the_kept_copies_without_holding_up_the_others(self):
        # It parsed state.json and up to 80 kept copies under the lock every read and write waits
        # for, so on the phone a sweep held up every other request meanwhile.
        v = '"0"'
        for n in range(5):
            v = self.call("PUT", "/state", snapshot(f"item {n}"), {"If-Match": v})[2]["ETag"]
        folder = self.old_photos("gone.jpg")
        real, under_lock = srv.read_doc, []

        def watched(path):
            under_lock.append(srv.lock.locked())
            return real(path)

        with unittest.mock.patch.object(srv, "read_doc", watched):
            srv.prune_photos("alex", force=True)
        self.assertGreater(len(under_lock), 5)
        self.assertNotIn(True, under_lock)
        self.assertEqual([], os.listdir(folder))

    def test_a_write_during_the_sweep_keeps_the_photo_it_names(self):
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        self.call("PUT", "/state", snapshot("Milk", "Eggs"), {"If-Match": '"1"'})
        folder = self.old_photos("back.jpg")
        real, wrote = srv.read_doc, []

        def write_meanwhile(path):
            # An item with that old photo comes back (an undone delete on the laptop, say) while
            # the sweep is reading the copies that don't name it.
            if not wrote and "history" in path:
                wrote.append(self.call("PUT", "/state", snapshot("Milk", photo="back.jpg"), {"If-Match": '"2"'})[0])
            return real(path)

        with unittest.mock.patch.object(srv, "read_doc", write_meanwhile):
            srv.prune_photos("alex", force=True)
        self.assertEqual([200], wrote)
        self.assertEqual(["back.jpg"], os.listdir(folder))

    def test_a_copy_that_cant_be_read_is_kept_and_the_newest_kept_copy_stands_in(self):
        # It read as "version 0, empty": the count started again, and the next writes took the
        # numbers of the copies kept in history/.
        v = '"0"'
        for n in range(4):
            v = self.call("PUT", "/state", snapshot(f"item {n}"), {"If-Match": v})[2]["ETag"]
        folder = os.path.join(self.data, "users", "alex")
        with open(os.path.join(folder, "state.json"), "w") as f:
            f.write('{"version": 4, "data": {"items": [{"na')
        with unittest.mock.patch("sys.stderr", new_callable=io.StringIO) as log:
            status, body, headers = self.call("GET", "/state")
        self.assertEqual((200, '"3"', ["item 2"]),
                         (status, headers["ETag"], [i["name"] for i in json.loads(body)["items"]]))
        aside = [n for n in os.listdir(folder) if n.startswith("state.json.damaged-")]
        self.assertEqual(1, len(aside))
        with open(os.path.join(folder, aside[0])) as f:
            self.assertIn('"version": 4', f.read())
        self.assertIn("can't be read", log.getvalue())
        status, _, headers = self.call("PUT", "/state", snapshot("again"), {"If-Match": '"3"'})
        self.assertEqual((200, '"4"'), (status, headers["ETag"]))
        self.assertTrue(os.path.exists(os.path.join(folder, "history", "1.json")))

    def test_a_photo_waits_for_the_item_that_names_it(self):
        # The laptop sends a photo as it's picked, and the item a little later. Shut
        # in between, it can be away for days before the item follows.
        folder = os.path.join(self.data, "users", "alex", "photos")
        self.call("PUT", "/photos/waiting.jpg", b"x", raw=True)
        days_ago = time.time() - 3 * 86400
        os.utime(os.path.join(folder, "waiting.jpg"), (days_ago, days_ago))
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        srv.prune_photos("alex", force=True)
        self.assertEqual(["waiting.jpg"], os.listdir(folder))
        self.call("PUT", "/state", snapshot("Milk", photo="waiting.jpg"), {"If-Match": '"1"'})
        self.assertEqual(200, self.call("GET", "/photos/waiting.jpg")[0])

    # ---- device logins (DeviceTokens) ---------------------------------------------------------

    def tokens_path(self):
        return os.path.join(os.path.dirname(srv.args.users), "device-tokens.json")

    def write_tokens(self, entries):
        """device-tokens.json as the server's owner writes it: a new file in the old one's place."""
        with open(self.tokens_path() + ".test", "w", encoding="utf-8") as f:
            f.write(entries if isinstance(entries, str) else json.dumps({"tokens": entries}))
        os.replace(self.tokens_path() + ".test", self.tokens_path())

    @staticmethod
    def a_token(services=("xrnhome",), user="alex"):
        """(a device token, its entry in the file)."""
        token_id = os.urandom(4).hex()
        secret = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
        entry = {"id": token_id, "user": user, "device": f"device {token_id}", "services": list(services),
                 "sha256": hashlib.sha256(secret.encode()).hexdigest(), "created": 1764115200}
        return f"xrndev_{token_id}_{secret}", entry

    def device_call(self, auth, addr, method="GET", path="/state", body=b"", **headers):
        """(status, body, headers) of a request sent with Authorization: [auth], from [addr]."""
        conn = http.client.HTTPConnection("127.0.0.1", self.httpd.server_address[1], timeout=10)
        conn.request(method, path, body=body, headers={"Authorization": auth, "X-Forwarded-For": addr, **headers})
        res = conn.getresponse()
        answer = res.status, res.read(), res
        conn.close()
        return answer

    def bearer(self, token, addr, **kw):
        return self.device_call(f"Bearer {token}", addr, **kw)[0]

    def with_password(self, addr, **kw):
        return self.device_call("Basic " + base64.b64encode(b"alex:secret").decode(), addr, **kw)[0]

    def test_a_device_token_signs_in_as_its_user(self):
        token, entry = self.a_token()
        self.write_tokens([entry])
        status, body, _ = self.device_call(f"Bearer {token}", "198.18.7.1", path="/xrnhome/state")
        self.assertEqual(200, status)
        self.assertEqual(self.device_call("Basic " + base64.b64encode(b"alex:secret").decode(), "198.18.7.1")[1], body, "alex's, as the password reads them")

    def test_a_token_for_other_services_is_refused_and_guessed_nothing(self):
        token, entry = self.a_token(services=("xrnrule", "xrnnote"))
        self.write_tokens([entry])
        addr = "198.18.7.2"
        for _ in range(srv.FAIL_LIMIT + 2):
            status, body, res = self.device_call(f"Bearer {token}", addr)
            self.assertEqual(403, status)
            self.assertIn(b"xrnhome", body)
            self.assertIsNone(res.getheader("WWW-Authenticate"))
        self.assertEqual(200, self.with_password(addr), "not locked out: it guessed nothing")

    def test_a_wrong_token_is_a_wrong_login(self):
        token, entry = self.a_token()
        self.write_tokens([entry])
        addr = "198.18.7.3"
        wrong = [f"{token[:16]}{self.a_token()[0][16:]}",  # its id, another secret
                 "xrnhub_" + token[7:],  # another kind of token
                 "not-a-token"]
        wrong += [self.a_token()[0] for _ in range(srv.FAIL_LIMIT)]  # ids that aren't there
        for guess in wrong[:srv.FAIL_LIMIT]:  # each a new one, not one wrong login sent again
            self.assertEqual(401, self.bearer(guess, addr))
        self.assertEqual(429, self.bearer(token, addr), "locked out, the right token too, as with a password")
        self.assertEqual(200, self.bearer(token, "198.18.7.4"))

    def test_a_revoked_token_sent_again_and_again_counts_once(self):
        # As a password from before it was changed: a device that hasn't heard of the revoke goes
        # on sending the same token, which mustn't lock the household's address out.
        token, entry = self.a_token()
        self.write_tokens([])
        addr = "198.18.7.13"
        for _ in range(srv.FAIL_LIMIT + 3):
            self.assertEqual(401, self.bearer(token, addr))
        self.assertEqual(200, self.with_password(addr))

    def test_a_revoked_token_is_refused_from_its_next_request(self):
        token, entry = self.a_token()
        other, kept = self.a_token()
        self.write_tokens([entry, kept])
        self.assertEqual(200, self.bearer(token, "198.18.7.5"))
        self.write_tokens([kept])  # revoked, and nothing restarted
        self.assertEqual(401, self.bearer(token, "198.18.7.5"))
        self.assertEqual(200, self.bearer(other, "198.18.7.5"))

    def test_a_tokens_user_must_be_in_the_users_file(self):
        import bcrypt

        token, entry = self.a_token(user="sam")
        self.write_tokens([entry])
        self.assertEqual(401, self.bearer(token, "198.18.7.6"), "no sam in the users file")
        with open(srv.args.users, encoding="utf-8") as f:
            before = f.read()
        try:
            with open(srv.args.users, "a", encoding="utf-8") as f:
                f.write("sam:" + bcrypt.hashpw(b"other", bcrypt.gensalt(4)).decode() + "\n")
            self.assertEqual(200, self.bearer(token, "198.18.7.6"))
        finally:
            with open(srv.args.users + ".test", "w", encoding="utf-8") as f:
                f.write(before)
            os.replace(srv.args.users + ".test", srv.args.users)
        self.assertEqual(401, self.bearer(token, "198.18.7.6"), "taken out of it, sam's tokens end")

    def test_a_tokens_file_that_cant_be_read_lets_no_token_in_and_the_password_still_works(self):
        token, entry = self.a_token()
        addr = "198.18.7.7"
        broken = ("{not json", '{"tokens": {}}', "[1]")
        with unittest.mock.patch("sys.stderr", new_callable=io.StringIO) as log:
            for doc in broken:
                self.write_tokens(doc)
                self.assertEqual(401, self.bearer(token, addr))
                self.assertEqual(401, self.bearer(token, addr))
                self.assertEqual(200, self.with_password(addr))
        self.assertEqual(len(broken), log.getvalue().count("can't be read, so no device token signs in"),
                         "a line for each, not for each request")
        self.write_tokens([entry])
        self.assertEqual(200, self.bearer(token, "198.18.7.8"))
        os.remove(self.tokens_path())
        self.assertEqual(401, self.bearer(token, "198.18.7.8"), "no file, no tokens")

    def test_an_entry_not_as_it_should_be_signs_no_one_in(self):
        token, entry = self.a_token()
        for bad in (dict(entry, sha256="\u00e9" * 64), dict(entry, sha256=entry["sha256"].upper()),
                    dict(entry, user="../alex"), dict(entry, user=["alex"]), dict(entry, services="xrnhome"),
                    {k: v for k, v in entry.items() if k != "services"}):
            self.write_tokens([bad, "not an entry"])
            self.assertEqual(401, self.bearer(token, "198.18.7.9"), bad)

    def test_when_a_device_was_last_here_is_written_down_now_and_then(self):
        token, entry = self.a_token()
        gone, revoked = self.a_token()
        self.write_tokens([entry, revoked])
        seen = os.path.join(os.path.dirname(srv.args.users), "device-seen", "xrnhome.json")

        def written():
            st = os.stat(seen)
            with open(seen, encoding="utf-8") as f:
                return (st.st_ino, st.st_mtime_ns), json.load(f), st.st_mode & 0o777

        start = int(time.time())
        self.assertEqual(200, self.bearer(gone, "198.18.7.11"))
        self.assertEqual(200, self.bearer(token, "198.18.7.11"))
        stamp, doc, mode = written()
        self.assertGreaterEqual(doc[entry["id"]], start)
        self.assertIn(revoked["id"], doc)
        self.assertEqual(0o600, mode)
        for _ in range(3):
            self.assertEqual(200, self.bearer(token, "198.18.7.11"))
        self.assertEqual(stamp, written()[0], "not written again within DEVICE_SEEN_S")
        self.write_tokens([entry])
        with unittest.mock.patch.object(srv, "DEVICE_SEEN_S", 0):
            self.assertEqual(200, self.bearer(token, "198.18.7.11"))
        stamp2, doc, _ = written()
        self.assertNotEqual(stamp, stamp2)
        self.assertEqual([entry["id"]], list(doc), "a revoked token's time goes with it")
        with open(seen, encoding="utf-8") as f:
            self.assertNotIn(token[16:], f.read())

    def test_a_token_never_reaches_the_log(self):
        token, entry = self.a_token()
        self.write_tokens([entry])
        wrong = self.a_token()[0]
        with unittest.mock.patch("sys.stderr", new_callable=io.StringIO) as log:
            self.assertEqual(200, self.bearer(token, "198.18.7.12"))
            self.assertEqual(401, self.bearer(wrong, "198.18.7.12"))
            time.sleep(0.05)
        self.assertIn("/state", log.getvalue())
        for secret in (token[16:], wrong[16:]):
            self.assertNotIn(secret, log.getvalue())


if __name__ == "__main__":
    unittest.main()
