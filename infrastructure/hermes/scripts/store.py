#!/usr/bin/env python3
"""Private local records. No network requests or reminder delivery."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sqlite3
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

STATUSES = {
    'job': {'new', 'shortlisted', 'drafting', 'approved', 'applied', 'interview', 'rejected', 'withdrawn', 'closed'},
    'task': {'open', 'doing', 'waiting', 'done', 'cancelled'},
    'note': {'draft', 'verified', 'outdated'},
    'study': {'planned', 'practicing', 'review', 'demonstrated'},
    'incident': {'open', 'investigating', 'proposed', 'resolved', 'closed'},
}
DEFAULTS = {'job': 'new', 'task': 'open', 'note': 'draft', 'study': 'planned', 'incident': 'open'}

def timestamp(value):
    if not isinstance(value, str):
        raise ValueError('timestamp must be an ISO-8601 string with timezone')
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError('timestamp requires an explicit timezone offset')
    return parsed.astimezone(dt.timezone.utc).isoformat()

def canonical_url(value):
    parts = urlsplit(value)
    if parts.scheme not in {'http', 'https'} or not parts.hostname or parts.username or parts.password:
        raise ValueError('job URL must be public-shaped http(s), without embedded credentials')
    if parts.port:  # validates malformed ports as well
        netloc = parts.hostname.lower() + ':' + str(parts.port)
    else:
        netloc = parts.hostname.lower()
    query = sorted((k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                   if not k.lower().startswith('utm_') and k.lower() not in {'fbclid', 'gclid'})
    # Keep path case, protocol, meaningful query arguments and trailing slash.
    return urlunsplit((parts.scheme, netloc, parts.path or '/', urlencode(query), ''))

def validate_record(record):
    if not isinstance(record, dict):
        raise ValueError('record must be an object')
    allowed = {'kind', 'key', 'title', 'status', 'source', 'due_at', 'details'}
    if set(record) - allowed:
        raise ValueError('unknown fields: ' + ', '.join(sorted(set(record) - allowed)))
    result = dict(record)
    kind = result.get('kind')
    if kind not in STATUSES:
        raise ValueError('unsupported record kind')
    for name in ['key', 'title']:
        if not isinstance(result.get(name), str) or not result[name].strip() or len(result[name]) > 2000:
            raise ValueError(name + ' must be nonempty text, at most 2000 characters')
    result['status'] = result.get('status', DEFAULTS[kind])
    if result['status'] not in STATUSES[kind]:
        raise ValueError('invalid status for ' + kind)
    if kind == 'job':
        result['key'] = canonical_url(result['key'])
    result.setdefault('source', '')
    if not isinstance(result['source'], str):
        raise ValueError('source must be text')
    result.setdefault('details', {})
    if not isinstance(result['details'], dict):
        raise ValueError('details must be an object')
    if len(json.dumps(result['details'], allow_nan=False)) > 100_000:
        raise ValueError('details too large; keep raw evidence outside the record')
    if result.get('due_at') is not None:
        result['due_at'] = timestamp(result['due_at'])
    else:
        result['due_at'] = None
    return result

def default_db():
    root = Path(os.getenv('HERMES_HOME', '/opt/data'))
    return root / 'workspace' / 'assistant.sqlite'

def connect(path):
    path = Path(path)
    # Protect newly created database/journal files; existing records remain private.
    os.umask(0o077)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError('database path must not be a symlink')
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    # DELETE is conservative across PVC filesystems. Stop the writer before full backups.
    db.execute('PRAGMA journal_mode=DELETE')
    db.execute('''CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL,
        title TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
        due_at TEXT, details TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, UNIQUE(kind,key))''')
    db.execute('''CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY, record_id INTEGER NOT NULL REFERENCES records(id),
        snapshot TEXT NOT NULL, saved_at TEXT NOT NULL)''')
    db.commit()
    path.chmod(0o600)
    return db

def row_record(row):
    result = dict(row)
    result['details'] = json.loads(result['details'])
    return result

def put(db, record):
    record = validate_record(record)
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    with db:
        # Single atomic upsert: duplicate imports cannot create two job records.
        db.execute('''INSERT INTO records(kind,key,title,status,source,due_at,details,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET
            title=excluded.title,status=excluded.status,source=excluded.source,
            due_at=excluded.due_at,details=excluded.details,updated_at=excluded.updated_at''',
            (record['kind'], record['key'], record['title'], record['status'], record['source'],
             record['due_at'], json.dumps(record['details'], ensure_ascii=False, allow_nan=False), now, now))
        row = db.execute('SELECT * FROM records WHERE kind=? AND key=?',
                         (record['kind'], record['key'])).fetchone()
        result = row_record(row)
        db.execute('INSERT INTO history(record_id,snapshot,saved_at) VALUES(?,?,?)',
                   (result['id'], json.dumps(result, ensure_ascii=False), now))
    return result

def find(db, kind=None, query=None, due_before=None, limit=50):
    if not 1 <= limit <= 500:
        raise ValueError('limit must be 1..500')
    where, args = [], []
    if kind:
        where.append('kind=?')
        args.append(kind)
    if query:
        escaped = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        where.append("(title LIKE ? ESCAPE '\\' OR details LIKE ? ESCAPE '\\')")
        args.extend(['%' + escaped + '%'] * 2)
    if due_before:
        where.append('due_at IS NOT NULL AND due_at<=?')
        args.append(timestamp(due_before))
    sql = 'SELECT * FROM records' + (' WHERE ' + ' AND '.join(where) if where else '')
    sql += ' ORDER BY updated_at DESC,id DESC LIMIT ?'
    return [row_record(row) for row in db.execute(sql, args + [limit])]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=default_db())
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('put', help='Atomic full record upsert; updates replace all mutable fields')
    p.add_argument('--file', required=True, type=Path)
    p = commands.add_parser('list')
    p.add_argument('--kind', choices=sorted(STATUSES))
    p.add_argument('--query')
    p.add_argument('--due-before')
    p.add_argument('--limit', type=int, default=50)
    p = commands.add_parser('history')
    p.add_argument('--id', type=int, required=True)
    commands.add_parser('export', help='All records to stdout; private backup data')
    p = commands.add_parser('import', help='Validate entire array before writing, then upsert records')
    p.add_argument('--file', required=True, type=Path)
    args = parser.parse_args()
    try:
        with connect(args.db) as db:
            if args.command == 'put':
                result = put(db, json.loads(args.file.read_text()))
            elif args.command == 'list':
                result = find(db, args.kind, args.query, args.due_before, args.limit)
            elif args.command == 'history':
                result = [json.loads(r[0]) for r in db.execute(
                    'SELECT snapshot FROM history WHERE record_id=? ORDER BY id', (args.id,))]
            elif args.command == 'export':
                result = [row_record(row) for row in db.execute('SELECT * FROM records ORDER BY id')]
            else:
                records = json.loads(args.file.read_text())
                if not isinstance(records, list) or len(records) > 10_000:
                    raise ValueError('import requires an array of up to 10000 records')
                records = [validate_record({k: v for k, v in r.items()
                    if k not in {'id', 'created_at', 'updated_at'}}) for r in records]
                result = [put(db, record) for record in records]
            print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    except (ValueError, OSError, sqlite3.Error, TypeError, AttributeError) as error:
        parser.exit(2, str(error) + '\n')

if __name__ == '__main__':
    main()
