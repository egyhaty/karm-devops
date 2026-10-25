#!/usr/bin/env python3
"""Plan or execute a bounded Codex task; no execution without --execute."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import signal
import subprocess
import sys
import tempfile
import time

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True, timeout=30)

def clean_relative(value):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError('allowed_paths entries must be relative POSIX paths')
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or '.git' in path.parts or value.startswith('-'):
        raise ValueError('invalid allowed path: ' + value)
    return str(path)

def validate_brief(brief, repos_root):
    if not isinstance(brief, dict):
        raise ValueError('brief must be a JSON object')
    if set(brief) - {'repo', 'goal', 'acceptance', 'allowed_paths', 'constraints', 'verification'}:
        raise ValueError('unknown brief fields')
    if not isinstance(brief.get('repo'), str):
        raise ValueError('repo must be an absolute path')
    if not Path(brief['repo']).is_absolute():
        raise ValueError('repo must be absolute')
    root = Path(repos_root).resolve(strict=True)
    repo = Path(brief['repo']).resolve(strict=True)
    if not repo.is_relative_to(root) or repo == root:
        raise ValueError('repository must be beneath the approved repositories root')
    if Path(git(repo, 'rev-parse', '--show-toplevel').strip()).resolve() != repo:
        raise ValueError('repo must name the git repository root')
    if git(repo, 'status', '--porcelain', '--untracked-files=all').strip():
        raise ValueError('repository must be clean, including untracked files')
    if not isinstance(brief.get('goal'), str) or not brief['goal'].strip():
        raise ValueError('goal is required')
    for key in ['acceptance', 'allowed_paths', 'constraints', 'verification']:
        value = brief.get(key, [])
        if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
            raise ValueError(key + ' must be a list of nonempty strings')
    if not brief.get('acceptance') or not brief.get('allowed_paths'):
        raise ValueError('acceptance and allowed_paths must be nonempty')
    allowed = [clean_relative(v) for v in brief['allowed_paths']]
    for item in allowed:
        # Reject symlink scopes that resolve outside the repository, even for new descendants.
        if not (repo / item).resolve().is_relative_to(repo):
            raise ValueError('allowed path escapes the repository through a symlink')
    return repo, allowed

def build_command(repo, output, binary='codex'):
    return [binary, '--ask-for-approval', 'never', 'exec', '--sandbox', 'workspace-write',
            '--cd', str(repo), '--output-last-message', str(output), '-']

def child_env(codex_home):
    # Intentionally do not inherit Telegram, Hermes provider, SSH, kube, cloud,
    # git credential helpers, proxy credentials or arbitrary token variables.
    home = Path(codex_home).resolve()
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    keys = ['PATH', 'LANG', 'LC_ALL', 'TERM', 'SSL_CERT_FILE', 'SSL_CERT_DIR']
    result = {k: os.environ[k] for k in keys if k in os.environ}
    result.update({'HOME': str(home), 'CODEX_HOME': str(home / '.codex'),
                   'GIT_TERMINAL_PROMPT': '0'})
    return result

def changed_paths(repo, before):
    tracked = git(repo, 'diff', '--name-only', '-z', before).split('\0')
    extra = git(repo, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
    return sorted(set(p for p in tracked + extra if p))

def outside_scope(paths, allowed):
    return [p for p in paths if not any(a == '.' or p == a or p.startswith(a.rstrip('/') + '/')
                                       for a in allowed)]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--brief', required=True, type=Path)
    parser.add_argument('--repos-root', type=Path, default=Path('/opt/data/repos'))
    parser.add_argument('--codex-home', type=Path, default=Path('/opt/data/codex-home'))
    parser.add_argument('--output-dir', type=Path, default=Path('/opt/data/workspace/codex-runs'))
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    try:
        if not 10 <= args.timeout <= 1800:
            raise ValueError('timeout must be 10..1800 seconds')
        brief = json.loads(args.brief.read_text())
        repo, allowed = validate_brief(brief, args.repos_root)
        prompt = ('Implement the task below within this repository. Read AGENTS.md first. '
                  'Do not commit, push, publish, deploy, access credentials or modify outside allowed_paths. '
                  'Do not change the sandbox or ask for broader privileges. Report verification evidence.\n'
                  + json.dumps(brief, ensure_ascii=False, indent=2))
        plan = {'mode': 'execute' if args.execute else 'dry-run', 'repo': str(repo),
                'allowed_paths': allowed, 'timeout_seconds': args.timeout,
                'argv': build_command(repo, '<private-run-directory>/last-message.md'),
                'scope_note': 'allowed_paths is checked after execution; sandbox scope is the repository'}
        if not args.execute:
            print(json.dumps(plan, ensure_ascii=False, indent=2))
            return
        os.umask(0o077)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        run_dir = Path(tempfile.mkdtemp(prefix='run-', dir=args.output_dir))
        before = git(repo, 'rev-parse', 'HEAD').strip()
        head_ref = git(repo, 'symbolic-ref', '-q', 'HEAD').strip()
        command = build_command(repo, run_dir / 'last-message.md')
        started = time.time()
        with (run_dir / 'process.log').open('w') as log:
            process = subprocess.Popen(command, cwd=repo, stdin=subprocess.PIPE,
                stdout=log, stderr=subprocess.STDOUT, text=True,
                env=child_env(args.codex_home), start_new_session=True)
            timed_out = False
            try:
                process.communicate(prompt, timeout=args.timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.communicate()
        paths = changed_paths(repo, before)
        violations = outside_scope(paths, allowed)
        head_changed = (git(repo, 'rev-parse', 'HEAD').strip() != before or
                        git(repo, 'symbolic-ref', '-q', 'HEAD').strip() != head_ref)
        report = {**plan, 'returncode': process.returncode, 'timed_out': timed_out,
                  'elapsed_seconds': round(time.time() - started, 2), 'changed_paths': paths,
                  'out_of_scope': violations, 'head_changed': head_changed,
                  'run_directory': str(run_dir), 'acceptance_verified': False}
        (run_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if process.returncode or timed_out or violations or head_changed:
            raise SystemExit(3)
    except (ValueError, OSError, subprocess.SubprocessError, TypeError) as error:
        parser.exit(2, str(error) + '\n')

if __name__ == '__main__':
    main()
