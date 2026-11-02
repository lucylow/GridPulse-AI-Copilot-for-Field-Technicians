import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ChevronLeft,
  CircleHelp, Database, Filter, GitBranch, HardDriveUpload, Layers3, ListFilter,
  LoaderCircle, Play, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Table2, Tag, Workflow,
} from 'lucide-react';
import {
  getGetDataCatalogQueryKey, getGetDatasetLineageQueryKey, getGetDatasetQueryKey,
  getGetDataObservabilityQueryKey, getListDataSetsQueryKey, getListDatasetVersionsQueryKey,
  getPreviewDatasetQueryKey, useAskDataAnalyst, useExecuteDataPipeline, useGetDataCatalog,
  useGetDataset, useGetDatasetLineage, useGetDataObservability, useImportDataset,
  useListDataSets, useListDatasetVersions, usePreviewDataset, useRunQualityCheck,
  useUpdateDatasetMetadata,
} from '@workspace/api-client-react';
import type { DataAnalystResult, DatasetMetadataUpdate, PipelineRun, QualityReport } from '@workspace/api-client-react';

const dateText = (value?: string) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const countText = (value?: number) => typeof value === 'number' ? value.toLocaleString() : '—';
const stateBadge = (status: string) => `badge ${['pass', 'active', 'succeeded', 'healthy'].includes(status.toLowerCase()) ? 'badge-green' : ['failed', 'attention', 'warning'].includes(status.toLowerCase()) ? 'badge-amber' : ''}`;

function DataHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-intro">{description}</p></div>{actions}</header>;
}
function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3 p-5" role="status" aria-label="Loading synthetic data"><div className="skeleton h-8 w-2/5" />{Array.from({ length: count }, (_, i) => <div className="skeleton h-12 w-full" key={i} />)}</div>;
}
function ErrorPanel({ retry }: { retry: () => void }) {
  return <div className="flex items-center gap-3 p-5 text-sm" role="alert"><AlertCircle size={18} className="text-[hsl(var(--destructive))]" /><div className="flex-1"><strong className="block">Data service unavailable</strong><span className="text-muted-foreground">The request did not return a usable synthetic data response.</span></div><button className="button-secondary" type="button" onClick={retry}><RefreshCw size={14} /> Retry</button></div>;
}
function SimNote({ children = 'Synthetic training records only · no live utility data or operational connection.' }: { children?: string }) {
  return <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--accent)/.25)] bg-[hsl(var(--accent)/.06)] p-3 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" size={14} />{children}</div>;
}
function MiniStat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <article className="panel p-4"><div className="eyebrow !text-[9px]">{label}</div><div className="mt-2 font-serif text-2xl tracking-tight">{value}</div><div className="mt-1 text-[11px] text-muted-foreground">{note}</div></article>;
}

export function DataCatalog() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<'catalog' | 'pipeline' | 'query'>('catalog');
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState('');
  const [importCategory, setImportCategory] = useState('Operations');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [question, setQuestion] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [pipelineName, setPipelineName] = useState('Analyst review extract');
  const [pipelineSource, setPipelineSource] = useState('');
  const catalog = useGetDataCatalog();
  const observability = useGetDataObservability();
  const params = useMemo(() => ({ search: search.trim() || undefined, category: category || undefined, page, pageSize: 8 }), [search, category, page]);
  const datasets = useListDataSets(params);
  const importMutation = useImportDataset();
  const pipelineMutation = useExecuteDataPipeline();
  const analystMutation = useAskDataAnalyst();
  const available = datasets.data?.items ?? [];
  const pipelineDataset = available.find(d => d.id === pipelineSource) ?? available[0];
  const analystDataset = available.find(d => d.id === selectedId) ?? available[0];
  const invalidateData = () => {
    void client.invalidateQueries({ queryKey: getGetDataCatalogQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDataObservabilityQueryKey() });
    void client.invalidateQueries({ queryKey: getListDataSetsQueryKey() });
  };
  async function handleImport(event: FormEvent) {
    event.preventDefault();
    if (!importName.trim() || !csvText.trim()) return;
    importMutation.mutate({ data: { name: importName.trim(), category: importCategory, csvText, sourceFileName: fileName || undefined, description: 'Imported synthetic analyst dataset.' } }, {
      onSuccess: result => {
        invalidateData();
        setImportOpen(false);
        setImportName(''); setCsvText(''); setFileName('');
        setSelectedId(result.dataset.id);
      },
    });
  }
  function runPipeline() {
    const dataset = pipelineDataset;
    if (!dataset) return;
    setPipelineSource(dataset.id);
    pipelineMutation.mutate({ data: { sourceDatasetId: dataset.id, name: pipelineName.trim() || 'Synthetic data pipeline', steps: [{ operation: 'remove_duplicates' }] } }, { onSuccess: invalidateData });
  }
  function askQuestion(event: FormEvent) {
    event.preventDefault();
    if (!analystDataset || !question.trim()) return;
    analystMutation.mutate({ data: { datasetId: analystDataset.id, question: question.trim() } });
  }
  return <div className="reveal">
    <DataHeader eyebrow="Workspace / 06 · Synthetic data" title="Data, with its trail intact." description="Catalog synthetic records, inspect quality, and run deterministic analyst workflows. Every source and transformation stays visible." actions={<button type="button" className="button-primary" onClick={() => setImportOpen(v => !v)} data-testid="button-open-import"><HardDriveUpload size={15} /> Import records</button>} />
    <div className="mb-5"><SimNote /></div>
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MiniStat label="Catalog datasets" value={catalog.isLoading ? '…' : countText(catalog.data?.datasetCount)} note={`${catalog.data?.activeCount ?? 0} active · synthetic only`} />
      <MiniStat label="Records indexed" value={catalog.isLoading ? '…' : countText(catalog.data?.totalRecords)} note="Across training datasets" />
      <MiniStat label="Quality attention" value={catalog.isLoading ? '…' : countText(catalog.data?.qualityFailures)} note="Datasets with reported failures" />
      <MiniStat label="Observability" value={observability.isLoading ? '…' : observability.data?.status ?? '—'} note={`${observability.data?.staleDatasets ?? 0} stale · ${observability.data?.recentImports ?? 0} recent imports`} />
    </div>
    {(catalog.isError || observability.isError) && <section className="panel mb-5"><ErrorPanel retry={() => { void catalog.refetch(); void observability.refetch(); }} /></section>}
    <section className="panel mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div><div className="eyebrow">Synthetic data workspace</div><h2 className="mt-1 panel-title">Catalog &amp; tools</h2></div>
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-[hsl(var(--background))] p-1" role="tablist" aria-label="Data workspace tools">
          {([['catalog', 'Catalog', Database], ['pipeline', 'Pipeline', Workflow], ['query', 'Analyst query', Sparkles]] as const).map(([key, label, Icon]) => <button key={key} className={`tool-tab ${mode === key ? 'active' : ''}`} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)} data-testid={`tab-data-${key}`}><Icon size={13} />{label}</button>)}
        </div>
      </div>
      {mode === 'catalog' ? <>
        <div className="data-filterbar">
          <label className="relative min-w-[200px] flex-1"><span className="sr-only">Search synthetic datasets</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="field !pl-9" type="search" placeholder="Search name, owner, source…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} data-testid="input-data-search" /></label>
          <label className="flex min-w-[155px] items-center gap-2"><span className="sr-only">Filter category</span><Filter size={14} className="text-muted-foreground" /><select className="field" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} data-testid="select-data-category"><option value="">All categories</option>{[...new Set([...(datasets.data?.items ?? []).map(x => x.category)])].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <span className="badge"><ListFilter size={12} /> {datasets.data?.total ?? 0} indexed</span>
        </div>
        {datasets.isLoading ? <LoadingRows /> : datasets.isError ? <ErrorPanel retry={() => void datasets.refetch()} /> : available.length ? <div className="divide-y divide-border">
          {available.map((dataset, index) => <Link href={`/data/${encodeURIComponent(dataset.id)}`} key={dataset.id} className="dataset-row" data-testid={`link-dataset-${dataset.id}`}>
            <span className="dataset-index mono">{String((page - 1) * 8 + index + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm">{dataset.name}</strong><span className={stateBadge(dataset.qualityStatus)}>{dataset.qualityStatus}</span><span className="badge">{dataset.status}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{dataset.description}</span><span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] text-muted-foreground"><span>{dataset.category}</span><span>{dataset.sourceSystem}</span><span>{dataset.latestVersion}</span></span></span>
            <span className="hidden min-w-[100px] text-right sm:block"><strong className="block font-mono text-sm">{countText(dataset.recordCount)}</strong><span className="text-[10px] text-muted-foreground">records</span></span><ArrowRight className="shrink-0 text-muted-foreground" size={16} />
          </Link>)}
          <div className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground"><span>Page {datasets.data?.page ?? page} · {datasets.data?.total ?? 0} synthetic datasets</span><div className="flex gap-2"><button type="button" className="button-secondary !px-3 !py-2" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} data-testid="button-data-previous">Previous</button><button type="button" className="button-secondary !px-3 !py-2" disabled={page * 8 >= (datasets.data?.total ?? 0)} onClick={() => setPage(p => p + 1)} data-testid="button-data-next">Next</button></div></div>
        </div> : <div className="p-3"><div className="empty-data"><Database size={23} /><h3>No synthetic datasets match</h3><p>Try a broader search or import a small CSV training sample.</p><button className="button-secondary" type="button" onClick={() => { setSearch(''); setCategory(''); }} data-testid="button-clear-data-filters">Clear filters</button></div></div>}
      </> : mode === 'pipeline' ? <div className="grid gap-0 md:grid-cols-[.9fr_1.1fr]">
        <form className="space-y-4 border-b border-border p-5 md:border-b-0 md:border-r" onSubmit={e => { e.preventDefault(); runPipeline(); }}>
          <div className="eyebrow">Deterministic execution</div><h3 className="font-serif text-xl">Build a clean extract.</h3><p className="text-xs leading-5 text-muted-foreground">Run the supported deduplication transform against synthetic records. The output is a training artifact, never an operational feed.</p>
          <label className="block text-xs font-semibold">Source dataset<select className="field mt-2" value={pipelineDataset?.id ?? ''} onChange={e => setPipelineSource(e.target.value)} data-testid="select-pipeline-source"><option value="" disabled>Select dataset</option>{available.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label>
          <label className="block text-xs font-semibold">Run label<input className="field mt-2" value={pipelineName} onChange={e => setPipelineName(e.target.value)} maxLength={100} data-testid="input-pipeline-name" /></label>
          <div className="rounded-md border border-border bg-[hsl(var(--background))] p-3"><div className="eyebrow">Step 01</div><div className="mt-2 flex items-center gap-2 text-xs"><Layers3 size={14} className="text-[hsl(var(--primary))]" /> Remove duplicate rows <span className="ml-auto badge">deterministic</span></div></div>
          <button className="button-primary" type="submit" disabled={!pipelineDataset || pipelineMutation.isPending} data-testid="button-run-pipeline">{pipelineMutation.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <Play size={14} />} Run pipeline</button>
          {pipelineMutation.isError && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">Pipeline did not complete. Confirm the source selection and retry.</p>}
        </form>
        <div className="p-5"><div className="eyebrow">Latest run</div>{pipelineMutation.data ? <PipelineResult run={pipelineMutation.data} /> : <div className="empty-data min-h-[250px]"><Workflow size={23} /><h3>Awaiting a run</h3><p>Execution summary and output lineage will appear here after the API returns a result.</p></div>}<div className="mt-4"><SimNote /></div></div>
      </div> : <div className="grid gap-0 md:grid-cols-[.88fr_1.12fr]">
        <form className="space-y-4 border-b border-border p-5 md:border-b-0 md:border-r" onSubmit={askQuestion}>
          <div className="eyebrow">Bounded, deterministic analysis</div><h3 className="font-serif text-xl">Ask the records a question.</h3><p className="text-xs leading-5 text-muted-foreground">Answers include the method, inspected evidence, examined row count, and known limitations.</p>
          <label className="block text-xs font-semibold">Dataset<select className="field mt-2" value={analystDataset?.id ?? ''} onChange={e => setSelectedId(e.target.value)} data-testid="select-analyst-dataset"><option value="" disabled>Select dataset</option>{available.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label>
          <label className="block text-xs font-semibold">Question<textarea className="field mt-2 min-h-24 resize-y" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Which records have a missing status value?" maxLength={500} data-testid="input-analyst-question" /></label>
          <button type="submit" className="button-primary" disabled={!analystDataset || !question.trim() || analystMutation.isPending} data-testid="button-ask-analyst">{analystMutation.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={14} />} Ask synthetic analyst</button>
          {analystMutation.isError && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">The analyst request failed. Edit the question and retry.</p>}
        </form>
        <div className="p-5"><div className="eyebrow">Evidence-first response</div>{analystMutation.data ? <AnalystResult result={analystMutation.data} /> : <div className="empty-data min-h-[250px]"><CircleHelp size={23} /><h3>No answer generated</h3><p>Ask a question to receive an inspectable, synthetic result.</p></div>}<div className="mt-4"><SimNote /></div></div>
      </div>}
    </section>
    {importOpen && <section className="panel mb-5 overflow-hidden" aria-label="Import synthetic CSV">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="eyebrow">Synthetic record intake</div><h2 className="mt-1 panel-title">Import a CSV sample</h2></div><button type="button" className="button-secondary" onClick={() => setImportOpen(false)} data-testid="button-close-import">Close</button></div>
      <form onSubmit={handleImport} className="grid gap-4 p-5 md:grid-cols-2">
        <label className="text-xs font-semibold">Dataset name<input className="field mt-2" value={importName} onChange={e => setImportName(e.target.value)} required maxLength={100} data-testid="input-import-name" /></label>
        <label className="text-xs font-semibold">Category<input className="field mt-2" value={importCategory} onChange={e => setImportCategory(e.target.value)} required maxLength={80} data-testid="input-import-category" /></label>
        <label className="md:col-span-2 text-xs font-semibold">CSV file<input className="field mt-2" type="file" accept=".csv,text/csv" data-testid="input-import-file" onChange={e => { const file = e.target.files?.[0]; if (!file) return; setFileName(file.name); void file.text().then(setCsvText); }} /></label>
        <label className="md:col-span-2 text-xs font-semibold">CSV content<textarea className="field mt-2 min-h-32 font-mono text-[11px]" value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="asset_id,status,observed_at&#10;SYN-014,review,2025-01-12" required data-testid="input-import-csv" /></label>
        <div className="md:col-span-2"><SimNote>Only synthetic training records may be imported. Do not submit utility, customer, or other real operational data.</SimNote></div>
        {importMutation.isError && <p role="alert" className="md:col-span-2 text-xs text-[hsl(var(--destructive))]">Import failed. Check the CSV header and retry.</p>}
        {importMutation.data && <p className="md:col-span-2 text-xs text-[hsl(var(--primary))]" role="status">Imported {countText(importMutation.data.importedRecords)} synthetic rows; {countText(importMutation.data.rejectedRecords)} rejected.</p>}
        <div className="md:col-span-2 flex justify-end"><button className="button-primary" type="submit" disabled={importMutation.isPending || !csvText.trim()} data-testid="button-submit-import">{importMutation.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <HardDriveUpload size={14} />} Import synthetic data</button></div>
      </form>
    </section>}
    {catalog.data?.recentEvents?.length ? <section className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-4"><div className="eyebrow">Observable lineage</div><h2 className="mt-1 panel-title">Recent synthetic data events</h2></div>
      <div className="divide-y divide-border">{catalog.data.recentEvents.slice(0, 5).map(event => <div className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center" key={event.id} data-testid={`lineage-event-${event.id}`}><div className="flex items-start gap-3"><GitBranch size={15} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /><div><p className="text-xs font-medium">{event.sourceLabel} <ArrowRight size={12} className="inline" /> {event.targetLabel}</p><p className="mt-1 text-xs text-muted-foreground">{event.detail}</p></div></div><span className="font-mono text-[9px] text-muted-foreground">{event.relation} · {dateText(event.createdAt)}</span></div>)}</div>
    </section> : null}
  </div>;
}

function PipelineResult({ run }: { run: PipelineRun }) {
  return <article className="mt-4 border-l-2 border-[hsl(var(--primary))] bg-[hsl(var(--background))] p-4" data-testid="pipeline-run-result">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{run.name}</h3><span className={stateBadge(run.status)}>{run.status}</span></div>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{run.message}</p>
    <div className="mt-4 grid grid-cols-2 gap-2"><MiniStat label="Processed" value={countText(run.recordsProcessed)} note="Synthetic rows" /><MiniStat label="Rejected" value={countText(run.recordsRejected)} note={`${run.durationMs} ms`} /></div>
    <div className="mt-3 flex items-center gap-2 font-mono text-[9px] text-muted-foreground"><ArrowDownRight size={13} />{run.sourceDatasetId}<ArrowRight size={13} />{run.outputDatasetId ?? 'No output dataset'}</div>
  </article>;
}
function AnalystResult({ result }: { result: DataAnalystResult }) {
  return <article className="mt-4 space-y-4" data-testid="analyst-result">
    <div className="rounded-md border border-[hsl(var(--primary)/.28)] bg-[hsl(var(--primary)/.06)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="badge badge-green">Synthetic answer</span><span className="font-mono text-[9px] text-muted-foreground">v{result.datasetVersion} · {countText(result.rowsExamined)} rows examined</span></div><p className="mt-3 text-sm leading-6">{result.answer}</p></div>
    <div><div className="eyebrow">Method</div><p className="mt-1 text-xs leading-5">{result.method}</p></div>
    <EvidenceList heading="Evidence" items={result.evidence} />
    <EvidenceList heading="Limitations" items={result.limitations} />
    <div className="font-mono text-[9px] text-muted-foreground">Generated {dateText(result.generatedAt)} · {result.datasetName}</div>
  </article>;
}
function EvidenceList({ heading, items }: { heading: string; items: string[] }) {
  return <div><div className="eyebrow">{heading}</div>{items.length ? <ul className="mt-2 space-y-1.5">{items.map((item, i) => <li className="flex gap-2 text-xs leading-5 text-muted-foreground" key={`${item}-${i}`}><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--accent))]" />{item}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">No additional details returned.</p>}</div>;
}

export function DatasetDetailPage() {
  const { datasetId = '' } = useParams<{ datasetId: string }>();
  const client = useQueryClient();
  const [tab, setTab] = useState<'preview' | 'schema' | 'quality' | 'lineage'>('preview');
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState('');
  const [description, setDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [classification, setClassification] = useState<DatasetMetadataUpdate['classification']>('internal_synthetic');
  const [retention, setRetention] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [analystQuestion, setAnalystQuestion] = useState('');
  const [analystResult, setAnalystResult] = useState<DataAnalystResult | null>(null);
  const detail = useGetDataset(datasetId, { query: { enabled: !!datasetId, queryKey: getGetDatasetQueryKey(datasetId) } });
  const previewParams = useMemo(() => ({ datasetId, page: 1, pageSize: 10 }), [datasetId]);
  const preview = usePreviewDataset(previewParams, { query: { enabled: !!datasetId, queryKey: getPreviewDatasetQueryKey(previewParams) } });
  const versions = useListDatasetVersions(datasetId, { query: { enabled: !!datasetId, queryKey: getListDatasetVersionsQueryKey(datasetId) } });
  const lineage = useGetDatasetLineage(datasetId, { query: { enabled: !!datasetId, queryKey: getGetDatasetLineageQueryKey(datasetId) } });
  const update = useUpdateDatasetMetadata();
  const qualityCheck = useRunQualityCheck();
  const analyst = useAskDataAnalyst();
  const dataset = detail.data?.dataset;
  const rows = preview.data?.records?.length ? preview.data.records : detail.data?.sampleRecords ?? [];
  const columns = dataset?.columns ?? [];
  const keys = rows.length ? Object.keys(rows[0]) : columns.map(col => col.name);
  function startEdit() {
    setOwner(dataset?.owner ?? '');
    setDescription(dataset?.description ?? '');
    setEditCategory(dataset?.category ?? '');
    setClassification((dataset?.classification as DatasetMetadataUpdate['classification']) ?? 'internal_synthetic');
    setRetention(dataset?.retentionCategory ?? '');
    setTagsText(dataset?.tags.join(', ') ?? '');
    setEditing(true);
  }
  function saveMetadata(event: FormEvent) {
    event.preventDefault();
    const data: DatasetMetadataUpdate = {
      owner: owner.trim(),
      description: description.trim(),
      category: editCategory.trim(),
      classification,
      retentionCategory: retention.trim(),
      tags: tagsText.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20),
    };
    update.mutate({ datasetId, data }, { onSuccess: () => {
      void client.invalidateQueries({ queryKey: getGetDatasetQueryKey(datasetId) });
      void client.invalidateQueries({ queryKey: getListDataSetsQueryKey() });
      setEditing(false);
    } });
  }
  function runQuality() {
    qualityCheck.mutate({ datasetId }, { onSuccess: result => {
      setQuality(result);
      void client.invalidateQueries({ queryKey: getListDatasetVersionsQueryKey(datasetId) });
      void client.invalidateQueries({ queryKey: getListDataSetsQueryKey() });
    } });
  }
  function askData(event: FormEvent) {
    event.preventDefault();
    if (!analystQuestion.trim()) return;
    analyst.mutate({ data: { datasetId, question: analystQuestion.trim() } }, { onSuccess: setAnalystResult });
  }
  if (detail.isLoading) return <div className="panel"><LoadingRows count={5} /></div>;
  if (detail.isError || !dataset) return <section className="panel"><ErrorPanel retry={() => void detail.refetch()} /></section>;
  return <div className="reveal">
    <Link href="/data" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground no-underline hover:text-foreground" data-testid="link-back-data"><ChevronLeft size={14} /> Back to data catalog</Link>
    <DataHeader eyebrow={`Synthetic dataset / ${dataset.id}`} title={dataset.name} description={dataset.description} actions={<div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={startEdit} data-testid="button-edit-metadata"><SlidersHorizontal size={14} /> Edit metadata</button><button type="button" className="button-primary" onClick={runQuality} disabled={qualityCheck.isPending} data-testid="button-run-quality">{qualityCheck.isPending ? <LoaderCircle className="animate-spin" size={14} /> : <Activity size={14} />} Run quality check</button></div>} />
    <div className="mb-5"><SimNote /></div>
    <section className="panel mb-5 overflow-hidden">
      <div className="dataset-meta-grid">
        <Meta label="Classification" value={dataset.classification} /><Meta label="Source system" value={dataset.sourceSystem} /><Meta label="Owner" value={dataset.owner} /><Meta label="Retention" value={dataset.retentionCategory} /><Meta label="Update frequency" value={dataset.updateFrequency} /><Meta label="Version / schema" value={`${dataset.latestVersion} / ${dataset.schemaVersion}`} /><Meta label="Quality status" value={dataset.qualityStatus} status /><Meta label="Updated" value={dateText(dataset.updatedAt)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3"><Tag size={13} className="text-muted-foreground" />{dataset.tags.map(tag => <span className="badge" key={tag}>{tag}</span>)}</div>
    </section>
    {editing && <form className="panel mb-5 grid gap-4 p-5 md:grid-cols-2" onSubmit={saveMetadata} aria-label="Edit dataset metadata">
      <div className="md:col-span-2"><div className="eyebrow">Metadata editor</div><h2 className="mt-1 panel-title">Update the catalog record</h2></div>
      <label className="text-xs font-semibold">Owner<input className="field mt-2" value={owner} onChange={e => setOwner(e.target.value)} maxLength={120} data-testid="input-dataset-owner" /></label>
      <label className="text-xs font-semibold">Description<input className="field mt-2" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} data-testid="input-dataset-description" /></label>
      <label className="text-xs font-semibold">Category<input className="field mt-2" value={editCategory} onChange={e => setEditCategory(e.target.value)} maxLength={80} data-testid="input-dataset-category" /></label>
      <label className="text-xs font-semibold">Classification<select className="field mt-2" value={classification} onChange={e => setClassification(e.target.value as DatasetMetadataUpdate['classification'])} data-testid="select-dataset-classification"><option value="public_demo">Public demo</option><option value="internal_synthetic">Internal synthetic</option><option value="restricted_demo">Restricted demo</option><option value="confidential_test">Confidential test</option></select></label>
      <label className="text-xs font-semibold">Retention category<input className="field mt-2" value={retention} onChange={e => setRetention(e.target.value)} maxLength={80} data-testid="input-dataset-retention" /></label>
      <label className="text-xs font-semibold">Tags <span className="font-normal text-muted-foreground">comma separated</span><input className="field mt-2" value={tagsText} onChange={e => setTagsText(e.target.value)} maxLength={400} data-testid="input-dataset-tags" /></label>
      {update.isError && <p role="alert" className="text-xs text-[hsl(var(--destructive))]">Metadata update failed. Please retry.</p>}
      <div className="flex justify-end gap-2 md:col-span-2"><button type="button" className="button-secondary" onClick={() => setEditing(false)} data-testid="button-cancel-metadata">Cancel</button><button type="submit" className="button-primary" disabled={update.isPending} data-testid="button-save-metadata">{update.isPending ? 'Saving…' : 'Save metadata'}</button></div>
    </form>}
    <div className="grid gap-5 xl:grid-cols-[1fr_310px]">
      <section className="panel min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><div className="eyebrow">Dataset record</div><h2 className="mt-1 panel-title">Inspect the asset</h2></div><div className="flex flex-wrap gap-1 rounded-md border border-border bg-[hsl(var(--background))] p-1" role="tablist" aria-label="Dataset views">{([['preview', 'Preview'], ['schema', 'Schema'], ['quality', 'Quality'], ['lineage', 'Lineage']] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} className={`tool-tab ${tab === key ? 'active' : ''}`} key={key} onClick={() => setTab(key)} data-testid={`tab-dataset-${key}`}>{label}</button>)}</div></div>
        {tab === 'preview' && (
          preview.isLoading ? <LoadingRows count={4} /> : preview.isError ? <ErrorPanel retry={() => void preview.refetch()} /> :
          <div className="overflow-x-auto">
            <div className="border-b border-border px-5 py-3 text-xs text-muted-foreground">First {rows.length} sample rows · synthetic values · {countText(dataset.recordCount)} total records</div>
            {rows.length ? <table className="data-table"><thead><tr>{keys.map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{keys.map(key => <td key={key}>{formatCell(row[key])}</td>)}</tr>)}</tbody></table> : <div className="empty-data"><Table2 size={22} /><h3>No sample rows available</h3><p>This dataset has no preview records yet.</p></div>}
          </div>
        )}
        {tab === 'schema' && (
          <div className="divide-y divide-border">{columns.length ? columns.map(col => <div className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_120px_90px] sm:items-center" key={col.name}><div><div className="font-mono text-xs">{col.name}</div><p className="mt-1 text-xs text-muted-foreground">{col.description || 'No field description supplied.'}</p></div><span className="badge w-fit">{col.type}</span><span className="font-mono text-[9px] text-muted-foreground">{col.nullable ? 'NULLABLE' : 'REQUIRED'}</span></div>) : <div className="empty-data"><Table2 size={22} /><h3>Schema unavailable</h3><p>The catalog has not returned a column definition.</p></div>}</div>
        )}
        {tab === 'quality' && (
          <div className="p-5">
            {quality ? <QualityPanel report={quality} /> : <QualityPanel report={null} status={dataset.qualityStatus} onRun={runQuality} busy={qualityCheck.isPending} error={qualityCheck.isError} />}
            {versions.isError && <div className="mt-4"><ErrorPanel retry={() => void versions.refetch()} /></div>}
            <div className="mt-6"><div className="eyebrow mb-2">Version history</div>{versions.isLoading ? <LoadingRows count={2} /> : versions.data?.length ? <div className="divide-y divide-border rounded-md border border-border">{versions.data.map(v => <div className="grid gap-2 p-3 sm:grid-cols-[90px_1fr_auto] sm:items-center" key={v.id} data-testid={`dataset-version-${v.id}`}><span className="font-mono text-xs">v{v.version}</span><span className="text-xs text-muted-foreground">{v.changeSummary}<span className="mt-1 block font-mono text-[9px]">{countText(v.recordCount)} rows · schema {v.schemaVersion} · {dateText(v.createdAt)}</span></span><span className={stateBadge(v.qualityStatus)}>{v.qualityStatus}</span></div>)}</div> : <p className="text-xs text-muted-foreground">No version history returned.</p>}</div>
          </div>
        )}
        {tab === 'lineage' && (
          lineage.isLoading ? <LoadingRows count={3} /> : lineage.isError ? <ErrorPanel retry={() => void lineage.refetch()} /> : lineage.data?.length ? <div className="divide-y divide-border">{lineage.data.map(event => <div key={event.id} className="flex gap-3 p-5" data-testid={`dataset-lineage-${event.id}`}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]"><GitBranch size={15} /></div><div className="min-w-0"><p className="text-xs font-semibold">{event.sourceLabel} <ArrowRight size={12} className="inline" /> {event.targetLabel}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{event.detail}</p><span className="mt-2 block font-mono text-[9px] text-muted-foreground">{event.relation} · {dateText(event.createdAt)}</span></div></div>)}</div> : <div className="empty-data"><GitBranch size={22} /><h3>No lineage events</h3><p>No transformation history has been recorded for this dataset.</p></div>
        )}
      </section>
      <aside className="space-y-5">
        <section className="panel overflow-hidden"><div className="border-b border-border px-4 py-4"><div className="eyebrow">Current snapshot</div><h2 className="mt-1 panel-title">Record profile</h2></div><div className="space-y-3 p-4"><ProfileRow label="Record count" value={countText(dataset.recordCount)} /><ProfileRow label="Fields" value={String(columns.length)} /><ProfileRow label="Created" value={dateText(dataset.createdAt)} /><ProfileRow label="Last updated" value={dateText(dataset.updatedAt)} /><ProfileRow label="Category" value={dataset.category} /></div></section>
        <section className="panel p-4"><div className="eyebrow">Ask this dataset</div><h2 className="mt-1 panel-title">Analyst query</h2><form onSubmit={askData} className="mt-3 space-y-3"><label className="sr-only" htmlFor="detail-analyst-question">Question about this synthetic dataset</label><textarea id="detail-analyst-question" className="field min-h-24 resize-y" placeholder="Ask a bounded question about the records…" value={analystQuestion} onChange={e => setAnalystQuestion(e.target.value)} maxLength={500} data-testid="input-detail-analyst-question" /><button className="button-secondary w-full justify-center" type="submit" disabled={!analystQuestion.trim() || analyst.isPending} data-testid="button-detail-analyst">{analyst.isPending ? 'Analyzing…' : <><Sparkles size={13} /> Ask deterministic analyst</>}</button></form>{analyst.isError && <p className="mt-2 text-xs text-[hsl(var(--destructive))]" role="alert">Query failed. Retry with a narrower question.</p>}{analystResult && <div className="mt-4 border-t border-border pt-3"><p className="text-xs leading-5">{analystResult.answer}</p><EvidenceList heading="Evidence" items={analystResult.evidence} /><p className="mt-2 font-mono text-[9px] text-muted-foreground">{analystResult.rowsExamined} rows examined · v{analystResult.datasetVersion}</p></div>}<div className="mt-3"><SimNote /></div></section>
      </aside>
    </div>
  </div>;
}
function Meta({ label, value, status }: { label: string; value: string; status?: boolean }) {
  return <div className="min-w-0"><div className="eyebrow !text-[9px]">{label}</div>{status ? <span className={`mt-2 ${stateBadge(value)}`}>{value}</span> : <div className="mt-1 truncate text-xs font-medium" title={value}>{value}</div>}</div>;
}
function ProfileRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 last:border-0 last:pb-0"><span className="text-[10px] text-muted-foreground">{label}</span><span className="max-w-[60%] text-right font-mono text-[9px]">{value}</span></div>;
}
function QualityPanel({ report, status, onRun, busy, error }: { report: QualityReport | null; status?: string; onRun?: () => void; busy?: boolean; error?: boolean }) {
  if (!report) return <div><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Current status</div><span className={`mt-2 ${stateBadge(status ?? 'unverified')}`}>{status ?? 'unverified'}</span></div>{onRun && <button className="button-secondary" type="button" onClick={onRun} disabled={busy} data-testid="button-quality-empty">{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Activity size={14} />} Run quality check</button>}</div>{error && <p className="mt-3 text-xs text-[hsl(var(--destructive))]" role="alert">Quality request failed. Please retry.</p>}<div className="empty-data min-h-[165px]"><Activity size={22} /><h3>No report generated</h3><p>Run a check to inspect the synthetic dataset’s dimensions and flagged values.</p></div></div>;
  return <div data-testid="quality-report"><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><MiniStat label="Checked" value={countText(report.recordsChecked)} note={`Version ${report.version}`} /><MiniStat label="Passed" value={countText(report.passedRecords)} note="Records meeting checks" /><MiniStat label="Failed" value={countText(report.failedRecords)} note="Records flagged" /><MiniStat label="Failure rate" value={`${(report.failureRate * 100).toFixed(1)}%`} note="Reported by API" /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{report.accuracyNote}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{report.dimensions.map(item => <div className="rounded-md border border-border p-3" key={item.name}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{item.name}</span><span className={stateBadge(item.status)}>{item.status}</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.details}</p></div>)}</div>{report.issues.length ? <div className="mt-5"><div className="eyebrow mb-2">Flagged issues</div><div className="divide-y divide-border rounded-md border border-border">{report.issues.map((issue, i) => <div className="grid gap-1 p-3 sm:grid-cols-[1fr_auto] sm:items-center" key={`${issue.field}-${i}`}><div><strong className="font-mono text-xs">{issue.field}</strong><p className="mt-1 text-xs text-muted-foreground">{issue.rule}{issue.sampleValue ? ` · Example: ${issue.sampleValue}` : ''}</p></div><span className={stateBadge(issue.severity)}>{issue.severity} · {issue.failedRecords}</span></div>)}</div></div> : null}<p className="mt-3 font-mono text-[9px] text-muted-foreground">Generated {dateText(report.generatedAt)}</p></div>;
}
function formatCell(value: unknown) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground/60">—</span>;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
