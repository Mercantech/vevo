(function () {
  'use strict';

  const STORAGE_KEY = 'vevo-skill-data';
  const EXPORT_HASH_PREFIX = 'd=';

  // --- Data ---
  let opgaver = [];
  let kompetencer = [];
  let point = {}; // { opgaveId: { kompetenceId: number } }
  let nextOpgaveId = 1;
  let nextKompetenceId = 1;

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        opgaver: opgaver,
        kompetencer: kompetencer,
        point: point,
        nextOpgaveId: nextOpgaveId,
        nextKompetenceId: nextKompetenceId
      }));
    } catch (e) {
      console.warn('Kunne ikke gemme til localStorage', e);
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      opgaver = d.opgaver || [];
      kompetencer = d.kompetencer || [];
      point = d.point || {};
      nextOpgaveId = d.nextOpgaveId != null ? d.nextOpgaveId : 1;
      nextKompetenceId = d.nextKompetenceId != null ? d.nextKompetenceId : 1;
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Returnerer data til eksport (opgaver, kompetencer, point, elevNavn). */
  function getExportPayload() {
    var elevNavnEl = document.getElementById('export-elev-navn');
    var elevNavn = (elevNavnEl && elevNavnEl.value) ? elevNavnEl.value.trim() : '';
    return { opgaver: opgaver, kompetencer: kompetencer, point: point, elevNavn: elevNavn };
  }

  /** Genererer et delbart URL med data i hash (client-side only). */
  function getShareableUrl() {
    const payload = getExportPayload();
    const json = JSON.stringify(payload);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    const base = window.location.origin + window.location.pathname;
    return base + '#' + EXPORT_HASH_PREFIX + base64;
  }

  /** Læser payload fra hash (#d=base64). Returnerer null hvis ugyldig. */
  function readPayloadFromHash() {
    const hash = window.location.hash;
    if (!hash || hash.indexOf(EXPORT_HASH_PREFIX) !== 1) return null;
    const base64 = hash.slice(1 + EXPORT_HASH_PREFIX.length);
    try {
      const json = decodeURIComponent(escape(atob(base64)));
      const d = JSON.parse(json);
      if (d && (d.opgaver || d.kompetencer)) return d;
    } catch (e) { /* ignore */ }
    return null;
  }

  /** Beregner niveau per kompetence ud fra et export-payload. */
  function getNiveauFromPayload(payload) {
    const opg = payload.opgaver || [];
    const komp = payload.kompetencer || [];
    const pt = payload.point || {};
    const sum = {};
    const count = {};
    komp.forEach(function (k) { sum[k.id] = 0; count[k.id] = 0; });
    opg.forEach(function (o) {
      komp.forEach(function (k) {
        const p = (pt[o.id] && pt[o.id][k.id]) ? pt[o.id][k.id] : 0;
        if (p > 0) { sum[k.id] += p; count[k.id] += 1; }
      });
    });
    return komp.map(function (k) {
      const n = count[k.id];
      const værdi = n > 0 ? sum[k.id] / n : 0;
      return { id: k.id, navn: k.navn, niveau: Math.round(værdi * 10) / 10 };
    });
  }

  /** Tegner radar-diagram på en canvas (elev-visning). */
  function tegnGraphElev(canvasEl, niveauer) {
    const SKALA_MAX = 10;
    const ctx = canvasEl.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.width / dpr;
    const h = canvasEl.height / dpr;
    const cx = w / 2;
    const cy = h / 2;
    const n = niveauer.length;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.restore();
    if (n === 0) {
      ctx.fillStyle = '#a6adc8';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ingen kompetencedata at vise.', cx, cy);
      return;
    }
    const radius = Math.min(w, h) * 0.38;
    const labelOffset = 28;
    function angleForIndex(i) { return (2 * Math.PI * i) / n - Math.PI / 2; }
    function toXY(r, i) {
      const a = angleForIndex(i);
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }
    for (var ring = 2; ring <= SKALA_MAX; ring += 2) {
      const r = (ring / SKALA_MAX) * radius;
      ctx.strokeStyle = 'rgba(108, 112, 134, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i <= n; i++) {
        var p = toXY(r, i % n);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(108, 112, 134, 0.6)';
    for (var i = 0; i < n; i++) {
      var end = toXY(radius, i);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    var points = niveauer.map(function (v, i) {
      var r = (v.niveau / SKALA_MAX) * radius;
      return toXY(r, i);
    });
    ctx.fillStyle = 'rgba(137, 180, 250, 0.35)';
    ctx.strokeStyle = 'rgba(137, 180, 250, 0.9)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    points.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#89b4fa';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#cdd6f4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    niveauer.forEach(function (v, i) {
      var a = angleForIndex(i);
      var lx = cx + (radius + labelOffset) * Math.cos(a);
      var ly = cy + (radius + labelOffset) * Math.sin(a);
      ctx.fillText(v.navn + ' — ' + v.niveau, lx, ly);
    });
  }

  /** Åbner elev-visning (read-only) i modal med givet payload. */
  var elevModalResizeHandler = null;

  function showElevView(payload) {
    const elevModal = document.getElementById('elev-view-modal');
    const elevCanvas = document.getElementById('elev-graph-canvas');
    const elevLegend = document.getElementById('elev-graph-legend');
    const elevOpgaverListe = document.getElementById('elev-opgaver-liste');
    const elevModalTitel = document.getElementById('elev-modal-title');
    if (!elevModal || !elevCanvas) return;
    if (elevModalTitel) elevModalTitel.textContent = (payload.elevNavn && payload.elevNavn.trim()) ? ('Kompetenceoverblik for ' + payload.elevNavn.trim()) : 'Dit kompetenceoverblik';
    const opg = payload.opgaver || [];
    const komp = payload.kompetencer || [];
    const pt = payload.point || {};
    const niveauer = getNiveauFromPayload(payload);
    if (elevLegend) elevLegend.innerHTML = '<span class="scale-info">Skala 0–10</span>';
    elevOpgaverListe.innerHTML = '';
    opg.forEach(function (o) {
      const row = document.createElement('div');
      row.className = 'elev-opgave-kort';
      var pts = komp.map(function (k) {
        const v = (pt[o.id] && pt[o.id][k.id]) ? pt[o.id][k.id] : null;
        return v != null ? k.navn + ': ' + v : null;
      }).filter(Boolean);
      row.innerHTML = '<strong>' + escapeHtml(o.navn) + '</strong>' +
        (o.beskrivelse ? '<p class="elev-opgave-beskr">' + escapeHtml(o.beskrivelse) + '</p>' : '') +
        '<p class="elev-opgave-pt">' + (pts.length ? pts.join(' · ') : 'Ingen point tildelt') + '</p>';
      elevOpgaverListe.appendChild(row);
    });
    function resizeElevCanvas() {
      const wrap = elevCanvas.parentElement;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w <= 0 || h <= 0) return;
      elevCanvas.width = w * dpr;
      elevCanvas.height = h * dpr;
      elevCanvas.style.width = w + 'px';
      elevCanvas.style.height = h + 'px';
      const ctx = elevCanvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tegnGraphElev(elevCanvas, niveauer);
    }
    if (elevModalResizeHandler) window.removeEventListener('resize', elevModalResizeHandler);
    elevModalResizeHandler = resizeElevCanvas;
    window.addEventListener('resize', elevModalResizeHandler);
    elevModal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      requestAnimationFrame(resizeElevCanvas);
    });
  }

  function closeElevModal() {
    const elevModal = document.getElementById('elev-view-modal');
    if (elevModal) {
      elevModal.hidden = true;
      document.body.style.overflow = '';
    }
    if (elevModalResizeHandler) {
      window.removeEventListener('resize', elevModalResizeHandler);
      elevModalResizeHandler = null;
    }
  }

  /** Hit-test for elev-canvas: returnerer kompetence-index (0..n-1) eller null. */
  function hitTestKompetenceElev(canvasEl, logicalX, logicalY, niveauer) {
    const n = niveauer.length;
    if (n === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvasEl.width / dpr;
    const ch = canvasEl.height / dpr;
    const cx = cw / 2;
    const cy = ch / 2;
    const radius = Math.min(cw, ch) * 0.38;
    const labelOffset = 28;
    const maxDist = radius + labelOffset + 40;
    const dx = logicalX - cx;
    const dy = logicalY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist || dist < 15) return null;
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    const index = Math.floor(angle / (2 * Math.PI / n)) % n;
    return index;
  }

  /** Viser kompetence-detalje i fuldskærms elev-view (read-only). */
  function visKompetenceDetaljeElev(payload, kompetenceId, niveauer) {
    const titelEl = document.getElementById('elev-fullpage-detalje-titel');
    const niveauEl = document.getElementById('elev-fullpage-detalje-niveau');
    const listeEl = document.getElementById('elev-fullpage-detalje-liste');
    const panelEl = document.getElementById('elev-fullpage-detalje');
    if (!panelEl || !titelEl) return;
    const komp = (payload.kompetencer || []).find(function (k) { return k.id === kompetenceId; });
    if (!komp) return;
    const niv = niveauer.find(function (n) { return n.id === kompetenceId; });
    const opg = payload.opgaver || [];
    const pt = payload.point || {};
    const opgaverMedPoint = opg.filter(function (o) { return (pt[o.id] && pt[o.id][kompetenceId]) > 0; })
      .map(function (o) {
        return { navn: o.navn, beskrivelse: o.beskrivelse, point: pt[o.id][kompetenceId] };
      })
      .sort(function (a, b) { return b.point - a.point; });
    titelEl.textContent = komp.navn;
    niveauEl.textContent = 'Niveau: ' + (niv ? niv.niveau : '0') + ' (gennemsnit af point fra opgaver)';
    listeEl.innerHTML = opgaverMedPoint.length === 0
      ? '<li>Ingen opgaver har givet point til denne kompetence.</li>'
      : opgaverMedPoint.map(function (item) {
          const beskr = item.beskrivelse ? '<span class="opgave-beskrivelse">' + escapeHtml(item.beskrivelse) + '</span>' : '';
          return '<li>' + escapeHtml(item.navn) + ' <span class="opgave-point">' + item.point + ' pt</span>' + beskr + '</li>';
        }).join('');
    panelEl.hidden = false;
  }

  /** Initialiserer fuldskærms elev-view (ved delt link). Read-only, interaktiv graf. */
  function initElevFullPage(payload) {
    const appEl = document.querySelector('.app');
    const fullpageEl = document.getElementById('elev-fullpage');
    const elevCanvas = document.getElementById('elev-fullpage-canvas');
    const elevLegend = document.getElementById('elev-fullpage-legend');
    const elevListe = document.getElementById('elev-fullpage-opgaver-liste');
    const detaljePanel = document.getElementById('elev-fullpage-detalje');
    const detaljeLuk = document.getElementById('elev-fullpage-detalje-luk');
    if (!fullpageEl || !elevCanvas) return;
    if (appEl) appEl.hidden = true;
    fullpageEl.hidden = false;
    var elevH1 = fullpageEl.querySelector('.elev-fullpage-header h1');
    if (elevH1) elevH1.textContent = (payload.elevNavn && payload.elevNavn.trim()) ? ('Kompetenceoverblik for ' + payload.elevNavn.trim()) : 'Dit kompetenceoverblik';
    const opg = payload.opgaver || [];
    const komp = payload.kompetencer || [];
    const pt = payload.point || {};
    const niveauer = getNiveauFromPayload(payload);
    if (elevLegend) elevLegend.innerHTML = '<span class="scale-info">Klik på en kompetence for at se hvilke opgaver der har givet point · Skala 0–10</span>';
    elevListe.innerHTML = '';
    opg.forEach(function (o) {
      const row = document.createElement('div');
      row.className = 'elev-opgave-kort';
      var pts = komp.map(function (k) {
        const v = (pt[o.id] && pt[o.id][k.id]) ? pt[o.id][k.id] : null;
        return v != null ? k.navn + ': ' + v : null;
      }).filter(Boolean);
      row.innerHTML = '<strong>' + escapeHtml(o.navn) + '</strong>' +
        (o.beskrivelse ? '<p class="elev-opgave-beskr">' + escapeHtml(o.beskrivelse) + '</p>' : '') +
        '<p class="elev-opgave-pt">' + (pts.length ? pts.join(' · ') : 'Ingen point tildelt') + '</p>';
      elevListe.appendChild(row);
    });
    function resizeAndDraw() {
      const wrap = elevCanvas.parentElement;
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w <= 0 || h <= 0) return;
      elevCanvas.width = w * dpr;
      elevCanvas.height = h * dpr;
      elevCanvas.style.width = w + 'px';
      elevCanvas.style.height = h + 'px';
      const ctx = elevCanvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tegnGraphElev(elevCanvas, niveauer);
    }
    elevCanvas.addEventListener('click', function (e) {
      const rect = elevCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const logicalX = ((e.clientX - rect.left) / rect.width) * (elevCanvas.width / dpr);
      const logicalY = ((e.clientY - rect.top) / rect.height) * (elevCanvas.height / dpr);
      const index = hitTestKompetenceElev(elevCanvas, logicalX, logicalY, niveauer);
      if (index === null) return;
      visKompetenceDetaljeElev(payload, niveauer[index].id, niveauer);
    });
    if (detaljeLuk) detaljeLuk.addEventListener('click', function () { if (detaljePanel) detaljePanel.hidden = true; });
    window.addEventListener('resize', resizeAndDraw);
    requestAnimationFrame(function () { requestAnimationFrame(resizeAndDraw); });
  }

  /** Genererer en selvstændig HTML-fil med indlejret data og styling. forPrint: true = åbner print-dialog (til PDF). */
  function generateStandaloneHtml(forPrint) {
    const payload = getExportPayload();
    const json = JSON.stringify(payload);
    const base64 = btoa(unescape(encodeURIComponent(json))).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const inlineCss = '*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:\'Segoe UI\',system-ui,sans-serif;background:#1e1e2e;color:#cdd6f4;min-height:100vh}.app{max-width:1400px;margin:0 auto;padding:.75rem 1rem}.elev-view{background:#2d2d3d;border-radius:12px;padding:1rem;border:1px solid #45475a}.elev-view h2{font-size:1.1rem;margin:0 0 .25rem 0;color:#cdd6f4}.elev-subtitle,.elev-footer{font-size:.85rem;color:#a6adc8;margin:0 0 .75rem 0}.elev-graph-wrap{width:100%;height:420px;background:#1e1e2e;border-radius:10px;border:1px solid #45475a;margin:.75rem 0;position:relative}#elev-graph-canvas{display:block;width:100%;height:100%}.elev-opgaver h3{font-size:.95rem;margin:.75rem 0 .5rem 0;color:#a6adc8}.elev-opgave-kort{padding:.6rem .75rem;margin-bottom:.5rem;background:#1e1e2e;border:1px solid #45475a;border-radius:8px;font-size:.9rem}.elev-opgave-kort strong{color:#89b4fa}.elev-opgave-beskr,.elev-opgave-pt{font-size:.85rem;color:#a6adc8;margin:.35rem 0 0 0}header{background:#2d2d3d;border-radius:8px;padding:1rem;margin-bottom:1rem}header h1{font-size:1.25rem;margin:0 0 .25rem 0;color:#cdd6f4}.subtitle{color:#a6adc8;margin:0}@media print{body,header,.app,.elev-view,.elev-graph-wrap,.elev-opgaver,.elev-opgave-kort{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:inherit}body{background:#1e1e2e!important}header{background:#2d2d3d!important;margin-bottom:1rem}.elev-view{background:#2d2d3d!important;box-shadow:none}.elev-graph-wrap{height:400px!important;background:#1e1e2e!important;page-break-inside:avoid}.elev-opgave-kort{background:#1e1e2e!important;page-break-inside:avoid}.elev-opgaver h3{color:#a6adc8}@page{margin:1.5cm}}';
    const inlineScript = '(function(){var d=JSON.parse(decodeURIComponent(escape(atob("' + base64 + '"))));var opg=d.opgaver||[],komp=d.kompetencer||[],pt=d.point||{};var sum={},count={};komp.forEach(function(k){sum[k.id]=0;count[k.id]=0;});opg.forEach(function(o){komp.forEach(function(k){var p=(pt[o.id]&&pt[o.id][k.id])?pt[o.id][k.id]:0;if(p>0){sum[k.id]+=p;count[k.id]++;}});});var niveauer=komp.map(function(k){var n=count[k.id],v=n>0?sum[k.id]/n:0;return{id:k.id,navn:k.navn,niveau:Math.round(v*10)/10};});var c=document.getElementById("elev-graph-canvas"),ctx=c.getContext("2d");function draw(){var w=c.width,h=c.height,cx=w/2,cy=h/2,n=niveauer.length;ctx.clearRect(0,0,w,h);if(n===0){ctx.fillStyle="#a6adc8";ctx.font="14px system-ui";ctx.textAlign="center";ctx.fillText("Ingen data",cx,cy);return;}var r=Math.min(w,h)*0.38,lo=28;function ang(i){return 2*Math.PI*i/n-Math.PI/2;}function xy(rr,i){var a=ang(i);return{x:cx+rr*Math.cos(a),y:cy+rr*Math.sin(a)};}for(var ring=2;ring<=10;ring+=2){var rr=(ring/10)*r;ctx.strokeStyle="rgba(108,112,134,.5)";ctx.beginPath();for(var i=0;i<=n;i++){var p=xy(rr,i%n);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.closePath();ctx.stroke();}ctx.strokeStyle="rgba(108,112,134,.6)";for(var i=0;i<n;i++){var e=xy(r,i);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(e.x,e.y);ctx.stroke();}var pts=niveauer.map(function(v,i){var rr=(v.niveau/10)*r;return xy(rr,i);});ctx.fillStyle="rgba(137,180,250,.35)";ctx.strokeStyle="rgba(137,180,250,.9)";ctx.lineWidth=2;ctx.beginPath();pts.forEach(function(p,i){if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});ctx.closePath();ctx.fill();ctx.stroke();pts.forEach(function(p){ctx.beginPath();ctx.arc(p.x,p.y,4,0,2*Math.PI);ctx.fillStyle="#89b4fa";ctx.fill();});ctx.font="12px system-ui";ctx.fillStyle="#cdd6f4";ctx.textAlign="center";niveauer.forEach(function(v,i){var a=ang(i),lx=cx+(r+lo)*Math.cos(a),ly=cy+(r+lo)*Math.sin(a);ctx.fillText(v.navn+" — "+v.niveau,lx,ly);});}var wrap=c.parentElement;function resize(){var w=wrap.clientWidth,h=wrap.clientHeight;c.width=w;c.height=h;c.style.width=w+"px";c.style.height=h+"px";draw();}resize();window.onresize=resize;var list=document.getElementById("elev-opgaver-liste");function esc(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}opg.forEach(function(o){var div=document.createElement("div");div.className="elev-opgave-kort";var pts=komp.map(function(k){var v=(pt[o.id]&&pt[o.id][k.id])?pt[o.id][k.id]:null;return v!=null?k.navn+": "+v:null;}).filter(Boolean);div.innerHTML="<strong>"+esc(o.navn)+"</strong>"+(o.beskrivelse?"<p class=\\"elev-opgave-beskr\\">"+esc(o.beskrivelse)+"</p>":"")+"<p class=\\"elev-opgave-pt\\">"+(pts.length?pts.join(" · "):"Ingen point")+"</p>";list.appendChild(div);});if(d.elevNavn&&String(d.elevNavn).trim()){var t="Kompetenceoverblik for "+String(d.elevNavn).trim();var h1=document.querySelector("header h1");if(h1)h1.textContent=t;document.title=t;}})();';
    const printScript = forPrint ? '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>' : '';
    return '<!DOCTYPE html><html lang="da"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Dit kompetenceoverblik</title><style>' + inlineCss + '</style></head><body><div class="app"><header><h1>Dit kompetenceoverblik</h1><p class="subtitle">Dette overblik viser dine vurderede opgaver og niveau per kompetence.</p></header><main class="elev-view"><h2>Skill-overview</h2><p class="elev-subtitle">Niveau per kompetence (0–10).</p><div class="elev-graph-wrap"><canvas id="elev-graph-canvas"></canvas></div><section class="elev-opgaver"><h3>Opgaver og point</h3><div id="elev-opgaver-liste"></div></section><p class="elev-footer">Genereret fra Kompetenceoverblik</p></main></div><script>' + inlineScript + '</script>' + printScript + '</body></html>';
  }

  window.VEVO_SHOW_ELEV_VIEW = showElevView;
  window.getNiveauFromPayload = getNiveauFromPayload;
  window.tegnGraphElev = tegnGraphElev;

  // --- DOM ---
  const formOpgave = document.getElementById('form-opgave');
  const formKompetence = document.getElementById('form-kompetence');
  const formPoint = document.getElementById('form-point');
  const listeOpgaver = document.getElementById('liste-opgaver');
  const listeKompetencer = document.getElementById('liste-kompetencer');
  const selectPointOpgave = document.getElementById('point-opgave');
  const pointKompetencerWrap = document.getElementById('point-kompetencer-wrap');
  const canvas = document.getElementById('graph-canvas');
  const legend = document.getElementById('graph-legend');
  const kompetenceDetalje = document.getElementById('kompetence-detalje');
  const kompetenceDetaljeTitel = document.getElementById('kompetence-detalje-titel');
  const kompetenceDetaljeNiveau = document.getElementById('kompetence-detalje-niveau');
  const kompetenceDetaljeListe = document.getElementById('kompetence-detalje-liste');

  /** Id på den kompetence der vises i forklaringspanelet (null når lukket). */
  let valgtKompetenceId = null;

  // --- Diagram ---
  let graphCtx = null;
  const SKALA_MAX = 10;

  function getOpgave(id) {
    return opgaver.find(function (o) { return o.id === id; });
  }
  function getKompetence(id) {
    return kompetencer.find(function (k) { return k.id === id; });
  }

  function getPoint(opgaveId, kompetenceId) {
    if (!point[opgaveId]) return 0;
    return point[opgaveId][kompetenceId] || 0;
  }
  function setPoint(opgaveId, kompetenceId, værdi) {
    if (!point[opgaveId]) point[opgaveId] = {};
    point[opgaveId][kompetenceId] = Math.max(1, Math.min(10, værdi));
  }

  /** Niveau per kompetence: gennemsnit af alle point fra opgaver (0–10). */
  function getNiveauPerKompetence() {
    const sum = {};
    const count = {};
    kompetencer.forEach(function (k) {
      sum[k.id] = 0;
      count[k.id] = 0;
    });
    opgaver.forEach(function (o) {
      kompetencer.forEach(function (k) {
        const p = getPoint(o.id, k.id);
        if (p > 0) {
          sum[k.id] += p;
          count[k.id] += 1;
        }
      });
    });
    return kompetencer.map(function (k) {
      const n = count[k.id];
      const værdi = n > 0 ? sum[k.id] / n : 0;
      return { id: k.id, navn: k.navn, niveau: Math.round(værdi * 10) / 10 };
    });
  }

  function opdaterSelects() {
    selectPointOpgave.innerHTML = opgaver.map(function (o) {
      return '<option value="' + o.id + '">' + escapeHtml(o.navn) + '</option>';
    }).join('');
    renderPointKompetencer();
  }

  function renderPointKompetencer() {
    pointKompetencerWrap.innerHTML = '';
    const opgaveId = parseInt(selectPointOpgave.value, 10);
    if (!opgaveId || kompetencer.length === 0) {
      pointKompetencerWrap.innerHTML = '<p class="point-ingen">Vælg en opgave – derefter kan du sætte point per kompetence.</p>';
      return;
    }
    kompetencer.forEach(function (k) {
      const v = getPoint(opgaveId, k.id);
      const hasValue = v > 0;
      const id = 'point-k-' + k.id;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.className = 'point-k-label';
      label.textContent = k.navn;
      const input = document.createElement('input');
      input.type = 'number';
      input.id = id;
      input.min = 1;
      input.max = 10;
      input.placeholder = '–';
      input.setAttribute('aria-label', k.navn + ' (1–10, tom = tæller ikke)');
      input.className = 'point-k-input';
      input.dataset.kompetenceId = String(k.id);
      if (hasValue) input.value = v;
      input.addEventListener('change', function () {
        const val = parseInt(input.value, 10);
        const num = isNaN(val) ? 0 : Math.max(0, Math.min(10, val));
        if (num > 0) {
          setPoint(opgaveId, k.id, num);
          input.value = num;
          input.placeholder = '–';
          fjernBtn.classList.remove('point-fjern--inaktiv');
        } else {
          if (point[opgaveId]) delete point[opgaveId][k.id];
          input.value = '';
          input.placeholder = '–';
          fjernBtn.classList.add('point-fjern--inaktiv');
        }
        tegnGraph();
        opdaterForklaringHvisSynlig();
        saveToStorage();
      });
      const fjernBtn = document.createElement('button');
      fjernBtn.type = 'button';
      fjernBtn.className = 'point-fjern' + (hasValue ? '' : ' point-fjern--inaktiv');
      fjernBtn.textContent = 'Fjern';
      fjernBtn.setAttribute('aria-label', 'Fjern ' + k.navn + ' fra denne opgave');
      fjernBtn.addEventListener('click', function () {
        if (point[opgaveId]) delete point[opgaveId][k.id];
        input.value = '';
        input.placeholder = '–';
        fjernBtn.classList.add('point-fjern--inaktiv');
        tegnGraph();
        opdaterForklaringHvisSynlig();
        saveToStorage();
      });
      const wrap = document.createElement('div');
      wrap.className = 'point-k-row';
      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(fjernBtn);
      pointKompetencerWrap.appendChild(wrap);
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderListeOpgaver() {
    listeOpgaver.innerHTML = opgaver.map(function (o) {
      const beskr = o.beskrivelse ? '<div class="beskrivelse">' + escapeHtml(o.beskrivelse) + '</div>' : '';
      return '<li data-id="' + o.id + '">' +
        '<div><span class="navn">' + escapeHtml(o.navn) + '</span>' + beskr + '</div>' +
        '<button type="button" class="slet-opgave" aria-label="Slet">×</button></li>';
    }).join('');
    listeOpgaver.querySelectorAll('.slet-opgave').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = parseInt(btn.closest('li').dataset.id, 10);
        opgaver = opgaver.filter(function (o) { return o.id !== id; });
        delete point[id];
        renderListeOpgaver();
        opdaterSelects();
        tegnGraph();
        saveToStorage();
      });
    });
  }

  function renderListeKompetencer() {
    listeKompetencer.innerHTML = kompetencer.map(function (k) {
      return '<li data-id="' + k.id + '">' +
        '<span class="navn">' + escapeHtml(k.navn) + '</span>' +
        '<button type="button" class="slet-kompetence" aria-label="Slet">×</button></li>';
    }).join('');
    listeKompetencer.querySelectorAll('.slet-kompetence').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = parseInt(btn.closest('li').dataset.id, 10);
        kompetencer = kompetencer.filter(function (k) { return k.id !== id; });
        Object.keys(point).forEach(function (opgaveId) {
          if (point[opgaveId][id] !== undefined) delete point[opgaveId][id];
        });
        renderListeKompetencer();
        opdaterSelects();
        tegnGraph();
        saveToStorage();
      });
    });
  }

  formOpgave.addEventListener('submit', function (e) {
    e.preventDefault();
    const navn = document.getElementById('opgave-navn').value.trim();
    const beskrivelse = document.getElementById('opgave-beskrivelse').value.trim();
    if (!navn) return;
    opgaver.push({ id: nextOpgaveId++, navn: navn, beskrivelse: beskrivelse });
    document.getElementById('opgave-navn').value = '';
    document.getElementById('opgave-beskrivelse').value = '';
    renderListeOpgaver();
    opdaterSelects();
    tegnGraph();
    saveToStorage();
  });

  formKompetence.addEventListener('submit', function (e) {
    e.preventDefault();
    const navn = document.getElementById('kompetence-navn').value.trim();
    if (!navn) return;
    kompetencer.push({ id: nextKompetenceId++, navn: navn });
    document.getElementById('kompetence-navn').value = '';
    renderListeKompetencer();
    opdaterSelects();
    tegnGraph();
  });

  selectPointOpgave.addEventListener('change', renderPointKompetencer);

  /** Tegner skill-overview radar-diagram: én akse per kompetence, niveau 0–10. */
  function tegnGraph() {
    if (!graphCtx || !canvas.width || !canvas.height) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    const cx = cw / 2;
    const cy = ch / 2;

    graphCtx.save();
    graphCtx.setTransform(1, 0, 0, 1, 0, 0);
    graphCtx.clearRect(0, 0, canvas.width, canvas.height);
    graphCtx.restore();

    const niveauer = getNiveauPerKompetence();
    const n = niveauer.length;
    if (n === 0) {
      graphCtx.fillStyle = '#a6adc8';
      graphCtx.font = '14px system-ui, sans-serif';
      graphCtx.textAlign = 'center';
      graphCtx.fillText('Tilføj kompetencer og tildel point fra opgaver for at se diagrammet.', cx, cy);
      legend.innerHTML = '';
      opdaterForklaringHvisSynlig();
      return;
    }

    const radius = Math.min(cw, ch) * 0.38;
    const labelOffset = 28;

    // Start øverst og gå med uret (som klassisk radar)
    function angleForIndex(i) {
      return (2 * Math.PI * i) / n - Math.PI / 2;
    }
    function toXY(r, i) {
      const a = angleForIndex(i);
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }

    // Grid: koncentriske ringe (2, 4, 6, 8, 10)
    graphCtx.strokeStyle = 'rgba(108, 112, 134, 0.5)';
    graphCtx.lineWidth = 1;
    for (var ring = 2; ring <= SKALA_MAX; ring += 2) {
      const r = (ring / SKALA_MAX) * radius;
      graphCtx.beginPath();
      for (var i = 0; i <= n; i++) {
        var p = toXY(r, i % n);
        if (i === 0) graphCtx.moveTo(p.x, p.y);
        else graphCtx.lineTo(p.x, p.y);
      }
      graphCtx.closePath();
      graphCtx.stroke();
    }

    // Akser fra centrum ud
    graphCtx.strokeStyle = 'rgba(108, 112, 134, 0.6)';
    for (var i = 0; i < n; i++) {
      var end = toXY(radius, i);
      graphCtx.beginPath();
      graphCtx.moveTo(cx, cy);
      graphCtx.lineTo(end.x, end.y);
      graphCtx.stroke();
    }

    // Polygon for niveauer (fyld + kant)
    var points = niveauer.map(function (v, i) {
      var r = (v.niveau / SKALA_MAX) * radius;
      return toXY(r, i);
    });
    graphCtx.fillStyle = 'rgba(137, 180, 250, 0.35)';
    graphCtx.strokeStyle = 'rgba(137, 180, 250, 0.9)';
    graphCtx.lineWidth = 2;
    graphCtx.lineJoin = 'round';
    graphCtx.beginPath();
    points.forEach(function (p, i) {
      if (i === 0) graphCtx.moveTo(p.x, p.y);
      else graphCtx.lineTo(p.x, p.y);
    });
    graphCtx.closePath();
    graphCtx.fill();
    graphCtx.stroke();

    // Punkter ved hvert niveau
    points.forEach(function (p) {
      graphCtx.beginPath();
      graphCtx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      graphCtx.fillStyle = '#89b4fa';
      graphCtx.fill();
      graphCtx.strokeStyle = 'rgba(255,255,255,0.6)';
      graphCtx.lineWidth = 1;
      graphCtx.stroke();
    });

    // Labels: kompetencenavn + niveau ved enden af aksen
    graphCtx.font = '12px system-ui, sans-serif';
    graphCtx.fillStyle = '#cdd6f4';
    graphCtx.textAlign = 'center';
    graphCtx.textBaseline = 'middle';
    niveauer.forEach(function (v, i) {
      var a = angleForIndex(i);
      var lx = cx + (radius + labelOffset) * Math.cos(a);
      var ly = cy + (radius + labelOffset) * Math.sin(a);
      graphCtx.fillText(v.navn + ' — ' + v.niveau, lx, ly);
    });

    legend.innerHTML = '<span class="scale-info">Klik på en kompetence for at se hvilke opgaver der har givet point · Skala 0–10</span>';
    opdaterForklaringHvisSynlig();
  }

  /** Returnerer kompetence-index (0..n-1) ved klik-koordinater i diagrammet, eller null. */
  function hitTestKompetence(logicalX, logicalY) {
    const niveauer = getNiveauPerKompetence();
    const n = niveauer.length;
    if (n === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;
    const cx = cw / 2;
    const cy = ch / 2;
    const radius = Math.min(cw, ch) * 0.38;
    const labelOffset = 28;
    const maxDist = radius + labelOffset + 40;
    const dx = logicalX - cx;
    const dy = logicalY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist || dist < 15) return null;
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
    const index = Math.floor(angle / (2 * Math.PI / n)) % n;
    return index;
  }

  function visKompetenceDetalje(kompetenceId) {
    const k = getKompetence(kompetenceId);
    if (!k) return;
    const niveauer = getNiveauPerKompetence();
    const niv = niveauer.find(function (n) { return n.id === kompetenceId; });
    const opgaverMedPoint = opgaver.filter(function (o) { return getPoint(o.id, kompetenceId) > 0; })
      .map(function (o) {
        return { navn: o.navn, beskrivelse: o.beskrivelse, point: getPoint(o.id, kompetenceId) };
      })
      .sort(function (a, b) { return b.point - a.point; });

    kompetenceDetaljeTitel.textContent = k.navn;
    kompetenceDetaljeNiveau.textContent = 'Niveau: ' + (niv ? niv.niveau : '0') + ' (gennemsnit af point fra opgaver)';
    kompetenceDetaljeListe.innerHTML = opgaverMedPoint.length === 0
      ? '<li>Ingen opgaver har endnu givet point til denne kompetence.</li>'
      : opgaverMedPoint.map(function (item) {
          const beskr = item.beskrivelse ? '<span class="opgave-beskrivelse">' + escapeHtml(item.beskrivelse) + '</span>' : '';
          return '<li>' + escapeHtml(item.navn) + ' <span class="opgave-point">' + item.point + ' pt</span>' + beskr + '</li>';
        }).join('');
    kompetenceDetalje.hidden = false;
    valgtKompetenceId = kompetenceId;
  }

  function skjulKompetenceDetalje() {
    kompetenceDetalje.hidden = true;
    valgtKompetenceId = null;
  }

  /** Opdaterer forklaringspanelet hvis det er åbent (efter ændring af point). */
  function opdaterForklaringHvisSynlig() {
    if (!kompetenceDetalje.hidden && valgtKompetenceId != null) {
      visKompetenceDetalje(valgtKompetenceId);
    }
  }

  function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const logicalX = ((e.clientX - rect.left) / rect.width) * (canvas.width / dpr);
    const logicalY = ((e.clientY - rect.top) / rect.height) * (canvas.height / dpr);
    const index = hitTestKompetence(logicalX, logicalY);
    if (index === null) return;
    const niveauer = getNiveauPerKompetence();
    const kompetenceId = niveauer[index].id;
    visKompetenceDetalje(kompetenceId);
  }

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (graphCtx) {
      graphCtx.setTransform(1, 0, 0, 1, 0, 0);
      graphCtx.scale(dpr, dpr);
    }
    tegnGraph();
  }

  // --- Resizable sidebar (træk for at give mere plads til menu eller diagram) ---
  const SIDEBAR_STORAGE_KEY = 'vevo-sidebar-width';
  const SIDEBAR_MIN = 240;
  const SIDEBAR_MAX = 900;

  function setupResizeHandle() {
    const mainEl = document.getElementById('main-layout');
    const leftPanel = document.getElementById('left-panel');
    const handle = document.getElementById('resize-handle');
    if (!mainEl || !leftPanel || !handle) return;

    var saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved) {
      var w = parseInt(saved, 10);
      if (!isNaN(w) && w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) {
        mainEl.style.setProperty('--sidebar-width', w + 'px');
      }
    }

    var dragging = false;
    function onMove(e) {
      if (!dragging) return;
      var mainRect = mainEl.getBoundingClientRect();
      var x = e.clientX - mainRect.left;
      var w = Math.round(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, x)));
      mainEl.style.setProperty('--sidebar-width', w + 'px');
      resizeCanvas();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      var w = leftPanel.getBoundingClientRect().width;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Math.round(w))); } catch (err) {}
    }
    handle.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // --- Demo data: Sprog faglighed ---
  function loadDemo() {
    kompetencer = [
      { id: 1, navn: 'Reception' },
      { id: 2, navn: 'Production' },
      { id: 3, navn: 'Interaction' },
      { id: 4, navn: 'Mediation' }
    ];
    nextKompetenceId = 5;

    opgaver = [
      { id: 1, navn: 'Læse og forstå autentisk artikel', beskrivelse: 'Læs en artikel og besvar forståelses- og analyseopgaver' },
      { id: 2, navn: 'Skrive argumenterende tekst', beskrivelse: 'Skriv en kort argumenterende tekst ud fra et givet perspektiv' },
      { id: 3, navn: 'Gruppedebat om et emne', beskrivelse: 'Deltag i en struktureret debat med forberedte argumenter' },
      { id: 4, navn: 'Oversætte og forklare uddrag', beskrivelse: 'Oversæt et uddrag og forklar valg og vinkler for modtageren' },
      { id: 5, navn: 'Lytte til podcast og lave noter', beskrivelse: 'Lyt til en podcast og udarbejd strukturerede noter' },
      { id: 6, navn: 'Fremlæggelse med præsentation', beskrivelse: 'Hold en kort fremlæggelse med visuel understøttelse' },
      { id: 7, navn: 'Sammenligne to tekster', beskrivelse: 'Læs to tekster og skriv en sammenlignende analyse' },
      { id: 8, navn: 'Rollespil: samtale i butik', beskrivelse: 'Før en situationel samtale (fx køb/returnering) med makker' },
      { id: 9, navn: 'Sammenfatning af lydkilde', beskrivelse: 'Lyt til en lydkilde og skriv en præcis sammenfatning' }
    ];
    nextOpgaveId = 10;

    point = {
      1: { 1: 8, 2: 2, 3: 1, 4: 5 },
      2: { 1: 4, 2: 9, 3: 2, 4: 3 },
      3: { 1: 5, 2: 5, 3: 9, 4: 4 },
      4: { 1: 6, 2: 4, 3: 2, 4: 9 },
      5: { 1: 8, 2: 6, 3: 1, 4: 3 },
      6: { 1: 3, 2: 8, 3: 7, 4: 5 },
      7: { 1: 7, 2: 4, 3: 2, 4: 8 },
      8: { 1: 4, 2: 5, 3: 9, 4: 3 },
      9: { 1: 7, 2: 7, 3: 2, 4: 6 }
    };
  }

  // --- Init ---
  function init() {
    var hashPayload = readPayloadFromHash() || (window.VEVO_ELEV_DATA || null);
    if (hashPayload) {
      initElevFullPage(hashPayload);
      return;
    }
    if (!loadFromStorage()) loadDemo();
    graphCtx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('click', onCanvasClick);
    kompetenceDetalje.querySelector('.kompetence-detalje-luk').addEventListener('click', skjulKompetenceDetalje);

    setupResizeHandle();

    renderListeOpgaver();
    renderListeKompetencer();
    opdaterSelects();
    tegnGraph();

    var btnExportOpen = document.getElementById('btn-export-open');
    var exportModal = document.getElementById('export-modal');
    var exportModalLuk = document.getElementById('export-modal-luk');
    var exportLinkInput = document.getElementById('export-link');
    var btnCopyLink = document.getElementById('btn-copy-link');
    var btnDownloadHtml = document.getElementById('btn-download-html');

    function updateExportTilNavn() {
      var navnEl = document.getElementById('export-elev-navn');
      var tilNavnEl = document.getElementById('export-til-navn');
      if (!tilNavnEl) return;
      var navn = (navnEl && navnEl.value) ? navnEl.value.trim() : '';
      if (navn) {
        tilNavnEl.textContent = 'Eksporterer til: ' + navn;
        tilNavnEl.hidden = false;
      } else {
        tilNavnEl.textContent = '';
        tilNavnEl.hidden = true;
      }
    }
    function openExportModal() {
      if (exportModal) {
        if (exportLinkInput) exportLinkInput.value = getShareableUrl();
        updateExportTilNavn();
        exportModal.hidden = false;
        document.body.style.overflow = 'hidden';
      }
    }
    function closeExportModal() {
      if (exportModal) {
        exportModal.hidden = true;
        document.body.style.overflow = '';
      }
    }

    if (btnExportOpen) btnExportOpen.addEventListener('click', openExportModal);
    var exportElevNavn = document.getElementById('export-elev-navn');
    if (exportElevNavn) {
      if (exportLinkInput) exportElevNavn.addEventListener('input', function () { exportLinkInput.value = getShareableUrl(); });
      exportElevNavn.addEventListener('input', updateExportTilNavn);
    }
    if (exportModalLuk) exportModalLuk.addEventListener('click', closeExportModal);
    if (exportModal) {
      exportModal.addEventListener('click', function (e) {
        if (e.target === exportModal) closeExportModal();
      });
    }
    if (exportLinkInput && btnCopyLink) {
      btnCopyLink.addEventListener('click', function () {
        exportLinkInput.value = getShareableUrl();
        exportLinkInput.select();
        try {
          document.execCommand('copy');
          btnCopyLink.textContent = 'Kopieret!';
          setTimeout(function () { btnCopyLink.textContent = 'Kopier'; }, 2000);
        } catch (e) {
          exportLinkInput.select();
        }
      });
    }
    if (btnDownloadHtml) {
      btnDownloadHtml.addEventListener('click', function () {
        var html = generateStandaloneHtml(false);
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Kompetenceoverblik-elev.html';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }
    var btnDownloadPdf = document.getElementById('btn-download-pdf');
    if (btnDownloadPdf) {
      btnDownloadPdf.addEventListener('click', function () {
        var html = generateStandaloneHtml(true);
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var win = window.open(url, '_blank');
        if (win) setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      });
    }
    var btnSeSomElev = document.getElementById('btn-se-som-elev');
    if (btnSeSomElev) {
      btnSeSomElev.addEventListener('click', function () {
        closeExportModal();
        showElevView(getExportPayload());
      });
    }

    var elevModal = document.getElementById('elev-view-modal');
    var elevModalLuk = document.getElementById('elev-modal-luk');
    if (elevModalLuk) elevModalLuk.addEventListener('click', closeElevModal);
    if (elevModal) {
      elevModal.addEventListener('click', function (e) {
        if (e.target === elevModal) closeElevModal();
      });
    }
  }

  init();
})();
