import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity, AlertCircle, ArrowRight, BookOpen, Check, CheckCircle2, CircleHelp, Database,
  Clock3, FileSearch, FileText, Gauge, Info, LoaderCircle, MapPin, Moon, Play, Radio,
  RotateCw, Search, ShieldCheck, Sparkles, SquareArrowOutUpRight, Sun, Workflow, XCircle,
  Bell, PanelLeftClose, PanelLeftOpen, HelpCircle, ChevronDown, Copy,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey,
  getListTracesQueryKey,
  useGetDashboardSummary,
  useHealthCheck,
  useListKnowledgeDocuments,
  useListEvaluationCases,
  useListScenarios,
  useListTraces,
  useRunCopilot,
  useRunEvaluation,
} from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { toast } from '@/hooks/use-toast';
import { DataCatalog, DatasetDetailPage } from '@/pages/data';

const queryClient = new QueryClient();
const showcasePrompt = 'Summarize the incident notes and identify what is known, assumed, and still missing.';
const navItems = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/copilot', label: 'Copilot', icon: Sparkles },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/evaluation', label: 'Evaluation', icon: Activity },
  { href: '/data', label: 'Data', icon: Database },
  { href: '/about', label: 'About', icon: CircleHelp },
];

function shortTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function outcomeTone(outcome?: string) {
  return outcome === 'grounded' ? 'badge badge-green' : outcome === 'blocked' ? 'badge badge-amber' : 'badge';
}

function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return <div aria-label="Loading content" className="space-y-3" role="status">{Array.from({ length: rows }, (_, i) => <div className="skeleton h-12 w-full" key={i} />)}</div>;
}

function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="panel flex items-center gap-3 p-4 text-sm" role="alert">
    <AlertCircle className="shrink-0 text-[hsl(var(--destructive))]" size={18} />
    <div className="flex-1"><strong className="block">Could not load this information</strong><span className="text-muted-foreground">{message}</span></div>
    <button className="button-secondary" onClick={retry} type="button" data-testid="button-retry"><RotateCw size={14} /> Retry</button>
  </div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
    <div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-intro">{description}</p></div>
    {action}
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const guideTriggerRef = useRef<HTMLButtonElement>(null);
  const scenarios = useListScenarios();
  const documents = useListKnowledgeDocuments();
  const traces = useListTraces();
  const evaluationCases = useListEvaluationCases();
  const healthStatus = useHealthCheck();
  const dashboardStatus = useGetDashboardSummary();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('gridpulse-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [recentEvents, setRecentEvents] = useState<Array<{ id: number; title: string; detail: string; time: string; kind: 'success' | 'error' }>>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('gridpulse-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('gridpulse-theme', theme);
    } catch {
      // Theme still works for this session if storage is unavailable.
    }
  }, [theme]);
  useEffect(() => {
    try {
      if (!localStorage.getItem('gridpulse-guide-seen')) setGuideOpen(true);
    } catch { /* The guide remains available from its help button. */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('gridpulse-sidebar-collapsed', String(sidebarCollapsed)); } catch { /* session only */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ title: string; detail: string; kind: 'success' | 'error' }>).detail;
      if (detail && typeof detail.title === 'string' && typeof detail.detail === 'string') {
        setRecentEvents(items => [{ ...detail, id: Date.now(), time: new Date().toLocaleTimeString() }, ...items].slice(0, 8));
      }
    };
    window.addEventListener('gridpulse-event', receive);
    return () => window.removeEventListener('gridpulse-event', receive);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const go = (href: string) => {
    setCommandOpen(false);
    setLocation(href);
  };
  const failedQueries = [
    ...(healthStatus.isError ? ['Health check could not be loaded.'] : []),
    ...(dashboardStatus.isError ? ['Dashboard summary could not be loaded.'] : []),
    ...(scenarios.isError ? ['Synthetic scenarios could not be loaded.'] : []),
    ...(documents.isError ? ['Knowledge documents could not be loaded.'] : []),
    ...(traces.isError ? ['Recent traces could not be loaded.'] : []),
    ...(evaluationCases.isError ? ['Evaluation cases could not be loaded.'] : []),
  ];
  const notifications = [
    ...recentEvents.map(item => ({ title: item.title, detail: item.detail, time: item.time, kind: item.kind })),
    ...failedQueries.map(detail => ({ title: 'API request failed', detail, time: 'Current session', kind: 'error' as const })),
  ];
  return <div className={`shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar" aria-label="Primary navigation">
      <Link href="/" className="sidebar-brand mb-12 flex items-center gap-3 px-2 text-inherit no-underline">
        <span className="brand-mark"><Activity size={19} strokeWidth={1.8} /></span>
        <span><span className="brand-name block">GridPulse</span><span className="mt-1 block font-mono text-[9px] tracking-[.19em] text-[hsl(var(--sidebar-foreground)/.56)]">COPILOT / SIM</span></span>
      </Link>
      <div className="nav-caption mb-3 px-3 font-mono text-[9px] tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.44)]">{sidebarCollapsed ? 'NAV' : 'WORKSPACE'}</div>
      <nav className="nav-list space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} aria-label={label} title={sidebarCollapsed ? label : undefined} aria-current={location === href ? 'page' : undefined} data-testid={`link-nav-${label.toLowerCase()}`}>
          <Icon size={16} strokeWidth={1.8} /><span className="sidebar-label">{label}</span>
        </Link>)}
      </nav>
      <div className="sidebar-footer mt-auto border-t border-[hsl(var(--sidebar-border))] pt-5">
        <div className="flex items-start gap-2 px-2 text-[11px] leading-5 text-[hsl(var(--sidebar-foreground)/.64)]">
          <ShieldCheck className="mt-0.5 shrink-0 text-[hsl(var(--sidebar-primary))]" size={15} />
          <span>Human review stays in the loop.<br /><span className="font-mono text-[9px] tracking-wide">SYNTHETIC TRAINING DATA</span></span>
        </div>
        <div className="mt-5 px-2 font-mono text-[9px] tracking-[.12em] text-[hsl(var(--sidebar-foreground)/.35)]">INDEPENDENT PROJECT · NOT UTILITY-AFFILIATED</div>
      </div>
      <button className="sidebar-collapse" type="button" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)} data-testid="button-sidebar-collapse">{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}<span>{sidebarCollapsed ? 'Expand' : 'Collapse'}</span></button>
    </aside>
    <div className="content-area">
      <div className="safety-banner" role="note">TRAINING SIMULATION — NOT FOR LIVE GRID OPERATIONS</div>
      <header className="topbar">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${healthStatus.isError ? 'bg-[hsl(var(--destructive))]' : healthStatus.data?.status === 'ok' ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--accent))]'}`} />{healthStatus.isLoading ? 'Checking demo API' : healthStatus.isError ? 'Demo API unavailable' : healthStatus.data?.status === 'ok' ? 'Synthetic demo · API available' : 'Synthetic demo · API status unknown'}</div>
        <div className="flex items-center gap-2">
          <button type="button" className="theme-toggle" onClick={() => setCommandOpen(true)} aria-label="Open command palette" data-testid="button-command-palette"><Search size={14} /><span className="hidden sm:inline">Search records</span><kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[9px] sm:inline">⌘K</kbd></button>
          <button type="button" className="theme-toggle notification-trigger" onClick={() => setNotificationsOpen(value => !value)} aria-expanded={notificationsOpen} aria-controls="notification-center" aria-label={`Notifications, ${notifications.length} recent events`} data-testid="button-notifications"><Bell size={15} /><span className="hidden sm:inline">Alerts</span><span className="notification-count" aria-hidden="true">{notifications.length}</span></button>
          <button ref={guideTriggerRef} type="button" className="theme-toggle" onClick={() => setGuideOpen(true)} aria-label="Open getting started guide" data-testid="button-open-guide"><HelpCircle size={15} /><span className="hidden sm:inline">Guide</span></button>
          <button type="button" className="theme-toggle" onClick={() => setTheme(current => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-pressed={theme === 'dark'} data-testid="button-theme-toggle">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}<span className="hidden sm:inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <div className="hidden items-center gap-2 font-mono text-[10px] tracking-[.08em] text-muted-foreground sm:flex"><span>FIELD TABLET VIEW</span><span className="rounded border border-border px-2 py-1">SIM / 01</span></div>
        </div>
      </header>
      {notificationsOpen && <section id="notification-center" className="notification-center panel" aria-label="Notification center">
        <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><div className="eyebrow">Workspace activity</div><h2 className="mt-1 text-sm font-semibold">Events from this session</h2></div><button className="icon-button" type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><XCircle size={16} /></button></div>
        {notifications.length ? <ul className="divide-y divide-border">{notifications.map((item, index) => <li className="p-4" key={`${item.title}-${item.detail}-${index}`}><div className="flex gap-2">{item.kind === 'success' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[hsl(var(--primary))]" /> : <AlertCircle size={15} className="mt-0.5 shrink-0 text-[hsl(var(--destructive))]" />}<div><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p><p className="mt-1 font-mono text-[9px] text-muted-foreground">{item.time}</p></div></div></li>)}</ul> : <div className="p-5 text-xs leading-5 text-muted-foreground">No API failures or completed runs have been reported in this session.</div>}
      </section>}
      <main className="main-content">{children}</main>
    </div>
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search pages, scenarios, documents, traces, evaluation cases…" aria-label="Search workspace records" data-testid="input-command-search" />
      <CommandList>
        <CommandEmpty>No matching destinations or records.</CommandEmpty>
        <CommandGroup heading="Destinations">
          {navItems.map(({href,label,icon: Icon}) => <CommandItem key={href} value={`${label} ${href}`} data-testid={`command-page-${label.toLowerCase()}`} onSelect={() => go(href)}><Icon size={15} />{label}<span className="ml-auto font-mono text-[10px] text-muted-foreground">{href}</span></CommandItem>)}
        </CommandGroup>
        {!!scenarios.data?.length && <CommandGroup heading="Synthetic scenarios">{scenarios.data.map(s => <CommandItem key={s.id} value={`scenario ${s.title} ${s.description} ${s.location} ${s.assetId} ${s.id}`} data-testid={`command-scenario-${s.id}`} onSelect={() => go(`/copilot?scenarioId=${encodeURIComponent(s.id)}`)}><MapPin size={15} /><span className="truncate">{s.title}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{s.location}</span></CommandItem>)}</CommandGroup>}
        {!!documents.data?.length && <CommandGroup heading="Knowledge documents">{documents.data.map(doc => <CommandItem key={doc.id} value={`document ${doc.title} ${doc.kind} ${doc.description} ${doc.content} ${doc.sourceLabel} ${doc.id}`} data-testid={`command-document-${doc.id}`} onSelect={() => go(`/knowledge?document=${encodeURIComponent(doc.id)}`)}><FileText size={15} /><span className="truncate">{doc.title}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{doc.kind}</span></CommandItem>)}</CommandGroup>}
        {!!traces.data?.length && <CommandGroup heading="Recent in-memory traces">{traces.data.map(trace => <CommandItem key={trace.id} value={`trace ${trace.id} ${trace.query} ${trace.outcome}`} data-testid={`command-trace-${trace.id}`} onSelect={() => go(`/?trace=${encodeURIComponent(trace.id)}`)}><Clock3 size={15} /><span className="truncate">{trace.query}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{trace.id}</span></CommandItem>)}</CommandGroup>}
          {!!evaluationCases.data?.length && <CommandGroup heading="Evaluation cases">{evaluationCases.data.map(testCase => <CommandItem key={testCase.id} value={`evaluation case ${testCase.id} ${testCase.query} ${testCase.expected} ${testCase.explanation}`} data-testid={`command-evaluation-${testCase.id}`} onSelect={() => go(`/evaluation?case=${encodeURIComponent(testCase.id)}`)}><CheckCircle2 size={15} /><span className="truncate">{testCase.id} · {testCase.query}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">CASE</span></CommandItem>)}</CommandGroup>}
          <CommandGroup heading="Synthetic data"><CommandItem value="data synthetic dataset catalog import quality pipeline" data-testid="command-page-data" onSelect={() => go('/data')}><Database size={15} />Data catalog<span className="ml-auto font-mono text-[10px] text-muted-foreground">/data</span></CommandItem></CommandGroup>
      </CommandList>
    </CommandDialog>
     {guideOpen && <GuideDialog onClose={() => { setGuideOpen(false); window.setTimeout(() => guideTriggerRef.current?.focus(), 0); }} />}
  </div>;
}

function GuideDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { dismiss(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  function dismiss() {
    try { localStorage.setItem('gridpulse-guide-seen', 'true'); } catch { /* guide can be dismissed for this session */ }
    onClose();
  }
  return <div className="guide-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <section ref={dialogRef} className="guide-dialog panel" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <div className="flex items-start justify-between gap-4"><div><div className="eyebrow">First visit / 90 seconds</div><h2 id="guide-title" className="mt-2 font-serif text-2xl">Inspect the path, not just the answer.</h2></div><button ref={closeRef} className="icon-button" type="button" onClick={dismiss} aria-label="Close guide"><XCircle size={18} /></button></div>
      <ol className="guide-steps mt-5">
        <li><span>01</span><div><strong>Choose a synthetic scenario</strong><p>Ask a bounded question about the provided notes. Review the inputs before sending the request.</p></div></li>
        <li><span>02</span><div><strong>Inspect the returned draft</strong><p>Compare facts, assumptions, missing information, citations, and the actual backend workflow steps.</p></div></li>
        <li><span>03</span><div><strong>Open the evidence and trace</strong><p>Source labels and retrieval rankings are inspectable. Nothing here is approved or saved as a review record.</p></div></li>
      </ol>
      <div className="mt-5 rounded-md border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--accent)/.07)] p-3 text-xs leading-5">Training simulation only. Never use this demo for live grid operations.</div>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button className="button-secondary" type="button" onClick={() => { try { localStorage.removeItem('gridpulse-guide-seen'); } catch { /* restart remains available for this session */ } onClose(); }}>Show automatically next visit</button><button className="button-primary" type="button" onClick={dismiss}>Got it</button></div>
    </section>
  </div>;
}

function Overview() {
  const health = useHealthCheck();
  const summary = useGetDashboardSummary();
  const scenarios = useListScenarios();
  const traces = useListTraces();
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem('gridpulse-dashboard-widgets');
      return saved ? JSON.parse(saved) as { quickStart: boolean; metrics: boolean; traces: boolean } : { quickStart: true, metrics: true, traces: true };
    } catch { return { quickStart: true, metrics: true, traces: true }; }
  });
  useEffect(() => { try { localStorage.setItem('gridpulse-dashboard-widgets', JSON.stringify(widgets)); } catch { /* preference remains for this session */ } }, [widgets]);
  const ready = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const traceRows = traces.data ?? summary.data?.latestTraces ?? [];
  const focusedTraceId = new URLSearchParams(window.location.search).get('trace');
  const focusedTraceRef = useRef<HTMLAnchorElement | null>(null);
  const focusedTrace = traceRows.find(trace => trace.id === focusedTraceId);
  const visibleTraceRows = focusedTrace ? [focusedTrace, ...traceRows.filter(trace => trace.id !== focusedTraceId).slice(0, 4)] : traceRows.slice(0, 5);
  useEffect(() => { focusedTraceRef.current?.focus(); focusedTraceRef.current?.scrollIntoView({block:'center', behavior:'smooth'}); }, [focusedTraceId, traces.data]);
  return <>
    <PageHeader eyebrow="Workspace / 01" title="A clearer incident brief starts here." description="Organize synthetic incident notes into a traceable draft. Every output is structured for human review, with its evidence kept close." action={<div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" aria-expanded={widgetSettingsOpen} onClick={() => setWidgetSettingsOpen(open => !open)} data-testid="button-dashboard-widgets"><PanelLeftOpen size={14} /> Dashboard widgets</button><Link href="/copilot" className="button-primary" data-testid="link-start-copilot"><Play size={14} /> Start a run <ArrowRight size={14} /></Link></div>} />
    {widgetSettingsOpen && <section className="panel mb-5 p-4" aria-label="Dashboard widget visibility preferences"><div className="eyebrow mb-3">Visible dashboard sections · saved on this device</div><div className="flex flex-wrap gap-x-6 gap-y-3">{([
      ['quickStart', 'Quick start'], ['metrics', 'Workspace metrics'], ['traces', 'Recent traces'],
    ] as const).map(([key, label]) => <label className="flex items-center gap-2 text-xs" key={key}><input type="checkbox" checked={widgets[key]} onChange={event => setWidgets(current => ({ ...current, [key]: event.target.checked }))} data-testid={`toggle-widget-${key}`} />{label}</label>)}</div><p className="mt-3 text-[10px] text-muted-foreground">These preferences only control local visibility; they contain no incident or review data.</p></section>}
    {widgets.quickStart && <section className="panel mb-6 overflow-hidden">
      <div className="grid md:grid-cols-[1.1fr_.9fr]">
        <div className="p-6 md:p-8">
          <div className="eyebrow flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" /> QUICK START</div>
          <h2 className="mt-3 max-w-md font-serif text-2xl leading-tight tracking-tight">Turn a field note into a reviewable brief.</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Choose a synthetic scenario, ask a focused question, then inspect the cited material and retrieval trail before using any part of the draft.</p>
          <Link href="/copilot" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] no-underline" data-testid="link-quick-start">Open Copilot <ArrowRight size={15} /></Link>
        </div>
        <div className="relative flex min-h-48 items-center justify-center overflow-hidden border-t border-border bg-[hsl(var(--secondary)/.56)] p-6 md:border-l md:border-t-0">
          <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(hsl(var(--foreground) / .04) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / .04) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
          <div className="relative w-full max-w-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[9px] tracking-[.14em] text-muted-foreground">BRIEF WORKFLOW</span><Workflow size={15} className="text-[hsl(var(--primary))]" /></div>
            <div className="flex items-center gap-2 text-xs"><span className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--primary)/.1)] font-mono text-[10px] text-[hsl(var(--primary))]">01</span> Notes in <ArrowRight size={13} className="text-muted-foreground" /><span className="grid h-6 w-6 place-items-center rounded-full bg-[hsl(var(--primary)/.1)] font-mono text-[10px] text-[hsl(var(--primary))]">02</span> Evidence linked</div>
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs"><span className="grid h-6 w-6 place-items-center rounded-full border border-[hsl(var(--accent)/.4)] font-mono text-[10px] text-[hsl(var(--accent))]">03</span> Human review <span className="ml-auto font-mono text-[9px] text-muted-foreground">REQUIRED</span></div>
          </div>
        </div>
      </div>
    </section>}
    {widgets.metrics && <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="API health" value={health.isLoading ? 'Checking' : health.isError ? 'Unavailable' : (health.data?.status ?? 'Unknown')} detail="Simulation service" icon={<Radio size={16} />} good={ready} />
      <Metric label="Operating mode" value={summary.data?.mode ?? (summary.isLoading ? 'Loading' : '—')} detail="Deterministic demo" icon={<ShieldCheck size={16} />} />
      <Metric label="Scenarios" value={summary.data?.scenarioCount ?? scenarios.data?.length ?? '—'} detail="Synthetic incident notes" icon={<MapPin size={16} />} />
      <Metric label="Source documents" value={summary.data?.knowledgeDocumentCount ?? '—'} detail={`${summary.data?.evaluationCaseCount ?? '—'} evaluation cases`} icon={<FileText size={16} />} />
    </div>}
    {(health.isError || summary.isError || scenarios.isError || traces.isError) && <div className="mb-5"><QueryError message="The API did not return a complete workspace snapshot. Retry the affected data request." retry={() => { void health.refetch(); void summary.refetch(); void scenarios.refetch(); void traces.refetch(); }} /></div>}
    {widgets.traces && <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div><div className="eyebrow">Recent activity</div><h2 className="mt-1 panel-title">Latest traces</h2></div>
        <span className="badge"><Clock3 size={12} /> In-memory demo history</span>
      </div>
      {traces.isLoading || summary.isLoading ? <div className="p-5"><LoadingBlock rows={3} /></div> : traceRows.length ? <div className="divide-y divide-border">
         {visibleTraceRows.map(trace => <Link ref={trace.id === focusedTraceId ? focusedTraceRef : undefined} href={`/?trace=${encodeURIComponent(trace.id)}`} key={trace.id} className={`grid gap-2 px-5 py-4 text-inherit no-underline transition-colors hover:bg-[hsl(var(--secondary)/.4)] sm:grid-cols-[1fr_auto] sm:items-center ${trace.id === focusedTraceId ? 'bg-[hsl(var(--primary)/.08)]' : ''}`} data-testid={`trace-row-${trace.id}`} aria-current={trace.id === focusedTraceId ? 'location' : undefined}>
          <div className="min-w-0"><p className="truncate text-sm font-medium">{trace.query}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{trace.id} · {shortTime(trace.createdAt)}</p></div>
          <div className="flex items-center gap-2"><span className={outcomeTone(trace.outcome)}>{trace.outcome}</span><span className="font-mono text-[10px] text-muted-foreground">{trace.durationMs} ms</span></div>
         </Link>)}
      </div> : <EmptyState icon={<FileSearch size={19} />} title="No traces yet" body="A trace is created when a Copilot run is completed. Start with a synthetic scenario to see its audit trail here." action={<Link href="/copilot" className="button-secondary" data-testid="link-empty-run">Run a scenario <ArrowRight size={14} /></Link>} />}
    </section>}
  </>;
}

function Metric({ label, value, detail, icon, good }: { label: string; value: string | number; detail: string; icon: ReactNode; good?: boolean }) {
  return <article className="panel p-4" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>
    <div className="flex items-center justify-between text-muted-foreground"><span className="eyebrow !text-[9px]">{label}</span><span className={good ? 'text-[hsl(var(--primary))]' : ''}>{icon}</span></div>
    <div className="metric-value mt-3 font-serif">{value}</div>
    <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
  </article>;
}

function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center px-6 py-12 text-center">
    <div className="grid h-10 w-10 place-items-center rounded-full border border-border bg-[hsl(var(--background))] text-[hsl(var(--primary))]">{icon}</div>
    <h3 className="mt-4 font-serif text-lg">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p>{action && <div className="mt-5">{action}</div>}
  </div>;
}

function Copilot() {
  const scenarios = useListScenarios();
  const runCopilot = useRunCopilot();
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const requestedScenario = new URLSearchParams(window.location.search).get('scenarioId') ?? '';
  const [scenarioId, setScenarioId] = useState(requestedScenario);
  const scenarioSelectRef = useRef<HTMLSelectElement>(null);
  const [prompt, setPrompt] = useState(showcasePrompt);
  const [result, setResult] = useState<NonNullable<typeof runCopilot.data> | null>(null);
  const [reviewBeforeRun, setReviewBeforeRun] = useState(false);
  useEffect(() => {
    if (scenarios.data?.length && !scenarios.data.some(s => s.id === scenarioId)) setScenarioId(scenarios.data[0].id);
  }, [scenarioId, scenarios.data]);
  useEffect(() => {
    if (requestedScenario && scenarioId === requestedScenario) scenarioSelectRef.current?.focus();
  }, [requestedScenario, scenarioId]);
  const selected = scenarios.data?.find(s => s.id === scenarioId);
  function executeRun(id: string, question: string) {
    if (!id || !question.trim()) return;
    runCopilot.mutate({ data: { scenarioId: id, prompt: question.trim() } }, {
      onSuccess: (data) => {
        setResult(data);
        window.dispatchEvent(new CustomEvent('gridpulse-event', { detail: { kind: 'success', title: 'Copilot run completed', detail: `Trace ${data.traceId} is ready for review.` } }));
        toast({ title: 'Run completed', description: `Trace ${data.traceId} is ready for review.` });
        void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        void client.invalidateQueries({ queryKey: getListTracesQueryKey() });
      },
      onError: () => {
        window.dispatchEvent(new CustomEvent('gridpulse-event', { detail: { kind: 'error', title: 'Copilot run failed', detail: 'The API request failed; no new result was returned.' } }));
        toast({ title: 'Run could not be completed', description: 'The service returned an error. No new trace was created.', variant: 'destructive' });
      },
    });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewBeforeRun(true);
  }
  return <>
    <PageHeader eyebrow="Workspace / 02" title="Copilot run" description="Run a question against a synthetic scenario. Review the draft, evidence, and retrieval path as one auditable record." />
    <div className="grid items-start gap-5 xl:grid-cols-[.82fr_1.18fr]">
      <section className="panel p-5 md:p-6">
        <div className="eyebrow">Input / source selection</div><h2 className="mt-1 panel-title">Set up a run</h2>
        {scenarios.isLoading ? <div className="mt-5"><LoadingBlock rows={3} /></div> : scenarios.isError ? <div className="mt-5"><QueryError message="Synthetic scenarios are unavailable." retry={() => void scenarios.refetch()} /></div> : !scenarios.data?.length ? <div className="mt-5"><EmptyState icon={<MapPin size={18} />} title="No scenarios available" body="The API returned an empty scenario set. A run needs a source scenario." /></div> : <form onSubmit={submit} className="mt-5 space-y-5">
          <div><label className="mb-2 block text-xs font-semibold" htmlFor="scenario-select">Synthetic scenario</label>
             <select ref={scenarioSelectRef} id="scenario-select" className="field" value={scenarioId} onChange={e => setScenarioId(e.target.value)} data-testid="select-scenario" aria-label="Select synthetic scenario">
              {scenarios.data.map(s => <option value={s.id} key={s.id}>{s.title} — {s.location}</option>)}
            </select>
          </div>
          {selected && <div className="rounded-md border border-border bg-[hsl(var(--background))] p-3">
            <div className="flex items-center justify-between gap-3"><span className="badge badge-green">Synthetic scenario</span><span className="font-mono text-[10px] text-muted-foreground">{selected.assetId}</span></div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{selected.description}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-[11px]">
              <div><dt className="text-muted-foreground">Location</dt><dd className="mt-1 font-medium">{selected.location}</dd></div>
              <div><dt className="text-muted-foreground">Weather</dt><dd className="mt-1 font-medium">{selected.weather}</dd></div>
            </dl>
            <p className="mt-3 border-l-2 border-[hsl(var(--accent))] pl-3 text-xs leading-5">{selected.incidentNote}</p>
          </div>}
          <div><div className="mb-2 flex items-center justify-between"><label className="text-xs font-semibold" htmlFor="run-prompt">Question for the brief</label><span className="font-mono text-[10px] text-muted-foreground">{prompt.length}/800</span></div>
            <textarea id="run-prompt" className="field min-h-32 resize-y leading-6" maxLength={800} minLength={1} value={prompt} onChange={e => setPrompt(e.target.value)} required data-testid="input-copilot-prompt" aria-describedby="prompt-guidance" />
            <p id="prompt-guidance" className="mt-2 text-[11px] leading-5 text-muted-foreground">This simulation does not provide field directions. Keep the question focused on organizing provided notes.</p>
          </div>
          {runCopilot.isError && <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.05)] p-3 text-xs text-[hsl(var(--destructive))]" role="alert"><AlertCircle size={15} className="mt-0.5 shrink-0" />The run could not be completed. Check the service and try again.</div>}
          {!reviewBeforeRun ? <div className="grid gap-2 sm:grid-cols-2">
            <button className="button-primary" disabled={runCopilot.isPending || !scenarioId || !prompt.trim()} type="submit" data-testid="button-review-run"><Check size={15} /> Review before run</button>
            <button className="button-secondary justify-center" disabled={runCopilot.isPending || !scenarios.data?.length} type="button" onClick={() => { if (scenarios.data?.[0]) { setScenarioId(scenarios.data[0].id); setPrompt(showcasePrompt); setReviewBeforeRun(true); } }} data-testid="button-run-showcase"><Play size={14} /> Review showcase</button>
          </div> : <div className="rounded-md border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.06)] p-4" role="region" aria-label="Review request before run">
            <div className="eyebrow">Review request / no request sent yet</div>
            <p className="mt-2 text-xs leading-5"><strong>{selected?.title ?? 'Selected scenario'}</strong><br />{prompt}</p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">This will send only the selected scenario ID and this question to the deterministic demo API. The result is an unapproved draft.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="button-primary" disabled={runCopilot.isPending || !prompt.trim()} type="button" onClick={() => { executeRun(scenarioId, prompt); setReviewBeforeRun(false); }} data-testid="button-confirm-run">{runCopilot.isPending ? <><LoaderCircle size={15} className="animate-spin" /> Running…</> : <><Sparkles size={15} /> Run this query</>}</button>
              <button className="button-secondary" type="button" onClick={() => setReviewBeforeRun(false)} data-testid="button-edit-request">Edit request</button>
            </div>
          </div>}
        </form>}
      </section>
      <section className="panel min-h-[460px]">
        {runCopilot.isPending ? <div className="p-6"><div className="eyebrow">Request pending</div><h2 className="mt-1 panel-title">Waiting for the run result</h2><p className="mb-6 mt-2 text-xs text-muted-foreground">The API request is in progress. No result is shown until it completes.</p><LoadingBlock rows={6} /></div>
          : result ? <RunResult result={result} onReset={() => { setResult(null); setPrompt(showcasePrompt); setReviewBeforeRun(false); }} onOpenEvidence={id => setLocation(`/knowledge?document=${encodeURIComponent(id)}`)} />
          : <EmptyState icon={<FileSearch size={19} />} title="Your brief will appear here" body="Choose a scenario and run a question. The result will include structured notes, citations, retrieval diagnostics, and workflow steps." />}
      </section>
    </div>
  </>;
}

function RunResult({ result, onReset, onOpenEvidence }: { result: NonNullable<ReturnType<typeof useRunCopilot>['data']>; onReset: () => void; onOpenEvidence: (id: string) => void }) {
  const [editedCopy, setEditedCopy] = useState(result.summary);
  const [editOpen, setEditOpen] = useState(false);
  async function copyText(text: string, label: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied`, description: 'The text is on your clipboard.' });
    } catch {
      toast({ title: `Could not copy ${label.toLowerCase()}`, description: 'Clipboard access was unavailable. Select and copy the text manually.', variant: 'destructive' });
    }
  }
  return <div className="reveal">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5 md:p-6">
      <div><div className="eyebrow">Review draft / {result.traceId}</div><h2 className="mt-1 panel-title">Structured result</h2><p className="mt-1 text-xs text-muted-foreground">{shortTime(result.createdAt)} · {result.durationMs} ms</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="button-secondary" type="button" onClick={() => void copyText(result.summary, 'Summary')} data-testid="button-copy-summary"><FileText size={13} /> Copy summary</button>
          <button className="button-secondary" type="button" onClick={() => void copyText(result.traceId, 'Trace ID')} data-testid="button-copy-trace-id"><Activity size={13} /> Copy trace ID</button>
          <button className="button-secondary" type="button" onClick={onReset} data-testid="button-start-another-run"><RotateCw size={13} /> Start another run</button>
        </div>
      </div>
      <span className={outcomeTone(result.outcome)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{result.outcome}</span>
    </div>
    <div className="space-y-5 p-5 md:p-6">
      <div><div className="eyebrow">Intent</div><p className="mt-1 text-sm leading-6">{result.intent}</p></div>
      <div className="rounded-md border-l-[3px] border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.055)] p-4"><div className="eyebrow">Draft summary · human review required</div><p className="mt-2 text-sm leading-6">{result.summary}</p></div>
      <section className="rounded-md border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="eyebrow">Personal working copy</div><h3 className="mt-1 text-sm font-semibold">Local edit · unsaved and not approved</h3></div><button className="button-secondary" type="button" onClick={() => setEditOpen(open => !open)} aria-expanded={editOpen} data-testid="button-toggle-local-edit">{editOpen ? 'Close editor' : 'Edit a local copy'}</button></div>
        {editOpen && <div className="mt-3"><label className="sr-only" htmlFor="local-draft-copy">Editable local-only draft copy</label><textarea id="local-draft-copy" className="field min-h-28 leading-6" value={editedCopy} onChange={event => setEditedCopy(event.target.value)} aria-describedby="local-copy-note" data-testid="input-local-draft-copy" /><p id="local-copy-note" className="mt-2 text-[11px] leading-5 text-muted-foreground">Changes stay in this page state only. The original generated draft above is unchanged; edits are not sent, saved, or approved.</p><button className="button-secondary mt-3" type="button" onClick={() => void copyText(editedCopy, 'Local copy')} data-testid="button-copy-local-draft"><Copy size={13} /> Copy local copy</button></div>}
      </section>
      {result.safetyNotice && <div className="flex gap-2 rounded-md border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.08)] p-3 text-xs leading-5"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[hsl(var(--accent))]" />{result.safetyNotice}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <StringList title="Facts in source notes" values={result.facts} empty="No facts were returned." />
        <StringList title="Assumptions" values={result.assumptions} empty="No assumptions were returned." />
      </div>
      <StringList title="Missing information" values={result.missingInformation} empty="No missing information was identified by this run." />
      <div>
        <div className="mb-3 flex items-center justify-between"><div><div className="eyebrow">Evidence</div><h3 className="mt-1 text-sm font-semibold">Citations <span className="font-mono text-[10px] text-muted-foreground">({result.citations.length})</span></h3></div><span className="badge">Source labels retained</span></div>
        {result.citations.length ? (
          <div className="space-y-2">{result.citations.map((citation, i) => <article key={`${citation.id}-${i}`} className="rounded-md border border-border p-3" data-testid={`citation-${citation.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><span className="font-mono text-[10px] text-muted-foreground">[{i + 1}] · {citation.id}</span><h4 className="mt-1 text-sm font-semibold">{citation.title}</h4></div><span className={/unvalidated|unknown|pending/i.test(citation.validationStatus) ? 'badge badge-amber' : 'badge badge-green'}>{citation.validationStatus}</span></div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{citation.excerpt}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground"><span>{citation.sourceLabel} · {citation.kind}</span><span>retrieval score {Number(citation.score).toFixed(3)}</span></div>
            <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--primary))]" onClick={() => onOpenEvidence(citation.id)} data-testid={`button-open-citation-${citation.id}`}><FileSearch size={13} /> Open cited evidence <ArrowRight size={13} /></button>
          </article>)}</div>
        ) : <p className="text-xs text-muted-foreground">No citations were returned for this run.</p>}
      </div>
      <details className="rounded-md border border-border p-4">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3"><span><span className="eyebrow block">Retrieval diagnostics</span><span className="mt-1 block text-xs text-muted-foreground">Returned by the run. Expand the terms for plain-language context.</span></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="mt-3">
        <div className="eyebrow">Retrieval diagnostics</div><p className="mt-1 text-xs text-muted-foreground">Method: <span className="font-mono">{result.retrieval.method}</span></p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">{[
          ['Keyword', result.retrieval.keywordRankings], ['Local', result.retrieval.localRankings], ['Fused', result.retrieval.fusedRankings],
        ].map(([name, rows]) => <div className="rounded-md border border-border p-3" key={name as string}><div className="eyebrow">{name as string} ranking</div>
          {(rows as typeof result.retrieval.keywordRankings).length ? <ol className="mt-2 space-y-2">{(rows as typeof result.retrieval.keywordRankings).map((row, i) => <li key={`${row.documentId}-${i}`} className="flex justify-between gap-2 font-mono text-[10px]"><span className="truncate">{row.rank}. {row.documentId}</span><span>{Number(row.score).toFixed(3)}</span></li>)}</ol> : <p className="mt-2 text-[11px] text-muted-foreground">No ranking entries.</p>}
        </div>)}</div>
        <div className="mt-4 border-t border-border pt-3">
          <div className="eyebrow">Glossary</div>
          <dl className="mt-2 grid gap-3 text-xs leading-5 sm:grid-cols-3">
            <div><dt className="font-semibold">BM25 / keyword</dt><dd className="mt-1 text-muted-foreground">A local sparse term-matching score; it rewards query terms that distinguish documents. It is not semantic understanding.</dd></div>
            <div><dt className="font-semibold">Local sparse similarity</dt><dd className="mt-1 text-muted-foreground">Token-weighted vectors compared within this demo. This is not a neural embedding or external service.</dd></div>
            <div><dt className="font-semibold">RRF / fused</dt><dd className="mt-1 text-muted-foreground">Reciprocal rank fusion combines positions from the returned ranking lists; the fused score is not a confidence or approval score.</dd></div>
          </dl>
        </div>
        </div>
      </details>
      <div><div className="eyebrow">Workflow record</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{result.steps.map(step => <div key={step.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"><StepIcon status={step.status} /><span className="flex-1">{step.label}</span><span className="font-mono text-[9px] uppercase text-muted-foreground">{step.status}</span></div>)}</div></div>
    </div>
  </div>;
}

function StepIcon({ status }: { status: string }) {
  if (status === 'complete') return <Check size={14} className="text-[hsl(var(--primary))]" />;
  if (status === 'blocked') return <XCircle size={14} className="text-[hsl(var(--destructive))]" />;
  return <AlertCircle size={14} className="text-[hsl(var(--accent))]" />;
}

function StringList({ title, values, empty }: { title: string; values: string[]; empty: string }) {
  return <div><div className="eyebrow">{title}</div>{values.length ? <ul className="mt-2 space-y-2">{values.map((value, i) => <li key={`${i}-${value}`} className="flex gap-2 text-xs leading-5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--accent))]" />{value}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">{empty}</p>}</div>;
}

function Knowledge() {
  const documents = useListKnowledgeDocuments();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const requestedDocument = new URLSearchParams(window.location.search).get('document');
  const [activeId, setActiveId] = useState<string | null>(requestedDocument);
  const [kindFilter, setKindFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const kinds = useMemo(() => [...new Set((documents.data ?? []).map(doc => doc.kind))].sort(), [documents.data]);
  const statuses = useMemo(() => [...new Set((documents.data ?? []).map(doc => doc.validationStatus))].sort(), [documents.data]);
  const filtered = useMemo(() => (documents.data ?? []).filter(doc =>
    `${doc.title} ${doc.kind} ${doc.description} ${doc.content} ${doc.sourceLabel}`.toLowerCase().includes(search.toLowerCase()) &&
    (kindFilter === 'all' || doc.kind === kindFilter) &&
    (statusFilter === 'all' || doc.validationStatus === statusFilter)
  ), [documents.data, search, kindFilter, statusFilter]);
  useEffect(() => {
    if (requestedDocument && documents.data?.some(doc => doc.id === requestedDocument)) setActiveId(requestedDocument);
  }, [requestedDocument, documents.data]);
  useEffect(() => {
    if (!documents.data) return;
    if (requestedDocument && filtered.some(doc => doc.id === requestedDocument)) {
      setActiveId(requestedDocument);
      return;
    }
    if (!filtered.some(doc => doc.id === activeId)) setActiveId(filtered[0]?.id ?? null);
  }, [documents.data, filtered, activeId, requestedDocument]);
  const active = filtered.find(doc => doc.id === activeId);
  return <>
    <PageHeader eyebrow="Workspace / 03" title="Knowledge library" description="Inspect the synthetic documents available to the retrieval workflow. Provenance labels and validation status travel with every source." />
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
        <div className="relative w-full sm:col-span-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="field pl-9" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, source, content…" aria-label="Search knowledge documents" data-testid="input-knowledge-search" /></div>
        <label className="sr-only" htmlFor="knowledge-kind-filter">Filter by document kind</label><select id="knowledge-kind-filter" className="field" value={kindFilter} onChange={e => setKindFilter(e.target.value)} data-testid="select-knowledge-kind"><option value="all">All kinds</option>{kinds.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select>
        <label className="sr-only" htmlFor="knowledge-status-filter">Filter by validation status</label><select id="knowledge-status-filter" className="field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="select-knowledge-status"><option value="all">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select>
      </div>
      {!documents.isLoading && !documents.isError && <span className="font-mono text-[10px] text-muted-foreground">{filtered.length} / {documents.data?.length ?? 0} RECORDS</span>}
    </div>
    {documents.isLoading ? <div className="panel p-5"><LoadingBlock rows={5} /></div> : documents.isError ? <QueryError message="Knowledge documents are unavailable." retry={() => void documents.refetch()} /> : !documents.data?.length ? <div className="panel"><EmptyState icon={<BookOpen size={18} />} title="No source documents" body="The service returned no knowledge records for this demo." /></div> : !filtered.length ? <div className="panel"><EmptyState icon={<Search size={18} />} title="No matching documents" body="Try a shorter search term or clear the current filter." action={<button className="button-secondary" onClick={() => setSearch('')} type="button">Clear search</button>} /></div> : <div className="grid items-start gap-4 lg:grid-cols-[.82fr_1.18fr]">
      <section className="panel overflow-hidden" aria-label="Knowledge documents list">
        <div className="border-b border-border px-4 py-3"><div className="eyebrow">Available material</div></div>
        <div className="divide-y divide-border">
          {filtered.map(doc => <button key={doc.id} type="button" onClick={() => { setActiveId(doc.id); setLocation(`/knowledge?document=${encodeURIComponent(doc.id)}`); }} className={`block w-full p-4 text-left transition-colors hover:bg-[hsl(var(--secondary)/.5)] ${active?.id === doc.id ? 'bg-[hsl(var(--secondary)/.65)]' : ''}`} data-testid={`button-document-${doc.id}`} aria-pressed={active?.id === doc.id}>
            <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold leading-5">{doc.title}</span><ArrowRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" /></div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{doc.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5"><span className="badge">{doc.kind}</span><ValidationBadge status={doc.validationStatus} /></div>
          </button>)}
        </div>
      </section>
      {active ? <article className="panel p-5 md:p-6" data-testid={`document-detail-${active.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow">Document detail / {active.id}</div><h2 className="mt-1 font-serif text-2xl leading-tight">{active.title}</h2></div><ValidationBadge status={active.validationStatus} /></div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{active.description}</p>
        <div className="mt-5 grid gap-3 rounded-md bg-[hsl(var(--background))] p-3 sm:grid-cols-2">
          <div><div className="eyebrow">Source label</div><p className="mt-1 text-xs leading-5">{active.sourceLabel}</p></div>
          <div><div className="eyebrow">Document kind</div><p className="mt-1 text-xs leading-5">{active.kind}</p></div>
        </div>
        {isGo174(active) && <div className="mt-4 flex gap-2 rounded-md border border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.08)] p-3 text-xs leading-5"><Info size={15} className="mt-0.5 shrink-0 text-[hsl(var(--accent))]" /><span><strong>Unvalidated GO 174 pointer.</strong> This source is a reference pointer only; its contents are not presented as validated guidance. Do not use it as operational direction.</span></div>}
        <div className="mt-5 border-t border-border pt-4"><div className="eyebrow">Document content</div><div className="mt-3 whitespace-pre-wrap text-sm leading-7">{active.content}</div></div>
        {active.sourceUrl && <a href={active.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))]" data-testid={`link-source-${active.id}`}>Open labeled source <SquareArrowOutUpRight size={13} /></a>}
        <div className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-muted-foreground">Synthetic demo material is provided for interface testing and review. Source labels do not imply endorsement, completeness, or operational applicability.</div>
      </article> : <div className="panel"><EmptyState icon={<FileText size={18} />} title="Select a document" body="Choose a record to inspect its full content and provenance." /></div>}
    </div>}
  </>;
}

function isGo174(doc: { title: string; sourceLabel: string; kind: string; validationStatus: string }) {
  return /go\s*174/i.test(`${doc.title} ${doc.sourceLabel} ${doc.kind}`) && /unvalidated|not validated|pointer|unknown|pending/i.test(doc.validationStatus);
}

function ValidationBadge({ status }: { status: string }) {
  const unvalidated = /unvalidated|not validated|unknown|pending/i.test(status);
  return <span className={unvalidated ? 'badge badge-amber' : 'badge badge-green'}>{status}</span>;
}

type EvaluationCaseView = {
  id: string;
  query: string;
  expected: string;
  explanation: string;
  actual?: string;
  passed?: boolean;
};

function EvaluationOutcome({ expected, actual, passed }: Pick<EvaluationCaseView, 'expected' | 'actual' | 'passed'>) {
  return <div className="flex flex-wrap items-center gap-2">
    <span className="badge">Expected: {expected}</span>
    {actual ? <span className={outcomeTone(actual)}>Actual: {actual}</span> : <span className="badge">Not run</span>}
    {typeof passed === 'boolean' && <span className={passed ? 'badge badge-green' : 'badge badge-amber'}>{passed ? 'PASS' : 'FAIL'}</span>}
  </div>;
}

function Evaluation() {
  const evaluation = useRunEvaluation();
  const listedCases = useListEvaluationCases();
  const requestedCase = new URLSearchParams(window.location.search).get('case');
  const caseRefs = useRef<Record<string, HTMLElement | null>>({});
  const result = evaluation.data;
  const [caseSearch, setCaseSearch] = useState('');
  const [caseStatus, setCaseStatus] = useState('all');
  const cases: EvaluationCaseView[] = result?.cases ?? listedCases.data ?? [];
  const filteredCases = useMemo(() => cases.filter(testCase => {
    const textMatches = `${testCase.id} ${testCase.query} ${testCase.expected} ${testCase.actual ?? ''} ${testCase.explanation}`.toLowerCase().includes(caseSearch.toLowerCase());
    if (!textMatches || !result || caseStatus === 'all') return textMatches;
    const passed = testCase.passed === true;
    return caseStatus === 'passed' ? passed : !passed;
  }), [cases, caseSearch, caseStatus, result]);
  useEffect(() => {
    if (requestedCase && cases.some(testCase => testCase.id === requestedCase)) {
      const target = caseRefs.current[requestedCase];
      target?.focus();
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [requestedCase, cases]);
  function runSuite() {
    evaluation.mutate(undefined, {
      onSuccess: response => {
        window.dispatchEvent(new CustomEvent('gridpulse-event', { detail: { kind: 'success', title: 'Evaluation completed', detail: `${response.passed} passed and ${response.failed} failed across ${response.total} returned cases.` } }));
        toast({ title: 'Evaluation completed', description: `${response.passed} passed and ${response.failed} failed across ${response.total} returned cases.` });
      },
      onError: () => {
        window.dispatchEvent(new CustomEvent('gridpulse-event', { detail: { kind: 'error', title: 'Evaluation run failed', detail: 'The API request failed; no new evaluation result was returned.' } }));
        toast({ title: 'Evaluation could not be completed', description: 'The service returned an error. No new evaluation result is available.', variant: 'destructive' });
      },
    });
  }
  return <>
    <PageHeader eyebrow="Workspace / 04" title="Evaluation suite" description="Run the compact deterministic checks against actual expected and observed outcomes. Counts below come from the latest API response." action={<button className="button-primary" type="button" disabled={evaluation.isPending} onClick={runSuite} data-testid="button-run-evaluation">{evaluation.isPending ? <><LoaderCircle size={15} className="animate-spin" /> Running…</> : <><RotateCw size={14} /> Run compact suite</>}</button>} />
    {evaluation.isError && <div className="mb-5"><QueryError message="The evaluation request failed. The previous result, if present, is still shown." retry={runSuite} /></div>}
    {evaluation.isPending && !result ? <div className="panel p-6"><div className="eyebrow">Request pending</div><p className="mb-5 mt-2 text-sm text-muted-foreground">Waiting for the API evaluation response.</p><LoadingBlock rows={5} /></div> : result ? <>
      <div className="panel mb-5 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4">
          <EvaluationMetric label="Total cases" value={result.total} icon={<FileText size={15} />} />
          <EvaluationMetric label="Passed" value={result.passed} icon={<CheckCircle2 size={15} />} positive />
          <EvaluationMetric label="Failed" value={result.failed} icon={<XCircle size={15} />} negative={result.failed > 0} />
          <EvaluationMetric label="Sample size" value={result.sampleSize} icon={<Activity size={15} />} />
        </div>
        <div className="border-t border-border px-5 py-3 font-mono text-[10px] text-muted-foreground">RUN AT {shortTime(result.runAt)} <span className="mx-2">·</span> Results reflect this response only</div>
      </div>
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4"><div className="eyebrow">Case-by-case results</div><h2 className="mt-1 panel-title">Observed vs expected</h2></div>
        <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-[1fr_180px]">
          <label className="sr-only" htmlFor="evaluation-case-search">Search evaluation cases</label><input id="evaluation-case-search" className="field" type="search" value={caseSearch} onChange={e => setCaseSearch(e.target.value)} placeholder="Search case, query, outcome…" data-testid="input-evaluation-search" />
          <label className="sr-only" htmlFor="evaluation-case-status">Filter cases by result</label><select id="evaluation-case-status" className="field" value={caseStatus} onChange={e => setCaseStatus(e.target.value)} disabled={!result} data-testid="select-evaluation-status"><option value="all">{result ? 'All results' : 'Run suite to filter'}</option><option value="passed">Passed</option><option value="failed">Failed</option></select>
        </div>
        {listedCases.isError && !result && <div className="p-4"><QueryError message="Evaluation cases are unavailable." retry={() => void listedCases.refetch()} /></div>}
        {listedCases.isLoading && !result ? <div className="p-5"><LoadingBlock rows={4} /></div> : filteredCases.length ? <div className="divide-y divide-border">{filteredCases.map(testCase => <article ref={element => { caseRefs.current[testCase.id] = element; }} tabIndex={-1} key={testCase.id} className={`grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-start ${testCase.id === requestedCase ? 'bg-[hsl(var(--primary)/.08)]' : ''}`} data-testid={`evaluation-case-${testCase.id}`}>
          <div><div className="font-mono text-[10px] text-muted-foreground">{testCase.id}</div><p className="mt-1 text-sm leading-6">{testCase.query}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{testCase.explanation}</p></div>
          <EvaluationOutcome expected={testCase.expected} actual={testCase.actual} passed={testCase.passed} />
        </article>)}</div> : result.cases.length ? <EmptyState icon={<Search size={18} />} title="No matching cases" body="Change the search or result filter to see cases from this API response." action={<button className="button-secondary" onClick={() => { setCaseSearch(''); setCaseStatus('all'); }} type="button" data-testid="button-clear-evaluation-filters">Clear filters</button>} /> : <EmptyState icon={<FileSearch size={18} />} title="No cases returned" body="The suite completed without case details. Run it again or inspect the API status." />}
      </section>
    </> : <><section className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-4"><div className="eyebrow">Available case definitions</div><h2 className="mt-1 panel-title">Actual evaluation cases</h2><p className="mt-1 text-xs text-muted-foreground">These definitions load without running the suite. Run the suite to compute actual outcomes and summary counts.</p></div>
      <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-[1fr_180px]"><label className="sr-only" htmlFor="evaluation-case-search">Search evaluation cases</label><input id="evaluation-case-search" className="field" type="search" value={caseSearch} onChange={e => setCaseSearch(e.target.value)} placeholder="Search case ID, query, expected outcome…" data-testid="input-evaluation-search" /><label className="sr-only" htmlFor="evaluation-case-status">Filter cases by result</label><select id="evaluation-case-status" className="field" value={caseStatus} onChange={e => setCaseStatus(e.target.value)} disabled={!result} data-testid="select-evaluation-status"><option value="all">{result ? 'All results' : 'Run suite to filter'}</option><option value="passed">Passed</option><option value="failed">Failed</option></select></div>
      {listedCases.isLoading ? <div className="p-5"><LoadingBlock rows={4} /></div> : listedCases.isError ? <div className="p-5"><QueryError message="Evaluation cases are unavailable." retry={() => void listedCases.refetch()} /></div> : filteredCases.length ? <div className="divide-y divide-border">{filteredCases.map(testCase => <article ref={element => { caseRefs.current[testCase.id] = element; }} tabIndex={-1} key={testCase.id} className={`grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-start ${testCase.id === requestedCase ? 'bg-[hsl(var(--primary)/.08)]' : ''}`} data-testid={`evaluation-case-${testCase.id}`}><div><div className="font-mono text-[10px] text-muted-foreground">{testCase.id}</div><p className="mt-1 text-sm leading-6">{testCase.query}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{testCase.explanation}</p></div><EvaluationOutcome expected={testCase.expected} actual={testCase.actual} passed={testCase.passed} /></article>)}</div> : <EmptyState icon={<FileSearch size={18} />} title="No matching cases" body="No cases match the current search or result filter." action={<button className="button-secondary" type="button" onClick={() => { setCaseSearch(''); setCaseStatus('all'); }}>Clear filters</button>} />}
    </section><div className="mt-5"><button className="button-primary" type="button" disabled={evaluation.isPending} onClick={runSuite} data-testid="button-evaluation-empty"><RotateCw size={14} /> Run compact suite</button></div></>}
    <div className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground"><Info className="mt-0.5 shrink-0" size={14} />Evaluation cases are deterministic checks for this simulation. They are not reliability metrics or claims about real-world performance.</div>
  </>;
}

function EvaluationMetric({ label, value, icon, positive, negative }: { label: string; value: number; icon: ReactNode; positive?: boolean; negative?: boolean }) {
  return <div className="p-4 md:p-5"><div className="flex items-center justify-between gap-2"><span className="eyebrow !text-[9px]">{label}</span><span className={positive ? 'text-[hsl(var(--primary))]' : negative ? 'text-[hsl(var(--destructive))]' : 'text-muted-foreground'}>{icon}</span></div><div className="mt-2 font-serif text-3xl">{value}</div></div>;
}

function About() {
  return <>
    <PageHeader eyebrow="Workspace / 05" title="A simulation, with boundaries." description="GridPulse Copilot is an independent project exploring how synthetic incident notes can be organized into a source-linked, human-reviewed brief." />
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <section className="panel p-6 md:p-8">
        <div className="eyebrow">Project statement</div><h2 className="mt-2 max-w-xl font-serif text-2xl leading-snug">Traceability is part of the interface—not a footnote.</h2>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">This project demonstrates a small, inspectable workflow: a coordinator selects a fabricated scenario, asks a bounded question, and receives a draft with facts, assumptions, gaps, citations, and retrieval details. It is designed for review of the software concept, not for use in an actual incident.</p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">The output is machine-generated and can be incomplete or incorrect. A person must independently review the source material and decide whether any text is appropriate to retain or share.</p>
        <div className="mt-6 rounded-md border border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.08)] p-4">
          <div className="flex items-center gap-2 font-mono text-[10px] font-medium tracking-[.1em] text-[hsl(var(--accent))]"><ShieldCheck size={14} /> SAFETY BOUNDARY</div>
          <p className="mt-2 text-sm leading-6">No live utility or PG&amp;E integration is represented. This interface offers no operational advice, field directions, or performance guarantees.</p>
        </div>
      </section>
      <aside className="space-y-4">
        <InfoBlock number="01" title="Independent project" body="Not built for, affiliated with, connected to, approved by, or endorsed by PG&E or any utility or public agency." />
        <InfoBlock number="02" title="Synthetic simulation" body="Scenarios and demo content are fictional or synthetic and may not reflect real assets, events, or procedures." />
        <InfoBlock number="03" title="Source limitations" body="Labels and citation excerpts support inspection; they do not certify accuracy, currency, completeness, or suitability." />
        <InfoBlock number="04" title="GO 174 pointer" body="Any GO 174 reference in the library is explicitly treated as an unvalidated pointer—not validated guidance." />
      </aside>
    </div>
  </>;
}

function InfoBlock({ number, title, body }: { number: string; title: string; body: string }) {
  return <article className="panel p-5"><div className="flex gap-3"><span className="font-mono text-[10px] text-[hsl(var(--accent))]">{number}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p></div></div></article>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>
    <Shell>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/copilot" component={Copilot} />
        <Route path="/knowledge" component={Knowledge} />
        <Route path="/evaluation" component={Evaluation} />
        <Route path="/data" component={DataCatalog} />
        <Route path="/data/:datasetId" component={DatasetDetailPage} />
        <Route path="/about" component={About} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  </ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;
