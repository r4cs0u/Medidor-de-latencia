(function () {
  if (window._lpStop) window._lpStop();
  document.querySelectorAll('[id^="lp-"]').forEach(e => e.remove());

  // ── Configuração dos 8 canais ─────────────────────────────
  const CHANNELS = [
    { id:'ch0', label:'LGK TIT BH 1', color:'#00d4ff', active:true  },
    { id:'ch1', label:'RX BHE VMX',   color:'#ff4444', active:true  },
    { id:'ch2', label:'Canal 3',       color:'#44ff88', active:false },
    { id:'ch3', label:'Canal 4',       color:'#ffd700', active:false },
    { id:'ch4', label:'Canal 5',       color:'#ff88ff', active:false },
    { id:'ch5', label:'Canal 6',       color:'#ff9944', active:false },
    { id:'ch6', label:'Canal 7',       color:'#aaffff', active:false },
    { id:'ch7', label:'Canal 8',       color:'#cc88ff', active:false },
  ];

  const INTERVAL_MS   = 200;
  const THRESHOLD     = 18;
  const MATCH_WINDOW  = 5000;
  const MAX_PAIRS     = 20;
  const ASPECT        = 9/16; // altura = largura * 9/16

  let running   = true;
  let capturing = false;
  let probeW    = 64; // largura base; altura = probeW * 9/16

  window._lpStop = () => { running = false; };

  // ── Canvas offscreen por canal ───────────────────────────
  function makeOff(ch) {
    ch.off = document.createElement('canvas');
    ch.off.width  = probeW;
    ch.off.height = Math.round(probeW * ASPECT);
    ch.ctx = ch.off.getContext('2d', {willReadFrequently:true});
  }
  CHANNELS.forEach(ch => { makeOff(ch); ch.prevLum=null; ch.events=[]; ch.lagPairs=[]; });

  // ── Probe arrastável 16:9 ────────────────────────────────
  const vw = window.innerWidth, vh = window.innerHeight;
  const startPositions = [
    [Math.round(vw*.38), Math.round(vh*.55)],
    [Math.round(vw*.85), Math.round(vh*.65)],
    [Math.round(vw*.25), Math.round(vh*.35)],
    [Math.round(vw*.50), Math.round(vh*.35)],
    [Math.round(vw*.65), Math.round(vh*.35)],
    [Math.round(vw*.38), Math.round(vh*.75)],
    [Math.round(vw*.55), Math.round(vh*.75)],
    [Math.round(vw*.72), Math.round(vh*.75)],
  ];

  function mkProbe(ch, x, y) {
    const d = document.createElement('div');
    d.id = 'lp-probe-'+ch.id;
    function resize() {
      const h = Math.round(probeW * ASPECT);
      d.style.width  = probeW + 'px';
      d.style.height = h + 'px';
    }
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;
      border:3px solid ${ch.color};background:${ch.color}15;
      box-shadow:0 0 8px ${ch.color};cursor:move;
      z-index:99997;box-sizing:border-box;pointer-events:auto;
      transition:opacity .2s;`;
    resize();
    // Mira
    const hLine = document.createElement('div');
    hLine.style.cssText=`position:absolute;top:50%;left:0;right:0;height:1px;background:${ch.color};opacity:.7;pointer-events:none`;
    const vLine = document.createElement('div');
    vLine.style.cssText=`position:absolute;left:50%;top:0;bottom:0;width:1px;background:${ch.color};opacity:.7;pointer-events:none`;
    const lbl = document.createElement('span');
    lbl.style.cssText=`position:absolute;top:-16px;left:0;font:bold 9px monospace;color:${ch.color};text-shadow:0 0 3px #000;white-space:nowrap;pointer-events:none`;
    lbl.textContent = ch.label;
    d.append(hLine, vLine, lbl);
    document.body.appendChild(d);
    ch.probe = d;
    ch.probeLabel = lbl;
    ch.resize = () => { resize(); makeOff(ch); };
    // Estado de visibilidade
    d.style.display = ch.active ? 'block' : 'none';
    // Drag
    let drag=false,ox=0,oy=0;
    d.addEventListener('mousedown',e=>{drag=true;ox=e.clientX-d.offsetLeft;oy=e.clientY-d.offsetTop;e.preventDefault();e.stopPropagation();});
    window.addEventListener('mousemove',e=>{if(!drag)return;d.style.left=Math.max(0,e.clientX-ox)+'px';d.style.top=Math.max(0,e.clientY-oy)+'px';});
    window.addEventListener('mouseup',()=>drag=false);
  }
  CHANNELS.forEach((ch,i) => mkProbe(ch, startPositions[i][0], startPositions[i][1]));

  // ── Luminância ────────────────────────────────────────────
  function getLum(ch) {
    const d = ch.probe;
    const w = probeW, h = Math.round(probeW * ASPECT);
    const cx = d.offsetLeft + w/2;
    const cy = d.offsetTop  + h/2;
    d.style.pointerEvents='none';
    const el = document.elementFromPoint(cx, cy);
    d.style.pointerEvents='auto';
    if(!el) return null;
    let m=null, node=el;
    for(let i=0;i<6;i++){
      if(!node) break;
      if(['VIDEO','CANVAS','IMG'].includes(node.tagName)){m=node;break;}
      const c=node.querySelector('video,canvas,img'); if(c){m=c;break;}
      node=node.parentElement;
    }
    if(!m) return null;
    const r=m.getBoundingClientRect();
    if(!r.width||!r.height) return null;
    const nw=m.videoWidth||m.naturalWidth||r.width;
    const nh=m.videoHeight||m.naturalHeight||r.height;
    const sx=Math.floor((cx-r.left)*(nw/r.width)-w/2);
    const sy=Math.floor((cy-r.top)*(nh/r.height)-h/2);
    ch.ctx.clearRect(0,0,w,h);
    try{ch.ctx.drawImage(m,sx,sy,w,h,0,0,w,h);}catch(e){return -1;}
    let px;
    try{px=ch.ctx.getImageData(0,0,w,h).data;}catch(e){return -1;}
    let Y=0,n=0;
    for(let i=0;i<px.length;i+=4){Y+=.2126*px[i]+.7152*px[i+1]+.0722*px[i+2];n++;}
    return n?Y/n:null;
  }

  function fmt(ts){
    const d=new Date(ts);
    return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+
           d.getSeconds().toString().padStart(2,'0')+'.'+d.getMilliseconds().toString().padStart(3,'0');
  }

  function tryPair(chA, chB) {
    for(const ea of chA.events){
      if(ea.paired) continue;
      for(const eb of chB.events){
        if(eb.paired) continue;
        if(Math.abs(ea.ts-eb.ts)<=MATCH_WINDOW){
          ea.paired=true; eb.paired=true;
          chA.lagPairs.push({lag: ea.ts - eb.ts});
          if(chA.lagPairs.length>MAX_PAIRS) chA.lagPairs.shift();
          break;
        }
      }
    }
    const cut=Date.now()-10000;
    [chA.events, chB.events].forEach(arr=>{
      const f=arr.filter(e=>e.ts>cut||e.paired);
      arr.length=0; arr.push(...f);
    });
  }

  function medianLag(pairs){
    if(!pairs.length) return null;
    const v=[...pairs.map(p=>p.lag)].sort((a,b)=>a-b);
    return v[Math.floor(v.length/2)];
  }

  // ── PAINEL ────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id='lp-panel';
  panel.style.cssText=`
    position:fixed;top:10px;right:10px;z-index:99999;
    background:#0e0e1aee;border:1px solid #222;
    border-radius:8px;padding:8px 12px;
    box-shadow:0 4px 16px #000c;font-family:monospace;
    font-size:11px;color:#ccc;width:300px;user-select:none;
  `;

  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;cursor:move';
  const ttl=document.createElement('span'); ttl.textContent='⬤ LUM / LATÊNCIA  ×8'; ttl.style.cssText='color:#e94560;font-weight:bold;font-size:10px';
  const btnX=document.createElement('button'); btnX.textContent='✕';
  btnX.style.cssText='background:#e94560;border:none;color:#fff;border-radius:4px;padding:0 6px;cursor:pointer;font-size:11px';
  btnX.onclick=()=>{running=false;document.querySelectorAll('[id^="lp-"]').forEach(e=>e.remove());};
  hdr.append(ttl,btnX); panel.appendChild(hdr);

  let pdrag=false,pox=0,poy=0;
  hdr.addEventListener('mousedown',e=>{pdrag=true;pox=e.clientX-panel.offsetLeft;poy=e.clientY-panel.offsetTop;});
  window.addEventListener('mousemove',e=>{if(!pdrag)return;panel.style.right='auto';panel.style.left=Math.max(0,e.clientX-pox)+'px';panel.style.top=Math.max(0,e.clientY-poy)+'px';});
  window.addEventListener('mouseup',()=>pdrag=false);

  // ── Controles: Tamanho + Iniciar ────────────────────────
  const ctrlRow=document.createElement('div');
  ctrlRow.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:7px;border-bottom:1px solid #1e1e30';

  const szLabel=document.createElement('span'); szLabel.textContent='Probe W:'; szLabel.style.cssText='font-size:9px;color:#888;white-space:nowrap';

  function mkBtn(txt,bg,cb){
    const b=document.createElement('button'); b.textContent=txt;
    b.style.cssText=`background:${bg};border:none;color:#fff;border-radius:4px;padding:1px 7px;cursor:pointer;font-size:12px;font-family:monospace`;
    b.onclick=cb; return b;
  }

  const szVal=document.createElement('span'); szVal.style.cssText='font-size:11px;color:#fff;min-width:32px;text-align:center;font-weight:bold'; szVal.textContent=probeW+'px';

  const btnMinus=mkBtn('−','#1e3a5f',()=>{
    probeW=Math.max(16,probeW-8); szVal.textContent=probeW+'px';
    CHANNELS.forEach(ch=>ch.active&&ch.resize&&ch.resize());
  });
  const btnPlus=mkBtn('+','#1e3a5f',()=>{
    probeW=Math.min(200,probeW+8); szVal.textContent=probeW+'px';
    CHANNELS.forEach(ch=>ch.active&&ch.resize&&ch.resize());
  });

  const btnCapture=document.createElement('button');
  btnCapture.style.cssText='margin-left:auto;background:#1a7a1a;border:none;color:#fff;border-radius:5px;padding:3px 10px;cursor:pointer;font-size:10px;font-family:monospace;font-weight:bold;box-shadow:0 0 6px #1a7a1a88';
  btnCapture.textContent='▶ INICIAR';
  btnCapture.onclick=()=>{
    capturing=!capturing;
    if(capturing){
      CHANNELS.forEach(ch=>{ch.prevLum=null;ch.events=[];ch.lagPairs=[];});
      document.querySelectorAll('.lp-lum,.lp-cut,.lp-lag').forEach(e=>e.textContent='--');
      eS.textContent='Capturando...';
      btnCapture.textContent='⏸ PAUSAR'; btnCapture.style.background='#7a4a00'; btnCapture.style.boxShadow='0 0 6px #7a4a0088';
    } else {
      btnCapture.textContent='▶ INICIAR'; btnCapture.style.background='#1a7a1a'; btnCapture.style.boxShadow='0 0 6px #1a7a1a88';
      eS.textContent='Pausado';
    }
  };

  ctrlRow.append(szLabel,btnMinus,szVal,btnPlus,btnCapture);
  panel.appendChild(ctrlRow);

  // ── Grid de canais ───────────────────────────────────────
  const grid=document.createElement('div');
  grid.style.cssText='display:flex;flex-direction:column;gap:4px;margin-bottom:8px';

  CHANNELS.forEach((ch,i) => {
    const row=document.createElement('div');
    row.id='lp-row-'+ch.id;
    row.style.cssText=`display:flex;align-items:center;gap:5px;padding:3px 4px;border-radius:5px;
      border:1px solid ${ch.active?ch.color+'55':'#1e1e30'};background:${ch.active?ch.color+'0a':'transparent'};
      transition:all .2s;opacity:${ch.active?1:.45}`;

    // Toggle ativo/inativo
    const tog=document.createElement('button');
    tog.style.cssText=`width:14px;height:14px;border-radius:50%;border:2px solid ${ch.color};
      background:${ch.active?ch.color:'transparent'};cursor:pointer;flex-shrink:0;padding:0`;
    tog.title='Ativar/desativar';
    tog.onclick=()=>{
      ch.active=!ch.active;
      tog.style.background=ch.active?ch.color:'transparent';
      row.style.border=`1px solid ${ch.active?ch.color+'55':'#1e1e30'}`;
      row.style.background=ch.active?ch.color+'0a':'transparent';
      row.style.opacity=ch.active?1:.45;
      ch.probe.style.display=ch.active?'block':'none';
      if(!ch.active){ch.prevLum=null;}
    };

    // Label editável
    const lbl=document.createElement('input');
    lbl.value=ch.label;
    lbl.style.cssText=`background:transparent;border:none;color:${ch.color};font:bold 10px monospace;
      width:95px;outline:none;cursor:text;`;
    lbl.addEventListener('change',()=>{
      ch.label=lbl.value;
      if(ch.probeLabel) ch.probeLabel.textContent=lbl.value;
    });

    // Luminância atual
    const lumEl=document.createElement('span');
    lumEl.className='lp-lum';
    lumEl.style.cssText=`color:${ch.color};font-size:13px;font-weight:bold;min-width:28px;text-align:right`;
    lumEl.textContent='--';
    ch.lumEl=lumEl;

    // Último corte
    const cutEl=document.createElement('span');
    cutEl.className='lp-cut';
    cutEl.style.cssText='color:#888;font-size:8px;margin-left:2px;white-space:nowrap;overflow:hidden;max-width:70px';
    cutEl.textContent='--';
    ch.cutEl=cutEl;

    row.append(tog, lbl, lumEl, cutEl);
    grid.appendChild(row);
    ch.rowEl=row; ch.togEl=tog;
  });
  panel.appendChild(grid);

  // ── Seção de comparação A vs B ───────────────────────────
  const sep=document.createElement('div'); sep.style.cssText='border-top:1px solid #2a2a3a;margin:4px 0 6px'; panel.appendChild(sep);

  const cmpTitle=document.createElement('div');
  cmpTitle.style.cssText='font-size:9px;color:#888;margin-bottom:5px';
  cmpTitle.textContent='COMPARAÇÃO (canais ativos — primeiro vs segundo)';
  panel.appendChild(cmpTitle);

  const lagRow=document.createElement('div');
  lagRow.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:4px 0';
  const lagLabel=document.createElement('span'); lagLabel.style.cssText='font-size:10px;color:#ffd700'; lagLabel.textContent='LATÊNCIA MEDIANA';
  const lagVal=document.createElement('span'); lagVal.id='lp-lag'; lagVal.className='lp-lag';
  lagVal.style.cssText='font-size:16px;font-weight:bold;color:#ffd700'; lagVal.textContent='--';
  lagRow.append(lagLabel,lagVal); panel.appendChild(lagRow);

  const pairsEl=document.createElement('div');
  pairsEl.style.cssText='font-size:9px;color:#555;text-align:right'; pairsEl.id='lp-pairs'; pairsEl.textContent='pares: 0';
  panel.appendChild(pairsEl);

  const eS=document.createElement('div'); eS.id='lp-st';
  eS.style.cssText='font-size:9px;color:#888;margin-top:5px;text-align:center;font-style:italic';
  eS.textContent='Posicione os quadrados e clique ▶ INICIAR';
  panel.appendChild(eS);

  document.body.appendChild(panel);

  // ── Loop ─────────────────────────────────────────────────
  let lastTick=0;
  const lagValEl=document.getElementById('lp-lag');
  const pairsValEl=document.getElementById('lp-pairs');

  function tick(){
    if(!running) return;
    const now=performance.now();

    if(capturing && now-lastTick>=INTERVAL_MS){
      lastTick=now;
      const ts=Date.now();

      const active=CHANNELS.filter(ch=>ch.active);

      active.forEach(ch=>{
        const y=getLum(ch);
        const v=(y!==null&&y!==-1)?Math.round(y):null;
        ch.lumEl.textContent=v!==null?v:(y===-1?'🔒':'--');

        if(v!==null&&ch.prevLum!==null&&Math.abs(v-ch.prevLum)>=THRESHOLD){
          const delta=Math.abs(v-ch.prevLum);
          ch.events.push({ts,lum:v,delta,paired:false});
          ch.cutEl.textContent=fmt(ts).slice(6)+' Δ'+delta; // só HH:MM:SS.ms
          ch.probe.style.boxShadow=`0 0 20px ${ch.color},0 0 40px ${ch.color}`;
          setTimeout(()=>ch.probe.style.boxShadow=`0 0 8px ${ch.color}`,300);
          // Pareia com todos os outros ativos
          active.forEach(other=>{ if(other!==ch) tryPair(ch,other); });
        }
        if(v!==null) ch.prevLum=v;
      });

      // Latência mediana entre os dois primeiros ativos
      if(active.length>=2){
        const chA=active[0], chB=active[1];
        const mLag=medianLag(chA.lagPairs);
        pairsValEl.textContent=`pares: ${chA.lagPairs.length}/${MAX_PAIRS} | ${chA.label} vs ${chB.label}`;
        if(mLag!==null){
          lagValEl.textContent=(mLag>0?'+':'')+mLag+'ms';
          lagValEl.style.color=Math.abs(mLag)<200?'#44ff88':Math.abs(mLag)<2000?'#ffd700':'#ff4444';
          eS.textContent=mLag>0?`${chA.label} atrasa ${Math.abs(mLag)}ms`
                        :mLag<0?`${chB.label} atrasa ${Math.abs(mLag)}ms`:'✓ Sincronizados';
        } else {
          const evA=chA.events.length, evB=chB.events.length;
          eS.textContent=`A:${evA} ev | B:${evB} ev | aguardando par...`;
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
