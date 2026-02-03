from http.server import HTTPServer, SimpleHTTPRequestHandler
import sys

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS (для локальной разработки / простого хостинга)
        self.send_header('Access-Control-Allow-Origin', '*')

        # Кэширование статики: ускоряет повторные заходы и экономит трафик.
        # HTML лучше не кэшировать агрессивно, чтобы изменения подтягивались сразу.
        path = self.path.split('?', 1)[0].lower()
        if path.endswith(('.css', '.js', '.webp', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.woff', '.ttf', '.otf', '.ico')):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        else:
            self.send_header('Cache-Control', 'no-cache')

        super().end_headers()

if __name__ == '__main__':
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    
    # Force localhost for safety and clearer debugging
    host = '127.0.0.1' 
    server_address = (host, port)
    
    print(f"Attempting to start server on {host}:{port}...")
    try:
        httpd = HTTPServer(server_address, CORSRequestHandler)
        print(f"Serving HTTP on http://{host}:{port} ...")
        httpd.serve_forever()
    except Exception as e:
        print(f"Failed to start server: {e}")
