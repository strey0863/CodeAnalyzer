let uploaded = [], folderFiles = [], curTab = 'upload';
const EXTS = ['lua', 'js', 'json', 'txt', 'cfg', 'fxmanifest'];
const MAX = 500 * 1024;

function ext(n) { return n.split('.').pop().toLowerCase(); }
function isRar(n) { return ['rar', '7z'].includes(ext(n)); }
function isZip(n) { return ext(n) === 'zip'; }
function scannable(n) { return EXTS.includes(ext(n)); }

function switchTab(t) {
    curTab = t;
    document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', ['upload', 'folder', 'paste'][i] === t));
    ['upload', 'folder', 'paste'].forEach(id => document.getElementById('tab-' + id).style.display = id === t ? '' : 'none');
}

function ev(e, type) {
    e.preventDefault();
    const dz = document.getElementById('dropZone');
    if (type === 'over') dz.classList.add('drag-over');
    else if (type === 'leave') dz.classList.remove('drag-over');
    else { dz.classList.remove('drag-over'); addFiles([...e.dataTransfer.files]); }
}
function onSel(e) { addFiles([...e.target.files]); e.target.value = ''; }
function onFolder(e) {
    folderFiles = [...e.target.files].filter(f => scannable(f.name));
    e.target.value = '';
    const lua = folderFiles.filter(f => ext(f.name) === 'lua').length;
    const js = folderFiles.filter(f => ext(f.name) === 'js').length;
    const other = folderFiles.length - lua - js;
    const preview = folderFiles.slice(0, 5).map(f =>
        `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.webkitRelativePath || f.name}</div>`
    ).join('') + (folderFiles.length > 5 ? `<div style="font-size:10px;color:var(--text3);padding-top:3px">+ ${folderFiles.length - 5} autres...</div>` : '');
    document.getElementById('folderInfo').innerHTML = folderFiles.length === 0 ? '' : `
      <div class="folder-counter" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div style="display:flex;align-items:center;gap:14px;width:100%">
          <div><div class="fc-num">${folderFiles.length}</div><div class="fc-label">fichiers scannables</div></div>
          <div class="fc-chips">
            ${lua ? `<span class="fc-chip">${lua} lua</span>` : ''}
            ${js ? `<span class="fc-chip">${js} js</span>` : ''}
            ${other ? `<span class="fc-chip">${other} autres</span>` : ''}
          </div>
        </div>
        <div style="width:100%;border-top:0.5px solid var(--border);padding-top:8px">${preview}</div>
      </div>`;
}

function fileIconClass(n) {
    const e = ext(n);
    return e === 'lua' ? 'fi-lua' : e === 'js' ? 'fi-js' : ['zip', 'rar', '7z'].includes(e) ? 'fi-zip' : 'fi-other';
}
function fileIconLabel(n) {
    const e = ext(n);
    return ['zip', 'rar', '7z'].includes(e) ? e.toUpperCase() : e;
}

function addFiles(newFiles) {
    newFiles.forEach(f => { if (!uploaded.find(x => x.name === f.name && x.size === f.size)) uploaded.push(f); });
    renderFiles();
}
function removeFile(i) { uploaded.splice(i, 1); renderFiles(); }
function renderFiles() {
    const hasRar = uploaded.some(f => isRar(f.name));
    document.getElementById('rarWarn').style.display = hasRar ? 'flex' : 'none';
    document.getElementById('fileList').innerHTML = uploaded.map((f, i) => `
      <div class="file-item">
        <div class="file-icon ${fileIconClass(f.name)}">${fileIconLabel(f.name)}</div>
        <div class="file-info">
          <div class="file-name">${f.name}</div>
          <div class="file-size">${(f.size / 1024).toFixed(1)} KB</div>
        </div>
        <button class="file-remove" onclick="removeFile(${i})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`).join('');
}

function readText(file) {
    return new Promise((res, rej) => {
        const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsText(file);
    });
}

async function extractZip(file) {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const out = []; const proms = [];
    zip.forEach((path, entry) => {
        if (!entry.dir && scannable(path) && !path.startsWith('__MACOSX'))
            proms.push(entry.async('string').then(c => { if (c.length < MAX * 2) out.push({ name: path, code: c }); }).catch(() => { }));
    });
    await Promise.all(proms);
    return out;
}

function setProgress(pct, msg) {
    const pf = document.getElementById('pfill'); const pm = document.getElementById('pmsg');
    if (pf) pf.style.width = pct + '%'; if (pm) pm.textContent = msg || '';
}

async function getFiles() {
    const out = [];
    if (curTab === 'paste') {
        const code = document.getElementById('pasteCode').value.trim();
        const name = document.getElementById('pasteName').value.trim() || 'code.lua';
        if (code) out.push({ name, code });
        return out;
    }
    const src = curTab === 'folder' ? folderFiles : uploaded;
    for (const f of src) {
        if (isRar(f.name)) continue;
        if (isZip(f.name)) {
            setProgress(20, `Extraction de ${f.name}...`);
            try { const ex = await extractZip(f); out.push(...ex); } catch (e) { console.error(e); }
        } else if (scannable(f.name) && f.size < MAX) {
            const code = await readText(f);
            const name = (curTab === 'folder' && f.webkitRelativePath) ? f.webkitRelativePath : f.name;
            out.push({ name, code });
        }
    }
    return out;
}

function quickScan(code) {
    const P = [
        { r: /load\s*\(\s*["']/, l: 'load() avec string encodé', s: 'danger', d: 'Exécution de code chargé dynamiquement — technique classique de backdoor.' },
        { r: /(?:os\.execute|os\.cmd|io\.popen)\s*\(/, l: 'Exécution système', s: 'danger', d: 'Appel direct au système d\'exploitation depuis le script.' },
        { r: /discord\.com\/api\/webhooks|hooks\.slack\.com/, l: 'Webhook Discord/Slack', s: 'danger', d: 'Exfiltration de données probable vers un serveur externe.' },
        { r: /require\s*\(\s*['"]https?:\/\//, l: 'Import depuis URL distante', s: 'danger', d: 'Chargement de code depuis un serveur externe au runtime.' },
        { r: /eval\s*\(/, l: 'eval() détecté', s: 'danger', d: 'Évaluation de code dynamique — vecteur courant d\'injection.' },
        { r: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){5,}/i, l: 'Séquences hex obfusquées', s: 'danger', d: 'Strings encodés en hexadécimal — technique d\'obfuscation de backdoor.' },
        { r: /setmetatable.*__index.*load|rawset.*load/, l: 'Métatable + load()', s: 'danger', d: 'Combinaison avancée pour dissimuler l\'exécution de code.' },
        { r: /ExecuteCommand\s*\(\s*['"].*rcon/, l: 'Commande RCON suspecte', s: 'danger', d: 'Exécution de commandes RCON potentiellement malveillantes.' },
        { r: /PerformHttpRequest|exports\[['"]oxmysql['"]\]/, l: 'Requête HTTP externe', s: 'warning', d: 'Communication réseau — vérifier les URLs cibles.' },
        { r: /GetPlayerIdentifiers|GetPlayerName|GetNumPlayerIdent/, l: 'Collecte identifiants joueurs', s: 'warning', d: 'Récupération d\'informations joueurs — potentielle fuite de données.' },
        { r: /(?:base64|atob|btoa)\s*\(/, l: 'Encodage Base64', s: 'warning', d: 'Peut masquer du code ou des données sensibles.' },
        { r: /TriggerEvent.*(?:admin|ban|kick|grant)/, l: 'Event admin suspect', s: 'warning', d: 'Déclenchement d\'événements privilégiés — vérifier les permissions.' },
        { r: /\b(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)){3}\b/, l: 'Adresse IP en dur', s: 'warning', d: 'Connexion vers une IP fixe — peut indiquer un C2 (Command & Control).' },
        { r: /[a-zA-Z0-9+\/]{60,}={0,2}/, l: 'Chaîne Base64 longue', s: 'info', d: 'Données encodées en base64 — peut cacher un payload.' },
    ];
    const lines = code.split('\n');
    return P.filter(p => p.r.test(code)).map(p => {
        const match = code.match(p.r);
        let line = -1;
        lines.forEach((l, i) => { if (p.r.test(l) && line === -1) line = i + 1; });
        return { label: p.l, sev: p.s, desc: p.d, snippet: match ? match[0].substring(0, 72) + (match[0].length > 72 ? '…' : '') : '', line };
    });
}

async function callAI(files) {
    const sys = `Tu es un expert sécurité FiveM. Analyse le code Lua/JS pour backdoors.\nRéponds UNIQUEMENT en JSON valide sans markdown:\n{"verdict":"clean|suspicious|malicious","summary":"1-2 phrases","findings":[{"title":"...","severity":"critical|warning|info","description":"...","snippet":"extrait court max 60 chars"}],"recommendation":"conseil 1 phrase"}`;
    const content = files.slice(0, 8).map(f => `=== ${f.name} ===\n${f.code.substring(0, 6000)}`).join('\n\n');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: sys, messages: [{ role: 'user', content: `Analyse:\n${content}` }] })
    });
    const d = await r.json();
    const t = d.content?.map(i => i.text || '').join('') || '';
    try { return JSON.parse(t.replace(/```json|```/g, '')); } catch { return null; }
}

function renderFinds(finds) {
    if (!finds || !finds.length) return `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-title">Aucun pattern suspect détecté</div></div>`;
    return finds.map(f => {
        const s = f.sev || f.severity;
        const dc = (s === 'danger' || s === 'critical') ? 'fsev-danger' : s === 'warning' ? 'fsev-warning' : 'fsev-info';
        const t = f.label || f.title; const d = f.desc || f.description;
        return `<div class="finding">
        <div class="fsev ${dc}"></div>
        <div class="finding-body">
          <span class="finding-title">${t}</span>${f.line && f.line > 0 ? `<span class="finding-line">L${f.line}</span>` : ''}
          <div class="finding-desc">${d}</div>
          ${f.snippet ? `<div class="finding-code">${f.snippet.replace(/</g, '&lt;')}</div>` : ''}
        </div>
      </div>`;
    }).join('');
}

function toggleCard(id) {
    const h = document.getElementById('h' + id);
    const b = document.getElementById('b' + id);
    const ch = document.getElementById('ch' + id);
    const open = b.classList.toggle('open');
    h.classList.toggle('open', open);
    ch.classList.toggle('open', open);
}

function applyFilter(f) {
    document.querySelectorAll('.fchip').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    document.querySelectorAll('.result-card[data-sev]').forEach(c => {
        c.style.display = (f === 'all' || c.dataset.sev === f) ? '' : 'none';
    });
}

function resetApp() {
    uploaded = [];
    folderFiles = [];
    document.getElementById('fi').value = '';
    document.getElementById('fdi').value = '';
    document.getElementById('pasteName').value = 'code.lua';
    document.getElementById('pasteCode').value = '';
    renderFiles();
    document.getElementById('folderInfo').innerHTML = '';

    const res = document.getElementById('results');
    res.style.display = 'none';
    res.innerHTML = '';

    const btn = document.getElementById('scanBtn');
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Lancer l'analyse IA`;
}

async function startScan() {
    const btn = document.getElementById('scanBtn');
    const res = document.getElementById('results');
    const src = curTab === 'folder' ? folderFiles : uploaded;
    if (curTab !== 'paste' && src.length === 0) { alert('Ajoute des fichiers ou sélectionne un dossier.'); return; }
    if (curTab === 'paste' && !document.getElementById('pasteCode').value.trim()) { alert('Colle du code à analyser.'); return; }

    btn.disabled = true;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Analyse en cours...`;
    res.style.display = 'block';
    res.innerHTML = `<div class="progress-wrap">
      <div class="prog-label"><div class="prog-dot"></div><span id="pmsg">Lecture des fichiers...</span></div>
      <div class="progress-track"><div class="progress-fill" id="pfill" style="width:8%"></div></div>
    </div>`;

    let codeFiles = [];
    try { codeFiles = await getFiles(); } catch (e) { console.error(e); }

    if (!codeFiles.length) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Lancer l'analyse IA`;
        res.innerHTML = '<div style="text-align:center;padding:1.5rem;font-size:13px;color:var(--danger)">Aucun fichier scannable trouvé.</div>';
        return;
    }

    setProgress(35, 'Scan des signatures...');
    const fileRes = codeFiles.map(f => ({ name: f.name, finds: quickScan(f.code) }));
    setProgress(60, 'Analyse IA en cours...');

    let ai = null;
    try { ai = await callAI(codeFiles); } catch (e) { console.error(e); }
    setProgress(100, 'Terminé.');

    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Lancer l'analyse IA`;

    const nDanger = fileRes.reduce((a, f) => a + f.finds.filter(x => x.sev === 'danger').length, 0) + (ai?.findings?.filter(x => x.severity === 'critical').length || 0);
    const nWarn = fileRes.reduce((a, f) => a + f.finds.filter(x => x.sev === 'warning').length, 0) + (ai?.findings?.filter(x => x.severity === 'warning').length || 0);
    const nClean = fileRes.filter(f => f.finds.length === 0).length;
    const verdict = nDanger > 0 || ai?.verdict === 'malicious' ? 'malicious' : nWarn > 0 || ai?.verdict === 'suspicious' ? 'suspicious' : 'clean';
    const vbadge = verdict === 'clean'
        ? '<span class="rc-badge rcb-clean">Propre</span>'
        : verdict === 'suspicious'
            ? '<span class="rc-badge rcb-warning">Suspect</span>'
            : '<span class="rc-badge rcb-danger">Malveillant</span>';

    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem">
      <span style="font-size:14px;font-weight:600">Résultats de l'analyse</span>${vbadge}
    </div>
    <div class="summary-grid">
      <div class="stat-card stat-danger"><div class="stat-num">${nDanger}</div><div class="stat-label">Critiques</div></div>
      <div class="stat-card stat-warning"><div class="stat-num">${nWarn}</div><div class="stat-label">Alertes</div></div>
      <div class="stat-card stat-info"><div class="stat-num">${codeFiles.length}</div><div class="stat-label">Fichiers</div></div>
      <div class="stat-card stat-success"><div class="stat-num">${nClean}</div><div class="stat-label">Propres</div></div>
    </div>
    <div class="filter-row">
      <span class="filter-label">Filtrer :</span>
      <button class="fchip active" data-f="all" onclick="applyFilter('all')">Tous</button>
      <button class="fchip" data-f="danger" onclick="applyFilter('danger')">Critiques</button>
      <button class="fchip" data-f="warning" onclick="applyFilter('warning')">Alertes</button>
      <button class="fchip" data-f="clean" onclick="applyFilter('clean')">Propres</button>
    </div>`;

    if (ai?.summary) {
        const id = 'ai0';
        html += `<div class="result-card is-info" data-sev="info" id="c${id}">
        <div class="rc-head open" id="h${id}" onclick="toggleCard('${id}')">
          <div class="rc-icon rci-ai">AI</div>
          <span class="rc-name">Synthèse IA — analyse approfondie</span>
          <span class="rc-badge rcb-ai">Claude AI</span>
          <svg class="rc-chevron open" id="ch${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="rc-body open" id="b${id}">
          <div class="ai-summary">${ai.summary}${ai.recommendation ? '\n\n' + ai.recommendation : ''}</div>
          ${ai.findings?.length ? `<div class="ai-divider"></div>${renderFinds(ai.findings)}` : ''}
        </div>
      </div>`;
    }

    fileRes.forEach((f, i) => {
        const hd = f.finds.some(x => x.sev === 'danger');
        const hw = f.finds.some(x => x.sev === 'warning');
        const sevKey = hd ? 'danger' : hw ? 'warning' : 'clean';
        const cardCls = hd ? 'is-danger' : hw ? 'is-warning' : 'is-clean';
        const iconCls = hd ? 'rci-danger' : hw ? 'rci-warning' : 'rci-clean';
        const badgeCls = hd ? 'rcb-danger' : hw ? 'rcb-warning' : 'rcb-clean';
        const badgeTxt = hd ? `${f.finds.filter(x => x.sev === 'danger').length} critique(s)` : hw ? `${f.finds.length} alerte(s)` : 'Propre';
        const iconTxt = hd ? '!' : hw ? '~' : '✓';
        const id = 'f' + i; const open = hd || hw;
        html += `<div class="result-card ${cardCls}" data-sev="${sevKey}" id="c${id}">
        <div class="rc-head${open ? ' open' : ''}" id="h${id}" onclick="toggleCard('${id}')">
          <div class="rc-icon ${iconCls}">${iconTxt}</div>
          <span class="rc-name">${f.name}</span>
          <span class="rc-badge ${badgeCls}">${badgeTxt}</span>
          <svg class="rc-chevron${open ? ' open' : ''}" id="ch${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="rc-body${open ? ' open' : ''}" id="b${id}">${renderFinds(f.finds)}</div>
      </div>`;
    });

    html += `<div class="footer-note">Scan local + Claude AI · Ne remplace pas un audit de sécurité humain</div>`;
    res.innerHTML = html;
}