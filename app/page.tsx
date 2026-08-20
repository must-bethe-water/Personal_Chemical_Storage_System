"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Chemical = { id: string; name: string; formula: string; cas: string; location: string; amount: string; tag: string; createdAt: string; structureUrl: string; };
type Language = "en" | "zh";

const STORAGE_KEY = "pcss-chemicals-v1";
const LANGUAGE_KEY = "pcss-language-v1";
const pubChemImage = (cas: string) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(cas)}/PNG?record_type=2d&image_size=large`;
const INITIAL_CHEMICALS: Chemical[] = [
  { id: "benzoic-acid", name: "Benzoic acid", formula: "C₇H₆O₂", cas: "65-85-0", location: "Organic cabinet · A2", amount: "250 g", tag: "Organic acid", createdAt: "2026-08-16T09:30:00.000Z", structureUrl: pubChemImage("65-85-0") },
  { id: "caffeine", name: "Caffeine", formula: "C₈H₁₀N₄O₂", cas: "58-08-2", location: "Desiccator · D1", amount: "25 g", tag: "Alkaloid", createdAt: "2026-08-18T03:15:00.000Z", structureUrl: pubChemImage("58-08-2") },
  { id: "salicylic-acid", name: "Salicylic acid", formula: "C₇H₆O₃", cas: "69-72-7", location: "Organic cabinet · A3", amount: "100 g", tag: "Organic acid", createdAt: "2026-08-19T07:40:00.000Z", structureUrl: pubChemImage("69-72-7") },
  { id: "acetophenone", name: "Acetophenone", formula: "C₈H₈O", cas: "98-86-2", location: "Flammables cabinet · B1", amount: "500 mL", tag: "Aromatic ketone", createdAt: "2026-08-20T01:05:00.000Z", structureUrl: pubChemImage("98-86-2") },
];
const EMPTY_FORM = { name: "", formula: "", cas: "", location: "", amount: "", tag: "", structureUrl: "" };
const COPY = {
  en: {
    brand: "Personal chemical storage", localData: "Data stays in this browser", add: "Add chemical",
    heroLead: "Your chemical inventory,", heroAccent: "clearly", heroEnd: "stored where it belongs.", heroCopy: "Track molecular structures, quantities, and locations. Find every reagent with confidence.",
    overview: "Inventory overview", records: "Inventory records", unique: "unique molecules", locations: "Storage locations", activeLocations: "active locations", tags: "Custom tags", categories: "classification groups",
    inventory: "Chemical inventory", showing: (shown: number, total: number) => `Showing ${shown} of ${total} records`,
    search: "Search chemicals…", clearSearch: "Clear search", searchScope: "Search in", allFields: "All fields", name: "Name", cas: "CAS number", formula: "Formula", tag: "Tag", location: "Storage location",
    sort: "Sort by", newest: "Newest first", nameSort: "Name A–Z", locationSort: "Storage location",
    unavailable: "Structure unavailable", deleteEntry: "Delete record", added: "Added", currentStock: "Current stock",
    noMatch: "No matching chemicals", noMatchCopy: "Try another keyword or search field.", clearFilters: "Clear filters",
    safety: "Inventory use only · Follow laboratory safety procedures when handling chemicals",
    newRecord: "NEW RECORD", addTitle: "Add a chemical", addIntro: "The CAS number is used to retrieve a 2D structure automatically from PubChem.",
    chemicalName: "Chemical name *", chemicalNameExample: "e.g. Benzoic acid", formulaLabel: "Molecular formula *", formulaExample: "e.g. C7H6O2", casLabel: "CAS number *", casExample: "e.g. 65-85-0", casHelp: "Enter a valid format, e.g. 65-85-0",
    amountLabel: "Quantity *", amountExample: "e.g. 250 g", locationLabel: "Storage location *", locationExample: "e.g. Organic cabinet · A2", tagLabel: "Custom tag *", tagExample: "e.g. Organic acid",
    structureLink: "Structure image URL", optional: "Optional", structureExample: "Leave blank to retrieve from PubChem using the CAS number", cancel: "Cancel", save: "Save to inventory →", close: "Close",
    duplicate: "This CAS number is already in your inventory", addedToast: (name: string) => `${name} added`, deletedToast: (name: string) => `${name} deleted`,
    deleteTitle: (name: string) => `Delete “${name}”?`, deleteCopy: "This record will be permanently removed from this browser.", confirmDelete: "Delete record", structureAlt: (name: string) => `2D chemical structure of ${name}`,
  },
  zh: {
    brand: "个人化学试剂库", localData: "数据保存在此浏览器", add: "添加试剂",
    heroLead: "你的化学试剂，", heroAccent: "清楚地", heroEnd: "放在该在的位置。", heroCopy: "记录分子结构、库存与位置。让每一次查找都有答案。",
    overview: "库存概览", records: "库存词条", unique: "种独特分子", locations: "存储地点", activeLocations: "个使用中位置", tags: "自定义标签", categories: "个分类维度",
    inventory: "试剂库存", showing: (shown: number, total: number) => `显示 ${shown} / ${total} 个词条`,
    search: "搜索试剂…", clearSearch: "清空搜索", searchScope: "检索范围", allFields: "全部字段", name: "名称", cas: "CAS 号", formula: "化学式", tag: "标签", location: "存储地点",
    sort: "排序", newest: "最近入库", nameSort: "名称 A–Z", locationSort: "存储地点",
    unavailable: "结构图暂不可用", deleteEntry: "删除词条", added: "入库", currentStock: "当前库存",
    noMatch: "没有匹配的试剂", noMatchCopy: "换个关键词或检索范围试试看。", clearFilters: "清除筛选",
    safety: "仅供库存管理 · 化学品处理请遵守实验室安全规范",
    newRecord: "新建词条", addTitle: "添加化学试剂", addIntro: "CAS 号将用于从 PubChem 自动获取二维结构图。",
    chemicalName: "试剂名称 *", chemicalNameExample: "例如：苯甲酸", formulaLabel: "化学式 *", formulaExample: "例如：C7H6O2", casLabel: "CAS 号 *", casExample: "例如：65-85-0", casHelp: "请输入有效格式，例如 65-85-0",
    amountLabel: "存储量 *", amountExample: "例如：250 g", locationLabel: "存储地点 *", locationExample: "例如：有机试剂柜 · A2", tagLabel: "自定义标签 *", tagExample: "例如：有机酸",
    structureLink: "结构图片链接", optional: "可选", structureExample: "留空则通过 CAS 号从 PubChem 获取", cancel: "取消", save: "保存并入库 →", close: "关闭",
    duplicate: "这个 CAS 号已经存在于库存中", addedToast: (name: string) => `已添加 ${name}`, deletedToast: (name: string) => `已删除 ${name}`,
    deleteTitle: (name: string) => `删除“${name}”？`, deleteCopy: "这个词条会从当前浏览器的库存中永久移除。", confirmDelete: "确认删除", structureAlt: (name: string) => `${name}的二维化学结构`,
  },
} as const;

const Icon = ({ children }: { children: React.ReactNode }) => <span aria-hidden="true" className="icon">{children}</span>;

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [chemicals, setChemicals] = useState<Chemical[]>(INITIAL_CHEMICALS);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [sort, setSort] = useState("newest");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Chemical | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState("");
  const t = COPY[language];
  const locale = language === "en" ? "en-US" : "zh-CN";

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
    if (saved) { try { setChemicals(JSON.parse(saved)); } catch { window.localStorage.removeItem(STORAGE_KEY); } }
    if (savedLanguage === "en" || savedLanguage === "zh") setLanguage(savedLanguage);
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chemicals)); }, [chemicals, hydrated]);
  useEffect(() => { document.documentElement.lang = language === "en" ? "en" : "zh-CN"; if (hydrated) window.localStorage.setItem(LANGUAGE_KEY, language); }, [language, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(timer); }, [toast]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = chemicals.filter((chemical) => {
      if (!normalized) return true;
      const values: Record<string, string> = { name: chemical.name, cas: chemical.cas, formula: chemical.formula, tag: chemical.tag, location: chemical.location };
      return field === "all" ? Object.values(values).some((value) => value.toLocaleLowerCase().includes(normalized)) : values[field].toLocaleLowerCase().includes(normalized);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, locale);
      if (sort === "location") return a.location.localeCompare(b.location, locale);
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [chemicals, query, field, sort, locale]);

  const locations = new Set(chemicals.map((item) => item.location)).size;
  const tags = new Set(chemicals.map((item) => item.tag)).size;

  function changeLanguage(nextLanguage: Language) { setLanguage(nextLanguage); }
  function submitChemical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chemicals.some((item) => item.cas.trim() === form.cas.trim())) { setToast(t.duplicate); return; }
    const chemical: Chemical = { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString(), structureUrl: form.structureUrl.trim() || pubChemImage(form.cas.trim()) };
    setChemicals((current) => [chemical, ...current]); setForm(EMPTY_FORM); setModalOpen(false); setToast(t.addedToast(chemical.name));
  }
  function confirmDelete() {
    if (!deleteTarget) return;
    setChemicals((current) => current.filter((item) => item.id !== deleteTarget.id)); setToast(t.deletedToast(deleteTarget.name)); setDeleteTarget(null);
  }
  function openAddModal() { setForm(EMPTY_FORM); setModalOpen(true); }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PCSS home"><span className="brand-mark">PC</span><span><b>PCSS</b><small>{t.brand}</small></span></a>
        <div className="header-meta"><span className="status-dot" /> {t.localData}</div>
        <div className="header-actions">
          <div className="language-toggle" role="group" aria-label="Language / 语言">
            <button type="button" className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>EN</button>
            <button type="button" className={language === "zh" ? "active" : ""} aria-pressed={language === "zh"} onClick={() => changeLanguage("zh")}>中文</button>
          </div>
          <button className="primary-button" onClick={openAddModal}><Icon>＋</Icon>{t.add}</button>
        </div>
      </header>
      <section className="hero" id="top">
        <div className="hero-content"><p className="eyebrow">PERSONAL CHEMICAL STORAGE SYSTEM</p><h1>{t.heroLead}<br /><em>{t.heroAccent}</em> {t.heroEnd}</h1><p className="hero-copy">{t.heroCopy}</p></div>
        <div className="molecule-orbit" aria-hidden="true"><span>N</span><i /><i /><i /><b>O</b></div>
      </section>
      <section className="workspace">
        <div className="stats" aria-label={t.overview}>
          <div><span>{t.records}</span><strong>{chemicals.length.toString().padStart(2, "0")}</strong><small>{t.unique}</small></div>
          <div><span>{t.locations}</span><strong>{locations.toString().padStart(2, "0")}</strong><small>{t.activeLocations}</small></div>
          <div><span>{t.tags}</span><strong>{tags.toString().padStart(2, "0")}</strong><small>{t.categories}</small></div>
        </div>
        <div className="inventory-heading"><div><p className="eyebrow">INVENTORY</p><h2>{t.inventory}</h2></div><p>{t.showing(results.length, chemicals.length)}</p></div>
        <div className="toolbar">
          <label className="search-control"><Icon>⌕</Icon><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} />{query && <button onClick={() => setQuery("")} aria-label={t.clearSearch}>×</button>}</label>
          <label className="select-control"><span>{t.searchScope}</span><select value={field} onChange={(event) => setField(event.target.value)}><option value="all">{t.allFields}</option><option value="name">{t.name}</option><option value="cas">{t.cas}</option><option value="formula">{t.formula}</option><option value="tag">{t.tag}</option><option value="location">{t.location}</option></select></label>
          <label className="select-control"><span>{t.sort}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t.newest}</option><option value="name">{t.nameSort}</option><option value="location">{t.locationSort}</option></select></label>
        </div>
        {results.length > 0 ? (
          <div className="cards">{results.map((chemical) => (
            <article className="card" key={chemical.id}>
              <div className="structure-panel">
                <img src={chemical.structureUrl} alt={t.structureAlt(chemical.name)} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.classList.add("show"); }} />
                <div className="structure-fallback"><span>⌬</span><small>{t.unavailable}</small></div>
                <button className="delete-button" onClick={() => setDeleteTarget(chemical)} aria-label={`${t.deleteEntry}: ${chemical.name}`} title={t.deleteEntry}>×</button><span className="record-id">#{chemical.id.slice(0, 4).toUpperCase()}</span>
              </div>
              <div className="card-body"><div className="tag-row"><span className="tag">{chemical.tag}</span><span className="date">{t.added} {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(chemical.createdAt))}</span></div><h3>{chemical.name}</h3><p className="formula">{chemical.formula}</p>
                <dl><div><dt>{t.cas}</dt><dd>{chemical.cas}</dd></div><div><dt>{t.location}</dt><dd>{chemical.location}</dd></div></dl><div className="amount"><span>{t.currentStock}</span><strong>{chemical.amount}</strong></div>
              </div>
            </article>
          ))}</div>
        ) : <div className="empty-state"><span>⌬</span><h3>{t.noMatch}</h3><p>{t.noMatchCopy}</p><button onClick={() => { setQuery(""); setField("all"); }}>{t.clearFilters}</button></div>}
      </section>
      <footer><span>PCSS / PERSONAL CHEMICAL STORAGE SYSTEM</span><span>{t.safety}</span></footer>
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => setModalOpen(false)} aria-label={t.close}>×</button><p className="eyebrow">{t.newRecord}</p><h2 id="add-title">{t.addTitle}</h2><p className="modal-intro">{t.addIntro}</p>
          <form onSubmit={submitChemical}><div className="form-grid">
            <label><span>{t.chemicalName}</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t.chemicalNameExample} autoFocus /></label>
            <label><span>{t.formulaLabel}</span><input required value={form.formula} onChange={(event) => setForm({ ...form, formula: event.target.value })} placeholder={t.formulaExample} /></label>
            <label><span>{t.casLabel}</span><input required value={form.cas} onChange={(event) => setForm({ ...form, cas: event.target.value })} placeholder={t.casExample} pattern="[0-9]{2,7}-[0-9]{2}-[0-9]" title={t.casHelp} /></label>
            <label><span>{t.amountLabel}</span><input required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder={t.amountExample} /></label>
            <label><span>{t.locationLabel}</span><input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder={t.locationExample} /></label>
            <label><span>{t.tagLabel}</span><input required value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder={t.tagExample} /></label>
            <label className="full-field"><span>{t.structureLink} <i>{t.optional}</i></span><input type="url" value={form.structureUrl} onChange={(event) => setForm({ ...form, structureUrl: event.target.value })} placeholder={t.structureExample} /></label>
          </div><div className="form-actions"><button type="button" onClick={() => setModalOpen(false)}>{t.cancel}</button><button className="primary-button" type="submit">{t.save}</button></div></form>
        </section>
      </div>}
      {deleteTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><span className="warning-icon">!</span><h2 id="delete-title">{t.deleteTitle(deleteTarget.name)}</h2><p>{t.deleteCopy}</p><div className="form-actions"><button onClick={() => setDeleteTarget(null)}>{t.cancel}</button><button className="danger-button" onClick={confirmDelete}>{t.confirmDelete}</button></div></section></div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
