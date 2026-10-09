"""Local dev server: serves the project folder with caching turned off, so the
browser always picks up the latest index.html and scripts after an edit."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5179
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
