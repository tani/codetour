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
\]`);assert(math.includes('x = y * z = w'));assert(!math.includes('<strong>'));assert(!math.includes('<code>'));assert(math.includes('a &amp; b \\'));
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
