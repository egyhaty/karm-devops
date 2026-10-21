"""Local HTTP contract tests; all cloud/token operations are mocked."""
import importlib.util
import json
from pathlib import Path
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

spec = importlib.util.spec_from_file_location('cloud_app', Path(__file__).parents[1] / 'labs/azure-app/app.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class AppContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path):
        try:
            with urlopen(self.base + path, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_health_does_not_request_cloud_identity(self):
        with patch.object(app, 'storage_status') as cloud:
            self.assertEqual(self.request('/healthz'), (200, {'status': 'ok'}))
            cloud.assert_not_called()

    def test_data_access_reports_status_without_payload_or_token(self):
        with patch.dict(app.os.environ, LAB_STORAGE_ACCOUNT='testaccount'), patch.object(app, 'storage_status', return_value=200):
            self.assertEqual(self.request('/storage-check'), (200, {'storageStatus': 200}))

    def test_access_denial_is_not_a_successful_readiness_check(self):
        denial = HTTPError('https://private.invalid', 403, 'secret-token-must-not-leak', {}, None)
        with patch.dict(app.os.environ, LAB_STORAGE_ACCOUNT='testaccount'), patch.object(app, 'storage_status', side_effect=denial):
            status, body = self.request('/storage-check')
            self.assertEqual(status, 503)
            self.assertEqual(body['storageStatus'], 403)
            self.assertNotIn('secret-token', json.dumps(body))

    def test_unknown_path_is_404(self):
        self.assertEqual(self.request('/missing')[0], 404)


if __name__ == '__main__':
    unittest.main()
