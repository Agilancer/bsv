"""Static dev server for BATTLESHIP VELSCOUR (no build step).

    python tools/serve.py [port]      # default 8420, then open http://localhost:8420/
"""
import http.server
import os
import socketserver
import sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8420


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', port), Handler) as server:
    print(f'BATTLESHIP VELSCOUR on http://localhost:{port}/')
    server.serve_forever()
