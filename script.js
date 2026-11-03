// CodeTour — a buildless, repository-driven source walkthrough.
// Licensed under the repository's Unlicense. Third-party libraries retain their licenses.

/** Parse a GitHub repository URL from the viewer's fragment. */
export function parseTarget(fragment) {
  let input = fragment.replace(/^#/, '').trim();
  if (!input) return null;
  // Accept a fully percent-encoded URL as well as an ordinary fragment URL.
  if (/^https%3a/i.test(input)) input = decodeURIComponent(input);
  let url;
  try { url = new URL(input); } catch { throw Error('Enter a complete https://github.com/owner/repository URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) {
    throw Error('Only public https://github.com repository URLs are supported.');
  }
  if (url.hash) throw Error('Use ?step=N inside the repository URL to select a page.');
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1).map(decodeURIComponent);
  if (parts.length < 2 || !/^[A-Za-z0-9-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) {
    throw Error('The URL must identify a GitHub owner and repository.');
  }
  const owner = parts[0], repo = parts[1].replace(/\.git$/, '');
  if (!repo || repo === '.' || repo === '..') throw Error('Invalid repository name.');
  const queryRef = url.searchParams.get('ref');
  let pathRef = null;
  if (parts.length > 2) {
    if (!['tree', 'commit'].includes(parts[2]) || parts.length < 4) throw Error('Use a repository URL, /tree/<ref>, or /commit/<SHA>.');
    pathRef = parts.slice(3).join('/');
    if (parts[2] === 'commit' && !/^[0-9a-f]{7,40}$/i.test(pathRef)) throw Error('A commit URL must contain a 7–40 digit hexadecimal SHA.');
  }
  if (queryRef && pathRef && queryRef !== pathRef) throw Error('The path and ?ref= query specify different revisions.');
  const ref = queryRef || pathRef || null;
  if (ref !== null && (!ref || /[\s~^:?*\[\\\x00-\x1f]/.test(ref) || ref.includes('..') || ref.includes('@{') || ref.startsWith('/') || ref.endsWith('/') || ref.endsWith('.') || ref.endsWith('.lock') || ref.includes('//'))) {
    throw Error('Invalid branch, tag, or commit reference.');
  }
  const rawStep = url.searchParams.get('step');
  if (rawStep !== null && (!/^\d+$/.test(rawStep) || +rawStep < 1 || !Number.isSafeInteger(+rawStep))) throw Error('The step parameter must be a positive page number.');
  return { owner, repo, repository: `${owner}/${repo}`, ref, page: rawStep ? +rawStep : 1,
    identity: `${owner.toLowerCase()}/${repo.toLowerCase()}@${ref || 'HEAD'}`, url: url.href };
}

/** Resolve a moving ref once; full SHAs need no GitHub API request. */
export async function resolveTarget(target, getJSON) {
  const sha = /^[0-9a-f]{40}$/i.test(target.ref || '')
    ? target.ref
    : (await getJSON(`https://api.github.com/repos/${target.repository}/commits/${encodeURIComponent(target.ref || 'HEAD')}`)).sha;
  if (!/^[0-9a-f]{40}$/i.test(sha || '')) throw Error('GitHub did not return a resolved commit.');
  return { repository: target.repository, sha, target };
}

export function pageFragment(target, page) {
  const url = new URL(target.url);
  if (page > 1) url.searchParams.set('step', String(page)); else url.searchParams.delete('step');
  return '#' + url.href;
}

/** All remote source bytes come from jsDelivr at a resolved immutable commit. */
export function sourceURL(context, path) {
  if (!/^[0-9a-f]{40}$/i.test(context.sha)) throw Error('Source requests require a resolved full commit SHA.');
  validatePath(path);
  return `https://cdn.jsdelivr.net/gh/${context.repository}@${context.sha}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function validatePath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || /[\x00-\x1f]/.test(path) || path.split('/').some(s => !s || s === '.' || s === '..')) {
    throw Error('FILE must be a relative repository path without parent traversal.');
  }
}

export function languageFor(file, explicit) {
  if (explicit) return explicit.toLowerCase();
  const ext = file.split('.').pop().toLowerCase();
  return ({ lean: 'lean4', js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx',
    py: 'python', rs: 'rust', rb: 'ruby', go: 'go', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
    java: 'java', kt: 'kotlin', swift: 'swift', ml: 'ocaml', mli: 'ocaml', hs: 'haskell', lisp: 'common-lisp', cl: 'common-lisp',
    asd: 'common-lisp', scm: 'scheme', rkt: 'racket', sh: 'bash', bash: 'bash', zsh: 'shellscript', json: 'json', toml: 'toml',
    yaml: 'yaml', yml: 'yaml', html: 'html', css: 'css', md: 'markdown', tex: 'latex', sql: 'sql', nix: 'nix', qasm: 'qasm' })[ext] || 'text';
}

export function parseOrg(text){
 const sections=[];let current=null,inProps=false,block=null;
 for(const line of text.replace(/\r/g,'').split('\n')){
  if(block){if(current)current.body.push(line);if(block==='org'?/^#\+end_src\s*$/i.test(line):line.trim()===block)block=null;continue;}
  const fence=line.match(/^(`{3,}|~{3,})/);
  if(/^#\+begin_src\b/i.test(line)||fence){block=fence?fence[1]:'org';if(current)current.body.push(line);continue;}
  const heading=line.match(/^\* (.+)$/);
  if(heading){current={title:heading[1],props:{},body:[]};sections.push(current);inProps=false;continue;}
  if(!current)continue;
  if(/^:PROPERTIES:\s*$/i.test(line)){inProps=true;continue;}
  if(inProps){if(/^:END:\s*$/i.test(line)){inProps=false;continue;}const p=line.match(/^:([\w_-]+):\s*(.*?)\s*$/);if(p)current.props[p[1].toUpperCase()]=p[2];continue;}
  current.body.push(line);
 }
 if(!sections.length)throw Error('No top-level headings found. Use * Heading to create a page.');
 return sections.map((s,i)=>{
  const base={title:s.title,chapter:s.props.CHAPTER||'CODE TOUR',kicker:s.props.KICKER||'SOURCE WALKTHROUGH',body:s.body.join('\n').trim()};
  const file=s.props.FILE||s.props.FILENAME,range=s.props.LINES||s.props.RANGE;
  if(!file&&!range)return {...base,file:null,start:null,end:null};
  const m=(range||'').match(/^(\d+)\s*(?:-|:|\.\.)\s*(\d+)$/);
  if(!file||!m||+m[1]<1||+m[2]<+m[1]||!Number.isSafeInteger(+m[1])||!Number.isSafeInteger(+m[2]))throw Error(`Section ${i+1}: provide both FILE and LINES (e.g. 10-20), or omit both for a single-pane page.`);
  validatePath(file);
  return {...base,file,start:+m[1],end:+m[2],language:s.props.LANGUAGE||s.props.LANG||null};
 });
}
export const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text){
 // Protect TeX and code before interpreting Org emphasis. In particular, = and *
 // inside equations must never become code/emphasis markup.
 const atoms=[];
 const protectedText=text.replace(/\\\([\s\S]*?\\\)|=([^=\n]+)=|~([^~\n]+)~|`([^`\n]+)`/g,(match,a,b,c)=>{
  const html=match.startsWith('\\(')?`<span class="math-inline">${escape(match)}</span>`:`<code>${escape(a??b??c)}</code>`;
  return `\u0000${atoms.push(html)-1}\u0000`;
 });
 return escape(protectedText).replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>').replace(/\u0000(\d+)\u0000/g,(_,n)=>atoms[+n]);
}
function codeBlock(lines,language){
 const source=escape(lines.join('\n'));
 if(language.toLowerCase()==='mermaid')return `<figure class="mermaid-block"><div class="diagram-canvas" role="img" aria-label="Mermaid diagram"><span class="render-status">Rendering diagram…</span></div><details class="diagram-source"><summary>Mermaid source</summary><pre><code>${source}</code></pre></details><p class="diagram-error" role="status" hidden></p></figure>`;
 return `<pre><code>${source}</code></pre>`;
}
export function renderOrg(body){
 let out='',para=[],block=null,math=null,list=false;
 const flush=()=>{if(para.length){out+='<p>'+inline(para.join('\n'))+'</p>';para=[];}if(list){out+='</ul>';list=false;}};
 const display=lines=>`<div class="math-display">${escape(lines.join('\n'))}</div>`;
 for(const line of body.replace(/\r/g,'').split('\n')){
  if(block){if(block.kind==='org'?/^#\+end_src\s*$/i.test(line):new RegExp('^'+block.fence+'\\s*$').test(line)){out+=codeBlock(block.lines,block.lang);block=null;}else block.lines.push(line);continue;}
  if(math){math.lines.push(line);if(line.includes(math.close)){out+=display(math.lines);math=null;}continue;}
  const org=line.match(/^#\+begin_src\s*(\S*)/i),fence=line.match(/^(`{3,}|~{3,})\s*([\w-]*)\s*$/);
  if(org||fence){flush();block={kind:org?'org':'fence',fence:fence?.[1],lang:org?org[1]:fence[2],lines:[]};continue;}
  const trimmed=line.trim();
  if(trimmed.startsWith('\\[')||trimmed.startsWith('$$')||/^\\begin\{(?:equation\*?|align\*?|gather\*?)\}/.test(trimmed)){
   flush();const env=trimmed.match(/^\\begin\{([^}]+)\}/);const close=env?'\\end{'+env[1]+'}':trimmed.startsWith('\\[')?'\\]':'$$';
   if(line.indexOf(close,env?env[0].length:2)>=0)out+=display([line]);else math={lines:[line],close};continue;
  }
  if(!trimmed){flush();continue;}
  const h=line.match(/^\*{2,}\s+(.+)$/);if(h){flush();out+='<h2>'+inline(h[1])+'</h2>';continue;}
  const li=line.match(/^\s*[-+] (.+)$/);if(li){if(para.length)flush();if(!list){out+='<ul>';list=true;}out+='<li>'+inline(li[1])+'</li>';continue;}
  if(list)flush();para.push(line);
 }
 flush();if(block)out+=codeBlock(block.lines,block.lang);if(math)out+=display(math.lines);return out;
}

let pelePromise,mathPromise;
function loadPele(){return pelePromise??=import('https://cdn.jsdelivr.net/npm/pele@1.13.0/dist/pele.js').catch(error=>{pelePromise=null;throw error;});}
function loadMath(){
 if(mathPromise)return mathPromise;
 mathPromise=new Promise((resolve,reject)=>{
  window.MathJax={
   loader:{load:['ui/safe']},
   tex:{inlineMath:[['\\(','\\)']],displayMath:[['\\[','\\]'],['$$','$$']],processEscapes:true,processEnvironments:true},
   svg:{fontCache:'none'},
   startup:{typeset:false},
   options:{skipHtmlTags:['script','noscript','style','textarea','pre','code','mjx-container'],ignoreHtmlClass:'mermaid-block'}
  };
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/mathjax@4.0.0/tex-svg.js';script.async=true;
  const timer=setTimeout(()=>{script.remove();reject(Error('MathJax loading timed out.'));},30000);
  script.onload=async()=>{try{await window.MathJax.startup.promise;clearTimeout(timer);resolve(window.MathJax);}catch(error){clearTimeout(timer);reject(error);}};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Could not load MathJax.'));};document.head.append(script);
 }).catch(error=>{mathPromise=null;throw error;});return mathPromise;
}
export function enhanceStory(root){
 let disposed=false;const mounted=[];
 const diagrams=[...root.querySelectorAll('.mermaid-block')];
 if(diagrams.length)loadPele().then(pele=>{
  if(disposed||!root.isConnected)return;
  for(const figure of diagrams){
   const source=figure.querySelector('pre code').textContent,canvas=figure.querySelector('.diagram-canvas');
   const showError=error=>{if(disposed)return;const note=figure.querySelector('.diagram-error');note.hidden=false;note.textContent='Could not render the diagram: '+(error?.message||String(error));figure.querySelector('details').open=true;};
   try{const diagram=pele.mount(canvas,source,{fontSize:14,padding:12,zoom:false,links:false,images:false,onError:showError});mounted.push(diagram);}catch(error){canvas.replaceChildren();showError(error);}
  }
 }).catch(error=>{if(disposed)return;for(const figure of diagrams){figure.querySelector('.diagram-canvas').textContent='Could not load the diagram renderer.';figure.querySelector('details').open=true;const note=figure.querySelector('.diagram-error');note.textContent=error.message;note.hidden=false;}});
 if(root.querySelector('.math-inline,.math-display'))loadMath().then(async mj=>{
  if(disposed||!root.isConnected)return;
  await mj.typesetPromise([root]);
  if(disposed||!root.isConnected)mj.typesetClear([root]);
 }).catch(error=>{if(disposed)return;const note=document.createElement('p');note.className='math-error';note.setAttribute('role','status');note.textContent='Could not render the equation. The LaTeX source is preserved. '+error.message;root.append(note);});
 return ()=>{disposed=true;for(const diagram of mounted)diagram.destroy();window.MathJax?.typesetClear?.([root]);};
}

// Browser UI. The pure functions above can also be imported by the Node test suite.
if (typeof document !== 'undefined') startViewer();

function startViewer() {
  const $ = id => document.getElementById(id);
  let context = null, steps = [], index = 0, renderRequest = 0, loadRequest = 0;
  let disposeStory = () => {}, highlighterPromise, currentOrg = '';
  const rawCache = new Map(), tokenCache = new Map(), languageLoads = new Map();

  async function getResponse(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000), credentials: 'omit' });
    if (!response.ok) {
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') throw Error('GitHub’s unauthenticated API rate limit was reached. Try later, or use a /commit/ URL with a full 40-character SHA to load directly from jsDelivr.');
      throw Error(`${response.status} ${response.statusText || 'Request failed'} — ${new URL(url).hostname}`);
    }
    if (Number(response.headers.get('content-length')) > 2000000) throw Error('The file exceeds the 2 MB limit.');
    return response;
  }
  async function fetchText(url) {
    const text = await (await getResponse(url)).text();
    if (text.length > 2000000) throw Error('The file exceeds the 2 MB limit.');
    return text;
  }
  async function source(ctx, file, force = false) {
    const url = sourceURL(ctx, file);
    if (force) { rawCache.delete(url); tokenCache.delete(url); }
    if (!rawCache.has(url)) rawCache.set(url, fetchText(url).catch(e => { rawCache.delete(url); throw e; }));
    return rawCache.get(url);
  }
  function highlighter() {
    return highlighterPromise ??= (async () => {
      const shiki = await import('https://cdn.jsdelivr.net/npm/shiki@3.13.0/+esm');
      return { highlighter: await shiki.createHighlighter({ themes: ['github-light'], langs: [] }), languages: shiki.bundledLanguages };
    })().catch(error => { highlighterPromise = null; throw error; });
  }
  async function tokens(ctx, step, raw) {
    const lang = languageFor(step.file, step.language);
    const key = sourceURL(ctx, step.file) + '::' + lang;
    if (!tokenCache.has(key)) tokenCache.set(key, (async () => {
      const { highlighter: h, languages } = await highlighter();
      const supported = lang === 'text' || lang === 'plain' || Boolean(languages[lang]);
      const actual = supported ? lang : 'text';
      if (!['text', 'plain'].includes(actual) && !h.getLoadedLanguages().includes(actual)) {
        if (!languageLoads.has(actual)) languageLoads.set(actual, h.loadLanguage(actual).catch(e => { languageLoads.delete(actual); throw e; }));
        await languageLoads.get(actual);
      }
      return { lines: h.codeToTokens(raw, { lang: actual, theme: 'github-light' }).tokens, language: actual };
    })().catch(error => { tokenCache.delete(key); throw error; }));
    return tokenCache.get(key);
  }
  function setCode(lines, step, request) {
    if (request !== renderRequest) return;
    const first = Math.max(1, step.start - 9), last = Math.min(lines.length, step.end + 10);
    $('code').innerHTML = lines.slice(first - 1, last).map((line, j) => {
      const n = first + j;
      return `<div class="code-line ${n >= step.start && n <= step.end ? 'focus' : 'context'}"><span class="line-number">${n}</span><span class="line-text">${line || ' '}</span></div>`;
    }).join('');
    requestAnimationFrame(() => {
      if (request !== renderRequest) return;
      const el = $('code').querySelector('.focus');
      if (el) $('code-link').scrollTop = Math.max(0, el.offsetTop - $('code').offsetTop - ($('code-link').clientHeight - Math.min(step.end - step.start + 1, 12) * 25) / 2);
    });
  }
  async function renderCode(ctx, step, request, force = false) {
    $('code').innerHTML = '<div class="loading">Fetching source…</div>';
    $('syntax-status').textContent = 'Fetching / jsDelivr';
    try {
      const raw = await source(ctx, step.file, force);
      if (request !== renderRequest) return;
      const plain = raw.replace(/\r/g, '').split('\n');
      if (step.end > plain.length) throw Error(`Line ${step.end} exceeds the file length of ${plain.length} lines.`);
      setCode(plain.map(escape), step, request);
      $('syntax-status').textContent = 'Loading Shiki…';
      try {
        const highlighted = await tokens(ctx, step, raw);
        if (request !== renderRequest) return;
        setCode(highlighted.lines.map(line => line.map(t => `<span style="color:${t.color || '#283830'}${t.fontStyle & 1 ? ';font-style:italic' : ''}${t.fontStyle & 2 ? ';font-weight:600' : ''}">${escape(t.content)}</span>`).join('')), step, request);
        $('syntax-status').textContent = `${highlighted.language} / Shiki`;
      } catch (error) {
        if (request !== renderRequest) return;
        $('syntax-status').textContent = 'Shiki unavailable · plain text';
        console.warn('Highlight unavailable', error);
      }
    } catch (error) {
      if (request !== renderRequest) return;
      $('syntax-status').textContent = 'Source unavailable';
      $('code').innerHTML = `<div class="error">Could not load the source.<br>${escape(error.message)}<br><button id="retry-code">Try again</button></div>`;
      $('retry-code').onclick = event => { event.preventDefault(); renderCode(ctx, step, ++renderRequest, true); };
    }
  }
  function buildNav() {
    $('progress').replaceChildren(); $('toc-list').replaceChildren();
    let chapter = '';
    steps.forEach((step, i) => {
      const b = document.createElement('button');
      b.title = `${i + 1}. ${step.title}`; b.setAttribute('aria-label', b.title); b.onclick = () => go(i); $('progress').append(b);
      if (chapter !== step.chapter) { chapter = step.chapter; const h = document.createElement('div'); h.className = 'toc-section'; h.textContent = chapter; $('toc-list').append(h); }
      const row = document.createElement('button'); row.className = 'toc-step';
      row.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${escape(step.title)}`;
      row.onclick = () => { go(i); $('toc').close(); }; row.dataset.index = i; $('toc-list').append(row);
    });
    document.querySelector('.total').textContent = '/ ' + steps.length;
    $('contents').disabled = false; $('index-button').disabled = false;
  }
  function go(n, updateHash = true) {
    if (!context || !steps.length) return;
    index = Math.max(0, Math.min(steps.length - 1, n));
    const step = steps[index], request = ++renderRequest, ctx = context;
    if (updateHash) history.replaceState(null, '', pageFragment(ctx.target, index + 1));
    const hasSource = Boolean(step.file);
    $('panes').classList.toggle('single-pane', !hasSource);
    document.querySelector('.source-pane').hidden = !hasSource;
    if (hasSource) {
      $('filepath').textContent = step.file; $('line-link').textContent = `L${step.start}–L${step.end} ↗`;
      const path = step.file.split('/').map(encodeURIComponent).join('/');
      const href = `https://github.com/${ctx.repository}/blob/${ctx.sha}/${path}#L${step.start}-L${step.end}`;
      $('line-link').href = href; $('code-link').href = href;
      $('code-link').setAttribute('aria-label', `Open ${step.file}, lines ${step.start}–${step.end} on GitHub`);
      $('focus-label').textContent = `FOCUS / ${step.end - step.start + 1} LINES`;
    } else {
      $('filepath').textContent = ''; $('line-link').textContent = '';
      $('line-link').removeAttribute('href'); $('code-link').removeAttribute('href'); $('code').replaceChildren();
    }
    $('chapter').textContent = step.chapter; $('step-label').textContent = `${String(index + 1).padStart(2, '0')} / ${steps.length}`;
    disposeStory();
    const content = document.createElement('div'); content.className = 'story-content';
    content.innerHTML = `<div class="eyebrow">${escape(step.kicker)}</div><h1>${escape(step.title)}</h1>${renderOrg(step.body)}`;
    $('story').replaceChildren(content); disposeStory = enhanceStory(content); $('story-scroll').scrollTop = 0;
    $('prev').disabled = index === 0; $('next').disabled = index === steps.length - 1;
    $('next-label').textContent = index === steps.length - 1 ? 'END OF TOUR' : 'UP NEXT';
    $('next-title').textContent = steps[index + 1]?.title || 'You have reached the end.';
    $('counter').textContent = String(index + 1).padStart(2, '0');
    [...$('progress').children].forEach((el, i) => {
      el.className = i === index ? 'active' : i < index ? 'visited' : '';
      if (i === index) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('.toc-step').forEach(el => el.classList.toggle('current', +el.dataset.index === index));
    document.title = `${index + 1}. ${step.title} — CodeTour`;
    if (hasSource) renderCode(ctx, step, request);
    const next = steps[index + 1]; if (next?.file) source(ctx, next.file).catch(() => {});
  }
  function message(title, text, retry = false) {
    ++renderRequest; disposeStory(); disposeStory = () => {};
    $('panes').classList.add('single-pane'); document.querySelector('.source-pane').hidden = true; $('code').replaceChildren();
    $('chapter').textContent = 'CODETOUR'; $('step-label').textContent = '';
    const content = document.createElement('div'); content.className = 'story-content';
    const heading = document.createElement('h1'); heading.textContent = title;
    const paragraph = document.createElement('p'); paragraph.textContent = text; content.append(heading, paragraph);
    if (retry) { const b = document.createElement('button'); b.className = 'action-button'; b.textContent = 'Try again'; b.onclick = () => loadFromHash(true); content.append(b); }
    else if (!location.hash || location.hash === '#') {
      const b = document.createElement('button'); b.className = 'action-button'; b.textContent = 'Open a repository'; b.onclick = openRepository; content.append(b);
      const example = document.createElement('a'); example.className = 'example-link'; example.href = '#https://github.com/tani/lean-qasm'; example.textContent = 'Explore the Lean QASM tour ↗'; content.append(example);
    }
    $('story').replaceChildren(content); $('story-scroll').scrollTop = 0;
    $('prev').disabled = true; $('next').disabled = true; $('contents').disabled = true; $('index-button').disabled = true;
    $('counter').textContent = '—'; document.querySelector('.total').textContent = '/ —'; $('progress').replaceChildren(); $('toc-list').replaceChildren();
    $('next-label').textContent = 'REPOSITORY-DRIVEN WALKTHROUGHS'; $('next-title').textContent = 'Read the code. Follow the idea.';
  }
  async function loadFromHash(force = false) {
    const generation = ++loadRequest;
    let target;
    try { target = parseTarget(location.hash); } catch (error) { context = null; steps = []; message('Check the repository URL.', error.message); return; }
    if (!target) {
      context = null; steps = []; currentOrg = ''; $('repo-link').hidden = true; document.title = 'CodeTour';
      message('Every codebase has a story.', 'Open a public GitHub repository to read its top-level TOUR.org. Code, context, diagrams, and equations stay together, one step at a time.'); return;
    }
    if (!force && context?.target.identity === target.identity) { context.target = target; go(target.page - 1, false); return; }
    context = null; steps = []; currentOrg = '';
    $('repo-link').hidden = false; $('repo-link').href = `https://github.com/${target.repository}`; $('repo-link').textContent = target.repository + ' ↗';
    message('Opening the tour…', `Resolving ${target.repository}${target.ref ? ' at ' + target.ref : ' on its default branch'} and fetching TOUR.org from jsDelivr.`);
    try {
      const ctx = await resolveTarget(target, async url => (await getResponse(url)).json());
      const commit = { sha: ctx.sha };
      let org;
      try { org = await source(ctx, 'TOUR.org', force); } catch (error) { throw Error(`Could not fetch the top-level TOUR.org at ${commit.sha.slice(0, 7)}. Add TOUR.org to this revision of the repository. ${error.message}`); }
      const parsed = parseOrg(org);
      if (generation !== loadRequest) return;
      context = ctx; steps = parsed; currentOrg = org;
      $('source-repo').textContent = ctx.repository; $('source-revision').textContent = '@ ' + ctx.sha.slice(0, 7);
      $('repo-title').textContent = org.match(/^#\+TITLE:\s*(.+)$/im)?.[1] || target.repository;
      buildNav(); go(target.page - 1);
    } catch (error) { if (generation === loadRequest) message('Could not open this tour.', error.message, true); }
  }
  function openRepository() { $('repository-url').value = context?.target.url || ''; $('repository-dialog').showModal(); $('repository-url').focus(); }
  $('open-repository').onclick = openRepository;
  $('close-repository').onclick = () => $('repository-dialog').close();
  $('repository-form').onsubmit = event => {
    event.preventDefault();
    try {
      const target = parseTarget('#' + $('repository-url').value.trim());
      if (!target) throw Error('Enter a GitHub repository URL.');
      $('repository-error').textContent = ''; $('repository-dialog').close();
      const hash = pageFragment(target, target.page);
      if (location.hash === hash) loadFromHash(true); else location.hash = hash;
    } catch (error) { $('repository-error').textContent = error.message; }
  };
  $('prev').onclick = () => go(index - 1); $('next').onclick = () => go(index + 1);
  const openToc = () => { if (!steps.length) return; $('toc').showModal(); document.querySelector('.toc-step.current')?.scrollIntoView({ block: 'center' }); };
  $('contents').onclick = openToc; $('index-button').onclick = openToc; $('close-toc').onclick = () => $('toc').close();
  for (const dialog of [$('toc'), $('repository-dialog')]) dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.closest('.mermaid-block')) return;
    if (event.target.closest('button,a') && [' ', 'Enter'].includes(event.key)) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); go(index + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(event.key)) { event.preventDefault(); go(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); go(0); }
    else if (event.key === 'End') { event.preventDefault(); go(steps.length - 1); }
    else if (event.key.toLowerCase() === 't') openToc();
  });
  let down = null;
  $('story-scroll').addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, top: $('story-scroll').scrollTop, time: Date.now() }; });
  $('story-scroll').addEventListener('pointerup', event => {
    const p = down; down = null; if (!p) return;
    if (event.target.closest('a,button,input,code,pre,summary,.mermaid-block,.math-display,mjx-container') || getSelection()?.toString() || Date.now() - p.time > 450 || Math.hypot(event.clientX - p.x, event.clientY - p.y) > 8 || Math.abs($('story-scroll').scrollTop - p.top) > 3) return;
    go(index + 1);
  });
  $('story-scroll').addEventListener('pointercancel', () => { down = null; });
  $('full').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { $('full').title = 'Fullscreen is unavailable in this browser.'; } };
  $('org-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (!context) throw Error('Open a repository before previewing a local tour.');
      const org = await file.text(), parsed = parseOrg(org); currentOrg = org; steps = parsed; buildNav(); go(0); $('toc').close();
    } catch (error) { alert(error.message); } finally { event.target.value = ''; }
  };
  window.addEventListener('hashchange', () => loadFromHash());
  window.codeTour = { parseOrg, renderOrg, parseTarget, get org() { return currentOrg; }, get steps() { return steps; } };
  loadFromHash();
}
