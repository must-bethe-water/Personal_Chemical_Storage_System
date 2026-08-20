"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Chemical = { id: string; name: string; formula: string; cas: string; location: string; amount: string; tag: string; createdAt: string; structureUrl: string; };
const STORAGE_KEY = "pcss-chemicals-v1";
const pubChemImage = (cas: string) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/PNG?record_type=2d&image_size=large`;
const INITIAL_CHEMICALS: Chemical[] = [
  { id: "benzoic-acid", name: "苯甲酸", formula: "C₇H₆O₂", cas: "65-85-0", location: "有机试剂柜 · A2", amount: "250 g", tag: "有机酸", createdAt: "2026-08-16T09:30:00.000Z", structureUrl: pubChemImage("65-85-0") },
  { id: "caffeine", name: "咖啡因", formula: "C₈H₁₀N₄O₂", cas: "58-08-2", location: "干燥器 · D1", amount: "25 g", tag: "生物碱", createdAt: "2026-08-18T03:15:00.000Z", structureUrl: pubChemImage("58-08-2") },
  { id: "salicylic-acid", name: "水杨酸", formula: "C₇H₆O₃", cas: "69-72-7", location: "有机试剂柜 · A3", amount: "100 g", tag: "有机酸", createdAt: "2026-08-19T07:40:00.000Z", structureUrl: pubChemImage("69-72-7") },
  { id: "acetophenone", name: "苯乙酮", formula: "C₈H₈O", cas: "98-86-2", location: "易燃液体柜 · B1", amount: "500 mL", tag: "芳香酮", createdAt: "2026-08-20T01:05:00.000Z", structureUrl: pubChemImage("98-86-2") },
];
const EMPTY_FORM = { name: "", formula: "", cas: "", location: "", amount: "", tag: "", structureUrl: "" };
const Icon = ({ children }: { children: React.ReactNode }) => <span aria-hidden="true" className="icon">{children}</span>;

export default function Home() {
  const [chemicals, setChemicals] = useState<Chemical[]>(INITIAL_CHEMICALS);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [sort, setSort] = useState("newest");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Chemical | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) { try { setChemicals(JSON.parse(saved)); } catch { window.localStorage.removeItem(STORAGE_KEY); } }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chemicals)); }, [chemicals, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(timer); }, [toast]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = chemicals.filter((chemical) => {
      if (!normalized) return true;
      const values: Record<string, string> = { name: chemical.name, cas: chemical.cas, formula: chemical.formula, tag: chemical.tag, location: chemical.location };
      return field === "all" ? Object.values(values).some((value) => value.toLocaleLowerCase().includes(normalized)) : values[field].toLocaleLowerCase().includes(normalized);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sort === "location") return a.location.localeCompare(b.location, "zh-CN");
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [chemicals, query, field, sort]);

  const locations = new Set(chemicals.map((item) => item.location)).size;
  const tags = new Set(chemicals.map((item) => item.tag)).size;

  function submitChemical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chemicals.some((item) => item.cas.trim() === form.cas.trim())) { setToast("这个 CAS 号已经存在于库存中"); return; }
    const chemical: Chemical = { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString(), structureUrl: form.structureUrl.trim() || pubChemImage(form.cas.trim()) };
    setChemicals((current) => [chemical, ...current]); setForm(EMPTY_FORM); setModalOpen(false); setToast(`已添加 ${chemical.name}`);
  }
  function confirmDelete() {
    if (!deleteTarget) return;
    setChemicals((current) => current.filter((item) => item.id !== deleteTarget.id)); setToast(`已删除 ${deleteTarget.name}`); setDeleteTarget(null);
  }
  function openAddModal() { setForm(EMPTY_FORM); setModalOpen(true); }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PCSS 首页"><span className="brand-mark">PC</span><span><b>PCSS</b><small>个人化学试剂库</small></span></a>
        <div className="header-meta"><span className="status-dot" /> 数据保存在此浏览器</div>
        <button className="primary-button" onClick={openAddModal}><Icon>＋</Icon>添加试剂</button>
      </header>
      <section className="hero" id="top">
        <div className="hero-content"><p className="eyebrow">PERSONAL CHEMICAL STORAGE SYSTEM</p><h1>你的化学试剂，<br /><em>清楚地</em>放在该在的位置。</h1><p className="hero-copy">记录分子结构、库存与位置。让每一次查找都有答案。</p></div>
        <div className="molecule-orbit" aria-hidden="true"><span>N</span><i /><i /><i /><b>O</b></div>
      </section>
      <section className="workspace">
        <div className="stats" aria-label="库存概览">
          <div><span>库存词条</span><strong>{chemicals.length.toString().padStart(2, "0")}</strong><small>种独特分子</small></div>
          <div><span>存储地点</span><strong>{locations.toString().padStart(2, "0")}</strong><small>个使用中位置</small></div>
          <div><span>自定义标签</span><strong>{tags.toString().padStart(2, "0")}</strong><small>个分类维度</small></div>
        </div>
        <div className="inventory-heading"><div><p className="eyebrow">INVENTORY</p><h2>试剂库存</h2></div><p>显示 {results.length} / {chemicals.length} 个词条</p></div>
        <div className="toolbar">
          <label className="search-control"><Icon>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索试剂…" aria-label="搜索试剂" />{query && <button onClick={() => setQuery("")} aria-label="清空搜索">×</button>}</label>
          <label className="select-control"><span>检索范围</span><select value={field} onChange={(event) => setField(event.target.value)}><option value="all">全部字段</option><option value="name">名称</option><option value="cas">CAS 号</option><option value="formula">化学式</option><option value="tag">标签</option><option value="location">存储地点</option></select></label>
          <label className="select-control"><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">最近入库</option><option value="name">名称 A–Z</option><option value="location">存储地点</option></select></label>
        </div>
        {results.length > 0 ? (
          <div className="cards">{results.map((chemical) => (
            <article className="card" key={chemical.id}>
              <div className="structure-panel">
                <img src={chemical.structureUrl} alt={`${chemical.name}的二维化学结构`} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.classList.add("show"); }} />
                <div className="structure-fallback"><span>⌬</span><small>结构图暂不可用</small></div>
                <button className="delete-button" onClick={() => setDeleteTarget(chemical)} aria-label={`删除${chemical.name}`} title="删除词条">×</button><span className="record-id">#{chemical.id.slice(0, 4).toUpperCase()}</span>
              </div>
              <div className="card-body"><div className="tag-row"><span className="tag">{chemical.tag}</span><span className="date">入库 {new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(chemical.createdAt))}</span></div><h3>{chemical.name}</h3><p className="formula">{chemical.formula}</p>
                <dl><div><dt>CAS 号</dt><dd>{chemical.cas}</dd></div><div><dt>存储地点</dt><dd>{chemical.location}</dd></div></dl><div className="amount"><span>当前库存</span><strong>{chemical.amount}</strong></div>
              </div>
            </article>
          ))}</div>
        ) : <div className="empty-state"><span>⌬</span><h3>没有匹配的试剂</h3><p>换个关键词或检索范围试试看。</p><button onClick={() => { setQuery(""); setField("all"); }}>清除筛选</button></div>}
      </section>
      <footer><span>PCSS / PERSONAL CHEMICAL STORAGE SYSTEM</span><span>仅供库存管理 · 化学品处理请遵守实验室安全规范</span></footer>
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => setModalOpen(false)} aria-label="关闭">×</button><p className="eyebrow">NEW RECORD</p><h2 id="add-title">添加化学试剂</h2><p className="modal-intro">CAS 号将用于从 PubChem 自动获取二维结构图。</p>
          <form onSubmit={submitChemical}><div className="form-grid">
            <label><span>试剂名称 *</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：苯甲酸" autoFocus /></label>
            <label><span>化学式 *</span><input required value={form.formula} onChange={(event) => setForm({ ...form, formula: event.target.value })} placeholder="例如：C7H6O2" /></label>
            <label><span>CAS 号 *</span><input required value={form.cas} onChange={(event) => setForm({ ...form, cas: event.target.value })} placeholder="例如：65-85-0" pattern="[0-9]{2,7}-[0-9]{2}-[0-9]" title="请输入有效格式，例如 65-85-0" /></label>
            <label><span>存储量 *</span><input required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="例如：250 g" /></label>
            <label><span>存储地点 *</span><input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="例如：有机试剂柜 · A2" /></label>
            <label><span>自定义标签 *</span><input required value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="例如：有机酸" /></label>
            <label className="full-field"><span>结构图片链接 <i>可选</i></span><input type="url" value={form.structureUrl} onChange={(event) => setForm({ ...form, structureUrl: event.target.value })} placeholder="留空则通过 CAS 号从 PubChem 获取" /></label>
          </div><div className="form-actions"><button type="button" onClick={() => setModalOpen(false)}>取消</button><button className="primary-button" type="submit">保存并入库 →</button></div></form>
        </section>
      </div>}
      {deleteTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><span className="warning-icon">!</span><h2 id="delete-title">删除“{deleteTarget.name}”？</h2><p>这个词条会从当前浏览器的库存中永久移除。</p><div className="form-actions"><button onClick={() => setDeleteTarget(null)}>取消</button><button className="danger-button" onClick={confirmDelete}>确认删除</button></div></section></div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
