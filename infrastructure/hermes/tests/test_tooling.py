import concurrent.futures
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]

def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

store, codex, render, bootstrap = [module(n) for n in ['store', 'codex_task', 'render', 'bootstrap']]

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'assistant.db'

    def tearDown(self):
        self.temp.cleanup()

    def job(self, url='https://EMPLOYER.example/job/42?utm_source=x&lang=en#apply'):
        return {'kind': 'job', 'key': url, 'title': 'Linux Engineer',
                'details': {'company': 'Example', 'gaps': ['Azure production']}}

    def test_dedup_preserves_history_and_does_not_claim_application(self):
        with closing(store.connect(self.path)) as db:
            first = store.put(db, self.job())
            second = store.put(db, self.job('https://employer.example/job/42?lang=en'))
            self.assertEqual(first['id'], second['id'])
            self.assertEqual(second['status'], 'new')
            self.assertEqual(len(store.find(db)), 1)
            self.assertEqual(db.execute('SELECT count(*) FROM history').fetchone()[0], 2)

    def test_meaningful_job_query_arguments_remain_distinct(self):
        self.assertNotEqual(store.canonical_url('https://example.test/job?id=1'),
                            store.canonical_url('https://example.test/job?id=2'))

    def test_invalid_record_rejected_without_write(self):
        for record in [dict(self.job(), status='sent'), dict(self.job(), due_at='2026-11-01T20:00:00'),
                       dict(self.job(), details={'score': float('nan')}),
                       dict(self.job(), key='https://token:password@example.test/job'),
                       dict(self.job(), unexpected='value')]:
            with self.subTest(record=record), closing(store.connect(self.path)) as db:
                with self.assertRaises(ValueError):
                    store.put(db, record)
                self.assertEqual(len(store.find(db)), 0)

    def test_due_dates_normalized_before_comparison(self):
        with closing(store.connect(self.path)) as db:
            store.put(db, {'kind': 'task', 'key': 'study', 'title': 'IAM lab',
                           'due_at': '2026-11-01T20:00:00+02:00'})
            self.assertEqual(len(store.find(db, due_before='2026-11-01T18:01:00Z')), 1)
            self.assertEqual(len(store.find(db, due_before='2026-11-01T17:59:00Z')), 0)

    def test_search_treats_wildcards_and_sql_as_data(self):
        with closing(store.connect(self.path)) as db:
            store.put(db, self.job())
            self.assertEqual(store.find(db, query="%' OR 1=1 --"), [])
            self.assertEqual(len(store.find(db, query='Linux')), 1)

    def test_concurrent_job_imports_have_one_identity(self):
        with closing(store.connect(self.path)):
            pass
        def write(_):
            with closing(store.connect(self.path)) as db:
                return store.put(db, self.job())['id']
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(write, range(8)))
        self.assertEqual(len(set(ids)), 1)
        with closing(store.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM history').fetchone()[0], 8)

    def test_export_import_roundtrip(self):
        with closing(store.connect(self.path)) as db:
            store.put(db, self.job())
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
        command = [sys.executable, str(ROOT / 'scripts/store.py'), '--db', str(self.path)]
        result = subprocess.run(command + ['export'], capture_output=True, text=True, env=env, check=True)
        data = Path(self.temp.name) / 'records.json'
        data.write_text(result.stdout)
        subprocess.run(command + ['import', '--file', str(data)], capture_output=True, env=env, check=True)
        with closing(store.connect(self.path)) as db:
            self.assertEqual(len(store.find(db)), 1)

class CodexTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.repo)], check=True)
        (self.repo / 'README.md').write_text('fixture\n')
        subprocess.run(['git', '-C', str(self.repo), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.repo), '-c', 'user.name=Fixture',
                        '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture'], check=True)
        self.brief = {'repo': str(self.repo), 'goal': 'Add documentation',
                      'acceptance': ['Document the API'], 'allowed_paths': ['docs']}

    def tearDown(self):
        self.temp.cleanup()

    def test_sandbox_is_fixed_and_prompt_not_interpolated(self):
        command = codex.build_command(self.repo, self.root / 'output.md')
        self.assertIn('workspace-write', command)
        self.assertNotIn('danger-full-access', command)
        self.assertEqual(command[-1], '-')

    def test_clean_scoped_repo_and_scope_check(self):
        repo, allowed = codex.validate_brief(self.brief, self.root)
        self.assertEqual(repo, self.repo.resolve())
        self.assertEqual(codex.outside_scope(['docs/api.md', 'docs-old/x', '.env'], allowed),
                         ['docs-old/x', '.env'])
        (self.repo / 'untracked').write_text('x')
        with self.assertRaises(ValueError):
            codex.validate_brief(self.brief, self.root)

    def test_outside_root_and_traversal_are_rejected(self):
        with self.assertRaises(ValueError):
            codex.validate_brief(self.brief, self.repo)
        for value in ['../secret', '/etc', '.git/config', 'docs/../../secret']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                codex.clean_relative(value)

    def test_child_does_not_inherit_unrelated_credentials(self):
        with patch.dict(os.environ, {'TELEGRAM_BOT_TOKEN': 'fixture-only',
                                    'OPENAI_API_KEY': 'fixture-only', 'AWS_SECRET_ACCESS_KEY': 'fixture-only'}):
            env = codex.child_env(self.root / 'isolated-home')
        self.assertNotIn('TELEGRAM_BOT_TOKEN', env)
        self.assertNotIn('OPENAI_API_KEY', env)
        self.assertNotIn('AWS_SECRET_ACCESS_KEY', env)

    def test_dry_run_never_launches_codex(self):
        file = self.root / 'brief.json'
        file.write_text(json.dumps(self.brief))
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/codex_task.py'),
            '--brief', str(file), '--repos-root', str(self.root)], capture_output=True, text=True,
            env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'), check=True)
        self.assertEqual(json.loads(result.stdout)['mode'], 'dry-run')
        self.assertFalse((self.root / 'isolated-home').exists())

    def test_execute_reports_out_of_scope_without_rollback(self):
        # Exercise the real CLI orchestration with an uncredentialed fixture
        # binary; never invoke the real Codex or a model in this test.
        bindir = self.root / 'bin'
        bindir.mkdir()
        stub = bindir / 'codex'
        stub.write_text('#!' + sys.executable + '\nimport pathlib,sys\n'
                        'sys.stdin.read()\npathlib.Path("outside.txt").write_text("fixture")\n')
        stub.chmod(0o700)
        brief = self.root / 'brief.json'
        brief.write_text(json.dumps(self.brief))
        env = dict(os.environ, PATH=str(bindir) + os.pathsep + os.environ['PATH'],
                   PYTHONDONTWRITEBYTECODE='1')
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/codex_task.py'),
            '--brief', str(brief), '--repos-root', str(self.root), '--execute',
            '--codex-home', str(self.root / 'codex-home'), '--output-dir', str(self.root / 'runs')],
            capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 3, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report['out_of_scope'], ['outside.txt'])
        self.assertFalse(report['acceptance_verified'])
        self.assertTrue((self.repo / 'outside.txt').exists())

    def test_symlink_scope_cannot_escape_repository(self):
        (self.repo / 'external').symlink_to(self.root, target_is_directory=True)
        subprocess.run(['git', '-C', str(self.repo), 'add', 'external'], check=True)
        subprocess.run(['git', '-C', str(self.repo), '-c', 'user.name=Fixture',
                        '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture symlink'], check=True)
        brief = dict(self.brief, allowed_paths=['external/new-file'])
        with self.assertRaises(ValueError):
            codex.validate_brief(brief, self.root)

class DeploymentTests(unittest.TestCase):
    def settings(self):
        result = json.loads((ROOT / 'config/deployment.example.json').read_text())
        result.update(image='registry.example.test/hermes@sha256:' + 'a' * 64,
                      provider='fixture-provider', model='fixture-model')
        return result

    def test_stopped_manifest_has_persistence_and_no_cluster_credentials(self):
        manifest = render.render(self.settings())
        deployment = next(x for x in manifest['items'] if x['kind'] == 'Deployment')
        self.assertEqual(deployment['spec']['replicas'], 0)
        self.assertEqual(deployment['spec']['strategy']['type'], 'Recreate')
        pod = deployment['spec']['template']['spec']
        self.assertFalse(pod['automountServiceAccountToken'])
        self.assertTrue(pod['securityContext']['runAsNonRoot'])
        self.assertTrue(pod['containers'][0]['securityContext']['readOnlyRootFilesystem'])
        self.assertTrue(any('persistentVolumeClaim' in v for v in pod['volumes']))
        config = json.loads(next(x for x in manifest['items'] if x['kind'] == 'ConfigMap')['data']['config.yaml'])
        self.assertNotIn('cronjob', config['platform_toolsets']['telegram'])

    def test_placeholders_tags_and_bad_names_rejected(self):
        with self.assertRaises(ValueError):
            render.render(json.loads((ROOT / 'config/deployment.example.json').read_text()))
        for key, value in [('image', 'hermes:latest'), ('namespace', '../default'), ('storage_size', '0Gi')]:
            settings = self.settings()
            settings[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                render.render(settings)

    def test_bootstrap_preserves_memory_sessions_and_tokens(self):
        with tempfile.TemporaryDirectory() as temp:
            home, managed = Path(temp) / 'home', Path(temp) / 'managed'
            managed.mkdir()
            manifest = render.render(self.settings())
            configmap = next(x for x in manifest['items'] if x['kind'] == 'ConfigMap')
            for name, content in configmap['data'].items():
                (managed / name).write_text(content)
            env = {'TELEGRAM_ALLOWED_USERS': '123456789', 'TELEGRAM_BOT_TOKEN': 'fixture-only'}
            with patch.dict(os.environ, env):
                bootstrap.seed(home, managed, ROOT / 'config/profile.example.json')
                (home / 'memories/USER.md').write_text('owner updated memory')
                (home / 'auth.json').write_text('fixture rotated credential')
                (home / 'state.db').write_text('fixture state')
                bootstrap.seed(home, managed, ROOT / 'config/profile.example.json')
            self.assertEqual((home / 'memories/USER.md').read_text(), 'owner updated memory')
            self.assertEqual((home / 'auth.json').read_text(), 'fixture rotated credential')
            self.assertEqual((home / 'state.db').read_text(), 'fixture state')

    def test_bootstrap_requires_owner_allowlist(self):
        with tempfile.TemporaryDirectory() as temp:
            home, managed = Path(temp) / 'home', Path(temp) / 'managed'
            managed.mkdir()
            (managed / 'config.yaml').write_text('{}')
            with patch.dict(os.environ, {'TELEGRAM_ALLOWED_USERS': '', 'TELEGRAM_BOT_TOKEN': 'fixture-only'}):
                with self.assertRaises(ValueError):
                    bootstrap.seed(home, managed, ROOT / 'config/profile.example.json')

if __name__ == '__main__':
    unittest.main()
