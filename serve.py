from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys
import json
from urllib.request import Request, urlopen
from urllib.error import URLError

REMARKED_API = 'https://app.remarked.ru/api/v1/ApiReservesWidget'
REMARKED_ORIGIN = 'https://maxmaev7-coder.github.io'
REMARKED_REFERER = 'https://maxmaev7-coder.github.io/sanapiro/booking.html'

class CORSRequestHandler(SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/remarked':
            self._proxy_remarked()
            return
        self.send_error(404)

    def _proxy_remarked(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b''

            req = Request(
                REMARKED_API,
                data=body,
                headers={
                    'Content-Type': 'application/json',
                    'Origin': REMARKED_ORIGIN,
                    'Referer': REMARKED_REFERER,
                },
                method='POST',
            )

            with urlopen(req, timeout=15) as resp:
                data = resp.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(data)

        except URLError as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode())

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')

        path = self.path.split('?', 1)[0].lower()
        # В dev нельзя кэшировать JS/CSS, иначе изменения в виджете не подтягиваются.
        if path.endswith(('.js', '.css', '.html')):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        elif path.endswith(('.webp', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.woff', '.ttf', '.otf', '.ico')):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        else:
            self.send_header('Cache-Control', 'no-cache')

        super().end_headers()

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    host = '127.0.0.1'
    server_address = (host, port)

    print(f"Attempting to start server on {host}:{port}...")
    print(f"ReMarked API proxy: POST /api/remarked -> {REMARKED_API}")
    try:
        httpd = HTTPServer(server_address, CORSRequestHandler)
        print(f"Serving HTTP on http://{host}:{port} ...")
        httpd.serve_forever()
    except Exception as e:
        print(f"Failed to start server: {e}")
