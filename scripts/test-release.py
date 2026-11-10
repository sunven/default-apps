#!/usr/bin/env python3
"""Release integration tests; every Git operation stays in temporary repos."""
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ['scripts/release.sh', 'scripts/version.mjs', 'internal/buildinfo/version.txt',
         'build/config.yml', 'build/darwin/Info.plist', 'build/darwin/Info.dev.plist',
         'frontend/package.json', 'frontend/package-lock.json']


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='default-apps-release-')
        self.addCleanup(self.temporary.cleanup)
        root = pathlib.Path(self.temporary.name)
        self.work = root / 'work'
        self.origin = root / 'origin.git'
        self.work.mkdir()
        self.env = {**os.environ, 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1',
                    'GIT_TERMINAL_PROMPT': '0'}
        for key in ['GITHUB_REF_TYPE', 'GITHUB_REF_NAME', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']:
            self.env.pop(key, None)
        self.run_command(['git', 'init', '--bare', str(self.origin)])
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Release test')
        self.git('config', 'user.email', 'release-test@example.invalid')
        for name in FILES:
            target = self.work / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        self.git('add', '.')
        self.git('commit', '-m', 'Initial fixture')
        self.git('remote', 'add', 'origin', str(self.origin))
        self.git('push', '-u', 'origin', 'main')
        self.initial = self.git('rev-parse', 'HEAD').stdout.strip()
        self.version = (self.work / 'internal/buildinfo/version.txt').read_text().strip()
        major, minor, patch = self.version.split('.')
        self.next_version = f'{major}.{minor}.{int(patch) + 1}'

    def run_command(self, args, check=True, **kwargs):
        return subprocess.run(args, cwd=self.work, env=self.env, text=True,
                              capture_output=True, check=check, **kwargs)

    def git(self, *args):
        return self.run_command(['git', *args])

    def release(self, *args, answer=''):
        return self.run_command(['bash', 'scripts/release.sh', *args], check=False, input=answer)

    def assert_unchanged(self):
        self.assertEqual(self.git('rev-parse', 'HEAD').stdout.strip(), self.initial)
        self.assertEqual((self.work / 'internal/buildinfo/version.txt').read_text().strip(), self.version)

    def test_default_patch_commits_and_pushes_branch_and_annotated_tag(self):
        result = self.release('--yes')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.run_command(['node', 'scripts/version.mjs', 'check'])
        self.assertEqual((self.work / 'internal/buildinfo/version.txt').read_text().strip(), self.next_version)
        self.assertEqual(self.git('status', '--porcelain').stdout, '')
        self.assertEqual(self.git('cat-file', '-t', 'v' + self.next_version).stdout.strip(), 'tag')
        head = self.git('rev-parse', 'HEAD').stdout.strip()
        remote = self.git('ls-remote', 'origin', 'refs/heads/main', 'refs/tags/v' + self.next_version + '^{}').stdout
        self.assertEqual(sum(line.startswith(head + '\t') for line in remote.splitlines()), 2)

    def test_explicit_version_and_confirmation(self):
        major = int(self.version.split('.')[0]) + 1
        result = self.release(f'{major}.0.0', answer='y\n')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.work / 'internal/buildinfo/version.txt').read_text().strip(), f'{major}.0.0')

    def test_cancel_leaves_version_and_history_unchanged(self):
        result = self.release(answer='n\n')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_unchanged()
        self.assertEqual(self.git('status', '--porcelain').stdout, '')
        self.assertEqual(self.git('tag').stdout, '')

    def test_dry_run_is_offline_and_does_not_mutate(self):
        self.origin.rename(self.origin.with_name('offline.git'))
        result = self.release('--dry-run')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_unchanged()
        self.assertFalse((self.work / '.git/FETCH_HEAD').exists())
        self.assertEqual(self.git('status', '--porcelain').stdout, '')

    def test_rejects_dirty_index_and_untracked_files(self):
        target = self.work / 'unrelated.txt'
        target.write_text('keep this work\n')
        for staged in [False, True]:
            if staged:
                self.git('add', 'unrelated.txt')
            result = self.release('--yes')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('未提交或未跟踪', result.stderr)
            self.assert_unchanged()
            self.assertEqual(target.read_text(), 'keep this work\n')

    def test_rejects_invalid_or_non_increasing_version_before_fetch(self):
        for version in ['01.2.3', '0.2.0-beta.1', self.version, '0.0.0']:
            with self.subTest(version=version):
                result = self.release(version, '--yes')
                self.assertNotEqual(result.returncode, 0)
                self.assert_unchanged()
                self.assertFalse((self.work / '.git/FETCH_HEAD').exists())

    def test_rejects_existing_remote_tag_before_changing_version(self):
        tag = 'v' + self.next_version
        self.git('tag', tag)
        self.git('push', 'origin', tag)
        self.git('tag', '-d', tag)
        result = self.release('--yes')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('远端标签', result.stderr)
        self.assert_unchanged()

    def test_rejects_unmerged_remote_main(self):
        clone = self.work.parent / 'other'
        self.run_command(['git', 'clone', '--branch', 'main', str(self.origin), str(clone)])
        def other(*args):
            return self.run_command(['git', '-C', str(clone), *args])
        other('config', 'user.name', 'Other test')
        other('config', 'user.email', 'other@example.invalid')
        (clone / 'other.txt').write_text('remote change\n')
        other('add', 'other.txt')
        other('commit', '-m', 'New remote change')
        other('push', 'origin', 'main')
        result = self.release('--yes')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('尚未合并', result.stderr)
        self.assert_unchanged()

    def test_failed_atomic_push_keeps_remote_unchanged(self):
        hook = self.origin / 'hooks/pre-receive'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        result = self.release('--yes')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('本地版本提交和标签已保留', result.stderr)
        remote = self.git('ls-remote', 'origin', 'refs/heads/main', 'refs/tags/v' + self.next_version).stdout
        self.assertEqual(remote.strip(), self.initial + '\trefs/heads/main')
        self.assertNotEqual(self.git('rev-parse', 'HEAD').stdout.strip(), self.initial)


if __name__ == '__main__':
    unittest.main()
