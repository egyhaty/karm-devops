"""Disposable private app: no credentials, no token/payload logging."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, ProxyHandler, build_opener


def storage_status(account):
    # IMDS must bypass proxies. Tokens stay in memory and never enter responses.
    opener = build_opener(ProxyHandler({}))
    token_request = Request(
        'http://169.254.169.254/metadata/identity/oauth2/token'
        '?api-version=2018-02-01&resource=https%3A%2F%2Fstorage.azure.com%2F',
        headers={'Metadata': 'true'},
    )
    with opener.open(token_request, timeout=5) as response:
        token = json.load(response)['access_token']
    request = Request(
        f'https://{account}.blob.core.windows.net/lab?restype=container&comp=list&maxresults=1',
        headers={'Authorization': f'Bearer {token}', 'x-ms-version': '2023-11-03'},
    )
    with opener.open(request, timeout=5) as response:
        return response.status


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/healthz':
            status, body = 200, {'status': 'ok'}
        elif self.path == '/storage-check':
            try:
                upstream = storage_status(os.environ['LAB_STORAGE_ACCOUNT'])
                status, body = 200, {'storageStatus': upstream}
            except HTTPError as error:
                status, body = 503, {'storageStatus': error.code, 'status': 'upstream denied'}
            except (URLError, TimeoutError, KeyError, ValueError):
                status, body = 503, {'status': 'storage unavailable'}
        else:
            status, body = 404, {'status': 'not found'}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass  # No request headers, query strings or upstream credentials in logs.


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
