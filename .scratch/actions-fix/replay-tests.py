"""Replay the workflow's real Test commands in a clean checkout."""
import json
import os
import pathlib
import subprocess
import tarfile
import tempfile

repo = pathlib.Path.cwd()
steps = json.loads(subprocess.check_output([
    'ruby', '-ryaml', '-rjson', '-e',
    'puts YAML.load_file(ARGV[0]).dig("jobs", "release", "steps").to_json',
    str(repo / '.github/workflows/release.yml'),
], text=True))
commands = [step['run'] for step in steps if step.get('name') == 'Test']
assert len(commands) == 1

with tempfile.TemporaryDirectory(prefix='default-apps-actions-replay-') as name:
    root = pathlib.Path(name)
    archive = subprocess.Popen(['git', 'archive', 'HEAD'], stdout=subprocess.PIPE)
    with tarfile.open(fileobj=archive.stdout, mode='r|') as stream:
        stream.extractall(root, filter='data')
    archive.stdout.close()
    assert archive.wait() == 0
    assert not (root / 'frontend/dist').exists()
    env = {**os.environ, 'CGO_CFLAGS': '-mmacosx-version-min=13.0',
           'CGO_LDFLAGS': '-mmacosx-version-min=13.0'}
    env.pop('GITHUB_REF_TYPE', None)
    env.pop('GITHUB_REF_NAME', None)
    result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', commands[0]],
                            cwd=root, env=env)
    raise SystemExit(result.returncode)
