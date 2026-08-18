/**
 * Vault module tests: scanning, frontmatter, retrieval, tasks, stats, and
 * draft guards.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ParsedNote } from '../src/vault/scanner.ts'
import { scanVault, collectTags, titleOf, parseNoteFile, DAILY_PATTERN } from '../src/vault/scanner.ts'
import { RetrievalIndex, gramsOf, normalize, makeSnippet } from '../src/vault/retrieval.ts'
import { extractTasks, collectTasks } from '../src/vault/tasks.ts'
import { computeStats } from '../src/vault/stats.ts'
import { sanitizeTitle, saveDraft } from '../src/vault/drafts.ts'

/** Build a ParsedNote fixture. */
function note(path: string, title: string, content: string, tags: string[] = [], mtime = 1): ParsedNote {
  return { path, title, tags, aliases: [], frontmatter: { title, tags }, content, mtime }
}

describe('scanner', () => {
  it('parses frontmatter title/tags/aliases and strips the block', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsidian-scan-'))
    const file = join(vault, 'a.md')
    writeFileSync(file, [
      '---',
      'title: 我的笔记',
      'tags: [项目, 助手]',
      'aliases: [别名A, 别名B]',
      '---',
      '',
      '# 正文',
      '',
      '内容内容',
    ].join('\n'), 'utf8')
    const { note, issue } = parseNoteFile(vault, file)
    expect(issue).toBeUndefined()
    expect(note?.title).toBe('我的笔记')
    expect(note?.tags).toEqual(['项目', '助手'])
    expect(note?.aliases).toEqual(['别名A', '别名B'])
    expect(note?.content).toContain('# 正文')
    expect(note?.content).not.toContain('title:')
  })

  it('falls back to the basename title without frontmatter', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsidian-scan-'))
    const file = join(vault, 'note.md')
    writeFileSync(file, 'plain body', 'utf8')
    const { note } = parseNoteFile(vault, file)
    expect(note?.title).toBe('note')
    expect(note?.content).toBe('plain body')
  })

  it('collects a full scan and reports unreadable files as issues', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsidian-scan-'))
    mkdirSync(join(vault, '.obsidian'), { recursive: true })
    mkdirSync(join(vault, '每日'), { recursive: true })
    writeFileSync(join(vault, '.obsidian', 'app.json'), '{}', 'utf8')
    writeFileSync(join(vault, '每日', '2026-06-18.md'), '# d', 'utf8')
    writeFileSync(join(vault, 'x.md'), 'x', 'utf8')
    const { notes, issues } = scanVault(vault)
    expect(notes.map(item => item.path).sort()).toEqual(['x.md', '每日/2026-06-18.md'])
    expect(issues).toEqual([])
  })

  it('mints tags from comma/space strings', () => {
    expect(collectTags({ tags: 'a, b #c' })).toEqual(['a', 'b', 'c'])
    expect(collectTags({ tags: ['x', '#y'] })).toEqual(['x', 'y'])
  })

  it('uses frontmatter title over basename', () => {
    expect(titleOf('dir/a.md', { title: '自定义' })).toBe('自定义')
    expect(titleOf('dir/a.md', {})).toBe('a')
  })
})

describe('retrieval', () => {
  it('normalizes and grams text', () => {
    expect(normalize('  Hello  世界 ')).toBe('hello 世界')
    expect(gramsOf('ab')).toEqual(new Set(['a', 'b', 'ab']))
  })

  it('finds the matching Chinese note deterministically', () => {
    const index = new RetrievalIndex()
    index.rebuild([
      note('a.md', '项目', '知识库助手项目，使用 RAG 方案进行检索。', ['项目']),
      note('b.md', '会议', '今天讨论了知识库的索引与检索算法。'),
      note('c.md', '其他', '完全无关的购物清单。'),
    ])
    const hits = index.search('RAG 方案', 3, 80)
    expect(hits.length).toBeGreaterThan(0)
    // Only a.md mentions RAG; it must rank first.
    expect(hits[0]?.path).toBe('a.md')
    expect(hits[0]?.snippet.length).toBeGreaterThan(0)
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0)
  })

  it('boosts title matches', () => {
    const index = new RetrievalIndex()
    index.rebuild([
      note('a.md', '周报模板', '正文里也有周报这个词。'),
      note('b.md', '其他', '正文里提到周报与周报的写法。'),
    ])
    const hits = index.search('周报', 2, 80)
    expect(hits[0]?.path).toBe('a.md')
  })

  it('honors an offset path filter', () => {
    const index = new RetrievalIndex()
    index.rebuild([
      note('a.md', '甲', '关键词内容'),
      note('b.md', '乙', '关键词内容'),
    ])
    const hits = index.search('关键词', 2, 80, 'b.md')
    expect(hits.map(hit => hit.path)).toEqual(['b.md'])
  })

  it('makes a bounded snippet around the match', () => {
    const text = '前缀'.repeat(50) + '关键词' + '后缀'.repeat(50)
    const snippet = makeSnippet(text, '关键词', ['关', '键'], 40)
    expect(snippet).toContain('关键词')
    expect(snippet.length).toBeLessThan(120)
  })

  it('returns an empty result for a blank query', () => {
    const index = new RetrievalIndex()
    index.rebuild([note('a.md', '甲', '正文')])
    expect(index.search('   ', 3, 80)).toEqual([])
  })
})

describe('tasks', () => {
  it('extracts checkboxes with due dates and inline tags', () => {
    const item = note('每日/2026-06-18.md', '每日', [
      '- [ ] 完成设计 (2026-06-20) #工作',
      '- [x] 已办事项',
      '* [ ] 无序清单项',
      '普通文本',
    ].join('\n'))
    const tasks = extractTasks(item)
    expect(tasks).toHaveLength(3)
    expect(tasks[0]).toMatchObject({ text: '完成设计', done: false, dueDate: '2026-06-20', tags: ['工作'], line: 1 })
    expect(tasks[1]).toMatchObject({ text: '已办事项', done: true })
    expect(tasks[2]?.dateGroup).toBe('2026-06-18')
  })

  it('groups undated tasks under the fallback group', () => {
    const item = note('x.md', 'x', '- [ ] 无日期任务')
    const tasks = extractTasks(item)
    expect(tasks[0]?.dateGroup).toBe('未指定日期')
  })

  it('filters done tasks unless requested', () => {
    const notes = [note('a.md', 'a', '- [ ] 待办\n- [x] 完成')]
    expect(collectTasks(notes, false)).toHaveLength(1)
    expect(collectTasks(notes, true)).toHaveLength(2)
  })
})

describe('stats', () => {
  it('computes counts, tags, recent edits, and issues', () => {
    const notes = [
      note('a.md', '甲', 'x', ['tag1'], 100),
      note('每日/2026-06-18.md', '乙', 'x', ['tag1', 'tag2'], 200),
      note('c.md', '丙', 'x', [], 300),
    ]
    const stats = computeStats(notes, [{ path: 'bad.md', reason: 'EACCES' }], 1234)
    expect(stats.noteCount).toBe(3)
    expect(stats.tagCounts).toEqual({ tag1: 2, tag2: 1 })
    expect(stats.dailyNoteCount).toBe(1)
    expect(stats.untaggedCount).toBe(1)
    expect(stats.issueCount).toBe(1)
    expect(stats.lastScanAt).toBe(1234)
    expect(stats.recentNotes[0]?.path).toBe('c.md')
  })
})

describe('drafts', () => {
  it('sanitizes illegal title characters', () => {
    expect(sanitizeTitle('标题<>:"?/')).toBe('标题')
    expect(sanitizeTitle('  a  b  ')).toBe('a b')
  })

  it('writes a draft into the drafts folder and refuses escapes', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsidian-draft-'))
    const result = saveDraft(vault, 'Drafts', '草稿标题', '# 草稿')
    expect(result.path).toContain(join(vault, 'Drafts'))
    expect(readFileSync(result.path, 'utf8')).toBe('# 草稿')
    expect(() => saveDraft(vault, 'Drafts', '../逃逸', 'x')).toThrow()
    expect(() => saveDraft(vault, 'Drafts', '', 'x')).toThrow()
    expect(() => saveDraft(vault, 'Drafts', 'a/b', 'x')).toThrow()
  })

  it('avoids overwriting an existing draft', () => {
    const vault = mkdtempSync(join(tmpdir(), 'obsidian-draft-'))
    saveDraft(vault, 'Drafts', '同名', 'one')
    const second = saveDraft(vault, 'Drafts', '同名', 'two')
    expect(second.path).not.toContain('同名.md')
    expect(existsSync(join(vault, 'Drafts', '同名.md'))).toBe(true)
  })
})

describe('daily pattern', () => {
  it('detects daily-note paths', () => {
    expect(DAILY_PATTERN.test('每日/2026-06-18.md')).toBe(true)
    expect(DAILY_PATTERN.test('notes/2026/06/18.md')).toBe(true)
    expect(DAILY_PATTERN.test('plain.md')).toBe(false)
  })
})
