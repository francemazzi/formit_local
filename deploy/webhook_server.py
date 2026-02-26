#!/usr/bin/env python3
"""
GitHub Webhook receiver for auto-deploy.
Listens on port 9000, verifies HMAC-SHA256 signature,
and triggers deploy.sh on push to main.
"""

import hmac
import hashlib
import json
import os
import subprocess
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
DEPLOY_LOCK = threading.Lock()
REPO_DIR = os.environ.get("REPO_DIR", "/repo")
LOG_FILE = "/app/deploy.log"


class WebhookHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path == "/hooks/health":
            self._respond(200, {"status": "ok", "service": "deploy-webhook"})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != "/hooks/deploy":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        signature_header = self.headers.get("X-Hub-Signature-256", "")
        if not self._verify_signature(body, signature_header):
            self._respond(403, {"error": "Invalid signature"})
            return

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, {"error": "Invalid JSON"})
            return

        event = self.headers.get("X-GitHub-Event", "")
        if event == "ping":
            self._respond(200, {"status": "pong"})
            return

        if event != "push":
            self._respond(200, {"status": "ignored", "reason": f"event={event}"})
            return

        ref = payload.get("ref", "")
        if ref != "refs/heads/main":
            self._respond(200, {"status": "ignored", "reason": f"ref={ref}"})
            return

        if not DEPLOY_LOCK.acquire(blocking=False):
            self._respond(409, {"error": "Deploy already in progress"})
            return

        commit = payload.get("after", "unknown")[:7]
        self._respond(202, {"status": "deploying", "commit": commit})

        thread = threading.Thread(target=self._run_deploy, args=(commit,), daemon=True)
        thread.start()

    def _respond(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _verify_signature(self, body, signature_header):
        if not WEBHOOK_SECRET:
            print("WARNING: WEBHOOK_SECRET not set, rejecting request")
            return False
        if not signature_header.startswith("sha256="):
            return False
        expected = "sha256=" + hmac.new(
            WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature_header)

    def _run_deploy(self, commit):
        try:
            print(f"[DEPLOY] Starting deploy for commit {commit}")
            result = subprocess.run(
                ["/app/deploy.sh"],
                cwd=REPO_DIR,
                capture_output=True,
                text=True,
                timeout=900,
            )
            status = "SUCCESS" if result.returncode == 0 else "FAILED"
            print(f"[DEPLOY] {status} for commit {commit}")
            if result.stdout:
                print(f"[DEPLOY] stdout:\n{result.stdout}")
            if result.stderr:
                print(f"[DEPLOY] stderr:\n{result.stderr}")

            with open(LOG_FILE, "a") as f:
                f.write(f"\n{'='*60}\n")
                f.write(f"Deploy at {time.strftime('%Y-%m-%d %H:%M:%S')} for commit {commit}\n")
                f.write(f"Status: {status} (exit code {result.returncode})\n")
                f.write(f"STDOUT:\n{result.stdout}\n")
                if result.stderr:
                    f.write(f"STDERR:\n{result.stderr}\n")
        except subprocess.TimeoutExpired:
            print(f"[DEPLOY] TIMEOUT for commit {commit} (>900s)")
        except Exception as e:
            print(f"[DEPLOY] ERROR: {e}")
        finally:
            DEPLOY_LOCK.release()

    def log_message(self, format, *args):
        print(f"[WEBHOOK] {args[0]} {args[1]} {args[2]}")


if __name__ == "__main__":
    port = int(os.environ.get("WEBHOOK_PORT", "9000"))
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    print(f"Webhook server listening on port {port}")
    server.serve_forever()
