/**
 * Tests for sidebars utils
 * Framework: Jest
 */

import * as Utils from './utils';

// Local helpers to construct sidebar items with minimal shapes.
// We intentionally cast as any to avoid depending on internal type packages.
const doc = (id: string, label?: string): any => ({ type: 'doc', id, label });
const ref = (id: string, label?: string): any => ({ type: 'ref', id, label });
const link = (label: string, href: string): any => ({ type: 'link', href, label });
const category = (
  label: string,
  items: any[],
  linkObj?: any
): any => ({ type: 'category', label, items, ...(linkObj ? { link: linkObj } : {}) });

describe('isCategoriesShorthand', () => {
  test('returns true for plain object without "type" key', () => {
    expect(Utils.isCategoriesShorthand({ foo: 'bar' } as any)).toBe(true);
    expect(Utils.isCategoriesShorthand({ label: 'X', items: [] } as any)).toBe(true);
  });

  test('returns false for objects with "type"', () => {
    expect(Utils.isCategoriesShorthand(doc('a'))).toBe(false);
    expect(Utils.isCategoriesShorthand(category('C', []))).toBe(false);
  });

  test('returns false for non-objects', () => {
    expect(Utils.isCategoriesShorthand('string' as any)).toBe(false);
    expect(Utils.isCategoriesShorthand(42 as any)).toBe(false);
    expect(Utils.isCategoriesShorthand(null as any)).toBe(false);
    expect(Utils.isCategoriesShorthand(undefined as any)).toBe(false);
  });
});

describe('transformSidebarItems', () => {
  test('recursively applies updateFn to all items while preserving structure', () => {
    const sidebar: any[] = [
      doc('a', 'A'),
      category('Cat', [doc('b', 'B'), category('Sub', [doc('c', 'C')])]),
      link('External', 'https://example.com'),
    ];

    const seen: string[] = [];
    const updated = Utils.transformSidebarItems(sidebar, (item) => {
      // Record visitation order by type/id/label to ensure every node is visited once
      if ((item as any).type === 'doc') {
        seen.push(`doc:${(item as any).id}`);
        return { ...item, label: `${item.label ?? item.id} (v)` };
      }
      if ((item as any).type === 'category') {
        seen.push(`category:${(item as any).label}`);
        return { ...item, label: `${(item as any).label} (v)` };
      }
      if ((item as any).type === 'link') {
        seen.push(`link:${(item as any).label}`);
        return { ...item, label: `${(item as any).label} (v)` };
      }
      return item;
    });

    expect(seen).toEqual([
      'doc:a',
      'category:Cat',
      'doc:b',
      'category:Sub',
      'doc:c',
      'link:External',
    ]);

    // Verify deep structure preserved and labels updated
    expect(updated).toMatchObject([
      { type: 'doc', id: 'a', label: 'A (v)' },
      {
        type: 'category',
        label: 'Cat (v)',
        items: [
          { type: 'doc', id: 'b', label: 'B (v)' },
          {
            type: 'category',
            label: 'Sub (v)',
            items: [{ type: 'doc', id: 'c', label: 'C (v)' }],
          },
        ],
      },
      { type: 'link', href: 'https://example.com', label: 'External (v)' },
    ]);
  });
});

describe('collect* helpers', () => {
  const sidebar: any[] = [
    category('Guides', [doc('guides/getting-started', 'Getting Started'), category('Sub', [doc('guides/sub/topic')])], {
      type: 'doc',
      id: 'guides/overview',
    }),
    doc('reference/api', 'API'),
    link('External', 'https://x.y'),
    ref('ref-to-a', 'Ref A'),
  ];

  test('collectSidebarDocItems returns all docs in flatten order', () => {
    const docs = Utils.collectSidebarDocItems(sidebar);
    expect(docs.map((d) => d.id)).toEqual([
      'guides/getting-started',
      'guides/sub/topic',
      'reference/api',
    ]);
  });

  test('collectSidebarCategories returns all categories', () => {
    const cats = Utils.collectSidebarCategories(sidebar);
    expect(cats.map((c) => c.label)).toEqual(['Guides', 'Sub']);
  });

  test('collectSidebarLinks returns all links', () => {
    const links = Utils.collectSidebarLinks(sidebar);
    expect(links.map((l) => l.href)).toEqual(['https://x.y']);
  });

  test('collectSidebarRefs returns all refs', () => {
    const refs = Utils.collectSidebarRefs(sidebar) as any[];
    expect(refs.map((r) => r.id)).toEqual(['ref-to-a']);
  });

  test('collectSidebarDocIds includes category "doc" links and doc items only (order preserved)', () => {
    const ids = Utils.collectSidebarDocIds(sidebar);
    // Order: category(overview) then its children docs, then top-level docs
    expect(ids).toEqual([
      'guides/overview',
      'guides/getting-started',
      'guides/sub/topic',
      'reference/api',
    ]);
  });

  test('collectSidebarNavigation includes docs and categories-with-link (excluding plain links/refs)', () => {
    const nav = Utils.collectSidebarNavigation(sidebar);
    // Expected sequence from flatten: category(Guides with link), docs, then doc 'reference/api'
    expect(nav.map((i: any) => (i.type === 'doc' ? `doc:${i.id}` : `cat:${i.label}:${i.link.type}`))).toEqual([
      'cat:Guides:doc',
      'doc:guides/getting-started',
      'cat:Sub:undefined', // Note: Sub has no link -> should not appear; verify it doesn't.
    ].filter(Boolean as any));

    // Ensure categories without link are not present
    expect(nav.find((i: any) => i.type === 'category' && i.label === 'Sub')).toBeUndefined();
  });
});

describe('collectSidebars* mappings', () => {
  const sidebars: any = {
    main: [
      category('Guides', [doc('a'), doc('b')], { type: 'doc', id: 'intro' }),
      doc('c'),
    ],
    misc: [doc('x'), doc('y')],
  };

  test('collectSidebarsDocIds returns mapping of sidebarId -> doc ids', () => {
    const map = Utils.collectSidebarsDocIds(sidebars);
    expect(map).toEqual({
      main: ['intro', 'a', 'b', 'c'],
      misc: ['x', 'y'],
    });
  });

  test('collectSidebarsNavigations returns mapping of sidebarId -> nav items', () => {
    const map = Utils.collectSidebarsNavigations(sidebars);
    expect(Array.isArray(map.main)).toBe(true);
    expect(map.main.map((i: any) => (i.type === 'doc' ? `doc:${i.id}` : `cat:${i.label}`))).toEqual([
      'cat:Guides',
      'doc:a',
      'doc:b',
      'doc:c',
    ]);
    expect(map.misc.map((i: any) => (i.type === 'doc' ? i.id : i.label))).toEqual(['x', 'y']);
  });
});

describe('createSidebarsUtils - navigation + queries', () => {
  const sidebars: any = {
    main: [
      category('Guides', [doc('guides/getting-started', 'Getting Started'), category('Advanced', [doc('guides/advanced/topic-a'), doc('guides/advanced/topic-b')], { type: 'generated-index', permalink: '/docs/guides/advanced' })], {
        type: 'doc',
        id: 'guides/overview',
      }),
      doc('reference/api', 'API'),
      link('Ext', 'https://example.com'),
    ],
    misc: [doc('misc/a', 'Misc A'), doc('misc/b')],
    nestedOnly: [
      category('Container', [
        category('Inner', [doc('inner/a')], { type: 'generated-index', permalink: '/docs/inner/index' }),
      ]),
    ],
    empty: [],
  };

  const utils = Utils.createSidebarsUtils(sidebars);

  test('getFirstDocIdOfFirstSidebar returns first doc id of first sidebar (including category doc-link)', () => {
    expect(utils.getFirstDocIdOfFirstSidebar()).toBe('guides/overview');
  });

  test('getSidebarNameByDocId returns owning sidebar id', () => {
    expect(utils.getSidebarNameByDocId('guides/overview')).toBe('main');
    expect(utils.getSidebarNameByDocId('misc/a')).toBe('misc');
    expect(utils.getSidebarNameByDocId('does-not-exist')).toBeUndefined();
  });

  describe('getDocNavigation', () => {
    test('returns correct prev/next around a middle doc (implicit sidebar)', () => {
      const nav = utils.getDocNavigation({
        docId: 'guides/getting-started',
        displayedSidebar: undefined,
        unlistedIds: new Set(),
      });

      expect(nav.sidebarName).toBe('main');
      // Prev is the "Guides" category because it has a link
      expect((nav.previous as any).type).toBe('category');
      expect((nav.previous as any).label).toBe('Guides');
      // Next is the "Advanced" category (generated-index)
      expect((nav.next as any).type).toBe('category');
      expect((nav.next as any).label).toBe('Advanced');
    });

    test('filters out unlisted doc ids, including category doc links', () => {
      // Unlist the "Guides" category's doc link id
      const nav = utils.getDocNavigation({
        docId: 'guides/getting-started',
        displayedSidebar: undefined,
        unlistedIds: new Set(['guides/overview']),
      });
      expect(nav.previous).toBeUndefined();
      expect((nav.next as any).type).toBe('category');
      expect((nav.next as any).label).toBe('Advanced');
    });

    test('explicit displayedSidebar used even if different from owning one', () => {
      const nav = utils.getDocNavigation({
        docId: 'guides/getting-started',
        displayedSidebar: 'main',
        unlistedIds: new Set(),
      });
      expect(nav.sidebarName).toBe('main');
    });

    test('returns empty navigation when sidebarName is falsy (displayedSidebar = null)', () => {
      const nav = utils.getDocNavigation({
        docId: 'guides/getting-started',
        displayedSidebar: null,
        unlistedIds: new Set(),
      });
      expect(nav).toEqual({
        sidebarName: undefined,
        previous: undefined,
        next: undefined,
      });
    });

    test('throws when displayedSidebar does not exist', () => {
      expect(() =>
        utils.getDocNavigation({
          docId: 'guides/getting-started',
          displayedSidebar: 'unknown-sidebar',
          unlistedIds: new Set(),
        })
      ).toThrow(/wants to display sidebar unknown-sidebar but a sidebar with this name doesn't exist/);
    });

    test('when docId not part of navigation, returns sidebarName with undefined prev/next', () => {
      const nav = utils.getDocNavigation({
        docId: 'not-in-nav',
        displayedSidebar: 'main',
        unlistedIds: new Set(),
      });
      expect(nav).toEqual({ sidebarName: 'main', previous: undefined, next: undefined });
    });

    test('boundary: last doc has undefined next', () => {
      const nav = utils.getDocNavigation({
        docId: 'reference/api',
        displayedSidebar: undefined,
        unlistedIds: new Set(),
      });
      expect(nav.sidebarName).toBe('main');
      expect(nav.next).toBeUndefined();
      expect((nav.previous as any).type).toBe('doc');
      expect((nav.previous as any).id).toBe('guides/advanced/topic-b');
    });
  });

  describe('getCategoryGeneratedIndexList / getCategoryGeneratedIndexNavigation', () => {
    test('returns list of categories with generated-index link', () => {
      const list = utils.getCategoryGeneratedIndexList();
      const labels = list.map((i: any) => i.label).sort();
      expect(labels).toEqual(['Advanced', 'Inner']);
    });

    test('navigates around a category generated index by permalink', () => {
      const nav = utils.getCategoryGeneratedIndexNavigation('/docs/guides/advanced');
      expect(nav.sidebarName).toBe('main');
      expect((nav.previous as any).type).toBe('doc');
      expect((nav.previous as any).id).toBe('guides/getting-started');
      expect((nav.next as any).type).toBe('doc');
      expect((nav.next as any).id).toBe('guides/advanced/topic-a');
    });

    test('boundary: first/last generated index neighbors can be undefined', () => {
      const nav = utils.getCategoryGeneratedIndexNavigation('/docs/inner/index');
      expect(nav.sidebarName).toBe('nestedOnly');
      expect(nav.previous).toBeUndefined();
      expect((nav.next as any).type).toBe('doc');
      expect((nav.next as any).id).toBe('inner/a');
    });
  });

  describe('legacy validation helpers', () => {
    test('checkLegacyVersionedSidebarNames throws with helpful error', () => {
      const withLegacyNames: any = {
        'version-3.0.0-alpha/my': [doc('a')],
        normal: [doc('b')],
      };
      const u = Utils.createSidebarsUtils(withLegacyNames);
      expect(() =>
        u.checkLegacyVersionedSidebarNames({
          versionMetadata: { versionName: '3.0.0-alpha' } as any,
          sidebarFilePath: '/absolute/path/to/sidebars.js',
        })
      ).toThrow(/legacy versioned sidebar names are not supported/i);
      expect(() =>
        u.checkLegacyVersionedSidebarNames({
          versionMetadata: { versionName: '3.0.0-alpha' } as any,
          sidebarFilePath: '/absolute/path/to/sidebars.js',
        })
      ).toThrow(/Please remove the "version-3.0.0-alpha\/" prefix/);
    });

    test('checkSidebarsDocIds throws for invalid ids with list of available ids', () => {
      // 'reference/api' exists in sidebars above, we intentionally omit it from allDocIds
      const allDocIds = [
        'guides/overview',
        'guides/getting-started',
        'guides/advanced/topic-a',
        'guides/advanced/topic-b',
      ];
      expect(() =>
        utils.checkSidebarsDocIds({
          allDocIds,
          sidebarFilePath: '/path/to/sidebars.js',
          versionMetadata: { versionName: '3.0.0' } as any,
        })
      ).toThrow(/These sidebar document ids do not exist:/i);
      expect(() =>
        utils.checkSidebarsDocIds({
          allDocIds,
          sidebarFilePath: '/path/to/sidebars.js',
          versionMetadata: { versionName: '3.0.0' } as any,
        })
      ).toThrow(/Available document ids are:/i);
    });

    test('checkSidebarsDocIds emits legacy doc id error first when prefixed ids present', () => {
      const sb: any = {
        s: [doc('version-1.2.3/intro')],
      };
      const u = Utils.createSidebarsUtils(sb);
      expect(() =>
        u.checkSidebarsDocIds({
          allDocIds: [],
          sidebarFilePath: '/path/to/sidebars.js',
          versionMetadata: { versionName: '1.2.3' } as any,
        })
      ).toThrow(/legacy versioned document ids are not supported/i);
    });
  });

  describe('getFirstLink', () => {
    test('returns doc link when first item is a category with doc link', () => {
      const first = utils.getFirstLink('main')!;
      expect(first).toEqual({ type: 'doc', id: 'guides/overview', label: 'Guides' });
    });

    test('returns first top-level doc link with label fallback', () => {
      const first = utils.getFirstLink('misc')!;
      expect(first).toEqual({ type: 'doc', id: 'misc/a', label: 'Misc A' });
    });

    test('returns generated-index from nested category when top-level category has no link', () => {
      const first = utils.getFirstLink('nestedOnly')!;
      expect(first).toEqual({ type: 'generated-index', permalink: '/docs/inner/index', label: 'Inner' });
    });

    test('returns undefined for empty sidebar', () => {
      expect(utils.getFirstLink('empty')).toBeUndefined();
    });
  });
});

describe('toDocNavigationLink and toNavigationLink', () => {
  const baseDoc = (overrides: any): any => ({
    title: 'Base Title',
    permalink: '/base',
    frontMatter: {},
    ...overrides,
  });

  test('toDocNavigationLink title precedence: pagination_label > sidebar_label > options.sidebarItemLabel > title', () => {
    // 1) pagination_label wins
    expect(
      Utils.toDocNavigationLink(
        baseDoc({ frontMatter: { pagination_label: 'P', sidebar_label: 'S' } })
      )
    ).toEqual({ title: 'P', permalink: '/base' });

    // 2) sidebar_label when no pagination_label
    expect(
      Utils.toDocNavigationLink(
        baseDoc({ frontMatter: { sidebar_label: 'S' } })
      )
    ).toEqual({ title: 'S', permalink: '/base' });

    // 3) options.sidebarItemLabel when no fm labels
    expect(
      Utils.toDocNavigationLink(
        baseDoc({}),
        { sidebarItemLabel: 'FromItem' }
      )
    ).toEqual({ title: 'FromItem', permalink: '/base' });

    // 4) fallback to doc title
    expect(Utils.toDocNavigationLink(baseDoc({}))).toEqual({
      title: 'Base Title',
      permalink: '/base',
    });
  });

  describe('toNavigationLink', () => {
    const docsById: Record<string, any> = {
      'reference/api': baseDoc({
        title: 'API Title',
        permalink: '/api',
        frontMatter: {},
      }),
      'guides/overview': baseDoc({
        title: 'Overview Title',
        permalink: '/overview',
        frontMatter: { sidebar_label: 'Overview Sidebar' },
      }),
    };

    test('undefined navigation item -> undefined', () => {
      expect(Utils.toNavigationLink(undefined, docsById)).toBeUndefined();
    });

    test('category with generated-index link -> plain link with label + permalink', () => {
      const nav = Utils.toNavigationLink(
        {
          type: 'category',
          label: 'Advanced',
          link: { type: 'generated-index', permalink: '/gen' },
          items: [],
        } as any,
        docsById
      )!;
      expect(nav).toEqual({ title: 'Advanced', permalink: '/gen' });
    });

    test('category with doc link -> applies toDocNavigationLink on target doc', () => {
      const nav = Utils.toNavigationLink(
        {
          type: 'category',
          label: 'Guides',
          link: { type: 'doc', id: 'guides/overview' },
          items: [],
        } as any,
        docsById
      )!;
      // sidebar_label should win from the doc metadata
      expect(nav).toEqual({ title: 'Overview Sidebar', permalink: '/overview' });
    });

    test('doc item -> toDocNavigationLink with sidebarItemLabel as fallback', () => {
      const nav = Utils.toNavigationLink(
        { type: 'doc', id: 'reference/api', label: 'API Label' } as any,
        docsById
      )!;
      // No fm labels => title should be "API Label" (from sidebar item label)
      expect(nav).toEqual({ title: 'API Label', permalink: '/api' });
    });

    test('throws if doc id missing in docsById', () => {
      expect(() =>
        Utils.toNavigationLink({ type: 'doc', id: 'missing' } as any, docsById)
      ).toThrow(/no doc found with id=missing/);
    });
  });
});