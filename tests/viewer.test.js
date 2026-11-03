import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTarget,resolveTarget,pageFragment,sourceURL,parseOrg,renderOrg,languageFor} from '../script.js';

test('default branch, tags, slash branches, commit links and encoded URLs',()=>{
 const cases=[
  ['#https://github.com/tani/lean-qasm',null],
  ['#https://github.com/tani/lean-qasm/tree/main','main'],
  ['#https://github.com/tani/lean-qasm/tree/feature/with/slashes','feature/with/slashes'],
  ['#https://github.com/tani/lean-qasm?ref=feature%2Fwith%2Fslashes','feature/with/slashes'],
  ['#https://github.com/tani/lean-qasm/tree/v1.0.0','v1.0.0'],
  ['#https://github.com/tani/lean-qasm/commit/fd18263ce6823a50c433f33dbdcde248bc842c47','fd18263ce6823a50c433f33dbdcde248bc842c47'],
  ['#'+encodeURIComponent('https://github.com/tani/lean-qasm/tree/main'),'main']
 ];
 for(const [input,ref] of cases){const t=parseTarget(input);assert.equal(t.repository,'tani/lean-qasm');assert.equal(t.ref,ref);}
 assert.equal(parseTarget('#'),null);
});
test('page navigation preserves the repository and revision',()=>{
 const target=parseTarget('#https://github.com/tani/lean-qasm?ref=feature%2Fbranch');
 const next=parseTarget(pageFragment(target,12));assert.equal(next.page,12);assert.equal(next.ref,target.ref);assert.equal(next.identity,target.identity);
 assert.equal(parseTarget(pageFragment(next,1)).page,1);
});
test('rejects unsafe hosts, ambiguous revisions and invalid page numbers',()=>{
 for(const hash of ['#javascript:alert(1)','#http://github.com/tani/repo','#https://github.com.evil.test/tani/repo','#https://user@github.com/tani/repo','#https://github.com/tani/repo/issues/1','#https://github.com/tani/repo/tree/main?ref=other','#https://github.com/tani/repo?step=0','#https://github.com/tani/repo?step=NaN','#https://github.com/tani/repo?ref=bad..ref'])assert.throws(()=>parseTarget(hash),hash);
});
test('source URLs are pinned and filenames are safely encoded',()=>{
 const ctx={repository:'tani/repo',sha:'a'.repeat(40)};assert.equal(sourceURL(ctx,'dir/a file.lean'),`https://cdn.jsdelivr.net/gh/tani/repo@${ctx.sha}/dir/a%20file.lean`);
 for(const path of ['../secret','a/../secret','/secret','a\\secret'])assert.throws(()=>sourceURL(ctx,path));
 assert.throws(()=>sourceURL({...ctx,sha:'main'},'TOUR.org'));
});
test('text-only pages and code pages can be interleaved',()=>{
 const org='* Introduction\nHello.\n* Code\n:PROPERTIES:\n:FILE: dir/a file.lean\n:LINES: 2-4\n:END:\nRead.\n* Summary\nDone.';
 const s=parseOrg(org);assert.equal(s.length,3);assert.equal(s[0].file,null);assert.equal(s[1].file,'dir/a file.lean');assert.equal(s[2].file,null);
 for(const props of [':FILE: a.js',':LINES: 1-2',':FILE: a.js\n:LINES: 4-2'])assert.throws(()=>parseOrg('* Bad\n:PROPERTIES:\n'+props+'\n:END:'));
});
test('Mermaid, math and code are isolated from Org emphasis and raw HTML',()=>{
 const math=renderOrg(String.raw`Inline \(x = y * z = w\).

\[
\begin{matrix}a & b \\ c & d\end{matrix}
\]`);assert(math.includes('x = y * z = w'));assert(!math.includes('<strong>'));assert(!math.includes('<code>'));assert(math.replaceAll('&#x26;', '&amp;').includes('a &amp; b \\'));
 for(const body of ['#+begin_src mermaid\nflowchart LR\n A-->B\n#+end_src','```mermaid\nflowchart LR\n A-->B\n```'])assert(renderOrg(body).includes('class="mermaid-block"'));
 const code=renderOrg('#+begin_src text\n<script>alert(1)</script>\n\\(not math\\)\n#+end_src');assert(!code.includes('<script>'));assert(!code.includes('math-inline'));
});
test('source headings inside blocks do not create sections',()=>{
 for(const code of ['```text\n* inside\n```','#+begin_src text\n* inside\n#+end_src'])assert.equal(parseOrg('* Page\n'+code).length,1);
});
test('languages are selected per file or overridden by a property',()=>{
 assert.equal(languageFor('QASM.lean'),'lean4');assert.equal(languageFor('script.js'),'javascript');assert.equal(languageFor('test.py'),'python');assert.equal(languageFor('unknown.xyz'),'text');assert.equal(languageFor('README','markdown'),'markdown');
});

test('revision resolution uses HEAD or the complete ref and skips the API for full SHAs',async()=>{
 const sha='a'.repeat(40);let calls=[];const getJSON=async url=>{calls.push(url);return {sha};};
 for(const [url,suffix] of [['https://github.com/tani/repo','HEAD'],['https://github.com/tani/repo/tree/feature/a','feature%2Fa'],['https://github.com/tani/repo/commit/abcdef0','abcdef0']]){
  const ctx=await resolveTarget(parseTarget('#'+url),getJSON);assert.equal(ctx.sha,sha);assert(calls.at(-1).endsWith('/commits/'+suffix));
 }
 const count=calls.length;assert.equal((await resolveTarget(parseTarget('#https://github.com/tani/repo/commit/'+sha),getJSON)).sha,sha);assert.equal(calls.length,count);
 await assert.rejects(()=>resolveTarget(parseTarget('#https://github.com/tani/repo'),async()=>({sha:'bad'})));
});

test('reorg extracts metadata and renders nested Org structures',()=>{
 const [page]=parseOrg('#+TITLE: Demo\n* *Welcome*\n:PROPERTIES:\n:CHAPTER: INTRO\n:KICKER: READ\n:END:\n** Details\n- item\n  - child\n\n| A | B |\n|---+---|\n| 1 | 2 |\n\n[[https://example.com][Reference]]');
 assert.equal(page.title,'Welcome');assert.equal(page.chapter,'INTRO');assert.equal(page.kicker,'READ');
 const html=renderOrg(page.content);assert.match(html,/<h2/);assert.match(html,/<table>/);assert.match(html,/<ul>/);assert.match(html,/href="https:\/\/example.com"/);assert(!html.includes(':PROPERTIES:'));
});
test('sanitization removes scripts, events and unsafe links from Org exports',()=>{
 const html=renderOrg('#+begin_export html\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">click</a><p>Safe</p>\n#+end_export');
 assert(!html.includes('<script'));assert(!html.includes('onerror'));assert(!html.includes('javascript:'));assert(html.includes('Safe'));
});
test('internal links agree with sanitized heading identifiers',()=>{
 const html=renderOrg('** Details\n[[*Details][Jump]]');assert.match(html,/id="user-content-details"/);assert.match(html,/href="#user-content-details"/);
});
test('display equations and literal block headings survive reorg',()=>{
 const html=renderOrg(String.raw`\begin{align*}
x &= y \\
z &= w
\end{align*}`);assert(html.includes('math-display'));assert(html.includes('\\begin{align*}'));assert(html.includes('\\end{align*}'));
 const code=renderOrg('```text\n* heading\n#+end_src\n,* literal comma\n```');assert(code.includes('* heading'));assert(code.includes('#+end_src'));assert(code.includes(',* literal comma'));assert(!code.includes('<h1'));
});
test('import map owns the pinned browser dependencies and matches test dependencies',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 for(const [name,version] of Object.entries(pkg.devDependencies))assert((map[name] || map[name+'/browser']).includes('@'+version+'/'));
 for(const name of ['unified','@orgajs/reorg-parse','@orgajs/reorg-rehype','rehype-sanitize','rehype-stringify','shiki','pele','mathjax'])assert(map[name]);
 const script=await readFile(new URL('../script.js',import.meta.url),'utf8');assert(!/import\(['"]https:/.test(script));assert(script.includes("import.meta.resolve('mathjax')"));
});

test('dollar math is prepared by rehype-mathjax/browser without double delimiters',()=>{
 const inline=renderOrg(String.raw`A claim $x = y * z = w$ is explicit.`);assert(inline.includes('math-inline-container'));assert(inline.includes('$x = y * z = w$'));assert(!inline.includes('\\('));assert(!inline.includes('<strong>'));
 const display=renderOrg('$$\n\\frac{a}{b}\n$$');assert(display.includes('math-display-container'));assert(display.includes('$$\\frac{a}{b}$$'));assert(!display.includes('$$$$'));
 const src=renderOrg('#+begin_src math\nx^2\n#+end_src');assert(src.includes('$$x^2$$'));
});
test('currency, escaped dollars, and dollars inside code remain outside math containers',()=>{
 for(const s of ['The cost is $5 and $10.',String.raw`A literal \$ symbol.`, '=price $x$=', '#+begin_src text\n$x$\n$$y$$\n#+end_src'])assert(!renderOrg(s).includes('math-inline-container'),s);
});
test('standard double-bracket approximation preserves TeX through the pipeline',()=>{
 const html=renderOrg(String.raw`$$
\lbrack\!\lbrack c\rbrack\!\rbrack
$$`);assert(html.includes('\\lbrack\\!\\lbrack'));assert(html.includes('\\rbrack\\!\\rbrack'));assert(!html.includes('\\llbracket'));assert(!html.includes('\\rrbracket'));
});

test('Org images resolve against the toured repository at the pinned commit', () => {
 const ctx = {repository:'tani/lean-qasm', sha:'a'.repeat(40)};
 assert(renderOrg('[[file:docs/tour/bell.svg]]',ctx).includes(`src="https://cdn.jsdelivr.net/gh/tani/lean-qasm@${ctx.sha}/docs/tour/bell.svg"`));
 assert(!renderOrg('[[file:../outside.svg]]',ctx).includes('src='));
 assert(renderOrg('[[https://example.com/circuit.svg]]',ctx).includes('src="https://example.com/circuit.svg"'));
});
