/**
 * Unit tests for sidebars utils.
 * Framework: Jest + @swc/jest (TypeScript).
 * Focus: utils.ts exports (navigation, collection, legacy checks).
 */

jest.mock('@docusaurus/utils', () => ({
  toMessageRelativeFilePath: (p: string) => p, // stabilize error messages
}));

import * as utils from './utils';

describe('sidebars utils', () => {
  describe('isCategoriesShorthand', () => {
    it('returns true for plain object without type', () => {
      expect(utils.isCategoriesShorthand({ foo: 'bar' } as any)).toBe(true);
    });

    it('returns false for object with type field', () => {
      expect(utils.isCategoriesShorthand({ type: 'doc', id: 'x' } as any)).toBe(false);
    });

    it('returns false for non-object inputs', () => {
      expect(utils.isCategoriesShorthand('str' as any)).toBe(false);
      expect(utils.isCategoriesShorthand(42 as any)).toBe(false);
      expect(utils.isCategoriesShorthand(null as any)).toBe(false);
      expect(utils.isCategoriesShorthand(undefined as any)).toBe(false);
    });

    it('returns true when type is explicitly undefined (edge case)', () => {
      expect(utils.isCategoriesShorthand({ type: undefined } as any)).toBe(true);
    });
  });

  describe('transformSidebarItems', () => {
    it('recursively applies the update function to all items, including nested categories', () => {
      const sidebar = [
        { type: 'doc', id: 'a' },
        {
          type: 'category',
          label: 'Cat',
          items: [
            { type: 'doc', id: 'b' },
            { type: 'category', label: 'Sub', items: [{ type: 'doc', id: 'c' }] },
          ],
        },
      ] as any;

      const seen: string[] = [];
      const out = utils.transformSidebarItems(sidebar, (item: any) => {
        if (item.type === 'doc') {
          seen.push(item.id);
          return { ...item, label: (item.label ?? item.id).toUpperCase() };
        }
        if (item.type === 'category') {
          seen.push(`[cat:${item.label}]`);
          return { ...item, label: `${item.label}!` };
        }
        return item;
      });

      expect(seen).toEqual(['a', '[cat:Cat]', 'b', '[cat:Sub]', 'c']);
      expect(out).toEqual([
        { type: 'doc', id: 'a', label: 'A' },
        {
          type: 'category',
          label: 'Cat!',
          items: [
            { type: 'doc', id: 'b', label: 'B' },
            { type: 'category', label: 'Sub!', items: [{ type: 'doc', id: 'c', label: 'C' }] },
          ],
        },
      ]);
    });
  });

  describe('collectors (flatten-based)', () => {
    const sidebar = [
      { type: 'doc', id: 'd1' },
      {
        type: 'category',
        label: 'Cat',
        link: { type: 'doc', id: 'cat-index' },
        items: [
          { type: 'link', label: 'external', href: 'https://example.com' },
          { type: 'doc', id: 'd2' },
          { type: 'ref', id: 'd-ref' },
          { type: 'category', label: 'SubCat', items: [{ type: 'doc', id: 'd3' }] },
        ],
      },
    ] as any;

    it('collectSidebarDocItems', () => {
      expect(utils.collectSidebarDocItems(sidebar).map((i) => i.id)).toEqual(['d1', 'd2', 'd3']);
    });

    it('collectSidebarCategories', () => {
      expect(utils.collectSidebarCategories(sidebar).map((i) => i.label)).toEqual([
        'Cat',
        'SubCat',
      ]);
    });

    it('collectSidebarLinks', () => {
      expect(utils.collectSidebarLinks(sidebar).map((i) => i.label)).toEqual(['external']);
    });

    it('collectSidebarRefs', () => {
      expect(utils.collectSidebarRefs(sidebar).map((i) => i.id)).toEqual(['d-ref']);
    });

    it('collectSidebarDocIds preserves order and includes category doc links', () => {
      expect(utils.collectSidebarDocIds(sidebar)).toEqual(['d1', 'cat-index', 'd2', 'd3']);
    });

    it('collectSidebarNavigation includes doc items and categories with a link', () => {
      const nav = utils.collectSidebarNavigation(sidebar);
      const labels = nav.map((i: any) =>
        i.type === 'category' ? `cat:${i.label}` : `doc:${i.id}`,
      );
      expect(labels).toEqual(['doc:d1', 'cat:Cat', 'doc:d2', 'doc:d3']);
    });

    it('collectSidebars* map across multiple sidebars', () => {
      const sidebars = { first: sidebar, second: [{ type: 'doc', id: 'x' }] as any };
      expect(utils.collectSidebarsDocIds(sidebars)).toEqual({
        first: ['d1', 'cat-index', 'd2', 'd3'],
        second: ['x'],
      });
      const nav = utils.collectSidebarsNavigations(sidebars);
      expect(nav.first.length).toBeGreaterThan(0);
      expect(nav.second.map((i: any) => (i.type === 'doc' ? i.id : i.label))).toEqual(['x']);
    });
  });

  describe('createSidebarsUtils core behaviors', () => {
    function buildSidebars() {
      const first = [
        { type: 'doc', id: 'a' },
        {
          type: 'category',
          label: 'Cat1',
          link: { type: 'doc', id: 'cat1' },
          items: [
            { type: 'doc', id: 'b', label: 'Bee' },
            { type: 'category', label: 'Sub', items: [{ type: 'doc', id: 'c' }] },
          ],
        },
        { type: 'link', label: 'ext', href: 'https://example.com' },
      ] as any;

      const second = [
        {
          type: 'category',
          label: 'Gen',
          link: { type: 'generated-index', permalink: '/generated/gen' },
          items: [{ type: 'doc', id: 'd' }],
        },
        { type: 'doc', id: 'e' },
      ] as any;

      return { first, second };
    }

    it('getFirstDocIdOfFirstSidebar returns first doc', () => {
      const { first, second } = buildSidebars();
      const su = utils.createSidebarsUtils({ first, second } as any);
      expect(su.getFirstDocIdOfFirstSidebar()).toBe('a');
    });

    it('getSidebarNameByDocId maps ids to their sidebar', () => {
      const { first, second } = buildSidebars();
      const su = utils.createSidebarsUtils({ first, second } as any);
      expect(su.getSidebarNameByDocId('a')).toBe('first');
      expect(su.getSidebarNameByDocId('d')).toBe('second');
      expect(su.getSidebarNameByDocId('missing')).toBeUndefined();
    });

    describe('getDocNavigation', () => {
      it('returns empty navigation when sidebar cannot be determined', () => {
        const { first, second } = buildSidebars();
        const su = utils.createSidebarsUtils({ first, second } as any);
        const nav = su.getDocNavigation({
          docId: 'unknown',
          displayedSidebar: undefined,
          unlistedIds: new Set(),
        });
        expect(nav).toEqual({ sidebarName: undefined, previous: undefined, next: undefined });
      });

      it('throws when displayedSidebar is specified but does not exist', () => {
        const { first } = buildSidebars();
        const su = utils.createSidebarsUtils({ first } as any);
        expect(() =>
          su.getDocNavigation({
            docId: 'a',
            displayedSidebar: 'does-not-exist',
            unlistedIds: new Set(),
          }),
        ).toThrow(
          /Doc with ID a wants to display sidebar does-not-exist but a sidebar with this name doesn't exist/,
        );
      });

      it('filters unlisted docs from navigation', () => {
        const { second } = buildSidebars();
        const su = utils.createSidebarsUtils({ second } as any);
        const nav1 = su.getDocNavigation({
          docId: 'e',
          displayedSidebar: 'second',
          unlistedIds: new Set(['d']),
        });
        expect(nav1.previous && nav1.previous.type).toBe('category'); // generated-index category remains
        expect((nav1.previous as any).label).toBe('Gen');
        expect(nav1.next).toBeUndefined();
      });

      it('filters categories when their doc link is unlisted', () => {
        const { first } = buildSidebars();
        const su = utils.createSidebarsUtils({ first } as any);
        const navB = su.getDocNavigation({
          docId: 'b',
          displayedSidebar: 'first',
          unlistedIds: new Set(['cat1']), // unlist the category's doc link target
        });
        expect((navB.previous as any).type).toBe('doc');
        expect((navB.previous as any).id).toBe('a');
        expect((navB.next as any).id).toBe('c');
      });

      it('returns neighbors when current item exists in navigation', () => {
        const { first } = buildSidebars();
        const su = utils.createSidebarsUtils({ first } as any);

        const navA = su.getDocNavigation({
          docId: 'a',
          displayedSidebar: undefined,
          unlistedIds: new Set(),
        });
        expect(navA.previous).toBeUndefined();
        expect(navA.next && navA.next.type).toBe('category');
        expect(navA.sidebarName).toBe('first');

        const navB = su.getDocNavigation({
          docId: 'b',
          displayedSidebar: 'first',
          unlistedIds: new Set(),
        });
        expect((navB.previous as any).type).toBe('category');
        expect((navB.next as any).type).toBe('doc');
        expect((navB.next as any).id).toBe('c');
      });

      it('returns undefined prev/next when current item is not found but sidebar exists', () => {
        const { first } = buildSidebars();
        const su = utils.createSidebarsUtils({ first } as any);
        const nav = su.getDocNavigation({
          docId: 'zzz',
          displayedSidebar: 'first',
          unlistedIds: new Set(),
        });
        expect(nav).toEqual({ sidebarName: 'first', previous: undefined, next: undefined });
      });
    });

    it('getCategoryGeneratedIndexList returns categories with generated-index links', () => {
      const { second } = buildSidebars();
      const su = utils.createSidebarsUtils({ second } as any);
      const list = su.getCategoryGeneratedIndexList();
      expect(list).toHaveLength(1);
      expect(list[0].link.type).toBe('generated-index');
      expect(list[0].link.permalink).toBe('/generated/gen');
    });

    it('getCategoryGeneratedIndexNavigation finds correct neighbors by permalink', () => {
      const sidebars = {
        sb: [
          { type: 'doc', id: 'start' },
          {
            type: 'category',
            label: 'G',
            link: { type: 'generated-index', permalink: '/gen' },
            items: [{ type: 'doc', id: 'mid' }],
          },
          { type: 'doc', id: 'end' },
        ],
      } as any;
      const su = utils.createSidebarsUtils(sidebars);
      const nav = su.getCategoryGeneratedIndexNavigation('/gen');
      expect(nav.sidebarName).toBe('sb');
      expect((nav.previous as any).id).toBe('start');
      expect((nav.next as any).id).toBe('end');
    });

    describe('legacy checks and validation', () => {
      const versionMetadata = { versionName: '1.0.0' } as any;

      it('checkLegacyVersionedSidebarNames throws with helpful message when illegal prefix is used', () => {
        const illegal = 'version-1.0.0/';
        const sidebars = {
          [`${illegal}mySidebar`]: [{ type: 'doc', id: 'a' }],
          ok: [{ type: 'doc', id: 'b' }],
        } as any;

        const su = utils.createSidebarsUtils(sidebars);
        expect(() =>
          su.checkLegacyVersionedSidebarNames({
            versionMetadata,
            sidebarFilePath: '/path/to/sidebars.js',
          }),
        ).toThrow(/These legacy versioned sidebar names are not supported anymore/);
      });

      it('checkSidebarsDocIds throws with unknown ids and lists available ones', () => {
        const sidebars = {
          s1: [
            { type: 'doc', id: 'a' },
            { type: 'doc', id: 'missing-1' },
          ],
        } as any;
        const su = utils.createSidebarsUtils(sidebars);
        expect(() =>
          su.checkSidebarsDocIds({
            allDocIds: ['a', 'b', 'c'],
            sidebarFilePath: 'sidebars.js',
            versionMetadata,
          }),
        ).toThrow(/These sidebar document ids do not exist:\n- missing-1/);
      });

      it('checkSidebarsDocIds throws legacy-specific error when invalid ids have legacy prefix', () => {
        const sidebars = { s1: [{ type: 'doc', id: 'version-1.0.0/old' }] } as any;
        const su = utils.createSidebarsUtils(sidebars);
        expect(() =>
          su.checkSidebarsDocIds({
            allDocIds: ['new'],
            sidebarFilePath: 'sidebars.js',
            versionMetadata,
          }),
        ).toThrow(/These legacy versioned document ids are not supported anymore/);
      });
    });

    describe('getFirstLink utility', () => {
      it('returns first doc with label fallback to id', () => {
        const sb = [{ type: 'doc', id: 'docA' }] as any;
        const su = utils.createSidebarsUtils({ sb } as any);
        expect(su.getFirstLink('sb')).toEqual({ type: 'doc', id: 'docA', label: 'docA' });
      });

      it('uses explicit doc label when provided', () => {
        const sb = [{ type: 'doc', id: 'id1', label: 'Label1' }] as any;
        const su = utils.createSidebarsUtils({ sb } as any);
        expect(su.getFirstLink('sb')).toEqual({ type: 'doc', id: 'id1', label: 'Label1' });
      });

      it('returns category doc link when present with category label', () => {
        const sb = [
          {
            type: 'category',
            label: 'Cat',
            link: { type: 'doc', id: 'cat-doc' },
            items: [{ type: 'doc', id: 'x' }],
          },
        ] as any;
        const su = utils.createSidebarsUtils({ sb } as any);
        expect(su.getFirstLink('sb')).toEqual({ type: 'doc', id: 'cat-doc', label: 'Cat' });
      });

      it('returns generated-index when category has generated-index link', () => {
        const sb = [
          {
            type: 'category',
            label: 'Gen',
            link: { type: 'generated-index', permalink: '/gen' },
            items: [],
          },
        ] as any;
        const su = utils.createSidebarsUtils({ sb } as any);
        expect(su.getFirstLink('sb')).toEqual({
          type: 'generated-index',
          permalink: '/gen',
          label: 'Gen',
        });
      });

      it('recurses into sub-items when category has no link', () => {
        const sb = [
          {
            type: 'category',
            label: 'NoLink',
            items: [
              { type: 'link', label: 'ext', href: 'https://example.com' },
              { type: 'doc', id: 'deep' },
            ],
          },
        ] as any;
        const su = utils.createSidebarsUtils({ sb } as any);
        expect(su.getFirstLink('sb')).toEqual({ type: 'doc', id: 'deep', label: 'deep' });
      });

      it('returns undefined when sidebar has no doc or generated-index path', () => {
        const sb = [{ type: 'link', label: 'ext', href: 'https://example.com' }] as any;
        const su = utils.createSidebarsUtils({ sb } as any);
        expect(su.getFirstLink('sb')).toBeUndefined();
      });
    });
  });

  describe('toDocNavigationLink and toNavigationLink', () => {
    const baseDoc = (overrides: Partial<any> = {}): any => ({
      title: 'Default Title',
      permalink: '/default',
      frontMatter: { pagination_label: undefined, sidebar_label: undefined },
      ...overrides,
    });

    it('toDocNavigationLink title precedence: pagination_label > sidebar_label > options.sidebarItemLabel > title', () => {
      const doc = baseDoc({
        frontMatter: { pagination_label: 'Pag', sidebar_label: 'Side' },
        title: 'DocTitle',
      });
      expect(utils.toDocNavigationLink(doc)).toEqual({ title: 'Pag', permalink: '/default' });

      const doc2 = baseDoc({
        frontMatter: { pagination_label: undefined, sidebar_label: 'Side' },
      });
      expect(utils.toDocNavigationLink(doc2, { sidebarItemLabel: 'SidebarItem' })).toEqual({
        title: 'Side',
        permalink: '/default',
      });

      const doc3 = baseDoc();
      expect(utils.toDocNavigationLink(doc3, { sidebarItemLabel: 'SidebarItem' })).toEqual({
        title: 'SidebarItem',
        permalink: '/default',
      });

      const doc4 = baseDoc();
      expect(utils.toDocNavigationLink(doc4)).toEqual({
        title: 'Default Title',
        permalink: '/default',
      });
    });

    it('toNavigationLink returns undefined when navigationItem is undefined', () => {
      expect(utils.toNavigationLink(undefined as any, {} as any)).toBeUndefined();
    });

    it('toNavigationLink handles category with generated-index', () => {
      const item = {
        type: 'category',
        label: 'Gen',
        link: { type: 'generated-index', permalink: '/gen' },
      } as any;
      expect(utils.toNavigationLink(item, {} as any)).toEqual({
        title: 'Gen',
        permalink: '/gen',
      });
    });

    it('toNavigationLink throws if doc id not found', () => {
      const item = { type: 'doc', id: 'miss', label: 'Label' } as any;
      expect(() => utils.toNavigationLink(item, {} as any)).toThrow(
        "Can't create navigation link: no doc found with id=miss",
      );
    });

    it('toNavigationLink includes sidebar item label when present for docs', () => {
      const item = { type: 'doc', id: 'doc1', label: 'ItemLabel' } as any;
      const docsById = {
        doc1: {
          title: 'DocTitle',
          permalink: '/doc1',
          frontMatter: { pagination_label: undefined, sidebar_label: undefined },
        },
      } as any;
      expect(utils.toNavigationLink(item, docsById)).toEqual({
        title: 'ItemLabel',
        permalink: '/doc1',
      });
    });

    it('toNavigationLink for category with doc link uses the target doc metadata (with pagination_label precedence)', () => {
      const item = { type: 'category', label: 'Cat', link: { type: 'doc', id: 'docX' } } as any;
      const docsById = {
        docX: {
          title: 'DocX Title',
          permalink: '/docX',
          frontMatter: { pagination_label: 'PagX', sidebar_label: 'SideX' },
        },
      } as any;
      expect(utils.toNavigationLink(item, docsById)).toEqual({
        title: 'PagX',
        permalink: '/docX',
      });
    });
  });
});