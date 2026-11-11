"""Tests for xrnhome-sync.py: the If-Match rule, photos, kept copies, releases, logins.

    python3 -m unittest server/test_xrnhome_sync.py     (from the repo root; needs bcrypt)
"""
import base64
import importlib.util
import json
import os
import tempfile
import threading
import time
import unittest
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

    def test_everything_but_health_needs_the_login(self):
        self.assertEqual((200, b"ok"), self.call("GET", "/health", password=None)[:2])
        for path in ("/state", "/photos", "/photos/a.jpg", "/update/app.json", "/update/xrnhome-1.apk"):
            self.assertEqual(401, self.call("GET", path, password=None)[0], path)
            self.assertEqual(401, self.call("GET", path, password="nope")[0], path)

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
