from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, threading, webbrowser

ROOT=Path(__file__).resolve().parent
PAGE="crown-pointe-cinema-v3.html"
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[Crown Pointe V3]", fmt % args)

server=ThreadingHTTPServer(("127.0.0.1",0), Handler)
port=server.server_address[1]
url=f"http://127.0.0.1:{port}/{PAGE}"
print(f"Crown Pointe Cinema V3: {url}")
print("Keep this window open while reviewing the map.")
threading.Timer(.45, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
