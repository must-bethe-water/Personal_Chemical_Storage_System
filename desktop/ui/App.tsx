"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isValidCas, migrateStoredTags, parseTagQuery, uniqueTags } from "./model";

type SourceId = "pubchem" | "chebi" | "chembl" | "comptox" | "unichem";
type SourceResult = { id: SourceId; status: "matched" | "not-found" | "unavailable" | "key-required"; identifier?: string; url?: string };
type LookupResult = { name: string; formula: string; cas: string; cid?: number; molecularWeight?: string; molecularWeightSource?: SourceId; exactMass?: string; inchiKey?: string; smiles?: string; sources: SourceResult[]; accessedAt: string };
type Chemical = { id: string; name: string; formula: string; cas: string; location: string; amount: string; tags: string[]; createdAt: string; structureUrl: string; structureStatus?: "not-found"; database?: LookupResult; };
type StoredChemical = Omit<Chemical, "tags"> & { tags?: string[]; tag?: string };
type InventoryForm = { name: string; formula: string; cas: string; location: string; amount: string; tags: string[]; structureUrl: string };
type Language = "en" | "zh";
type LookupState = { status: "idle" | "loading" | "success" | "not-found" | "error"; result?: LookupResult };

const STORAGE_KEY = "pcss-chemicals-v1";
const LANGUAGE_KEY = "pcss-language-v1";
const pubChemImage = (cas: string) => `/api/structure?cas=${encodeURIComponent(cas)}`;
const isPubChemImage = (url: string) => url.startsWith("/api/structure?") || url.startsWith("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/");
const migrateChemical = (chemical: StoredChemical): Chemical => {
  const { tag, tags, ...rest } = chemical;
  return { ...rest, tags: migrateStoredTags(tags, tag) };
};
const rankFrequentValues = (chemicals: Chemical[], key: "amount" | "location", locale: string) => {
  const frequencies = new Map<string, { value: string; count: number; latest: number }>();
  chemicals.forEach((chemical) => {
    const value = chemical[key].trim();
    if (!value) return;
    const normalized = value.toLocaleLowerCase();
    const timestamp = +new Date(chemical.createdAt);
    const current = frequencies.get(normalized);
    frequencies.set(normalized, { value: !current || timestamp >= current.latest ? value : current.value, count: (current?.count ?? 0) + 1, latest: Math.max(current?.latest ?? 0, timestamp) });
  });
  return [...frequencies.values()].sort((a, b) => b.count - a.count || b.latest - a.latest || a.value.localeCompare(b.value, locale)).slice(0, 5).map((item) => item.value);
};
const rankFrequentTags = (chemicals: Chemical[], locale: string) => {
  const frequencies = new Map<string, { value: string; count: number; latest: number }>();
  chemicals.forEach((chemical) => chemical.tags.forEach((tag) => {
    const value = tag.trim();
    if (!value) return;
    const normalized = value.toLocaleLowerCase();
    const timestamp = +new Date(chemical.createdAt);
    const current = frequencies.get(normalized);
    frequencies.set(normalized, { value: !current || timestamp >= current.latest ? value : current.value, count: (current?.count ?? 0) + 1, latest: Math.max(current?.latest ?? 0, timestamp) });
  }));
  return [...frequencies.values()].sort((a, b) => b.count - a.count || b.latest - a.latest || a.value.localeCompare(b.value, locale)).slice(0, 5).map((item) => item.value);
};
const INITIAL_CHEMICALS: Chemical[] = [];
const EMPTY_FORM: InventoryForm = { name: "", formula: "", cas: "", location: "", amount: "", tags: [], structureUrl: "" };
const COPY = {
  en: {
    brand: "Personal chemical storage", localData: "Local inventory · on-demand sources", add: "Add chemical", settings: "Database settings",
    heroLead: "Your chemical inventory,", heroAccent: "clearly", heroEnd: "stored where it belongs.", heroCopy: "Track molecular structures, quantities, and locations. Find every reagent with confidence.",
    overview: "Inventory overview", records: "Inventory records", unique: "unique molecules", locations: "Storage locations", activeLocations: "active locations", tags: "Custom tags", categories: "classification groups",
    inventory: "Chemical inventory", showing: (shown: number, total: number) => `Showing ${shown} of ${total} records`,
    search: "Search chemicals…", tagSearch: "Enter tags separated by commas…", clearSearch: "Clear search", searchScope: "Search in", allFields: "All fields", name: "Name", cas: "CAS number", formula: "Formula", tag: "Tags", location: "Storage location", tagLegend: "Available tags", tagLegendCopy: "Select one or more. Results must contain every selected tag.", clearTags: "Clear tags", noTags: "No tags in inventory",
    sort: "Sort by", newest: "Newest first", nameSort: "Name A–Z", locationSort: "Storage location",
    unavailable: "Structure unavailable", deleteEntry: "Delete record", added: "Added", currentStock: "Current stock",
    noMatch: "No matching chemicals", noMatchCopy: "Try another keyword or search field.", clearFilters: "Clear filters", noInventory: "Your inventory is empty", noInventoryCopy: "Add your first chemical to begin a local inventory.", addFirst: "Add first chemical",
    safety: "Inventory use only · Follow laboratory safety procedures when handling chemicals",
    newRecord: "NEW RECORD", addTitle: "Add a chemical", addIntro: "Enter either an English compound name or a CAS number. The other identity fields will be resolved and filled automatically.",
    chemicalName: "English compound name *", chemicalNameExample: "e.g. Benzoic acid", formulaLabel: "Molecular formula *", formulaExample: "e.g. C7H6O2", casLabel: "CAS number *", casExample: "e.g. 65-85-0", casHelp: "Enter a valid format, e.g. 65-85-0",
    amountLabel: "Quantity", amountExample: "e.g. 250 g", locationLabel: "Storage location *", locationExample: "e.g. Organic cabinet · A2", tagLabel: "Custom tags", tagExample: "e.g. Organic acid", addTag: "Add tag", removeTag: (tag: string) => `Remove ${tag}`, frequentSuggestions: "Frequently used",
    structureLink: "Structure image URL", optional: "Optional", structureExample: "Leave blank to retrieve from PubChem using the CAS number", cancel: "Cancel", save: "Save to inventory →", close: "Close",
    lookupHint: "Enter an English name or valid CAS number to auto-fill the matching identity.", lookupLoading: "Resolving compound identity…", lookupSuccess: (count: number, cid?: number, cas?: string) => `${count} sources matched${cid ? ` · CID ${cid}` : ""}${cas ? ` · CAS ${cas}` : ""}`, lookupNotFound: "No matching compound with a confirmed CAS number was found.", lookupError: "Sources are temporarily unavailable. You can enter the details manually.",
    untagged: "Untagged", notSpecified: "Not specified",
    duplicate: "Duplicate CAS number", duplicateCreateTitle: "Create another entry?", duplicateCreateCopy: (cas: string, count: number) => `${count} existing ${count === 1 ? "entry uses" : "entries use"} CAS ${cas}. You can still create this entry and manage the group later.`, existingEntries: "Existing entries", createAnyway: "Create anyway", reviewDuplicates: (count: number) => `View ${count} related entries`, duplicatesTitle: (cas: string) => `Entries with CAS ${cas}`, duplicatesCopy: "These records are linked because they share the same CAS number. Select the record whose identity and structure should be retained.", keepAsPrimary: "Keep as primary", mergeEntries: (count: number) => `Merge ${count} entries`, mergeHelp: "Locations, quantities and tags are retained; no quantities are mathematically added.", mergedToast: (count: number) => `${count} entries merged`, addedToast: (name: string) => `${name} added`, deletedToast: (name: string) => `${name} deleted`,
    deleteTitle: (name: string) => `Delete “${name}”?`, deleteCopy: "This record will be permanently removed from this app.", confirmDelete: "Delete record", structureAlt: (name: string) => `2D chemical structure of ${name}`,
    sources: "Database sources", sourceDetails: "Source details", enrich: "Check / refresh sources", enriching: "Checking sources…", noSources: "Not checked yet", matched: "Matched", notFound: "Not found", unavailableSource: "Unavailable", keyRequired: "API key required", molecularWeight: "Molecular weight", exactMass: "Exact mass", inchiKey: "InChIKey", smiles: "Canonical SMILES", lastChecked: "Last checked", openRecord: "Open official record", editRecord: "Edit inventory record", editIntro: "Chemical identity is read-only. Only the inventory fields below can be changed.", readonlyIdentity: "Read-only chemical identity", saveChanges: "Save changes", updatedToast: (name: string) => `${name} updated`,
    settingsTitle: "EPA CompTox access", settingsIntro: "CompTox requires a free EPA CCTE API key. In the Mac app it is stored only in macOS Keychain.", apiKey: "EPA API key", apiKeyPlaceholder: "Paste API key", saveKey: "Save to Keychain", removeKey: "Remove saved key", configured: "Key configured", notConfigured: "No key configured", savedKey: "CompTox key saved", removedKey: "CompTox key removed", settingsError: "Could not update Keychain.",
    dataTitle: "Local inventory data", dataIntro: "Inventory is stored in SQLite under Application Support. Automatic JSON snapshots retain the 20 most recent changes.", exportJSON: "Export JSON backup", exportCSV: "Export CSV", importData: "Import JSON / CSV", exportSuccess: "Inventory exported", importSuccess: (count: number) => `${count} records imported`, dataError: "Could not complete the inventory data operation.", storageError: "The local inventory could not be opened or saved.", storageRecovery: "Editing is disabled to protect your data. Quit and reopen PCSS; legacy data remains untouched if migration did not complete.",
  },
  zh: {
    brand: "个人化学试剂库", localData: "库存本地保存 · 数据库按需查询", add: "添加试剂", settings: "数据库设置",
    heroLead: "你的化学试剂，", heroAccent: "清楚地", heroEnd: "放在该在的位置。", heroCopy: "记录分子结构、库存与位置。让每一次查找都有答案。",
    overview: "库存概览", records: "库存词条", unique: "种独特分子", locations: "存储地点", activeLocations: "个使用中位置", tags: "自定义标签", categories: "个分类维度",
    inventory: "试剂库存", showing: (shown: number, total: number) => `显示 ${shown} / ${total} 个词条`,
    search: "搜索试剂…", tagSearch: "输入多个标签，用逗号分隔…", clearSearch: "清空搜索", searchScope: "检索范围", allFields: "全部字段", name: "名称", cas: "CAS 号", formula: "化学式", tag: "标签", location: "存储地点", tagLegend: "现有标签", tagLegendCopy: "可选择多个；词条必须同时包含所有已选标签。", clearTags: "清空标签", noTags: "库存中尚无标签",
    sort: "排序", newest: "最近入库", nameSort: "名称 A–Z", locationSort: "存储地点",
    unavailable: "结构图暂不可用", deleteEntry: "删除词条", added: "入库", currentStock: "当前库存",
    noMatch: "没有匹配的试剂", noMatchCopy: "换个关键词或检索范围试试看。", clearFilters: "清除筛选", noInventory: "库存还是空的", noInventoryCopy: "添加第一个化学试剂，开始建立本地库存。", addFirst: "添加第一个试剂",
    safety: "仅供库存管理 · 化学品处理请遵守实验室安全规范",
    newRecord: "新建词条", addTitle: "添加化学试剂", addIntro: "输入化合物英文名称或 CAS 号中的任意一项，系统会反向确认并自动补全其他身份信息。",
    chemicalName: "化合物英文名称 *", chemicalNameExample: "例如：Benzoic acid", formulaLabel: "化学式 *", formulaExample: "例如：C7H6O2", casLabel: "CAS 号 *", casExample: "例如：65-85-0", casHelp: "请输入有效格式，例如 65-85-0",
    amountLabel: "存储量", amountExample: "例如：250 g", locationLabel: "存储地点 *", locationExample: "例如：有机试剂柜 · A2", tagLabel: "自定义标签", tagExample: "例如：有机酸", addTag: "添加标签", removeTag: (tag: string) => `删除标签 ${tag}`, frequentSuggestions: "常用快捷填充",
    structureLink: "结构图片链接", optional: "可选", structureExample: "留空则通过 CAS 号从 PubChem 获取", cancel: "取消", save: "保存并入库 →", close: "关闭",
    lookupHint: "输入英文名称或有效 CAS 号后，将自动补全对应身份信息。", lookupLoading: "正在解析化合物身份…", lookupSuccess: (count: number, cid?: number, cas?: string) => `已匹配 ${count} 个来源${cid ? ` · CID ${cid}` : ""}${cas ? ` · CAS ${cas}` : ""}`, lookupNotFound: "未找到具有可确认 CAS 号的对应化合物。", lookupError: "数据库暂时不可用，你仍可手动填写。",
    untagged: "未加标签", notSpecified: "未填写",
    duplicate: "CAS 号重复", duplicateCreateTitle: "仍要创建这个词条吗？", duplicateCreateCopy: (cas: string, count: number) => `库中已有 ${count} 个词条使用 CAS ${cas}。你仍可继续创建，之后再集中查看和合并。`, existingEntries: "已有词条", createAnyway: "仍然创建", reviewDuplicates: (count: number) => `查看 ${count} 个关联词条`, duplicatesTitle: (cas: string) => `CAS ${cas} 的关联词条`, duplicatesCopy: "这些记录因 CAS 号相同而自动关联。请选择要保留其名称、结构与身份信息的主词条。", keepAsPrimary: "保留为主词条", mergeEntries: (count: number) => `合并 ${count} 个词条`, mergeHelp: "存储地点、数量和标签会被保留，不会对不同单位的数量进行数学相加。", mergedToast: (count: number) => `已合并 ${count} 个词条`, addedToast: (name: string) => `已添加 ${name}`, deletedToast: (name: string) => `已删除 ${name}`,
    deleteTitle: (name: string) => `删除“${name}”？`, deleteCopy: "这个词条会从当前 App 的库存中永久移除。", confirmDelete: "确认删除", structureAlt: (name: string) => `${name}的二维化学结构`,
    sources: "数据库来源", sourceDetails: "来源详情", enrich: "查询 / 刷新来源", enriching: "正在查询…", noSources: "尚未查询", matched: "已匹配", notFound: "未找到", unavailableSource: "暂不可用", keyRequired: "需要 API 密钥", molecularWeight: "分子量", exactMass: "精确质量", inchiKey: "InChIKey", smiles: "规范 SMILES", lastChecked: "最近查询", openRecord: "打开官方记录", editRecord: "编辑库存词条", editIntro: "化学身份信息仅供展示，仅可修改下方三个库存属性。", readonlyIdentity: "只读化学身份", saveChanges: "保存修改", updatedToast: (name: string) => `已更新 ${name}`,
    settingsTitle: "EPA CompTox 接入", settingsIntro: "CompTox 需要免费的 EPA CCTE API 密钥；在 Mac 程序中，密钥仅保存于 macOS 钥匙串。", apiKey: "EPA API 密钥", apiKeyPlaceholder: "粘贴 API 密钥", saveKey: "保存到钥匙串", removeKey: "删除已存密钥", configured: "密钥已配置", notConfigured: "尚未配置密钥", savedKey: "CompTox 密钥已保存", removedKey: "CompTox 密钥已删除", settingsError: "无法更新钥匙串。",
    dataTitle: "本地库存数据", dataIntro: "库存保存在 Application Support 中的 SQLite 数据库里；系统自动保留最近 20 次修改的 JSON 快照。", exportJSON: "导出 JSON 备份", exportCSV: "导出 CSV", importData: "导入 JSON / CSV", exportSuccess: "库存已导出", importSuccess: (count: number) => `已导入 ${count} 个词条`, dataError: "无法完成库存数据操作。", storageError: "无法打开或保存本地库存。", storageRecovery: "为保护数据，编辑功能已停用。请退出并重新打开 PCSS；如果迁移没有完成，旧数据仍会原样保留。",
  },
} as const;

const Icon = ({ children }: { children: React.ReactNode }) => <span aria-hidden="true" className="icon">{children}</span>;
const QuickSuggestions = ({ values, label, onSelect }: { values: string[]; label: string; onSelect: (value: string) => void }) => values.length > 0 ? (
  <div className="quick-suggestions"><small>{label}</small><div>{values.map((value) => <button type="button" key={value.toLocaleLowerCase()} onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(value)}>{value}</button>)}</div></div>
) : null;
const TagEditor = ({ tags, value, suggestions, label, placeholder, addLabel, suggestionLabel, removeLabel, onChange, onAdd, onRemove }: { tags: string[]; value: string; suggestions: string[]; label: string; placeholder: string; addLabel: string; suggestionLabel: string; removeLabel: (tag: string) => string; onChange: (value: string) => void; onAdd: () => void; onRemove: (tag: string) => void }) => (
  <div className="tag-editor">
    <div className="tag-suggestion-zone suggestion-field"><div className="tag-entry-row"><input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onAdd(); } }} placeholder={placeholder} aria-label={label} /><button type="button" onClick={onAdd} disabled={!value.trim()}>{addLabel}</button></div><QuickSuggestions values={suggestions} label={suggestionLabel} onSelect={onChange} /></div>
    {tags.length > 0 && <div className="tag-editor-list">{tags.map((tag) => <span className="tag-editor-chip" key={tag.toLocaleLowerCase()}><span>{tag}</span><button type="button" onClick={() => onRemove(tag)} aria-label={removeLabel(tag)} title={removeLabel(tag)}>×</button></span>)}</div>}
  </div>
);

const ChemicalStructure = ({ chemical, alt, unavailable, onNotFound }: { chemical: Chemical; alt: string; unavailable: string; onNotFound: (id: string) => void }) => {
  const source = isPubChemImage(chemical.structureUrl) ? pubChemImage(chemical.cas) : chemical.structureUrl;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resolvedUrl, setResolvedUrl] = useState("");
  const checkingRef = useRef(false);
  const objectUrlRef = useRef("");
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryDelayRef = useRef(15_000);

  const clearRetry = () => {
    if (retryTimerRef.current !== undefined) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = undefined;
  };
  const scheduleRetry = () => {
    if (!navigator.onLine || retryTimerRef.current !== undefined) return;
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(delay * 2, 300_000);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = undefined;
      setFailed(false);
      setAttempt((current) => current + 1);
    }, delay);
  };

  const checkPubChem = async () => {
    if (!isPubChemImage(chemical.structureUrl) || chemical.structureStatus === "not-found" || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const response = await fetch(source, { cache: "no-store" });
      if (response.status === 404) { clearRetry(); onNotFound(chemical.id); return; }
      if (!response.ok) { scheduleRetry(); return; }
      const nextUrl = URL.createObjectURL(await response.blob());
      clearRetry();
      retryDelayRef.current = 15_000;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = nextUrl;
      setResolvedUrl(nextUrl);
      setFailed(false);
    } catch {
      scheduleRetry();
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    const retry = () => {
      if (!failed || chemical.structureStatus === "not-found") return;
      clearRetry();
      retryDelayRef.current = 15_000;
      if (isPubChemImage(chemical.structureUrl)) void checkPubChem();
      else { setFailed(false); setAttempt((current) => current + 1); }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  });
  useEffect(() => () => {
    clearRetry();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  if (chemical.structureStatus === "not-found") return <div className="structure-fallback show"><span>⌬</span><small>{unavailable}</small></div>;
  return <>
    <img key={`${source}-${attempt}`} src={resolvedUrl || source} alt={alt} loading="lazy" style={failed ? { display: "none" } : undefined} onLoad={() => setFailed(false)} onError={() => { setFailed(true); void checkPubChem(); }} />
    <div className={`structure-fallback ${failed ? "show" : ""}`}><span>⌬</span><small>{unavailable}</small></div>
  </>;
};

export default function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [chemicals, setChemicals] = useState<Chemical[]>(INITIAL_CHEMICALS);
  const [hydrated, setHydrated] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [sort, setSort] = useState("newest");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Chemical | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<{ chemical: Chemical; matches: Chemical[] } | null>(null);
  const [duplicateCas, setDuplicateCas] = useState("");
  const [primaryId, setPrimaryId] = useState("");
  const [detailTarget, setDetailTarget] = useState<Chemical | null>(null);
  const [editTarget, setEditTarget] = useState<Chemical | null>(null);
  const [editForm, setEditForm] = useState({ tags: [] as string[], amount: "", location: "" });
  const [tagInput, setTagInput] = useState("");
  const [editTagInput, setEditTagInput] = useState("");
  const [enrichingId, setEnrichingId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSupported, setSettingsSupported] = useState(false);
  const [compToxConfigured, setCompToxConfigured] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [dataBusy, setDataBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const [toast, setToast] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const lastResolvedRef = useRef("");
  const lastPersistedRef = useRef("");
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());
  const t = COPY[language];
  const locale = language === "en" ? "en-US" : "zh-CN";

  /* Loading persisted client data after hydration intentionally updates state. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage === "en" || savedLanguage === "zh") setLanguage(savedLanguage);
    const loadInventory = async () => {
      const legacy = window.localStorage.getItem(STORAGE_KEY);
      try {
        let selected: Chemical[];
        if (window.location.protocol === "pcss:") {
          const response = await fetch("/api/inventory");
          if (!response.ok) throw new Error("inventory_read_failed");
          const stored = await response.json() as { initialized?: boolean; chemicals?: StoredChemical[] };
          if (stored.initialized) selected = (stored.chemicals ?? []).map(migrateChemical);
          else if (legacy) selected = (JSON.parse(legacy) as StoredChemical[]).map(migrateChemical);
          else selected = INITIAL_CHEMICALS;
          if (!stored.initialized) {
            const migrated = await fetch("/api/inventory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chemicals: selected, createBackup: false }) });
            if (!migrated.ok) throw new Error("inventory_migration_failed");
            if (legacy) window.localStorage.removeItem(STORAGE_KEY);
          }
        } else selected = legacy ? (JSON.parse(legacy) as StoredChemical[]).map(migrateChemical) : INITIAL_CHEMICALS;
        lastPersistedRef.current = JSON.stringify(selected);
        setChemicals(selected);
        setHydrated(true);
      } catch {
        setChemicals([]);
        setStorageFailed(true);
        setToast(COPY[savedLanguage === "zh" ? "zh" : "en"].storageError);
      }
    };
    void loadInventory();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated) return;
    const serialized = JSON.stringify(chemicals);
    if (serialized === lastPersistedRef.current) return;
    if (window.location.protocol !== "pcss:") { window.localStorage.setItem(STORAGE_KEY, serialized); return; }
    persistChainRef.current = persistChainRef.current.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch("/api/inventory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chemicals, createBackup: true }) });
          if (!response.ok) throw new Error("inventory_save_failed");
          lastPersistedRef.current = serialized;
          return;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }).catch(() => { setStorageFailed(true); setToast(t.storageError); });
  }, [chemicals, hydrated, t.storageError]);
  useEffect(() => { document.documentElement.lang = language === "en" ? "en" : "zh-CN"; if (hydrated) window.localStorage.setItem(LANGUAGE_KEY, language); }, [language, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2400); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (window.location.protocol !== "pcss:") return;
    fetch("/api/settings/comptox").then((response) => response.ok ? response.json() : null).then((value: { supported?: boolean; configured?: boolean } | null) => {
      setSettingsSupported(Boolean(value?.supported)); setCompToxConfigured(Boolean(value?.configured));
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const cas = form.cas.trim();
    const name = form.name.trim();
    const lookupByCas = isValidCas(cas);
    const lookupByName = !lookupByCas && name.length >= 2;
    if (!lookupByCas && !lookupByName) return;
    const lookupKey = lookupByCas ? `cas:${cas}` : `name:${name.toLocaleLowerCase()}`;
    if (lastResolvedRef.current === lookupKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookup({ status: "loading" });
      try {
        const parameter = lookupByCas ? `cas=${encodeURIComponent(cas)}` : `name=${encodeURIComponent(name)}`;
        const response = await fetch(`/api/chemistry?${parameter}`, { signal: controller.signal });
        if (response.status === 404 || response.status === 400) { setLookup({ status: "not-found" }); return; }
        if (!response.ok) { setLookup({ status: "error" }); return; }
        const compound = await response.json() as LookupResult;
        lastResolvedRef.current = `cas:${compound.cas}`;
        setForm((current) => {
          const unchanged = lookupByCas ? current.cas.trim() === cas : !isValidCas(current.cas.trim()) && current.name.trim() === name;
          return unchanged ? { ...current, name: compound.name, formula: compound.formula, cas: compound.cas } : current;
        });
        setLookup({ status: "success", result: compound });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLookup({ status: "error" });
      }
    }, 650);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.cas, form.name]);
  useEffect(() => { if (modalOpen) nameInputRef.current?.focus(); }, [modalOpen]);

  const allTags = useMemo(() => {
    const labels = new Map<string, string>();
    chemicals.flatMap((chemical) => chemical.tags).forEach((tag) => { const key = tag.toLocaleLowerCase(); if (!labels.has(key)) labels.set(key, tag); });
    return [...labels.values()].sort((a, b) => a.localeCompare(b, locale));
  }, [chemicals, locale]);
  const selectedTags = useMemo(() => field === "tag" ? (selectedFilterTags.length > 0 ? selectedFilterTags : parseTagQuery(query)) : [], [field, query, selectedFilterTags]);
  const selectedTagKeys = new Set(selectedTags.map((tag) => tag.toLocaleLowerCase()));
  const amountSuggestions = useMemo(() => rankFrequentValues(chemicals, "amount", locale), [chemicals, locale]);
  const locationSuggestions = useMemo(() => rankFrequentValues(chemicals, "location", locale), [chemicals, locale]);
  const tagSuggestions = useMemo(() => rankFrequentTags(chemicals, locale), [chemicals, locale]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = chemicals.filter((chemical) => {
      const identifiers = chemical.database?.sources.map((item) => item.identifier ?? "").join(" ") ?? "";
      const values: Record<string, string> = { name: `${chemical.name} ${identifiers}`, cas: chemical.cas, formula: chemical.formula, tag: chemical.tags.join(" "), location: chemical.location };
      if (field === "tag") {
        if (selectedTags.length === 0) return true;
        const ownedTags = new Set(chemical.tags.map((tag) => tag.toLocaleLowerCase()));
        return selectedTags.every((tag) => ownedTags.has(tag.toLocaleLowerCase()));
      }
      if (!normalized) return true;
      return field === "all" ? Object.values(values).some((value) => value.toLocaleLowerCase().includes(normalized)) : values[field].toLocaleLowerCase().includes(normalized);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, locale);
      if (sort === "location") return a.location.localeCompare(b.location, locale);
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [chemicals, query, field, sort, locale, selectedTags]);

  const locations = new Set(chemicals.map((item) => item.location)).size;
  const tags = allTags.length;
  const duplicateGroup = duplicateCas ? chemicals.filter((item) => item.cas.trim() === duplicateCas) : [];

  function changeLanguage(nextLanguage: Language) { setLanguage(nextLanguage); }
  function markStructureNotFound(id: string) {
    if (storageFailed) return;
    setChemicals((current) => current.map((item) => item.id === id && item.structureStatus !== "not-found" ? { ...item, structureStatus: "not-found" } : item));
  }
  function addChemical(chemical: Chemical) {
    if (storageFailed) return;
    setChemicals((current) => [chemical, ...current]); setForm(EMPTY_FORM); setTagInput(""); setLookup({ status: "idle" }); setModalOpen(false); setPendingDuplicate(null); setToast(t.addedToast(chemical.name));
  }
  function submitChemical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chemical: Chemical = { ...form, tags: uniqueTags([...form.tags, tagInput]), id: crypto.randomUUID(), createdAt: new Date().toISOString(), structureUrl: form.structureUrl.trim() || pubChemImage(form.cas.trim()), ...(lookup.result ? { database: lookup.result } : {}) };
    const matches = chemicals.filter((item) => item.cas.trim() === chemical.cas.trim());
    if (matches.length) { setPendingDuplicate({ chemical, matches }); return; }
    addChemical(chemical);
  }
  function confirmDelete() {
    if (!deleteTarget || storageFailed) return;
    setChemicals((current) => current.filter((item) => item.id !== deleteTarget.id)); setToast(t.deletedToast(deleteTarget.name)); setDeleteTarget(null);
  }
  function openAddModal() { setForm(EMPTY_FORM); setTagInput(""); setLookup({ status: "idle" }); setModalOpen(true); }
  function openDuplicateGroup(cas: string, preferredId?: string) {
    const group = chemicals.filter((item) => item.cas.trim() === cas.trim());
    setDuplicateCas(cas.trim()); setPrimaryId(preferredId && group.some((item) => item.id === preferredId) ? preferredId : group[0]?.id ?? "");
  }
  function mergeDuplicateGroup() {
    if (storageFailed) return;
    if (duplicateGroup.length < 2) { setDuplicateCas(""); return; }
    const primary = duplicateGroup.find((item) => item.id === primaryId) ?? duplicateGroup[0];
    const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
    const merged: Chemical = {
      ...primary,
      location: unique(duplicateGroup.map((item) => item.location)).join(" · "),
      amount: unique(duplicateGroup.map((item) => item.amount)).join(" + "),
      tags: uniqueTags(duplicateGroup.flatMap((item) => item.tags)),
      database: primary.database ?? duplicateGroup.find((item) => item.database)?.database,
    };
    const ids = new Set(duplicateGroup.map((item) => item.id));
    setChemicals((current) => current.filter((item) => !ids.has(item.id)).concat(merged).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
    setDuplicateCas(""); setPrimaryId(""); setToast(t.mergedToast(duplicateGroup.length));
  }
  async function enrichChemical(chemical: Chemical) {
    if (storageFailed) return;
    setEnrichingId(chemical.id);
    try {
      const response = await fetch(`/api/chemistry?cas=${encodeURIComponent(chemical.cas)}`);
      if (!response.ok) throw new Error("lookup_failed");
      const database = await response.json() as LookupResult;
      const updated = { ...chemical, name: database.name || chemical.name, formula: database.formula || chemical.formula, database };
      setChemicals((current) => current.map((item) => item.id === chemical.id ? updated : item));
      setDetailTarget(updated);
    } catch { setToast(t.lookupError); }
    finally { setEnrichingId(""); }
  }
  function openEdit(chemical: Chemical) {
    setEditTarget(chemical); setEditTagInput(""); setEditForm({ tags: [...chemical.tags], amount: chemical.amount, location: chemical.location });
  }
  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || storageFailed) return;
    const updated = { ...editTarget, tags: uniqueTags([...editForm.tags, editTagInput]), amount: editForm.amount.trim(), location: editForm.location.trim() };
    setChemicals((current) => current.map((item) => item.id === editTarget.id ? updated : item));
    setEditTarget(null); setToast(t.updatedToast(updated.name));
  }
  async function saveCompToxKey() {
    try {
      const response = await fetch("/api/settings/comptox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
      if (!response.ok) throw new Error("save_failed");
      setCompToxConfigured(true); setApiKey(""); setToast(t.savedKey);
    } catch { setToast(t.settingsError); }
  }
  async function removeCompToxKey() {
    try {
      const response = await fetch("/api/settings/comptox", { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      setCompToxConfigured(false); setApiKey(""); setToast(t.removedKey);
    } catch { setToast(t.settingsError); }
  }
  async function exportInventory(format: "json" | "csv") {
    setDataBusy(true);
    try {
      await persistChainRef.current;
      const response = await fetch("/api/inventory/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) });
      const result = await response.json() as { saved?: boolean; cancelled?: boolean };
      if (!response.ok) throw new Error("export_failed");
      if (result.saved) setToast(t.exportSuccess);
    } catch { setToast(t.dataError); }
    finally { setDataBusy(false); }
  }
  async function importInventory() {
    setDataBusy(true);
    try {
      await persistChainRef.current;
      const response = await fetch("/api/inventory/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }) });
      const result = await response.json() as { imported?: number; cancelled?: boolean; chemicals?: StoredChemical[] };
      if (!response.ok) throw new Error("import_failed");
      if (result.chemicals) {
        const imported = result.chemicals.map(migrateChemical);
        lastPersistedRef.current = JSON.stringify(imported);
        setChemicals(imported);
        setToast(t.importSuccess(result.imported ?? 0));
      }
    } catch { setToast(t.dataError); }
    finally { setDataBusy(false); }
  }
  const sourceLabel = (id: SourceId) => ({ pubchem: "PubChem", chebi: "ChEBI", chembl: "ChEMBL", comptox: "EPA CompTox", unichem: "UniChem" })[id];
  const sourceStatus = (status: SourceResult["status"]) => status === "matched" ? t.matched : status === "not-found" ? t.notFound : status === "key-required" ? t.keyRequired : t.unavailableSource;
  function toggleTagFilter(tag: string) {
    const current = field === "tag" ? selectedTags : [];
    const key = tag.toLocaleLowerCase();
    const next = current.some((item) => item.toLocaleLowerCase() === key) ? current.filter((item) => item.toLocaleLowerCase() !== key) : [...current, tag];
    setField("tag"); setQuery(""); setSelectedFilterTags(next);
  }
  function addFormTag() {
    const next = uniqueTags([...form.tags, tagInput]);
    if (next.length === form.tags.length) { setTagInput(""); return; }
    setForm({ ...form, tags: next }); setTagInput("");
  }
  function addEditTag() {
    const next = uniqueTags([...editForm.tags, editTagInput]);
    if (next.length === editForm.tags.length) { setEditTagInput(""); return; }
    setEditForm({ ...editForm, tags: next }); setEditTagInput("");
  }

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
          {settingsSupported && <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label={t.settings} title={t.settings}>⚙</button>}
          <button className="primary-button" disabled={storageFailed} onClick={openAddModal}><Icon>＋</Icon>{t.add}</button>
        </div>
      </header>
      {storageFailed && <div className="storage-error" role="alert"><strong>{t.storageError}</strong><span>{t.storageRecovery}</span></div>}
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
          <label className="search-control"><Icon>⌕</Icon><input value={query} onChange={(event) => { setQuery(event.target.value); if (field === "tag") setSelectedFilterTags([]); }} placeholder={field === "tag" ? t.tagSearch : t.search} aria-label={field === "tag" ? t.tagSearch : t.search} />{(query || selectedFilterTags.length > 0) && <button onClick={() => { setQuery(""); setSelectedFilterTags([]); }} aria-label={t.clearSearch}>×</button>}</label>
          <label className="select-control"><span>{t.searchScope}</span><select value={field} onChange={(event) => { setField(event.target.value); setSelectedFilterTags([]); }}><option value="all">{t.allFields}</option><option value="name">{t.name}</option><option value="cas">{t.cas}</option><option value="formula">{t.formula}</option><option value="tag">{t.tag}</option><option value="location">{t.location}</option></select></label>
          <label className="select-control"><span>{t.sort}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">{t.newest}</option><option value="name">{t.nameSort}</option><option value="location">{t.locationSort}</option></select></label>
        </div>
        {field === "tag" && <div className="tag-filter-panel"><div><strong>{t.tagLegend}</strong><small>{t.tagLegendCopy}</small></div><div className="tag-filter-list">{allTags.length ? allTags.map((tag) => <button key={tag.toLocaleLowerCase()} className={selectedTagKeys.has(tag.toLocaleLowerCase()) ? "active" : ""} aria-pressed={selectedTagKeys.has(tag.toLocaleLowerCase())} onClick={() => toggleTagFilter(tag)}><span>✓</span>{tag}</button>) : <em>{t.noTags}</em>}</div>{selectedTags.length > 0 && <button className="clear-tag-filter" onClick={() => { setQuery(""); setSelectedFilterTags([]); }}>{t.clearTags}</button>}</div>}
        {results.length > 0 ? (
          <div className="cards">{results.map((chemical) => (
            <div className="card" key={chemical.id} role="button" tabIndex={0} aria-label={`${t.editRecord}: ${chemical.name}`} onClick={() => openEdit(chemical)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openEdit(chemical); } }}>
              <div className="structure-panel">
                <ChemicalStructure chemical={chemical} alt={t.structureAlt(chemical.name)} unavailable={t.unavailable} onNotFound={markStructureNotFound} />
                <button className="delete-button" onClick={(event) => { event.stopPropagation(); setDeleteTarget(chemical); }} aria-label={`${t.deleteEntry}: ${chemical.name}`} title={t.deleteEntry}>×</button><span className="record-id">#{chemical.id.slice(0, 4).toUpperCase()}</span>
              </div>
              <div className="card-body"><div className="tag-row"><div className="tag-list">{chemical.tags.length ? chemical.tags.map((tag) => <span className="tag" key={tag.toLocaleLowerCase()}>{tag}</span>) : <span className="tag tag-empty">{t.untagged}</span>}</div><span className="date">{t.added} {new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(chemical.createdAt))}</span></div><h3>{chemical.name}</h3><p className="formula">{chemical.formula}</p>{chemical.database?.molecularWeight && <p className="molecular-weight">MW {chemical.database.molecularWeight} g/mol <span>· {sourceLabel(chemical.database.molecularWeightSource ?? "pubchem")}</span></p>}
                <dl><div><dt>{t.cas}</dt><dd>{chemical.cas}</dd></div><div><dt>{t.location}</dt><dd>{chemical.location}</dd></div></dl>
                {chemicals.filter((item) => item.cas.trim() === chemical.cas.trim()).length > 1 && <button className="duplicate-link" onClick={(event) => { event.stopPropagation(); openDuplicateGroup(chemical.cas, chemical.id); }}><span>!</span>{t.reviewDuplicates(chemicals.filter((item) => item.cas.trim() === chemical.cas.trim()).length)}<b>›</b></button>}
                <button className="source-summary" onClick={(event) => { event.stopPropagation(); setDetailTarget(chemical); }}><span>{t.sources}</span><strong>{chemical.database ? `${chemical.database.sources.filter((item) => item.status === "matched").length} / 5` : t.noSources}</strong><b>›</b></button>
                <div className="amount"><span>{t.currentStock}</span><strong className={chemical.amount ? "" : "amount-empty"}>{chemical.amount || t.notSpecified}</strong></div>
              </div>
            </div>
          ))}</div>
        ) : chemicals.length === 0 ? <div className="empty-state"><span>⌬</span><h3>{t.noInventory}</h3><p>{t.noInventoryCopy}</p><button disabled={storageFailed} onClick={openAddModal}>{t.addFirst}</button></div> : <div className="empty-state"><span>⌬</span><h3>{t.noMatch}</h3><p>{t.noMatchCopy}</p><button onClick={() => { setQuery(""); setSelectedFilterTags([]); setField("all"); }}>{t.clearFilters}</button></div>}
      </section>
      <footer><span>PCSS / PERSONAL CHEMICAL STORAGE SYSTEM</span><span>{t.safety}</span></footer>
      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title"><button className="modal-close" onClick={() => setModalOpen(false)} aria-label={t.close}>×</button><p className="eyebrow">{t.newRecord}</p><h2 id="add-title">{t.addTitle}</h2><p className="modal-intro">{t.addIntro}</p>
          <form onSubmit={submitChemical}><div className="form-grid">
            <label><span>{t.chemicalName}</span><input ref={nameInputRef} required value={form.name} onChange={(event) => { const resolvedIdentity = lookup.result?.cas === form.cas; lastResolvedRef.current = ""; setLookup({ status: "idle" }); setForm({ ...form, name: event.target.value, ...(resolvedIdentity ? { cas: "", formula: "" } : {}) }); }} placeholder={t.chemicalNameExample} autoComplete="off" /></label>
            <label><span>{t.formulaLabel}</span><input required value={form.formula} onChange={(event) => setForm({ ...form, formula: event.target.value })} placeholder={t.formulaExample} /></label>
            <label className="cas-field"><span>{t.casLabel}</span><input required value={form.cas} onChange={(event) => { const resolvedIdentity = lookup.result?.name === form.name; lastResolvedRef.current = ""; setLookup({ status: "idle" }); setForm({ ...form, cas: event.target.value, ...(resolvedIdentity ? { name: "", formula: "" } : {}) }); }} placeholder={t.casExample} pattern="[0-9]{2,7}-[0-9]{2}-[0-9]" title={t.casHelp} /><small className={`lookup-status ${lookup.status}`}>{lookup.status === "loading" ? t.lookupLoading : lookup.status === "success" ? t.lookupSuccess(lookup.result?.sources.filter((item) => item.status === "matched").length ?? 0, lookup.result?.cid, lookup.result?.cas) : lookup.status === "not-found" ? t.lookupNotFound : lookup.status === "error" ? t.lookupError : t.lookupHint}</small>
              {lookup.result && <span className="lookup-badges">{lookup.result.sources.map((item) => <i key={item.id} className={item.status}>{sourceLabel(item.id)}{item.identifier ? ` · ${item.identifier}` : ""}</i>)}</span>}
            </label>
            <div className="form-field suggestion-field"><label><span>{t.amountLabel} <i>{t.optional}</i></span><input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder={t.amountExample} /></label><QuickSuggestions values={amountSuggestions} label={t.frequentSuggestions} onSelect={(amount) => setForm({ ...form, amount })} /></div>
            <div className="form-field suggestion-field"><label><span>{t.locationLabel}</span><input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder={t.locationExample} /></label><QuickSuggestions values={locationSuggestions} label={t.frequentSuggestions} onSelect={(location) => setForm({ ...form, location })} /></div>
            <div className="form-field full-field"><span className="field-label">{t.tagLabel} <i>{t.optional}</i></span><TagEditor tags={form.tags} value={tagInput} suggestions={tagSuggestions.filter((tag) => !form.tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase()))} label={t.tagLabel} placeholder={t.tagExample} addLabel={t.addTag} suggestionLabel={t.frequentSuggestions} removeLabel={t.removeTag} onChange={setTagInput} onAdd={addFormTag} onRemove={(tag) => setForm({ ...form, tags: form.tags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) })} /></div>
            <label className="full-field"><span>{t.structureLink} <i>{t.optional}</i></span><input type="url" value={form.structureUrl} onChange={(event) => setForm({ ...form, structureUrl: event.target.value })} placeholder={t.structureExample} /></label>
          </div><div className="form-actions"><button type="button" onClick={() => setModalOpen(false)}>{t.cancel}</button><button className="primary-button" type="submit">{t.save}</button></div></form>
        </section>
      </div>}
      {pendingDuplicate && <div className="modal-backdrop modal-layer-top" role="presentation">
        <section className="confirm-modal duplicate-confirm" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-create-title"><span className="warning-icon">!</span><p className="eyebrow">{t.duplicate}</p><h2 id="duplicate-create-title">{t.duplicateCreateTitle}</h2><p>{t.duplicateCreateCopy(pendingDuplicate.chemical.cas, pendingDuplicate.matches.length)}</p>
          <div className="existing-entries"><strong>{t.existingEntries}</strong>{pendingDuplicate.matches.map((item) => <div key={item.id}><span>{item.name}</span><small>{item.amount || t.notSpecified} · {item.location}</small></div>)}</div>
          <div className="form-actions"><button onClick={() => setPendingDuplicate(null)}>{t.cancel}</button><button className="primary-button" onClick={() => addChemical(pendingDuplicate.chemical)}>{t.createAnyway}</button></div>
        </section>
      </div>}
      {duplicateGroup.length > 1 && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDuplicateCas(""); }}>
        <section className="modal duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="duplicates-title"><button className="modal-close" onClick={() => setDuplicateCas("")} aria-label={t.close}>×</button><p className="eyebrow">{t.duplicate}</p><h2 id="duplicates-title">{t.duplicatesTitle(duplicateCas)}</h2><p className="modal-intro">{t.duplicatesCopy}</p>
          <div className="duplicate-records">{duplicateGroup.map((item) => <label className={primaryId === item.id ? "selected" : ""} key={item.id}><input type="radio" name="primary-record" checked={primaryId === item.id} onChange={() => setPrimaryId(item.id)} /><span><strong>{item.name}</strong><small>{item.formula} · {item.amount || t.notSpecified}</small><small>{item.location}</small></span><b>{t.keepAsPrimary}</b></label>)}</div>
          <p className="merge-help">{t.mergeHelp}</p>
          <div className="form-actions"><button onClick={() => setDuplicateCas("")}>{t.cancel}</button><button className="primary-button" onClick={mergeDuplicateGroup}>{t.mergeEntries(duplicateGroup.length)}</button></div>
        </section>
      </div>}
      {editTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditTarget(null); }}>
        <section className="modal edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><button className="modal-close" onClick={() => setEditTarget(null)} aria-label={t.close}>×</button><p className="eyebrow">{t.editRecord}</p><h2 id="edit-title">{editTarget.name}</h2><p className="modal-intro">{t.editIntro}</p>
          <div className="readonly-panel"><strong>{t.readonlyIdentity}</strong><dl><div><dt>{t.chemicalName.replace(" *", "")}</dt><dd>{editTarget.name}</dd></div><div><dt>{t.formula}</dt><dd>{editTarget.formula}</dd></div><div><dt>{t.cas}</dt><dd>{editTarget.cas}</dd></div>{editTarget.database?.molecularWeight && <div><dt>{t.molecularWeight}</dt><dd>{editTarget.database.molecularWeight} g/mol · {sourceLabel(editTarget.database.molecularWeightSource ?? "pubchem")}</dd></div>}</dl>
            {editTarget.database && <div className="readonly-sources">{editTarget.database.sources.filter((item) => item.status === "matched").map((item) => <span key={item.id}>{sourceLabel(item.id)}{item.identifier ? ` · ${item.identifier}` : ""}</span>)}</div>}
          </div>
          <form onSubmit={saveEdit}><div className="form-grid edit-grid"><div className="form-field full-field"><span className="field-label">{t.tagLabel.replace(" *", "")}</span><TagEditor tags={editForm.tags} value={editTagInput} suggestions={tagSuggestions.filter((tag) => !editForm.tags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase()))} label={t.tagLabel} placeholder={t.tagExample} addLabel={t.addTag} suggestionLabel={t.frequentSuggestions} removeLabel={t.removeTag} onChange={setEditTagInput} onAdd={addEditTag} onRemove={(tag) => setEditForm({ ...editForm, tags: editForm.tags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) })} /></div><div className="form-field suggestion-field"><label><span>{t.amountLabel}</span><input value={editForm.amount} onChange={(event) => setEditForm({ ...editForm, amount: event.target.value })} placeholder={t.amountExample} /></label><QuickSuggestions values={amountSuggestions} label={t.frequentSuggestions} onSelect={(amount) => setEditForm({ ...editForm, amount })} /></div><div className="form-field suggestion-field"><label><span>{t.locationLabel}</span><input required value={editForm.location} onChange={(event) => setEditForm({ ...editForm, location: event.target.value })} placeholder={t.locationExample} /></label><QuickSuggestions values={locationSuggestions} label={t.frequentSuggestions} onSelect={(location) => setEditForm({ ...editForm, location })} /></div></div><div className="form-actions"><button type="button" onClick={() => setEditTarget(null)}>{t.cancel}</button><button className="primary-button" type="submit">{t.saveChanges}</button></div></form>
        </section>
      </div>}
      {detailTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailTarget(null); }}>
        <section className="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title"><button className="modal-close" onClick={() => setDetailTarget(null)} aria-label={t.close}>×</button><p className="eyebrow">{detailTarget.cas}</p><h2 id="source-title">{detailTarget.name}</h2><p className="modal-intro">{t.sourceDetails}</p>
          <div className="source-list">{detailTarget.database?.sources.map((item) => <div className={`source-item ${item.status}`} key={item.id}><span className="source-dot" /><div><strong>{sourceLabel(item.id)}</strong><small>{item.identifier || sourceStatus(item.status)}</small></div>{item.url && <a href={item.url} target="_blank" rel="noreferrer" title={t.openRecord}>↗</a>}</div>) ?? <p className="no-source-copy">{t.noSources}</p>}</div>
          {detailTarget.database && <dl className="property-list">
            {detailTarget.database.molecularWeight && <div><dt>{t.molecularWeight}</dt><dd>{detailTarget.database.molecularWeight} g/mol · {sourceLabel(detailTarget.database.molecularWeightSource ?? "pubchem")}</dd></div>}
            {detailTarget.database.exactMass && <div><dt>{t.exactMass}</dt><dd>{detailTarget.database.exactMass}</dd></div>}
            {detailTarget.database.inchiKey && <div><dt>{t.inchiKey}</dt><dd>{detailTarget.database.inchiKey}</dd></div>}
            {detailTarget.database.smiles && <div><dt>{t.smiles}</dt><dd>{detailTarget.database.smiles}</dd></div>}
            <div><dt>{t.lastChecked}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(detailTarget.database.accessedAt))}</dd></div>
          </dl>}
          <div className="form-actions"><button onClick={() => setDetailTarget(null)}>{t.close}</button><button className="primary-button" onClick={() => enrichChemical(detailTarget)} disabled={enrichingId === detailTarget.id}>{enrichingId === detailTarget.id ? t.enriching : t.enrich}</button></div>
        </section>
      </div>}
      {settingsOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label={t.close}>×</button><p className="eyebrow">DATABASE ACCESS</p><h2 id="settings-title">{t.settingsTitle}</h2><p className="modal-intro">{t.settingsIntro}</p>
          <div className={`key-status ${compToxConfigured ? "configured" : ""}`}><span />{compToxConfigured ? t.configured : t.notConfigured}</div>
          <label className="settings-field"><span>{t.apiKey}</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t.apiKeyPlaceholder} /></label>
          <div className="settings-actions">{compToxConfigured && <button onClick={removeCompToxKey}>{t.removeKey}</button>}<button className="primary-button" disabled={!apiKey.trim()} onClick={saveCompToxKey}>{t.saveKey}</button></div>
          <section className="data-management" aria-labelledby="data-title"><p className="eyebrow">DATA &amp; BACKUP</p><h3 id="data-title">{t.dataTitle}</h3><p>{t.dataIntro}</p><div><button disabled={dataBusy} onClick={() => exportInventory("json")}>{t.exportJSON}</button><button disabled={dataBusy} onClick={() => exportInventory("csv")}>{t.exportCSV}</button><button className="primary-button" disabled={dataBusy} onClick={importInventory}>{t.importData}</button></div></section>
        </section>
      </div>}
      {deleteTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><span className="warning-icon">!</span><h2 id="delete-title">{t.deleteTitle(deleteTarget.name)}</h2><p>{t.deleteCopy}</p><div className="form-actions"><button onClick={() => setDeleteTarget(null)}>{t.cancel}</button><button className="danger-button" onClick={confirmDelete}>{t.confirmDelete}</button></div></section></div>}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
