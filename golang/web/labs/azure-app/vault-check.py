"""Run only INSIDE the sandbox VM: python3 vault-check.py VAULT [--seed]."""
import json
import re
import sys
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

if len(sys.argv) not in (2, 3) or not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]', sys.argv[1]):
    raise SystemExit('Usage: python3 vault-check.py VAULT [--seed]')
if len(sys.argv) == 3 and sys.argv[2] != '--seed':
    raise SystemExit('Unknown option')
opener = build_opener(ProxyHandler({}))
request = Request(
    'http://169.254.169.254/metadata/identity/oauth2/token'
    '?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net',
    headers={'Metadata': 'true'},
)
with opener.open(request, timeout=5) as response:
    token = json.load(response)['access_token']
url = f'https://{sys.argv[1]}.vault.azure.net/secrets/lab-sample?api-version=7.4'
headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
# This disposable string is deliberately not a credential. Real secrets must
# never be passed in command arguments or copied into this script.
data = json.dumps({'value': 'cloud-learning-not-a-secret'}).encode() if '--seed' in sys.argv else None
try:
    with opener.open(Request(url, headers=headers, data=data, method='PUT' if data else 'GET'), timeout=5) as response:
        result = json.load(response)
        print(json.dumps({'status': response.status, 'secretVersionId': result.get('id')}))
except HTTPError as error:
    print(json.dumps({'status': error.code, 'message': 'Vault request denied; inspect role/network separately'}))
    raise SystemExit(1)
