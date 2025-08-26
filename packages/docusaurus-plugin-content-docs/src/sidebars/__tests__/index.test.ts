/**
 * Tests for sidebars/index.ts
 * Framework: Jest (TypeScript). These tests mock fs, globby, yaml, and internal processors.
 */

import path from 'path';

// System under test
import * as SidebarsMod from '../index';

// Mocks
jest.mock('fs-extra', () => ({
  __esModule: true,
  default: {
    readFile: jest.fn(),
    pathExists: jest.fn(),
  },
}));
import fs from 'fs-extra';

jest.mock('@docusaurus/utils', () => ({
  __esModule: true,
  loadFreshModule: jest.fn(),
  Globby: jest.fn(),
}));
import {loadFreshModule, Globby} from '@docusaurus/utils';

jest.mock('js-yaml', () => ({
  __esModule: true,
  default: {},
  load: jest.fn(),
}));
import Yaml from 'js-yaml';

jest.mock('combine-promises', () => ({
  __esModule: true,
  default: (obj: Record<string, any>) =>
    Promise.all(
      Object.entries(obj).map(async ([k, v]) => [k, await v]),
    ).then((entries) => Object.fromEntries(entries)),
}));
import combinePromises from 'combine-promises';

jest.mock('../validation', () => ({
  __esModule: true,
  validateSidebars: jest.fn(),
  validateCategoryMetadataFile: jest.fn((v) => v),
}));
import {validateSidebars, validateCategoryMetadataFile} from '../validation';

jest.mock('../normalization', () => ({
  __esModule: true,
  normalizeSidebars: jest.fn((s) => s),
}));
import {normalizeSidebars} from '../normalization';

jest.mock('../processor', () => ({
  __esModule: true,
  processSidebars: jest.fn((_norm, _catMeta, _opts) => ({
    processed: true,
    input: _norm,
    meta: _catMeta,
  })),
}));
import {processSidebars} from '../processor';

jest.mock('../postProcessor', () => ({
  __esModule: true,
  postProcessSidebars: jest.fn((processed, _opts) => ({
    ...processed,
    postProcessed: true,
  })),
}));
import {postProcessSidebars} from '../postProcessor';

jest.mock('@docusaurus/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),  // tag function usage compatible
    error: jest.fn(), // tag function usage compatible
  },
}));
import logger from '@docusaurus/logger';

// Helpers to access constants
const {DefaultSidebars, DisabledSidebars} = SidebarsMod;

describe('resolveSidebarPathOption', () => {
  test('returns absolute path when given a relative string', () => {
    const siteDir = '/var/www/site';
    const result = SidebarsMod.resolveSidebarPathOption(siteDir, 'sidebars.js');
    expect(result).toBe(path.resolve(siteDir, 'sidebars.js'));
  });

  test('passes through false unchanged', () => {
    const result = SidebarsMod.resolveSidebarPathOption('/x', false);
    expect(result).toBe(false);
  });

  test('passes through undefined unchanged', () => {
    const result = SidebarsMod.resolveSidebarPathOption('/x', undefined);
    expect(result).toBeUndefined();
  });
});

describe('loadSidebarsFile', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('returns DisabledSidebars when option is false', async () => {
    const res = await SidebarsMod.loadSidebarsFile(false);
    expect(res).toEqual(DisabledSidebars);
  });

  test('returns DefaultSidebars when option is undefined', async () => {
    const res = await SidebarsMod.loadSidebarsFile(undefined);
    expect(res).toEqual(DefaultSidebars);
  });

  test('returns DisabledSidebars when file does not exist', async () => {
    (fs.pathExists as jest.Mock).mockResolvedValue(false);
    const res = await SidebarsMod['loadSidebarsFile']?.('/abs/missing/sidebars.js' as any);
    // The public wrapper delegates to unsafe; behavior for non-existent should be disabled sidebars.
    expect(res).toEqual(DisabledSidebars);
    expect(fs.pathExists).toHaveBeenCalledWith('/abs/missing/sidebars.js');
  });

  test('loads module via loadFreshModule when file exists', async () => {
    const fakeConfig = {mySidebar: [{type: 'doc', id: 'intro'}]};
    (fs.pathExists as jest.Mock).mockResolvedValue(true);
    (loadFreshModule as jest.Mock).mockResolvedValue(fakeConfig);

    const res = await SidebarsMod.loadSidebarsFile('/abs/path/sidebars.js' as any);
    expect(fs.pathExists).toHaveBeenCalledWith('/abs/path/sidebars.js');
    expect(loadFreshModule).toHaveBeenCalledWith('/abs/path/sidebars.js');
    expect(res).toEqual(fakeConfig);
  });
});

describe('loadSidebars (integration across pipeline)', () => {
  const baseOptions = {
    version: {
      contentPath: '/docs',
    },
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    (Globby as jest.Mock).mockResolvedValue([]);
    (fs.pathExists as jest.Mock).mockResolvedValue(false);
    (Yaml.load as jest.Mock).mockReset();
  });

  test('happy path: uses defaults when sidebarFilePath undefined and runs full pipeline', async () => {
    // Arrange readCategoriesMetadata to find one category file per folder
    (Globby as jest.Mock).mockResolvedValue([
      'a/_category_.json',
      'b/_category_.yml',
    ]);

    // Mock file reads for both files
    (fs.readFile as jest.Mock).mockImplementation(async (p: string) => {
      if (p.endsWith('a/_category_.json')) {
        return JSON.stringify({label: 'A', position: 1});
      }
      if (p.endsWith('b/_category_.yml')) {
        return 'label: B\nposition: 2';
      }
      throw new Error('Unexpected readFile path: ' + p);
    });

    // Yaml.load should only be needed for yml/yaml
    (Yaml.load as jest.Mock).mockImplementation((content: string) => {
      if (content.includes('label: B')) {
        return {label: 'B', position: 2};
      }
      return JSON.parse(content);
    });

    // Act
    const result = await SidebarsMod.loadSidebars(undefined, baseOptions);

    // Assert pipeline calls
    expect(normalizeSidebars).toHaveBeenCalledWith(DefaultSidebars);
    expect(validateSidebars).toHaveBeenCalled();

    // Validate categories metadata was combined and passed to processor
    expect(processSidebars).toHaveBeenCalledWith(
      DefaultSidebars,
      {
        '/docs/a': {label: 'A', position: 1},
        '/docs/b': {label: 'B', position: 2},
      },
      baseOptions,
    );

    expect(postProcessSidebars).toHaveBeenCalled();
    expect(result).toEqual({
      processed: true,
      input: DefaultSidebars,
      meta: {
        '/docs/a': {label: 'A', position: 1},
        '/docs/b': {label: 'B', position: 2},
      },
      postProcessed: true,
    });

    // No error should be logged
    expect((logger as any).error).not.toHaveBeenCalled();
  });

  test('warns when multiple category metadata files exist for the same folder', async () => {
    (Globby as jest.Mock).mockResolvedValue([
      'a/_category_.json',
      'a/_category_.yml',
    ]);
    (fs.readFile as jest.Mock).mockResolvedValue('{}');
    (Yaml.load as jest.Mock).mockImplementation((c: string) => {
      try {
        return JSON.parse(c);
      } catch {
        return {};
      }
    });

    await SidebarsMod.loadSidebars(undefined, baseOptions);

    expect((logger as any).warn).toHaveBeenCalled();
  });

  test('logs and rethrows when category metadata file is invalid', async () => {
    (Globby as jest.Mock).mockResolvedValue(['a/_category_.yml']);
    (fs.readFile as jest.Mock).mockResolvedValue('label: "Bad": "YAML"'); // malformed
    (Yaml.load as jest.Mock).mockImplementation(() => {
      throw new Error('YAML parse error');
    });

    await expect(
      SidebarsMod.loadSidebars(undefined, baseOptions),
    ).rejects.toThrow('YAML parse error');

    // It should log specific category metadata error, then the general sidebars load error
    expect((logger as any).error).toHaveBeenCalled();
    const calls = (logger as any).error.mock.calls;
    // First error from readCategoriesMetadata
    expect(calls.some((args: any[]) => (args?.[0]?.raw || args?.[0])?.toString?.().includes('category metadata file'))).toBe(true);
  });

  test('logs and rethrows when normalizeSidebars fails', async () => {
    (normalizeSidebars as jest.Mock).mockImplementation(() => {
      throw new Error('normalize failed');
    });

    await expect(
      SidebarsMod.loadSidebars(undefined, baseOptions),
    ).rejects.toThrow('normalize failed');

    expect((logger as any).error).toHaveBeenCalled();
    // The error message should mention the sidebars file path (undefined in this case)
    const errLogCalled = (logger as any).error.mock.calls.some((args: any[]) => {
      const first = args?.[0];
      const text = (first?.raw || first)?.toString?.() ?? '';
      return text.includes('Sidebars file at path=undefined');
    });
    expect(errLogCalled).toBe(true);
  });
});

describe('Default and Disabled sidebars constants', () => {
  test('DefaultSidebars contains autogenerated at root', () => {
    expect(DefaultSidebars).toEqual({
      defaultSidebar: [{type: 'autogenerated', dirName: '.'}],
    });
  });

  test('DisabledSidebars is an empty object', () => {
    expect(DisabledSidebars).toEqual({});
  });
});
