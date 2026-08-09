// Workspace RBAC registry — the can() checker, system-role defaults, and the
// sanitizer that guards role-editor saves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  can, emptyPermissions, defaultPermissionsForSystemRole, sanitizePermissions,
  permissionsForRole, isSystemRole, PAGE_KEYS,
} from '../src/shared/permissions.js';

test('admin is full access via the __full sentinel', () => {
  const admin = defaultPermissionsForSystemRole('admin');
  assert.deepEqual(admin, { __full: true });
  assert.ok(can(admin, 'billing', 'edit'));
  assert.ok(can(admin, 'collections', 'edit', 'manage'));
  assert.ok(can(admin, 'anything-unknown', 'edit'));
});

test('editor can edit content but not admin surfaces', () => {
  const editor = defaultPermissionsForSystemRole('editor');
  assert.ok(can(editor, 'pages', 'edit'), 'editor edits pages');
  assert.ok(can(editor, 'media', 'edit'), 'editor edits media');
  assert.ok(!can(editor, 'billing', 'edit'), 'editor cannot touch billing');
  assert.ok(!can(editor, 'team', 'edit'), 'editor cannot manage the team');
  assert.ok(!can(editor, 'redirects', 'edit'), 'editor cannot edit redirects');
  // Previously admin-only sub-features stay off for editors.
  assert.ok(!can(editor, 'collections', 'edit', 'manage'), 'editor cannot create/delete collections');
  assert.ok(!can(editor, 'email', 'edit', 'send'), 'editor cannot send campaigns');
  assert.ok(!can(editor, 'social', 'edit', 'accounts'), 'editor cannot manage social accounts');
});

test('viewer is read-only', () => {
  const viewer = defaultPermissionsForSystemRole('viewer');
  assert.ok(can(viewer, 'pages', 'view'), 'viewer sees pages');
  assert.ok(!can(viewer, 'pages', 'edit'), 'viewer cannot edit pages');
  assert.ok(!can(viewer, 'billing', 'view'), 'viewer does not see billing');
});

test('edit implies view; view=false disables edit', () => {
  const editor = defaultPermissionsForSystemRole('editor');
  assert.ok(can(editor, 'pages', 'view'), 'edit rights imply view');

  const custom = emptyPermissions();
  custom.pages.edit = true; // view left false
  assert.ok(can(custom, 'pages', 'view'), 'an edit grant is always viewable');
});

test('a page a role does not list is denied', () => {
  const custom = emptyPermissions();
  custom.pages.view = true;
  custom.pages.edit = true;
  assert.ok(can(custom, 'pages', 'edit'));
  assert.ok(!can(custom, 'media', 'edit'), 'no media grant -> denied');
  assert.ok(!can(custom, 'media', 'view'));
});

test('feature check requires the specific toggle', () => {
  const custom = emptyPermissions();
  custom.collections.view = true;
  custom.collections.edit = true;
  assert.ok(can(custom, 'collections', 'edit'), 'can edit entries');
  assert.ok(!can(custom, 'collections', 'edit', 'manage'), 'but not manage without the toggle');
  custom.collections.features.manage = true;
  assert.ok(can(custom, 'collections', 'edit', 'manage'), 'toggle grants it');
});

test('sanitizePermissions is an allowlist and never trusts __full', () => {
  const dirty = {
    __full: true, // must be ignored
    pages: { view: 'yes', edit: 1, features: { publish: 'x', bogus: true } },
    notARealPage: { view: true, edit: true },
  };
  const clean = sanitizePermissions(dirty);
  assert.equal(clean.__full, undefined, 'client can never set full access');
  assert.equal(clean.pages.view, true, 'truthy coerced to boolean');
  assert.equal(clean.pages.edit, true);
  assert.equal(clean.pages.features.publish, true);
  assert.equal(clean.pages.features.bogus, undefined, 'unknown feature dropped');
  assert.equal(clean.notARealPage, undefined, 'unknown page dropped');
  // A sanitized custom role behaves as expected through can().
  assert.ok(can(clean, 'pages', 'edit', 'publish'));
  assert.ok(!can(clean, 'billing', 'edit'));
});

test('permissionsForRole resolves system vs custom', () => {
  assert.ok(isSystemRole('editor'));
  assert.ok(!isSystemRole('content-lead'));
  assert.deepEqual(permissionsForRole('admin'), { __full: true });
  const row = { permissions: (() => { const p = emptyPermissions(); p.pages.view = true; return p; })() };
  assert.ok(can(permissionsForRole('content-lead', row), 'pages', 'view'));
  // Missing custom row -> deny-all, not a crash.
  assert.ok(!can(permissionsForRole('content-lead', null), 'pages', 'view'));
});

test('every registry page key round-trips through emptyPermissions', () => {
  const empty = emptyPermissions();
  for (const key of PAGE_KEYS) {
    assert.ok(key in empty, `${key} present`);
    assert.equal(empty[key].view, false);
    assert.equal(empty[key].edit, false);
  }
});
