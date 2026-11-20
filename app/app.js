/* Leonida Trophy Atlas — offline tracker for GTA VI's 55 PS5 trophies.
   No network: the only fetch is data/trophies.json, a file under app/. */
(function () {
  'use strict';

  var STORE_KEY = 'leonida-trophy-atlas-v1';
  var DEMO_EARNED = [2, 3, 4, 8, 15, 16, 21, 28, 35, 42, 52, 53];

  var KIND_LABELS = {
    story: 'Story', stranger: 'Strangers', activity: 'Activity',
    collectible: 'Collectible', exploration: 'Exploration',
    combat: 'Combat & crime', economy: 'Money & property',
    secret: 'Secret', completion: 'Completion'
  };

  var data = null;          // the parsed trophies.json
  var earned = new Set();   // trophy ids the reader has ticked
  var spoilers = false;     // hide story trophies until earned
  var revealed = new Set(); // story trophies revealed one-by-one this session
  var demo = false;         // ?demo=earned seeds example progress, never saved
  var selectedId = null;
  var view = 'checklist';

  var $ = function (id) { return document.getElementById(id); };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (Array.isArray(saved.earned)) saved.earned.forEach(function (id) { earned.add(id); });
      if (saved.spoilers === true) spoilers = true;
    } catch (e) { /* a corrupt save starts fresh */ }
  }

  function saveState() {
    if (demo) return; // demo progress is for screenshots, never persisted
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        earned: Array.from(earned).sort(function (a, b) { return a - b; }),
        spoilers: spoilers
      }));
    } catch (e) { /* private mode or full storage: tracking still works in memory */ }
  }

  function isMasked(t) {
    return spoilers && t.kind === 'story' && !earned.has(t.id) && !revealed.has(t.id);
  }

  function displayName(t) { return isMasked(t) ? 'Hidden story trophy' : t.name; }
  function displayDesc(t) {
    return isMasked(t) ? 'Hidden until earned — turn spoilers off to see it.' : t.description;
  }

  function matchesFilters(t) {
    var q = $('search').value.trim().toLowerCase();
    if (q) {
      var hay = (displayName(t) + ' ' + displayDesc(t)).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    var grade = $('filter-grade').value;
    if (grade !== 'all' && t.grade !== grade) return false;
    var kind = $('filter-kind').value;
    if (kind !== 'all' && t.kind !== kind) return false;
    var status = $('filter-status').value;
    if (status === 'earned' && !earned.has(t.id)) return false;
    if (status === 'remaining' && earned.has(t.id)) return false;
    if ($('filter-missable').checked && !t.missable) return false;
    return true;
  }

  function gradeCounts() {
    var out = {};
    data.trophies.forEach(function (t) {
      out[t.grade] = out[t.grade] || { total: 0, got: 0 };
      out[t.grade].total++;
      if (earned.has(t.id)) out[t.grade].got++;
    });
    return out;
  }

  function renderProgress() {
    var total = data.trophies.length;
    var got = earned.size;
    $('progress-count').textContent = got + ' / ' + total + ' earned';
    $('progress-pct').textContent = Math.round((got / total) * 100) + '%';
    $('progress-fill').style.width = ((got / total) * 100) + '%';
    var counts = gradeCounts();
    $('grade-counts').innerHTML = ['platinum', 'gold', 'silver', 'bronze'].map(function (g) {
      var c = counts[g] || { total: 0, got: 0 };
      return '<span>' + g[0].toUpperCase() + g.slice(1) + ' <b>' + c.got + '/' + c.total + '</b></span>';
    }).join('');
  }

  function renderList() {
    var list = $('trophy-list');
    var shown = data.trophies.filter(matchesFilters);
    $('list-meta').textContent = 'Showing ' + shown.length + ' of ' + data.trophies.length + ' trophies'
      + (earned.size ? ' — ' + earned.size + ' earned' : '');
    list.innerHTML = '';
    if (!shown.length) {
      var li = document.createElement('li');
      li.className = 'trophy';
      li.textContent = 'Nothing matches these filters. Loosen one and try again.';
      list.appendChild(li);
      return;
    }
    shown.forEach(function (t) {
      var li = document.createElement('li');
      li.className = 'trophy' + (earned.has(t.id) ? ' earned' : '') + (t.id === selectedId ? ' selected' : '');
      li.dataset.id = t.id;

      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = earned.has(t.id);
      box.setAttribute('aria-label', 'Mark ' + displayName(t) + ' as earned');
      box.addEventListener('change', function () {
        if (box.checked) earned.add(t.id); else earned.delete(t.id);
        saveState();
        renderAll();
      });
      li.appendChild(box);

      var badge = document.createElement('span');
      badge.className = 'grade-badge grade-' + t.grade;
      badge.textContent = t.grade;
      li.appendChild(badge);

      var mid = document.createElement('div');
      var name = document.createElement('div');
      name.className = 't-name';
      name.textContent = displayName(t);
      mid.appendChild(name);
      var desc = document.createElement('div');
      desc.className = 't-desc';
      desc.textContent = displayDesc(t);
      mid.appendChild(desc);
      var tags = document.createElement('div');
      tags.className = 't-tags';
      var kindTag = document.createElement('span');
      kindTag.className = 'tag';
      kindTag.textContent = KIND_LABELS[t.kind] || t.kind;
      tags.appendChild(kindTag);
      var stageTag = document.createElement('span');
      stageTag.className = 'tag stage';
      stageTag.textContent = 'Roadmap ' + t.stage;
      tags.appendChild(stageTag);
      if (t.missable) {
        var m = document.createElement('span');
        m.className = 'tag missable';
        m.textContent = '⚠ Missable';
        tags.appendChild(m);
      }
      mid.appendChild(tags);
      li.appendChild(mid);

      var num = document.createElement('span');
      num.className = 'tag';
      num.textContent = '#' + t.id;
      li.appendChild(num);

      li.addEventListener('click', function (ev) {
        if (ev.target === box) return;
        selectedId = t.id;
        setView('checklist');
        renderAll();
      });
      list.appendChild(li);
    });
  }

  function renderDetail() {
    var el = $('detail');
    var t = data.trophies.find(function (x) { return x.id === selectedId; });
    if (!t) {
      el.innerHTML = '<p class="empty">Pick a trophy from the list to see its guide, its sources and when it can be missed.</p>'
        + '<p class="empty">Start with the roadmap: finish the story first, meditate in Chapter 1, and keep a manual save at the start of every chapter — there is no mission replay.</p>';
      return;
    }
    var html = '';
    html += '<span class="grade-badge grade-' + t.grade + '">' + t.grade + '</span>';
    html += '<h2></h2>';
    el.innerHTML = html;
    el.querySelector('h2').textContent = displayName(t);

    if (isMasked(t)) {
      var p = document.createElement('p');
      p.className = 'locked';
      p.textContent = 'This is a story trophy and spoilers are hidden until you earn it. Turn spoilers off, or reveal just this one.';
      el.appendChild(p);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Reveal this trophy';
      btn.addEventListener('click', function () { revealed.add(t.id); renderAll(); });
      el.appendChild(btn);
      return;
    }

    var off = document.createElement('p');
    off.className = 'official';
    off.textContent = 'Official: "' + t.description + '"';
    el.appendChild(off);

    var meta = document.createElement('p');
    meta.className = 't-tags';
    meta.innerHTML = '';
    var k = document.createElement('span');
    k.className = 'tag';
    k.textContent = KIND_LABELS[t.kind] || t.kind;
    meta.appendChild(k);
    var s = document.createElement('span');
    s.className = 'tag stage';
    s.textContent = 'Roadmap stage ' + t.stage;
    meta.appendChild(s);
    el.appendChild(meta);

    if (t.missable) {
      var w = document.createElement('p');
      w.className = 'warn';
      w.innerHTML = '<b>⚠ Missable.</b> ';
      w.appendChild(document.createTextNode('The first meditation spot, at Jason\u2019s house in Chapter 1, disappears after that chapter, and there is no mission replay. Do it before you finish Chapter 1.'));
      el.appendChild(w);
    }

    var g = document.createElement('p');
    g.className = 'guide';
    g.textContent = t.guide;
    el.appendChild(g);

    var h = document.createElement('h3');
    h.textContent = 'Sources';
    el.appendChild(h);
    var ul = document.createElement('ul');
    ul.className = 'sources';
    t.sources.forEach(function (src) {
      var li = document.createElement('li');
      if (src.url) {
        var a = document.createElement('a');
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = src.name;
        li.appendChild(a);
      } else {
        li.textContent = src.name;
      }
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  function renderRoadmap() {
    var ol = $('stages');
    ol.innerHTML = '';
    data.roadmap.forEach(function (stage) {
      var li = document.createElement('li');
      var h = document.createElement('h3');
      h.textContent = 'Stage ' + stage.stage + ' — ' + stage.title;
      var time = document.createElement('span');
      time.className = 'time';
      time.textContent = stage.time;
      h.appendChild(time);
      li.appendChild(h);
      var p = document.createElement('p');
      p.textContent = stage.text;
      li.appendChild(p);
      var chips = document.createElement('div');
      chips.className = 'chips';
      data.trophies.filter(function (t) { return t.stage === stage.stage; }).forEach(function (t) {
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'chip' + (earned.has(t.id) ? ' done' : '');
        c.innerHTML = '';
        var g = document.createElement('span');
        g.className = 'g';
        g.textContent = t.grade[0].toUpperCase();
        c.appendChild(g);
        c.appendChild(document.createTextNode(' ' + displayName(t) + (t.missable ? ' ⚠' : '')));
        c.addEventListener('click', function () {
          selectedId = t.id;
          setView('checklist');
          renderAll();
          var row = document.querySelector('.trophy[data-id="' + t.id + '"]');
          if (row) row.scrollIntoView({ block: 'center' });
        });
        chips.appendChild(c);
      });
      li.appendChild(chips);
      ol.appendChild(li);
    });
  }

  function setView(v) {
    view = v;
    $('view-checklist').hidden = v !== 'checklist';
    $('view-roadmap').hidden = v !== 'roadmap';
    $('tab-checklist').classList.toggle('active', v === 'checklist');
    $('tab-roadmap').classList.toggle('active', v === 'roadmap');
    var hash = v === 'roadmap' ? '#roadmap' : (selectedId ? '#trophy-' + selectedId : '#');
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function renderAll() {
    renderProgress();
    renderList();
    renderDetail();
    renderRoadmap();
  }

  function applyQuery() {
    var q = new URLSearchParams(location.search);
    if (q.get('demo') === 'earned') {
      demo = true;
      DEMO_EARNED.forEach(function (id) { earned.add(id); });
    }
    if (q.get('grade')) $('filter-grade').value = q.get('grade');
    if (q.get('kind')) $('filter-kind').value = q.get('kind');
    if (q.get('status')) $('filter-status').value = q.get('status');
    if (q.get('missable') === '1') $('filter-missable').checked = true;
    if (q.get('spoilers') === 'on') spoilers = true;
    if (q.get('view') === 'roadmap') view = 'roadmap';
    var m = /^#trophy-(\d+)$/.exec(location.hash || '');
    if (m) selectedId = Number(m[1]);
    if (location.hash === '#roadmap') view = 'roadmap';
    $('spoiler-toggle').checked = spoilers;
  }

  function exportProgress() {
    var blob = new Blob([JSON.stringify({
      app: 'leonida-trophy-atlas',
      version: 1,
      exportedAt: new Date().toISOString(),
      earned: Array.from(earned).sort(function (a, b) { return a - b; })
    }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leonida-trophy-atlas-progress.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        var ids = Array.isArray(parsed) ? parsed : parsed.earned;
        if (!Array.isArray(ids)) throw new Error('bad file');
        var known = new Set(data.trophies.map(function (t) { return t.id; }));
        var next = new Set();
        ids.forEach(function (id) { if (known.has(Number(id))) next.add(Number(id)); });
        earned = next;
        saveState();
        renderAll();
        alert('Imported ' + earned.size + ' earned trophies.');
      } catch (e) {
        alert('That file is not a Leonida Trophy Atlas export.');
      }
    };
    reader.readAsText(file);
  }

  function bind() {
    $('tab-checklist').addEventListener('click', function () { setView('checklist'); });
    $('tab-roadmap').addEventListener('click', function () { setView('roadmap'); });
    ['search', 'filter-grade', 'filter-kind', 'filter-status', 'filter-missable'].forEach(function (id) {
      $(id).addEventListener('input', renderList);
      $(id).addEventListener('change', renderList);
    });
    $('spoiler-toggle').addEventListener('change', function () {
      spoilers = $('spoiler-toggle').checked;
      saveState();
      renderAll();
    });
    $('export-btn').addEventListener('click', exportProgress);
    $('import-file').addEventListener('change', function () {
      if ($('import-file').files[0]) importProgress($('import-file').files[0]);
      $('import-file').value = '';
    });
    $('reset-btn').addEventListener('click', function () {
      if (!confirm('Clear all earned trophies and the spoiler setting?')) return;
      earned = new Set();
      revealed = new Set();
      saveState();
      renderAll();
    });
    window.addEventListener('hashchange', function () {
      var m = /^#trophy-(\d+)$/.exec(location.hash || '');
      if (m) { selectedId = Number(m[1]); setView('checklist'); renderAll(); }
      else if (location.hash === '#roadmap') { setView('roadmap'); }
    });
  }

  fetch('data/trophies.json')
    .then(function (r) { if (!r.ok) throw new Error('trophies.json not found'); return r.json(); })
    .then(function (json) {
      data = json;
      loadState();
      applyQuery();
      bind();
      setView(view);
      renderAll();
    })
    .catch(function (err) {
      $('trophy-list').innerHTML = '<li class="trophy">Could not load the trophy list (' + err.message + '). Open this app from its own folder so data/trophies.json sits beside it.</li>';
    });
})();
