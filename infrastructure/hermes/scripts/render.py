#!/usr/bin/env python3
"""Render a stopped Kubernetes deployment from non-secret settings."""
import argparse
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]

def render(settings, root=ROOT):
    required = {'namespace', 'image', 'provider', 'model', 'timezone', 'storage_class', 'storage_size', 'secret_name'}
    if set(settings) != required or not all(isinstance(v, str) for v in settings.values()):
        raise ValueError('settings must contain exactly the documented string fields')
    if 'REQUIRED_' in json.dumps(settings):
        raise ValueError('fill required deployment values first')
    for key in ['namespace', 'secret_name']:
        if len(settings[key]) > 63 or not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?', settings[key]):
            raise ValueError('invalid Kubernetes name: ' + key)
    if not re.fullmatch(r'[A-Za-z0-9./_:-]+@sha256:[0-9a-f]{64}', settings['image']):
        raise ValueError('image must be pinned by sha256 digest')
    if not re.fullmatch(r'[1-9][0-9]*(?:Gi|Mi)', settings['storage_size']):
        raise ValueError('storage_size must be a positive Mi or Gi quantity')
    if not settings['provider'].strip() or not settings['model'].strip():
        raise ValueError('provider and model must be chosen explicitly')
    ZoneInfo(settings['timezone'])
    ns = settings['namespace']
    labels = {'app.kubernetes.io/name': 'hermes-karem'}
    metadata = lambda name: {'name': name, 'namespace': ns, 'labels': labels}
    config = {
        'model': {'provider': settings['provider'], 'default': settings['model']},
        'database': {'journal_mode': 'delete'},
        'agent': {'max_turns': 30, 'gateway_timeout': 900},
        'max_concurrent_sessions': 2,
        'group_sessions_per_user': True,
        'terminal': {'backend': 'local', 'cwd': '/opt/data/workspace', 'timeout': 120, 'home_mode': 'profile'},
        'memory': {'memory_enabled': True, 'user_profile_enabled': True,
                   'memory_char_limit': 2200, 'user_char_limit': 1800, 'nudge_interval': 10},
        'compression': {'enabled': True},
        'skills': {'external_dirs': ['/opt/karem/skills'], 'creation_nudge_interval': 0},
        # No cron, delegation, mail/calendar write, MCP or messaging toolsets in initial profile.
        'platform_toolsets': {surface: ['web', 'terminal', 'file', 'skills', 'todo',
            'memory', 'session_search', 'clarify'] for surface in ['cli', 'telegram']},
        'platforms': {'telegram': {'extra': {'drop_pending_on_cold_boot': True,
                                             'disable_link_previews': True}}},
    }
    pvc_spec = {'accessModes': ['ReadWriteOnce'], 'resources': {'requests': {'storage': settings['storage_size']}}}
    if settings['storage_class']:
        pvc_spec['storageClassName'] = settings['storage_class']
    container = {
        'name': 'hermes', 'image': settings['image'], 'imagePullPolicy': 'IfNotPresent',
        'envFrom': [{'secretRef': {'name': settings['secret_name']}}],
        'env': [{'name': 'HERMES_HOME', 'value': '/opt/data'}, {'name': 'HOME', 'value': '/opt/data'},
                {'name': 'HERMES_TIMEZONE', 'value': settings['timezone']},
                {'name': 'TZ', 'value': settings['timezone']}],
        'resources': {'requests': {'cpu': '250m', 'memory': '1Gi'},
                      'limits': {'cpu': '2', 'memory': '4Gi'}},
        'securityContext': {'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True,
                            'capabilities': {'drop': ['ALL']}},
        'volumeMounts': [{'name': 'data', 'mountPath': '/opt/data'},
                         {'name': 'managed', 'mountPath': '/etc/karem', 'readOnly': True},
                         {'name': 'tmp', 'mountPath': '/tmp'},
                         {'name': 'private', 'mountPath': '/etc/karem-private', 'readOnly': True}],
        # Process-only readiness: not a claim that Telegram/provider connectivity is healthy.
        'readinessProbe': {'exec': {'command': ['/opt/hermes/.venv/bin/python', '-c',
            "from pathlib import Path; import sys; sys.exit(0 if b'gateway' in Path('/proc/1/cmdline').read_bytes() else 1)"]},
            'initialDelaySeconds': 10, 'periodSeconds': 15, 'timeoutSeconds': 5},
    }
    deployment = {'apiVersion': 'apps/v1', 'kind': 'Deployment', 'metadata': metadata('hermes'),
        'spec': {'replicas': 0, 'strategy': {'type': 'Recreate'}, 'selector': {'matchLabels': labels},
                 'template': {'metadata': {'labels': labels}, 'spec': {
                    'automountServiceAccountToken': False, 'terminationGracePeriodSeconds': 60,
                    'securityContext': {'runAsNonRoot': True, 'runAsUser': 10000, 'runAsGroup': 10000,
                        'fsGroup': 10000, 'fsGroupChangePolicy': 'OnRootMismatch',
                        'seccompProfile': {'type': 'RuntimeDefault'}},
                    'containers': [container],
                    'volumes': [{'name': 'data', 'persistentVolumeClaim': {'claimName': 'hermes-data'}},
                                {'name': 'managed', 'configMap': {'name': 'hermes-managed'}},
                                {'name': 'tmp', 'emptyDir': {'sizeLimit': '1Gi'}},
                                {'name': 'private', 'secret': {'secretName': 'hermes-profile', 'defaultMode': 288}}]}}}}
    objects = [
        {'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': ns}},
        {'apiVersion': 'v1', 'kind': 'PersistentVolumeClaim', 'metadata': metadata('hermes-data'), 'spec': pvc_spec},
        {'apiVersion': 'v1', 'kind': 'ConfigMap', 'metadata': metadata('hermes-managed'), 'data': {
            'config.yaml': json.dumps(config, indent=2), 'SOUL.md': (root / 'config/SOUL.md').read_text()}},
        deployment,
        {'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy', 'metadata': metadata('hermes-ingress'),
         'spec': {'podSelector': {'matchLabels': labels}, 'policyTypes': ['Ingress'], 'ingress': []}},
    ]
    return {'apiVersion': 'v1', 'kind': 'List', 'items': objects}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings', required=True, type=Path)
    parser.add_argument('--out', type=Path, default=ROOT / 'build')
    args = parser.parse_args()
    try:
        result = render(json.loads(args.settings.read_text()))
        args.out.mkdir(parents=True, exist_ok=True)
        target = args.out / 'manifest.json'
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print('Rendered ' + str(target) + '; replicas=0, nothing applied')
    except (ValueError, OSError, KeyError) as error:
        parser.exit(2, str(error) + '\n')

if __name__ == '__main__':
    main()
