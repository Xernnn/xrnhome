"""Tests for xrnhome-sync.py: the If-Match rule, photos, kept copies, releases, logins.

    python3 -m unittest server/test_xrnhome_sync.py     (from the repo root; needs bcrypt)
"""
import base64
import http.client
import importlib.util
import io
import json
import os
import socket
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
            f.write("sonn:" + bcrypt.hashpw(RIGHT.encode(), bcrypt.gensalt(4)).decode() + "\n")
        self.data = os.path.join(self.tmp.name, "data")
        srv.args = type("Args", (), {"data": self.data, "users": users})()
        srv.FAIL_DELAY_S = 0
        srv.failures.clear()
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
            req.add_header("Authorization", "Basic " + base64.b64encode(f"sonn:{password}".encode()).decode())
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

    def test_photos_go_up_and_come_back(self):
        self.assertEqual((200, []), (lambda r: (r[0], json.loads(r[1])))(self.call("GET", "/photos")))
        jpeg = b"\xff\xd8\xff" + os.urandom(5000)
        status, _, _ = self.call("PUT", "/photos/1730-abc.jpg", jpeg, {"Content-Type": "application/octet-stream"}, raw=True)
        self.assertEqual(201, status)
        self.assertEqual(["1730-abc.jpg"], json.loads(self.call("GET", "/photos")[1]))
        status, body, headers = self.call("GET", "/photos/1730-abc.jpg")
        self.assertEqual((200, jpeg, "image/jpeg"), (status, body, headers["Content-Type"]))
        self.assertEqual(404, self.call("GET", "/photos/nope.jpg")[0])

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
        self.assertEqual(1, checks("sonn:nope"))
        self.assertEqual(1, checks("nobody:nope"))  # none: the answer came sooner, and said so
        self.assertIsNone(srv.check_login("Basic " + base64.b64encode(b"nobody:secret").decode()))

    def test_a_request_with_no_password_isnt_held(self):
        # The hold after a wrong password slows a guesser down. One that sent no password, as the
        # browser's first try at the laptop version does, guessed nothing and was held all the same.
        def timed(addr, password):
            start = time.monotonic()
            status = self.call("GET", "/state", password=password, headers={"X-Forwarded-For": addr})[0]
            return status, time.monotonic() - start
        srv.failures["203.0.113.61"] = {str(i): time.monotonic() for i in range(srv.FAIL_LIMIT)}  # locked out
        srv.FAIL_DELAY_S = 0.5
        try:
            for addr, status in (("203.0.113.60", 401), ("203.0.113.61", 429)):
                got, took = timed(addr, None)
                self.assertEqual(status, got)
                self.assertLess(took, 0.4, addr)
                got, took = timed(addr, "nope")
                self.assertEqual(status, got)
                self.assertGreaterEqual(took, 0.5, addr)
        finally:
            srv.FAIL_DELAY_S = 0

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
        history = sorted(int(n[:-5]) for n in os.listdir(os.path.join(self.data, "users", "sonn", "history")))
        self.assertEqual(srv.KEEP_VERSIONS, len(history))
        self.assertEqual(srv.KEEP_VERSIONS + 4, history[-1])
        daily = os.listdir(os.path.join(self.data, "users", "sonn", "daily"))
        self.assertEqual(1, len(daily))
        with open(os.path.join(self.data, "users", "sonn", "daily", daily[0])) as f:
            self.assertEqual("item 0", json.load(f)["data"]["items"][0]["name"])

    def test_photos_nothing_names_any_more_are_swept(self):
        folder = os.path.join(self.data, "users", "sonn", "photos")
        for name in ("kept.jpg", "old.jpg", "new.jpg"):
            self.call("PUT", f"/photos/{name}", b"x", raw=True)
        old = time.time() - srv.PHOTO_GRACE_S - 60
        for name in ("kept.jpg", "old.jpg"):
            os.utime(os.path.join(folder, name), (old, old))
        self.call("PUT", "/state", snapshot("Milk", photo="kept.jpg"), {"If-Match": '"0"'})
        srv.prune_photos("sonn", force=True)
        self.assertEqual(["kept.jpg", "new.jpg"], sorted(os.listdir(folder)))

    def test_a_photo_waits_for_the_item_that_names_it(self):
        # The laptop sends a photo as it's picked, and the item a little later. Shut
        # in between, it can be away for days before the item follows.
        folder = os.path.join(self.data, "users", "sonn", "photos")
        self.call("PUT", "/photos/waiting.jpg", b"x", raw=True)
        days_ago = time.time() - 3 * 86400
        os.utime(os.path.join(folder, "waiting.jpg"), (days_ago, days_ago))
        self.call("PUT", "/state", snapshot("Milk"), {"If-Match": '"0"'})
        srv.prune_photos("sonn", force=True)
        self.assertEqual(["waiting.jpg"], os.listdir(folder))
        self.call("PUT", "/state", snapshot("Milk", photo="waiting.jpg"), {"If-Match": '"1"'})
        self.assertEqual(200, self.call("GET", "/photos/waiting.jpg")[0])


if __name__ == "__main__":
    unittest.main()
