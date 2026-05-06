import { useState, useEffect, useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  password: string;
  role: 'admin' | 'employe';
  actif: boolean;
}
interface Chantier {
  id: string;
  nom: string;
  ville: string;
  adresse: string;
  reference: string;
  statut: 'actif' | 'termine' | 'archive';
}
interface Pointage {
  id: string;
  userId: string;
  chantierId: string;
  date: string;
  debut: string;
  pauseDebut: string;
  pauseFin: string;
  fin: string;
  heures: number;
  remarque: string;
  createdAt?: number;
  updatedAt?: number;
}
interface PForm {
  date: string;
  chantierId: string;
  debut: string;
  pauseDebut: string;
  pauseFin: string;
  fin: string;
  remarque: string;
}

// ── Storage ──────────────────────────────────────────────────────────────────
const K = { u: 'pc_u', c: 'pc_c', p: 'pc_p', s: 'pc_s' } as const;
function ld<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null') as T;
  } catch {
    return null;
  }
}
const sv = (k: string, v: unknown) =>
  localStorage.setItem(k, JSON.stringify(v));
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Utils ─────────────────────────────────────────────────────────────────────
const toM = (t: string) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const calcH = (d: string, pb: string, pf: string, f: string) =>
  Math.max(0, (toM(f) - toM(d) - (pb && pf ? toM(pf) - toM(pb) : 0)) / 60);
const fmtH = (h: number) => {
  const r = Math.floor(h);
  const m = Math.round((h - r) * 60);
  return m ? `${r}h${String(m).padStart(2, '0')}` : `${r}h`;
};
const fmtD = (d: string) =>
  d
    ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
const wkN = (d: string) => {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const j = new Date(dt.getFullYear(), 0, 4);
  return Math.ceil(
    ((dt.getTime() - j.getTime()) / 86400000 + j.getDay() + 1) / 7
  );
};
const tW = () => {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  const mon = d.toISOString().split('T')[0];
  d.setDate(d.getDate() + 6);
  return { mon, sun: d.toISOString().split('T')[0] };
};
const doCSV = (rows: string[][], name: string) => {
  const c = rows
    .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob(['\uFEFF' + c], { type: 'text/csv;charset=utf-8;' })
  );
  a.download = name;
  a.click();
};

// ── Seed ──────────────────────────────────────────────────────────────────────
const seed = () => {
  if (!ld(K.u))
    sv(K.u, [
      {
        id: 'admin',
        nom: 'Administrateur',
        prenom: '',
        email: 'admin@chantier.fr',
        password: 'admin123',
        role: 'admin',
        actif: true,
      },
      {
        id: 'e1',
        nom: 'Martin',
        prenom: 'Lucas',
        email: 'lucas@chantier.fr',
        password: 'lucas123',
        role: 'employe',
        actif: true,
      },
      {
        id: 'e2',
        nom: 'Dubois',
        prenom: 'Marie',
        email: 'marie@chantier.fr',
        password: 'marie123',
        role: 'employe',
        actif: true,
      },
    ] as User[]);
  if (!ld(K.c))
    sv(K.c, [
      {
        id: 'c1',
        nom: 'Résidence Les Pins',
        ville: 'Istres',
        adresse: '12 rue des Pins, 13800',
        reference: '1418',
        statut: 'actif',
      },
      {
        id: 'c2',
        nom: 'Bâtiment Industriel',
        ville: 'Marseille',
        adresse: 'Zone Industrielle Nord',
        reference: '1502',
        statut: 'actif',
      },
      {
        id: 'c3',
        nom: 'Villa Méditerranée',
        ville: 'Martigues',
        adresse: '15 avenue du Port',
        reference: '1389',
        statut: 'termine',
      },
    ] as Chantier[]);
  if (!ld(K.p))
    sv(K.p, [
      {
        id: 'p1',
        userId: 'e1',
        chantierId: 'c1',
        date: '2026-04-28',
        debut: '08:00',
        pauseDebut: '12:00',
        pauseFin: '13:00',
        fin: '17:00',
        remarque: 'Pose carrelage terrasse',
        heures: 8,
        createdAt: Date.now() - 86400000 * 3,
      },
      {
        id: 'p2',
        userId: 'e1',
        chantierId: 'c2',
        date: '2026-04-29',
        debut: '07:30',
        pauseDebut: '12:00',
        pauseFin: '13:00',
        fin: '17:30',
        remarque: '',
        heures: 9,
        createdAt: Date.now() - 86400000 * 2,
      },
      {
        id: 'p3',
        userId: 'e2',
        chantierId: 'c1',
        date: '2026-04-28',
        debut: '08:00',
        pauseDebut: '12:30',
        pauseFin: '13:30',
        fin: '17:00',
        remarque: 'Maçonnerie mur nord',
        heures: 8,
        createdAt: Date.now() - 86400000 * 3,
      },
    ] as Pointage[]);
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Syne:wght@700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#0f1117;--card:#181c27;--c2:#1f2435;--bd:#2a3048;
  --a:#4f9cf9;--ab:rgba(79,156,249,0.15);--a2:#6aadff;
  --tx:#e8eaf0;--t2:#8892aa;
  --gn:#3dd68c;--gb:rgba(61,214,140,0.12);
  --rd:#f44771;--rb:rgba(244,71,113,0.12);
  --bl:#4f9cf9;--bb:rgba(79,156,249,0.12);
  --nv:#0d1018;--r:12px;
}
body{background:var(--bg);color:var(--tx);font-family:'Outfit',sans-serif;min-height:100vh;}
.layout{display:flex;min-height:100vh;}

/* SIDEBAR */
.sb{width:215px;background:var(--nv);display:flex;flex-direction:column;padding:1.25rem .75rem;flex-shrink:0;position:sticky;top:0;height:100vh;border-right:1px solid var(--bd);}
.sb-logo{display:flex;align-items:center;gap:.6rem;padding:0 .4rem;margin-bottom:1.75rem;}
.sb-icon{width:34px;height:34px;background:var(--a);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.05rem;flex-shrink:0;}
.sb-brand{font-family:'Syne',sans-serif;font-size:.9rem;font-weight:800;color:#fff;line-height:1.2;}
.sb-brand small{display:block;font-size:.58rem;color:rgba(255,255,255,.35);font-family:'Outfit',sans-serif;font-weight:400;}
.sb-lbl{font-size:.58rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);padding:0 .55rem;margin-bottom:.4rem;}
.sb-item{display:flex;align-items:center;gap:.6rem;padding:.58rem .7rem;border-radius:8px;cursor:pointer;font-size:.82rem;color:rgba(255,255,255,.45);border:none;background:none;width:100%;text-align:left;transition:all .15s;margin-bottom:2px;}
.sb-item:hover{background:rgba(255,255,255,.06);color:#fff;}
.sb-item.on{background:rgba(79,156,249,0.18);color:var(--a);font-weight:600;}
.sb-foot{margin-top:auto;border-top:1px solid rgba(255,255,255,.08);padding-top:.85rem;display:flex;align-items:center;gap:.6rem;}
.sb-av{width:32px;height:32px;border-radius:50%;background:var(--a);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;color:#fff;flex-shrink:0;}
.sb-ui{flex:1;min-width:0;}
.sb-ui strong{font-size:.76rem;color:#fff;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sb-ui span{font-size:.6rem;color:rgba(255,255,255,.3);}
.sb-out{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.3);font-size:1rem;padding:4px;border-radius:6px;line-height:1;transition:color .15s;}
.sb-out:hover{color:var(--rd);}

/* MAIN */
.main{flex:1;padding:1.75rem;overflow-y:auto;min-width:0;background:var(--bg);}
.pt{font-family:'Syne',sans-serif;font-size:1.35rem;font-weight:800;margin-bottom:.25rem;}
.ps{color:var(--t2);font-size:.82rem;margin-bottom:1.25rem;}
.rb{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;}
.row{display:flex;align-items:center;gap:7px;}
.mt{margin-top:10px;}
.dsh{font-family:'Syne',sans-serif;font-size:.9rem;font-weight:700;margin-bottom:.85rem;}
.smb{margin-bottom:1.25rem;}

/* CARDS */
.card{background:var(--card);border-radius:var(--r);box-shadow:0 2px 16px rgba(0,0,0,.4);border:1px solid var(--bd);}
.cp{padding:1.1rem;}
.sg{display:grid;gap:.85rem;margin-bottom:1.25rem;}
.sg3{grid-template-columns:repeat(3,1fr);}
.sg4{grid-template-columns:repeat(4,1fr);}
.sc{background:var(--card);border-radius:var(--r);padding:1rem;box-shadow:0 2px 12px rgba(0,0,0,.3);border:1px solid var(--bd);}
.sv{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;color:var(--a);}
.sk{font-size:.7rem;color:var(--t2);margin-top:3px;}

/* TABLE */
.tw{overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:.8rem;}
th{font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t2);padding:.55rem .9rem;text-align:left;border-bottom:1px solid var(--bd);white-space:nowrap;}
td{padding:.65rem .9rem;border-bottom:1px solid var(--bd);vertical-align:middle;}
tr:last-child td{border-bottom:none;}
tr:hover td{background:rgba(255,255,255,.025);}
.tds{font-size:.67rem;color:var(--t2);margin-top:2px;}

/* FORMS */
.field{margin-bottom:12px;}
.field label{display:block;font-size:.67rem;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;}
.field input,.field select,.field textarea{width:100%;background:var(--c2);border:1.5px solid var(--bd);border-radius:8px;color:var(--tx);font-family:'Outfit',sans-serif;font-size:.9rem;padding:9px 12px;outline:none;transition:border-color .15s;-webkit-appearance:none;appearance:none;}
.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--a);}
.field textarea{min-height:70px;resize:none;}
.field select option{background:var(--c2);color:var(--tx);}
.tg{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.dfg{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.85rem;}
.dfg2{display:grid;grid-template-columns:1fr 1fr;gap:.85rem;}
.dhp{background:var(--ab);border:1px solid rgba(79,156,249,.25);border-radius:9px;padding:.85rem 1rem;display:flex;align-items:center;gap:.75rem;margin:.75rem 0;}
.dhp-v{font-size:1.3rem;font-weight:800;color:var(--a);font-family:'Syne',sans-serif;}
.dhp-l{font-size:.7rem;color:var(--t2);}

/* CHANTIER SELECT */
.cho{padding:11px 13px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s;}
.cho:last-child{border-bottom:none;}
.cho.sel{background:var(--ab);}
.cho:hover{background:rgba(79,156,249,0.08);}
.ch-n{font-size:.88rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;}
.ch-i{font-size:.7rem;color:var(--t2);margin-top:2px;}
.ch-r{background:var(--bb);color:var(--bl);border-radius:20px;padding:2px 8px;font-size:.63rem;font-weight:700;margin-top:3px;display:inline-block;}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:none;border-radius:8px;font-family:'Outfit',sans-serif;font-weight:600;cursor:pointer;transition:all .15s;font-size:.8rem;padding:7px 14px;}
.bf{width:100%;padding:11px;}
.bp{background:var(--a);color:#fff;font-weight:700;}
.bp:hover{background:var(--a2);}
.bs{background:var(--c2);color:var(--tx);border:1.5px solid var(--bd);}
.bs:hover{border-color:var(--a);color:var(--a);}
.bdn{background:var(--rb);color:var(--rd);border:1px solid rgba(244,71,113,.25);}
.bsm{padding:4px 10px;font-size:.73rem;border-radius:6px;}
.bic{width:28px;height:28px;border-radius:6px;font-size:.78rem;padding:0;}
.be{background:var(--bb);color:var(--bl);}
.bd{background:var(--rb);color:var(--rd);}
.bg2{background:none;color:var(--t2);font-size:.76rem;border:none;cursor:pointer;padding:3px 8px;font-family:'Outfit',sans-serif;}

/* BADGES */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:.63rem;font-weight:700;}
.bg0{background:var(--gb);color:var(--gn);}
.bo{background:var(--ab);color:var(--a);}
.br0{background:var(--rb);color:var(--rd);}
.bb0{background:var(--bb);color:var(--bl);}
.bgr{background:rgba(136,146,170,0.15);color:var(--t2);}

/* MODAL */
.mo{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem;}
.mo-b{background:var(--card);border:1px solid var(--bd);border-radius:14px;width:100%;max-width:500px;padding:1.5rem;max-height:90vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.6);}
.mo-t{font-size:.95rem;font-weight:800;margin-bottom:1rem;}

/* MISC */
.al{padding:9px 12px;border-radius:8px;font-size:.8rem;margin-bottom:10px;}
.al-err{background:var(--rb);color:var(--rd);border:1px solid rgba(244,71,113,.3);}
.emp{text-align:center;padding:2.5rem 1rem;color:var(--t2);}
.emp-i{font-size:2rem;margin-bottom:8px;}
.emp p{font-size:.8rem;}
.wh{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;}
.wt{font-size:.66rem;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;}
.wp{background:var(--ab);color:var(--a);border-radius:20px;padding:2px 9px;font-size:.66rem;font-weight:700;}

/* LOGIN */
.lw{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 30% 20%,#0d1a2a 0%,#0d1018 60%);padding:1rem;}
.lc{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:2.25rem;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.6);}
`;

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    const u = (ld<User[]>(K.u) || []).find(
      (u) => u.email === email && u.password === pw && u.actif
    );
    if (u) onLogin(u);
    else setErr('Email ou mot de passe incorrect');
  };
  return (
    <div className="lw">
      <div className="lc">
        <div className="row" style={{ marginBottom: '1.75rem' }}>
          <div
            style={{
              width: 42,
              height: 42,
              background: 'var(--a)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              flexShrink: 0,
            }}
          >
            🏗️
          </div>
          <div
            style={{
              fontFamily: "'Syne',sans-serif",
              fontSize: '1.1rem',
              fontWeight: 800,
            }}
          >
            PointageChantier
            <span
              style={{
                display: 'block',
                fontSize: '.62rem',
                color: 'var(--t2)',
                fontFamily: "'Outfit',sans-serif",
                fontWeight: 400,
              }}
            >
              Gestion des heures terrain
            </span>
          </div>
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 3 }}>
          Connexion
        </div>
        <div
          style={{
            fontSize: '.78rem',
            color: 'var(--t2)',
            marginBottom: '1.25rem',
          }}
        >
          Entrez vos identifiants pour accéder à votre espace
        </div>
        {err && <div className="al al-err">⚠️ {err}</div>}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre@email.fr"
          />
        </div>
        <div className="field">
          <label>Mot de passe</label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
        </div>
        <button className="btn bf bp mt" onClick={go}>
          Se connecter →
        </button>
        <p
          style={{
            textAlign: 'center',
            marginTop: 14,
            fontSize: '.62rem',
            color: 'var(--t2)',
          }}
        >
          admin@chantier.fr / admin123 · lucas@chantier.fr / lucas123
        </p>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({
  user,
  page,
  setPage,
  logout,
}: {
  user: User;
  page: string;
  setPage: (p: string) => void;
  logout: () => void;
}) {
  const isA = user.role === 'admin';
  const nav = isA
    ? [
        { id: 'dash', i: '📊', l: 'Dashboard' },
        { id: 'pts', i: '📋', l: 'Pointages' },
        { id: 'ch', i: '🏗️', l: 'Chantiers' },
        { id: 'emp', i: '👷', l: 'Employés' },
        { id: 'exp', i: '📤', l: 'Export CSV' },
      ]
    : [
        { id: 'home', i: '🏠', l: 'Tableau de bord' },
        { id: 'new', i: '➕', l: 'Nouveau pointage' },
        { id: 'hist', i: '📋', l: 'Mes pointages' },
      ];
  return (
    <div className="sb">
      <div className="sb-logo">
        <div className="sb-icon">🏗️</div>
        <div className="sb-brand">
          PointageChantier
          <small>{isA ? 'Administration' : 'Espace employé'}</small>
        </div>
      </div>
      <div className="sb-lbl">Navigation</div>
      {nav.map((x) => (
        <button
          key={x.id}
          className={`sb-item ${page === x.id ? 'on' : ''}`}
          onClick={() => setPage(x.id)}
        >
          <span>{x.i}</span>
          {x.l}
        </button>
      ))}
      <div className="sb-foot">
        <div className="sb-av">
          {(user.prenom?.[0] || user.nom?.[0] || '?').toUpperCase()}
        </div>
        <div className="sb-ui">
          <strong>
            {user.prenom} {user.nom}
          </strong>
          <span>{isA ? 'Administrateur' : 'Employé'}</span>
        </div>
        <button className="sb-out" title="Se déconnecter" onClick={logout}>
          🚪
        </button>
      </div>
    </div>
  );
}

// ── Pointage Form ─────────────────────────────────────────────────────────────
function PointageForm({
  user,
  editData,
  onDone,
}: {
  user: User;
  editData?: Pointage | null;
  onDone?: () => void;
}) {
  const chs = (ld<Chantier[]>(K.c) || []).filter((c) => c.statut === 'actif');
  const [form, setForm] = useState<PForm>(
    editData
      ? {
          date: editData.date,
          chantierId: editData.chantierId,
          debut: editData.debut,
          pauseDebut: editData.pauseDebut,
          pauseFin: editData.pauseFin,
          fin: editData.fin,
          remarque: editData.remarque,
        }
      : {
          date: new Date().toISOString().split('T')[0],
          chantierId: chs[0]?.id || '',
          debut: '08:00',
          pauseDebut: '12:00',
          pauseFin: '13:00',
          fin: '17:00',
          remarque: '',
        }
  );
  const [ok, setOk] = useState(false);
  const set = (k: keyof PForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const h = calcH(form.debut, form.pauseDebut, form.pauseFin, form.fin);

  const go = () => {
    if (!form.chantierId || !form.date || !form.debut || !form.fin) return;
    const all = ld<Pointage[]>(K.p) || [];
    if (editData) {
      const i = all.findIndex((p) => p.id === editData.id);
      if (i !== -1)
        all[i] = { ...editData, ...form, heures: h, updatedAt: Date.now() };
    } else
      all.push({
        id: uid(),
        userId: user.id,
        ...form,
        heures: h,
        createdAt: Date.now(),
      });
    sv(K.p, all);
    setOk(true);
    setTimeout(() => {
      setOk(false);
      onDone?.();
    }, 1300);
  };

  if (ok)
    return (
      <div style={{ textAlign: 'center', padding: '2.5rem' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 5 }}>
          Pointage enregistré !
        </div>
        <div style={{ color: 'var(--t2)', fontSize: '.82rem' }}>
          {fmtH(h)} enregistrées avec succès
        </div>
      </div>
    );

  return (
    <div>
      <div className="dfg2">
        <div>
          <div className="field">
            <label>🏗️ Chantier *</label>
            <div
              style={{
                background: 'var(--c2)',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1.5px solid var(--bd)',
              }}
            >
              {chs.map((c) => (
                <div
                  key={c.id}
                  className={`cho ${form.chantierId === c.id ? 'sel' : ''}`}
                  onClick={() => set('chantierId', c.id)}
                >
                  <div className="ch-n">
                    {c.nom}
                    {form.chantierId === c.id && (
                      <span style={{ color: 'var(--a)' }}>✓</span>
                    )}
                  </div>
                  <div className="ch-i">
                    📍 {c.ville} — {c.adresse}
                  </div>
                  <span className="ch-r">Réf. {c.reference}</span>
                </div>
              ))}
              {!chs.length && (
                <div
                  style={{
                    padding: '14px',
                    color: 'var(--t2)',
                    textAlign: 'center',
                    fontSize: '.82rem',
                  }}
                >
                  Aucun chantier actif
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="field">
            <label>📅 Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'block',
                fontSize: '.67rem',
                fontWeight: 700,
                color: 'var(--t2)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                marginBottom: 8,
              }}
            >
              ⏱️ Horaires
            </div>
            <div className="tg">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>🟢 Début</label>
                <input
                  type="time"
                  value={form.debut}
                  onChange={(e) => set('debut', e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>☕ Pause</label>
                <input
                  type="time"
                  value={form.pauseDebut}
                  onChange={(e) => set('pauseDebut', e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>🔄 Reprise</label>
                <input
                  type="time"
                  value={form.pauseFin}
                  onChange={(e) => set('pauseFin', e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>🔴 Fin</label>
                <input
                  type="time"
                  value={form.fin}
                  onChange={(e) => set('fin', e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="dhp">
            <span style={{ fontSize: '1.15rem' }}>⏱️</span>
            <div>
              <div className="dhp-v">{fmtH(h)}</div>
              <div className="dhp-l">heures calculées automatiquement</div>
            </div>
          </div>
          <div className="field">
            <label>💬 Remarque (facultatif)</label>
            <textarea
              value={form.remarque}
              onChange={(e) => set('remarque', e.target.value)}
              placeholder="Ex : pose carrelage, livraison matériaux..."
            />
          </div>
          <div className="row">
            <button className="btn bp" onClick={go}>
              ✅ {editData ? 'Modifier' : 'Enregistrer'}
            </button>
            {onDone && (
              <button className="btn bs" onClick={onDone}>
                Annuler
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Emp Home ──────────────────────────────────────────────────────────────────
function EmpHome({
  user,
  setPage,
}: {
  user: User;
  setPage: (p: string) => void;
}) {
  const pts = (ld<Pointage[]>(K.p) || []).filter((p) => p.userId === user.id);
  const chs = ld<Chantier[]>(K.c) || [];
  const { mon, sun } = tW();
  const hS = pts
    .filter((p) => p.date >= mon && p.date <= sun)
    .reduce((a, p) => a + p.heures, 0);
  const hT = pts.reduce((a, p) => a + p.heures, 0);
  const last = [...pts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  return (
    <div>
      <div className="rb" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="pt">Bonjour, {user.prenom} 👋</div>
          <div className="ps">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <button className="btn bp bsm" onClick={() => setPage('new')}>
          + Nouveau pointage
        </button>
      </div>
      <div className="sg sg3">
        <div className="sc">
          <div className="sv">{fmtH(hS)}</div>
          <div className="sk">Cette semaine</div>
        </div>
        <div className="sc">
          <div className="sv" style={{ color: 'var(--gn)' }}>
            {fmtH(hT)}
          </div>
          <div className="sk">Total général</div>
        </div>
        <div className="sc">
          <div className="sv" style={{ color: 'var(--bl)' }}>
            {pts.length}
          </div>
          <div className="sk">Pointages</div>
        </div>
      </div>
      <div className="rb" style={{ marginBottom: '.75rem' }}>
        <div className="dsh" style={{ marginBottom: 0 }}>
          Derniers pointages
        </div>
        <button className="bg2" onClick={() => setPage('hist')}>
          Voir tout →
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Chantier</th>
                <th>Début</th>
                <th>Pause</th>
                <th>Fin</th>
                <th>Heures</th>
                <th>Remarque</th>
              </tr>
            </thead>
            <tbody>
              {last.map((p) => {
                const ch = chs.find((c) => c.id === p.chantierId);
                return (
                  <tr key={p.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtD(p.date)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ch?.nom || '—'}</div>
                      <div className="tds">Réf. {ch?.reference}</div>
                    </td>
                    <td>{p.debut}</td>
                    <td style={{ color: 'var(--t2)' }}>
                      {p.pauseDebut}–{p.pauseFin}
                    </td>
                    <td>{p.fin}</td>
                    <td>
                      <span className="badge bo">{fmtH(p.heures)}</span>
                    </td>
                    <td
                      style={{
                        color: 'var(--t2)',
                        fontSize: '.72rem',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.remarque || '—'}
                    </td>
                  </tr>
                );
              })}
              {!last.length && (
                <tr>
                  <td colSpan={7}>
                    <div className="emp">
                      <div className="emp-i">📋</div>
                      <p>
                        Aucun pointage pour l'instant. Commencez par créer votre
                        premier pointage !
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Emp Historique ────────────────────────────────────────────────────────────
function EmpHist({ user }: { user: User }) {
  const [edit, setEdit] = useState<Pointage | null>(null);
  const [r, setR] = useState(0);
  const chs = ld<Chantier[]>(K.c) || [];
  const pts = useMemo(
    () =>
      [...(ld<Pointage[]>(K.p) || []).filter((p) => p.userId === user.id)].sort(
        (a, b) => b.date.localeCompare(a.date)
      ),
    [r]
  );
  const grp = useMemo(() => {
    const g: Record<string, Pointage[]> = {};
    pts.forEach((p) => {
      const w = `Semaine ${wkN(p.date)} — ${new Date(
        p.date + 'T00:00:00'
      ).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
      if (!g[w]) g[w] = [];
      g[w].push(p);
    });
    return g;
  }, [pts]);
  const del = (id: string) => {
    sv(
      K.p,
      (ld<Pointage[]>(K.p) || []).filter((p) => p.id !== id)
    );
    setR((r) => r + 1);
  };

  if (edit)
    return (
      <div>
        <div className="pt" style={{ marginBottom: '1rem' }}>
          Modifier le pointage
        </div>
        <div className="card cp">
          <PointageForm
            user={user}
            editData={edit}
            onDone={() => {
              setEdit(null);
              setR((r) => r + 1);
            }}
          />
        </div>
      </div>
    );

  return (
    <div>
      <div className="pt">Mes pointages</div>
      <div className="ps">
        {pts.length} pointage{pts.length > 1 ? 's' : ''} au total
      </div>
      {Object.entries(grp).map(([w, ps]) => (
        <div key={w} className="smb">
          <div className="wh">
            <span className="wt">{w}</span>
            <span className="wp">
              {fmtH(ps.reduce((a, p) => a + p.heures, 0))}
            </span>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Chantier</th>
                    <th>Début</th>
                    <th>Pause</th>
                    <th>Fin</th>
                    <th>Heures</th>
                    <th>Remarque</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ps.map((p) => {
                    const ch = chs.find((c) => c.id === p.chantierId);
                    return (
                      <tr key={p.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtD(p.date)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {ch?.nom || '—'}
                          </div>
                          <div className="tds">
                            {ch?.ville} · Réf. {ch?.reference}
                          </div>
                        </td>
                        <td>{p.debut}</td>
                        <td style={{ color: 'var(--t2)' }}>
                          {p.pauseDebut}–{p.pauseFin}
                        </td>
                        <td>{p.fin}</td>
                        <td>
                          <span className="badge bo">{fmtH(p.heures)}</span>
                        </td>
                        <td
                          style={{
                            color: 'var(--t2)',
                            fontSize: '.72rem',
                            maxWidth: 100,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.remarque || '—'}
                        </td>
                        <td>
                          <div className="row">
                            <button
                              className="btn bic be"
                              onClick={() => setEdit(p)}
                            >
                              ✏️
                            </button>
                            <button
                              className="btn bic bd"
                              onClick={() => del(p.id)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
      {!pts.length && (
        <div className="card cp">
          <div className="emp">
            <div className="emp-i">📋</div>
            <p>Aucun pointage enregistré</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function ADash() {
  const us = (ld<User[]>(K.u) || []).filter((u) => u.role === 'employe');
  const chs = ld<Chantier[]>(K.c) || [];
  const pts = ld<Pointage[]>(K.p) || [];
  const hT = pts.reduce((a, p) => a + p.heures, 0);
  const last = [...pts]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 8);
  return (
    <div>
      <div className="pt">Tableau de bord</div>
      <div className="ps">Vue globale de l'activité</div>
      <div className="sg sg4">
        <div className="sc">
          <div className="sv">{fmtH(hT)}</div>
          <div className="sk">Total heures</div>
        </div>
        <div className="sc">
          <div className="sv" style={{ color: 'var(--gn)' }}>
            {pts.length}
          </div>
          <div className="sk">Pointages</div>
        </div>
        <div className="sc">
          <div className="sv" style={{ color: 'var(--bl)' }}>
            {us.filter((u) => u.actif).length}
          </div>
          <div className="sk">Employés actifs</div>
        </div>
        <div className="sc">
          <div className="sv" style={{ color: 'var(--t2)' }}>
            {chs.filter((c) => c.statut === 'actif').length}
          </div>
          <div className="sk">Chantiers actifs</div>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '.85rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="card cp">
          <div className="dsh">👷 Heures par employé</div>
          {us.map((u) => {
            const h = pts
              .filter((p) => p.userId === u.id)
              .reduce((a, p) => a + p.heures, 0);
            return (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '.45rem 0',
                  borderBottom: '1px solid var(--bd)',
                }}
              >
                <div className="row">
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: 'var(--a)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '.68rem',
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {(u.prenom?.[0] || '?').toUpperCase()}
                  </div>
                  <span style={{ fontSize: '.8rem' }}>
                    {u.prenom} {u.nom}
                  </span>
                </div>
                <span className="badge bo">{fmtH(h)}</span>
              </div>
            );
          })}
          {!us.length && (
            <div className="emp">
              <p>Aucun employé</p>
            </div>
          )}
        </div>
        <div className="card cp">
          <div className="dsh">🏗️ Heures par chantier</div>
          {chs.map((c) => {
            const h = pts
              .filter((p) => p.chantierId === c.id)
              .reduce((a, p) => a + p.heures, 0);
            if (!h) return null;
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '.45rem 0',
                  borderBottom: '1px solid var(--bd)',
                }}
              >
                <div>
                  <div style={{ fontSize: '.8rem', fontWeight: 600 }}>
                    {c.nom}
                  </div>
                  <div className="tds">{c.ville}</div>
                </div>
                <span className="badge bb0">{fmtH(h)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="dsh">Derniers pointages reçus</div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Date</th>
                <th>Chantier</th>
                <th>Début</th>
                <th>Pause</th>
                <th>Fin</th>
                <th>Heures</th>
                <th>Remarque</th>
              </tr>
            </thead>
            <tbody>
              {last.map((p) => {
                const e = us.find((u) => u.id === p.userId);
                const ch = chs.find((c) => c.id === p.chantierId);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {e ? `${e.prenom} ${e.nom}` : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtD(p.date)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ch?.nom || '—'}</div>
                      <div className="tds">Réf. {ch?.reference}</div>
                    </td>
                    <td>{p.debut}</td>
                    <td style={{ color: 'var(--t2)' }}>
                      {p.pauseDebut}–{p.pauseFin}
                    </td>
                    <td>{p.fin}</td>
                    <td>
                      <span className="badge bo">{fmtH(p.heures)}</span>
                    </td>
                    <td
                      style={{
                        color: 'var(--t2)',
                        fontSize: '.72rem',
                        maxWidth: 110,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.remarque || '—'}
                    </td>
                  </tr>
                );
              })}
              {!last.length && (
                <tr>
                  <td colSpan={8}>
                    <div className="emp">
                      <p>Aucun pointage</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Admin Pointages ───────────────────────────────────────────────────────────
function APts() {
  const [r, setR] = useState(0);
  const [edit, setEdit] = useState<Pointage | null>(null);
  const [fe, setFe] = useState('');
  const [fc, setFc] = useState('');
  const [fd, setFd] = useState('');
  const us = ld<User[]>(K.u) || [];
  const chs = ld<Chantier[]>(K.c) || [];
  const all = useMemo(() => ld<Pointage[]>(K.p) || [], [r]);
  const fil = all
    .filter(
      (p) =>
        (!fe || p.userId === fe) &&
        (!fc || p.chantierId === fc) &&
        (!fd || p.date === fd)
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const del = (id: string) => {
    sv(
      K.p,
      all.filter((p) => p.id !== id)
    );
    setR((r) => r + 1);
  };

  if (edit)
    return (
      <div>
        <div className="pt" style={{ marginBottom: '1rem' }}>
          Modifier le pointage
        </div>
        <div className="card cp">
          <PointageForm
            user={{ id: edit.userId } as User}
            editData={edit}
            onDone={() => {
              setEdit(null);
              setR((r) => r + 1);
            }}
          />
        </div>
      </div>
    );

  return (
    <div>
      <div className="pt">Tous les pointages</div>
      <div className="ps">
        {fil.length} résultats · {fmtH(fil.reduce((a, p) => a + p.heures, 0))}
      </div>
      <div className="card cp" style={{ marginBottom: '1rem' }}>
        <div className="dfg">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Employé</label>
            <select value={fe} onChange={(e) => setFe(e.target.value)}>
              <option value="">Tous</option>
              {us
                .filter((u) => u.role === 'employe')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.prenom} {u.nom}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Chantier</label>
            <select value={fc} onChange={(e) => setFc(e.target.value)}>
              <option value="">Tous</option>
              {chs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Date</label>
            <input
              type="date"
              value={fd}
              onChange={(e) => setFd(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Date</th>
                <th>Chantier</th>
                <th>Début</th>
                <th>Pause</th>
                <th>Fin</th>
                <th>Heures</th>
                <th>Remarque</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fil.map((p) => {
                const e = us.find((u) => u.id === p.userId);
                const ch = chs.find((c) => c.id === p.chantierId);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {e ? `${e.prenom} ${e.nom}` : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtD(p.date)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ch?.nom || '—'}</div>
                      <div className="tds">Réf. {ch?.reference}</div>
                    </td>
                    <td>{p.debut}</td>
                    <td style={{ color: 'var(--t2)' }}>
                      {p.pauseDebut}–{p.pauseFin}
                    </td>
                    <td>{p.fin}</td>
                    <td>
                      <span className="badge bo">{fmtH(p.heures)}</span>
                    </td>
                    <td
                      style={{
                        color: 'var(--t2)',
                        fontSize: '.72rem',
                        maxWidth: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.remarque || '—'}
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="btn bic be"
                          onClick={() => setEdit(p)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn bic bd"
                          onClick={() => del(p.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!fil.length && (
                <tr>
                  <td colSpan={9}>
                    <div className="emp">
                      <div className="emp-i">🔍</div>
                      <p>Aucun pointage trouvé</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Admin Chantiers ───────────────────────────────────────────────────────────
function ACh() {
  const [chs, setChs] = useState<Chantier[]>(ld<Chantier[]>(K.c) || []);
  const [mo, setMo] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Chantier>>({});
  const sc = (list: Chantier[]) => {
    sv(K.c, list);
    setChs(list);
  };
  const set = (k: keyof Chantier, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));
  const sm: Record<string, { l: string; c: string }> = {
    actif: { l: 'Actif', c: 'bg0' },
    termine: { l: 'Terminé', c: 'bo' },
    archive: { l: 'Archivé', c: 'bgr' },
  };
  return (
    <div>
      <div className="rb" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="pt">Chantiers</div>
          <div className="ps">{chs.length} chantiers au total</div>
        </div>
        <button
          className="btn bp"
          onClick={() => {
            setForm({
              nom: '',
              ville: '',
              adresse: '',
              reference: '',
              statut: 'actif',
            });
            setMo('new');
          }}
        >
          + Nouveau chantier
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Chantier</th>
                <th>Ville</th>
                <th>Adresse</th>
                <th>Réf.</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chs.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.nom}</td>
                  <td>{c.ville}</td>
                  <td style={{ color: 'var(--t2)', fontSize: '.75rem' }}>
                    {c.adresse}
                  </td>
                  <td>
                    <span className="badge bb0">#{c.reference}</span>
                  </td>
                  <td>
                    <span className={`badge ${sm[c.statut]?.c || 'bgr'}`}>
                      {sm[c.statut]?.l}
                    </span>
                  </td>
                  <td>
                    <div className="row">
                      <button
                        className="btn bsm be"
                        onClick={() => {
                          setForm({ ...c });
                          setMo('edit');
                        }}
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        className="btn bsm bs"
                        onClick={() =>
                          sc(
                            chs.map((x) =>
                              x.id === c.id
                                ? {
                                    ...x,
                                    statut:
                                      x.statut === 'archive'
                                        ? 'actif'
                                        : 'archive',
                                  }
                                : x
                            )
                          )
                        }
                      >
                        {c.statut === 'archive' ? 'Réactiver' : 'Archiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!chs.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="emp">
                      <div className="emp-i">🏗️</div>
                      <p>Aucun chantier créé</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {mo && (
        <div className="mo" onClick={() => setMo(null)}>
          <div className="mo-b" onClick={(e) => e.stopPropagation()}>
            <div className="mo-t">
              {mo === 'new' ? 'Nouveau chantier' : 'Modifier le chantier'}
            </div>
            <div className="dfg2">
              <div className="field">
                <label>Nom *</label>
                <input
                  value={form.nom || ''}
                  onChange={(e) => set('nom', e.target.value)}
                  placeholder="Résidence Les Pins"
                />
              </div>
              <div className="field">
                <label>Référence *</label>
                <input
                  value={form.reference || ''}
                  onChange={(e) => set('reference', e.target.value)}
                  placeholder="1418"
                />
              </div>
              <div className="field">
                <label>Ville</label>
                <input
                  value={form.ville || ''}
                  onChange={(e) => set('ville', e.target.value)}
                  placeholder="Istres"
                />
              </div>
              <div className="field">
                <label>Statut</label>
                <select
                  value={form.statut || 'actif'}
                  onChange={(e) => set('statut', e.target.value)}
                >
                  <option value="actif">Actif</option>
                  <option value="termine">Terminé</option>
                  <option value="archive">Archivé</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Adresse</label>
              <input
                value={form.adresse || ''}
                onChange={(e) => set('adresse', e.target.value)}
                placeholder="12 rue des Pins, 13800"
              />
            </div>
            <div className="row mt">
              <button
                className="btn bp"
                onClick={() => {
                  if (!form.nom || !form.reference) return;
                  if (mo === 'new')
                    sc([...chs, { ...form, id: uid() } as Chantier]);
                  else
                    sc(
                      chs.map((c) =>
                        c.id === form.id ? (form as Chantier) : c
                      )
                    );
                  setMo(null);
                }}
              >
                ✅ Enregistrer
              </button>
              <button className="btn bs" onClick={() => setMo(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Employés ─────────────────────────────────────────────────────────────
function AEmp() {
  const [us, setUs] = useState<User[]>(
    (ld<User[]>(K.u) || []).filter((u) => u.role === 'employe')
  );
  const [mo, setMo] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<User>>({});
  const set = (k: keyof User, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));
  const su = (list: User[]) => {
    const adm = (ld<User[]>(K.u) || []).filter((u) => u.role === 'admin');
    sv(K.u, [...adm, ...list]);
    setUs(list);
  };
  const pts = ld<Pointage[]>(K.p) || [];
  return (
    <div>
      <div className="rb" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="pt">Employés</div>
          <div className="ps">
            {us.length} employé{us.length > 1 ? 's' : ''}
          </div>
        </div>
        <button
          className="btn bp"
          onClick={() => {
            setForm({
              nom: '',
              prenom: '',
              email: '',
              password: '',
              actif: true,
            });
            setMo('new');
          }}
        >
          + Nouvel employé
        </button>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Email</th>
                <th>Pointages</th>
                <th>Total heures</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {us.map((u) => {
                const h = pts
                  .filter((p) => p.userId === u.id)
                  .reduce((a, p) => a + p.heures, 0);
                const nb = pts.filter((p) => p.userId === u.id).length;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="row">
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            background: 'var(--a)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '.68rem',
                            fontWeight: 700,
                            color: '#fff',
                            flexShrink: 0,
                          }}
                        >
                          {(u.prenom?.[0] || '?').toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>
                          {u.prenom} {u.nom}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--t2)', fontSize: '.75rem' }}>
                      {u.email}
                    </td>
                    <td>{nb}</td>
                    <td>
                      <span className="badge bo">{fmtH(h)}</span>
                    </td>
                    <td>
                      <span className={`badge ${u.actif ? 'bg0' : 'br0'}`}>
                        {u.actif ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          className="btn bsm be"
                          onClick={() => {
                            setForm({ ...u });
                            setMo('edit');
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          className={`btn bsm ${u.actif ? 'bdn' : 'bs'}`}
                          onClick={() =>
                            su(
                              us.map((x) =>
                                x.id === u.id ? { ...x, actif: !x.actif } : x
                              )
                            )
                          }
                        >
                          {u.actif ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!us.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="emp">
                      <div className="emp-i">👷</div>
                      <p>Aucun employé créé</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {mo && (
        <div className="mo" onClick={() => setMo(null)}>
          <div className="mo-b" onClick={(e) => e.stopPropagation()}>
            <div className="mo-t">
              {mo === 'new' ? 'Nouvel employé' : "Modifier l'employé"}
            </div>
            <div className="dfg2">
              <div className="field">
                <label>Prénom *</label>
                <input
                  value={form.prenom || ''}
                  onChange={(e) => set('prenom', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Nom *</label>
                <input
                  value={form.nom || ''}
                  onChange={(e) => set('nom', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Email *</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => set('email', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Mot de passe</label>
                <input
                  type="text"
                  value={form.password || ''}
                  onChange={(e) => set('password', e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Statut</label>
              <select
                value={form.actif ? 'actif' : 'inactif'}
                onChange={(e) => set('actif', e.target.value === 'actif')}
              >
                <option value="actif">Actif</option>
                <option value="inactif">Désactivé</option>
              </select>
            </div>
            <div className="row mt">
              <button
                className="btn bp"
                onClick={() => {
                  if (!form.nom || !form.email) return;
                  if (mo === 'new')
                    su([
                      ...us,
                      { ...form, id: uid(), role: 'employe' } as User,
                    ]);
                  else
                    su(us.map((u) => (u.id === form.id ? (form as User) : u)));
                  setMo(null);
                }}
              >
                ✅ Enregistrer
              </button>
              <button className="btn bs" onClick={() => setMo(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Export ──────────────────────────────────────────────────────────────
function AExp() {
  const us = ld<User[]>(K.u) || [];
  const chs = ld<Chantier[]>(K.c) || [];
  const pts = ld<Pointage[]>(K.p) || [];
  const [f, setF] = useState({ e: '', c: '', df: '', dt: '' });
  const fil = pts.filter(
    (p) =>
      (!f.e || p.userId === f.e) &&
      (!f.c || p.chantierId === f.c) &&
      (!f.df || p.date >= f.df) &&
      (!f.dt || p.date <= f.dt)
  );
  const go = () => {
    const rows: string[][] = [
      [
        'Employé',
        'Date',
        'Chantier',
        'Ville',
        'Référence',
        'Début',
        'Pause début',
        'Pause fin',
        'Fin',
        'Heures',
        'Remarque',
      ],
    ];
    fil.forEach((p) => {
      const e = us.find((u) => u.id === p.userId);
      const ch = chs.find((c) => c.id === p.chantierId);
      rows.push([
        e ? `${e.prenom} ${e.nom}` : '',
        p.date,
        ch?.nom || '',
        ch?.ville || '',
        ch?.reference || '',
        p.debut,
        p.pauseDebut,
        p.pauseFin,
        p.fin,
        p.heures.toString().replace('.', ','),
        p.remarque || '',
      ]);
    });
    doCSV(rows, `pointages_${new Date().toISOString().slice(0, 10)}.csv`);
  };
  return (
    <div>
      <div className="pt">Export CSV</div>
      <div className="ps">
        {fil.length} pointages · {fmtH(fil.reduce((a, p) => a + p.heures, 0))}
      </div>
      <div className="card cp" style={{ maxWidth: 600 }}>
        <div className="dfg" style={{ marginBottom: '1rem' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Employé</label>
            <select
              value={f.e}
              onChange={(e) => setF((x) => ({ ...x, e: e.target.value }))}
            >
              <option value="">Tous</option>
              {us
                .filter((u) => u.role === 'employe')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.prenom} {u.nom}
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Chantier</label>
            <select
              value={f.c}
              onChange={(e) => setF((x) => ({ ...x, c: e.target.value }))}
            >
              <option value="">Tous</option>
              {chs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Du</label>
            <input
              type="date"
              value={f.df}
              onChange={(e) => setF((x) => ({ ...x, df: e.target.value }))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Au</label>
            <input
              type="date"
              value={f.dt}
              onChange={(e) => setF((x) => ({ ...x, dt: e.target.value }))}
            />
          </div>
        </div>
        <div
          style={{
            background: 'var(--ab)',
            borderRadius: 'var(--r)',
            padding: '1.1rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ fontSize: '1.6rem', marginBottom: 5 }}>📊</div>
          <div
            style={{
              fontWeight: 800,
              fontSize: '1.3rem',
              color: 'var(--a)',
              fontFamily: "'Syne',sans-serif",
            }}
          >
            {fmtH(fil.reduce((a, p) => a + p.heures, 0))}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--t2)', marginTop: 3 }}>
            {fil.length} pointages sélectionnés
          </div>
        </div>
        <button className="btn bf bp" onClick={go}>
          ⬇️ Télécharger le fichier CSV
        </button>
        <p
          style={{
            textAlign: 'center',
            marginTop: 8,
            fontSize: '.7rem',
            color: 'var(--t2)',
          }}
        >
          Compatible Excel, Google Sheets, LibreOffice
        </p>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<string>('home');

  useEffect(() => {
    seed();
    const s = ld<User>(K.s);
    if (s) {
      setUser(s);
      setPage(s.role === 'admin' ? 'dash' : 'home');
    }
  }, []);

  const login = (u: User) => {
    sv(K.s, u);
    setUser(u);
    setPage(u.role === 'admin' ? 'dash' : 'home');
  };
  const logout = () => {
    localStorage.removeItem(K.s);
    setUser(null);
    setPage('home');
  };

  const renderPage = () => {
    if (!user) return null;
    if (user.role === 'admin') {
      if (page === 'dash') return <ADash />;
      if (page === 'pts') return <APts />;
      if (page === 'ch') return <ACh />;
      if (page === 'emp') return <AEmp />;
      if (page === 'exp') return <AExp />;
      return <ADash />;
    }
    if (page === 'home') return <EmpHome user={user} setPage={setPage} />;
    if (page === 'new')
      return (
        <div>
          <div className="pt" style={{ marginBottom: '1rem' }}>
            Nouveau pointage
          </div>
          <div className="ps">Saisissez vos heures pour la journée</div>
          <div className="card cp">
            <PointageForm user={user} onDone={() => setPage('home')} />
          </div>
        </div>
      );
    if (page === 'hist') return <EmpHist user={user} />;
    return <EmpHome user={user} setPage={setPage} />;
  };

  if (!user)
    return (
      <>
        <style>{CSS}</style>
        <Login onLogin={login} />
      </>
    );

  return (
    <div className="layout">
      <style>{CSS}</style>
      <Sidebar user={user} page={page} setPage={setPage} logout={logout} />
      <div className="main">{renderPage()}</div>
    </div>
  );
}
