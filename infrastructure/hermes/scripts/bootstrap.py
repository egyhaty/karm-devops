#!/usr/bin/env python3
"""Seed managed settings and initial memory; preserve state and credentials."""
import argparse
import json
import os
from pathlib import Path
import tempfile

def write_atomic(path, content):
    if path.is_symlink():
        raise ValueError('refusing symlink target: ' + str(path))
    fd, name = tempfile.mkstemp(prefix='.karem-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def seed(home, managed, profile_path):
    home, managed = Path(home), Path(managed)
    os.umask(0o077)
    if home.is_symlink():
        raise ValueError('HERMES_HOME must not be a symlink')
    home.mkdir(parents=True, exist_ok=True)
    for directory in ['workspace', 'memories', 'repos', 'home', 'codex-home']:
        target = home / directory
        if target.is_symlink():
            raise ValueError('refusing symlink directory: ' + str(target))
        target.mkdir(exist_ok=True)
    config = json.loads((managed / 'config.yaml').read_text())
    if 'REQUIRED_' in json.dumps(config):
        raise ValueError('configuration is incomplete')
    users = os.environ.get('TELEGRAM_ALLOWED_USERS', '')
    if not users or not all(p.strip().isdigit() and int(p.strip()) > 0 for p in users.split(',')):
        raise ValueError('TELEGRAM_ALLOWED_USERS must contain explicit positive numeric IDs')
    if not os.environ.get('TELEGRAM_BOT_TOKEN'):
        raise ValueError('TELEGRAM_BOT_TOKEN is required')
    # Managed config and identity are refreshed deliberately at each start.
    # OAuth refresh tokens, sessions, user memory and record DB are never replaced.
    write_atomic(home / 'config.yaml', json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    write_atomic(home / 'SOUL.md', (managed / 'SOUL.md').read_text())
    profile = json.loads(Path(profile_path).read_text())
    user = home / 'memories' / 'USER.md'
    if not user.exists():
        write_atomic(user, '\n'.join([
            '# Owner', 'Name: ' + profile['name'] + ' / ' + profile['arabic_name'],
            'Language: ' + profile['language'], 'Style: ' + profile['communication'],
            'Use /etc/karem-private/profile.json for contextual facts; confirm current details before external use.',
            '']) )
    return home

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', default=os.getenv('HERMES_HOME', '/opt/data'))
    parser.add_argument('--managed', default='/etc/karem')
    parser.add_argument('--profile', default='/etc/karem-private/profile.json')
    parser.add_argument('--exec', action='store_true', dest='execute')
    args = parser.parse_args()
    home = seed(args.home, args.managed, args.profile)
    if args.execute:
        os.chdir(home / 'workspace')
        binary = '/opt/hermes/.venv/bin/hermes'
        os.execv(binary, [binary, 'gateway', 'run'])
    print('Configuration seeded; gateway not started')

if __name__ == '__main__':
    main()
