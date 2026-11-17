import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Routes, Route } from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Layers,
  LayoutDashboard,
  Server,
  CheckSquare,
  BookOpen,
  LogOut,
  Plus,
  Search,
  X,
  ArrowUpRight,
  Copy,
  Star,
  RefreshCw,
  Trash2,
  Pencil,
} from "lucide-react";
import type {
  NamedRecord,
  TaskRecord,
  PromptRecord,
  ServerRecord,
} from "@hivehub/contracts";
import { api } from "./api";
import "./style.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const useData = <T,>(key: string) =>
  useQuery({
    queryKey: [key],
    queryFn: () => api<T>(key),
    refetchInterval: key === "servers" ? 15000 : false,
  });
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Layers size={30} />
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    const selector =
      'button:not(:disabled), input:not(:disabled), textarea, select, [href], [tabindex="0"]';
    const first = node?.querySelector<HTMLElement>(selector);
    first?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = [
        ...(node?.querySelectorAll<HTMLElement>(selector) ?? []),
      ];
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    node?.addEventListener("keydown", trap);
    return () => {
      node?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay" onClick={close}>
      <section
        className="modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="关闭" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function useActions() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { act, error, busy, setError };
}
function Feedback({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
function Login() {
  const { act, error, busy } = useActions();
  return (
    <div className="login">
      <Layers size={38} />
      <h1>欢迎回到 HiveHub</h1>
      <p className="muted">为你的日常，留一个有序的空间。</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(() => api("auth/login", "POST", Object.fromEntries(f)));
        }}
      >
        <Field label="用户名">
          <input name="username" autoComplete="username" required autoFocus />
        </Field>
        <Field label="密码">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Feedback error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "正在登录…" : "登录"}
        </button>
      </form>
      <small>你的个人事务中心</small>
    </div>
  );
}
function Dashboard() {
  const servers = useData<ServerRecord[]>("servers"),
    tasks = useData<TaskRecord[]>("tasks"),
    prompts = useData<PromptRecord[]>("prompts");
  const pending = tasks.data?.filter((t) => !t.completed) || [];
  return (
    <>
      <div className="intro">
        <p className="muted">
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
        <h1>把日常，安放妥当。</h1>
        <p className="muted">从一件小事开始，照顾好你的数字生活。</p>
      </div>
      <div className="stats">
        {[
          ["服务器", servers.data?.length || 0, "连接你的基础设施"],
          ["待完成", pending.length, "给重要的事一点空间"],
          ["提示词", prompts.data?.length || 0, "保存值得复用的表达"],
        ].map(([label, count, note]) => (
          <div key={label}>
            <span className="muted">{label}</span>
            <strong>{count}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <header>
            <h2>接下来要做</h2>
            <NavLink to="/tasks">
              查看清单 <ArrowUpRight size={15} />
            </NavLink>
          </header>
          {pending.length ? (
            pending.slice(0, 5).map((t) => (
              <div className="simple-row" key={t.id}>
                <span className="circle" />
                {t.title}
              </div>
            ))
          ) : (
            <Empty>暂无待办，在清单中记下下一件事。</Empty>
          )}
        </section>
        <section className="panel">
          <header>
            <h2>服务器状态</h2>
            <NavLink to="/servers">
              查看全部 <ArrowUpRight size={15} />
            </NavLink>
          </header>
          {servers.data?.length ? (
            servers.data.slice(0, 5).map((s) => (
              <div className="simple-row" key={s.id}>
                <span
                  className={
                    "dot " + (s.error ? "bad" : s.lastSuccess ? "good" : "")
                  }
                />
                <span>{s.name}</span>
                <small className="ml-auto muted">{status(s)}</small>
              </div>
            ))
          ) : (
            <Empty>添加服务器，开始关注运行状态。</Empty>
          )}
        </section>
      </div>
      <section className="panel mt">
        <header>
          <h2>收藏的提示词</h2>
          <NavLink to="/prompts">
            打开模板库 <ArrowUpRight size={15} />
          </NavLink>
        </header>
        {prompts.data?.some((p) => p.favorite) ? (
          <div className="prompt-grid">
            {prompts.data
              .filter((p) => p.favorite)
              .slice(0, 3)
              .map((p) => (
                <article key={p.id}>
                  <BookOpen size={18} />
                  <h3>{p.title}</h3>
                  <p className="excerpt">{p.body}</p>
                </article>
              ))}
          </div>
        ) : (
          <Empty>把常用提示词收藏在这里，随时取用。</Empty>
        )}
      </section>
      {[servers, tasks, prompts].map((q, i) =>
        q.error ? <Feedback key={i} error={q.error.message} /> : null,
      )}
    </>
  );
}
function Tasks() {
  const q = useData<TaskRecord[]>("tasks"),
    lists = useData<NamedRecord[]>("task-lists");
  const { act, error, busy } = useActions();
  const [list, setList] = useState("all"),
    [filter, setFilter] = useState("all"),
    [editing, setEditing] = useState<TaskRecord | null | undefined>();
  const [listEditor, setListEditor] = useState<
    NamedRecord | null | undefined
  >();
  const [quick, setQuick] = useState("");
  const target = list === "all" ? lists.data?.find((l) => l.inbox)?.id : list;
  const items =
    q.data?.filter(
      (t) =>
        (list === "all" || t.listId === list) &&
        (filter === "all" || t.completed === (filter === "done")),
    ) || [];
  return (
    <>
      <PageTitle title="待办清单" subtitle="腾出头脑，把事情写下来。">
        <button className="primary" onClick={() => setListEditor(null)}>
          <Plus size={16} />
          新建清单
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="tabs">
          <button
            className={list === "all" ? "selected" : ""}
            onClick={() => setList("all")}
          >
            全部清单
          </button>
          {lists.data?.map((l) => (
            <button
              key={l.id}
              className={list === l.id ? "selected" : ""}
              onClick={() => setList(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
        <select
          aria-label="任务状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="open">未完成</option>
          <option value="done">已完成</option>
        </select>
      </div>
      {list !== "all" && (
        <div className="actions">
          <button
            onClick={() =>
              setListEditor(lists.data?.find((l) => l.id === list))
            }
          >
            重命名清单
          </button>
          {!lists.data?.find((l) => l.id === list)?.inbox && (
            <button
              onClick={() => {
                if (confirm("删除清单？其中的任务将移入收件箱。"))
                  void act(async () => {
                    await api("task-lists/" + list, "DELETE");
                    setList("all");
                  });
              }}
            >
              删除清单
            </button>
          )}
        </div>
      )}
      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (target)
            void act(async () => {
              await api("tasks", "POST", {
                title: quick,
                notes: "",
                listId: target,
              });
              setQuick("");
            });
        }}
      >
        <Plus size={20} />
        <input
          aria-label="新任务"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder="有什么需要记下来？"
          maxLength={200}
          required
        />
        <button disabled={busy || !target} className="primary">
          添加任务
        </button>
      </form>
      <section className="panel task-list">
        {q.isPending ? (
          <p>正在加载…</p>
        ) : items.length ? (
          items.map((t) => (
            <div className="task-row" key={t.id}>
              <input
                aria-label={"完成 " + t.title}
                type="checkbox"
                checked={t.completed}
                disabled={busy}
                onChange={() =>
                  void act(() =>
                    api("tasks/" + t.id, "PUT", {
                      title: t.title,
                      notes: t.notes,
                      listId: t.listId,
                      completed: !t.completed,
                    }),
                  )
                }
              />
              <div className={t.completed ? "completed" : ""}>
                <strong>{t.title}</strong>
                {t.notes && <p className="muted">{t.notes}</p>}
                <small className="muted">
                  {lists.data?.find((l) => l.id === t.listId)?.name}
                </small>
              </div>
              <div className="row-actions">
                <button aria-label="编辑任务" onClick={() => setEditing(t)}>
                  <Pencil size={16} />
                </button>
                <button
                  aria-label="删除任务"
                  onClick={() => {
                    if (confirm("删除这条任务？"))
                      void act(() => api("tasks/" + t.id, "DELETE"));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <Empty>清单空空，给今天留一点余地。</Empty>
        )}
      </section>
      {editing !== undefined && (
        <Modal title="编辑任务" close={() => setEditing(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api("tasks/" + editing!.id, "PUT", {
                  title: f.get("title"),
                  notes: f.get("notes"),
                  listId: f.get("listId"),
                  completed: editing!.completed,
                });
                setEditing(undefined);
              });
            }}
          >
            <Field label="标题">
              <input
                name="title"
                defaultValue={editing?.title}
                required
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field label="备注">
              <textarea name="notes" defaultValue={editing?.notes} />
            </Field>
            <Field label="清单">
              <select name="listId" defaultValue={editing?.listId}>
                {lists.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Feedback error={error} />
            <button disabled={busy} className="primary">
              保存
            </button>
          </form>
        </Modal>
      )}
      {listEditor !== undefined && (
        <Modal
          title={listEditor ? "重命名清单" : "新建清单"}
          close={() => setListEditor(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name");
              void act(async () => {
                await api(
                  "task-lists" + (listEditor ? "/" + listEditor.id : ""),
                  listEditor ? "PUT" : "POST",
                  { name },
                );
                setListEditor(undefined);
              });
            }}
          >
            <Field label="清单名称">
              <input
                name="name"
                defaultValue={listEditor?.name}
                required
                maxLength={200}
                autoFocus
              />
            </Field>
            <Feedback error={error} />
            <button className="primary" disabled={busy}>
              保存
            </button>
          </form>
        </Modal>
      )}
      <Feedback
        error={error || q.error?.message || lists.error?.message || ""}
      />
    </>
  );
}
function PageTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
function Prompts() {
  const q = useData<PromptRecord[]>("prompts"),
    cats = useData<NamedRecord[]>("prompt-categories");
  const { act, error, busy } = useActions();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("all"),
    [tag, setTag] = useState(""),
    [favorites, setFavorites] = useState(false),
    [editing, setEditing] = useState<PromptRecord | null | undefined>(),
    [categoryEditor, setCategoryEditor] = useState(false),
    [notice, setNotice] = useState("");
  const items =
    q.data?.filter(
      (p) =>
        (!favorites || p.favorite) &&
        (category === "all" || p.categoryId === category) &&
        (!tag || p.tags.includes(tag)) &&
        [p.title, p.body, ...p.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("已复制到剪贴板");
    } catch {
      setNotice("复制失败，请在详情中选中正文后手动复制。");
    }
  }
  return (
    <>
      <PageTitle title="提示词模板库" subtitle="收藏好表达，让灵感可以复用。">
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          新建提示词
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="搜索提示词"
            placeholder="搜索标题、正文或标签"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="提示词分类"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">全部分类</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="标签筛选"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">全部标签</option>
          {[...new Set(q.data?.flatMap((p) => p.tags) || [])].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          className={favorites ? "selected" : ""}
          onClick={() => setFavorites(!favorites)}
        >
          <Star size={16} />
          仅收藏
        </button>
        <button onClick={() => setCategoryEditor(true)}>管理分类</button>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="prompt-grid">
        {items.map((p) => (
          <article className="prompt-card" key={p.id}>
            <div className="card-top">
              <span className="badge">
                {cats.data?.find((c) => c.id === p.categoryId)?.name ||
                  "未分类"}
              </span>
              <button
                aria-label={p.favorite ? "取消收藏" : "收藏"}
                onClick={() =>
                  void act(() =>
                    api("prompts/" + p.id, "PUT", {
                      title: p.title,
                      body: p.body,
                      categoryId: p.categoryId,
                      tags: p.tags,
                      favorite: !p.favorite,
                    }),
                  )
                }
              >
                <Star size={18} fill={p.favorite ? "currentColor" : "none"} />
              </button>
            </div>
            <button className="text-button" onClick={() => setEditing(p)}>
              <h3>{p.title}</h3>
            </button>
            <p className="excerpt">{p.body}</p>
            <div className="tags">
              {p.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
            <footer>
              <button onClick={() => void copy(p.body)}>
                <Copy size={15} />
                复制原文
              </button>
              <div className="actions">
                <button aria-label="编辑提示词" onClick={() => setEditing(p)}>
                  <Pencil size={16} />
                </button>
                <button
                  aria-label="删除提示词"
                  onClick={() => {
                    if (confirm("删除这条提示词？"))
                      void act(() => api("prompts/" + p.id, "DELETE"));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
      {q.isPending ? (
        <p>正在加载…</p>
      ) : (
        !items.length && <Empty>还没有匹配的提示词，添加一条常用表达吧。</Empty>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "编辑提示词" : "新建提示词"}
          close={() => setEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(async () => {
                await api(
                  "prompts" + (editing ? "/" + editing.id : ""),
                  editing ? "PUT" : "POST",
                  {
                    title: f.get("title"),
                    body: f.get("body"),
                    categoryId: f.get("categoryId") || null,
                    tags: String(f.get("tags"))
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    favorite: editing?.favorite || false,
                  },
                );
                setEditing(undefined);
              });
            }}
          >
            <Field label="标题">
              <input
                name="title"
                required
                maxLength={200}
                defaultValue={editing?.title}
                autoFocus
              />
            </Field>
            <Field label="正文">
              <textarea
                className="prompt-body"
                name="body"
                required
                maxLength={100000}
                defaultValue={editing?.body}
              />
            </Field>
            <Field label="分类">
              <select
                name="categoryId"
                defaultValue={editing?.categoryId || ""}
              >
                <option value="">未分类</option>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="标签（英文逗号分隔）">
              <input name="tags" defaultValue={editing?.tags.join(", ")} />
            </Field>
            <Feedback error={error} />
            <button className="primary" disabled={busy}>
              保存提示词
            </button>
          </form>
        </Modal>
      )}
      {categoryEditor && (
        <Modal title="管理分类" close={() => setCategoryEditor(false)}>
          {cats.data?.map((c) => (
            <div className="simple-row" key={c.id}>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get("name");
                  void act(() =>
                    api("prompt-categories/" + c.id, "PUT", { name }),
                  );
                }}
              >
                <input
                  aria-label="分类名称"
                  name="name"
                  defaultValue={c.name}
                  required
                  maxLength={200}
                />
                <button disabled={busy}>保存</button>
              </form>
              <button
                aria-label="删除分类"
                onClick={() => {
                  if (confirm("删除分类？提示词将保留并变为未分类。"))
                    void act(() => api("prompt-categories/" + c.id, "DELETE"));
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <form
            className="inline-form mt"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = new FormData(form).get("name");
              void act(async () => {
                await api("prompt-categories", "POST", { name });
                form.reset();
              });
            }}
          >
            <input
              name="name"
              aria-label="新分类名称"
              placeholder="新分类名称"
              required
              maxLength={200}
            />
            <button className="primary" disabled={busy}>
              添加
            </button>
          </form>
          <Feedback error={error} />
        </Modal>
      )}
      <Feedback
        error={error || q.error?.message || cats.error?.message || ""}
      />
    </>
  );
}
function status(s: ServerRecord) {
  return !s.fingerprint
    ? "待确认指纹"
    : s.error
      ? "连接失败"
      : !s.lastSuccess
        ? "待采集"
        : Date.now() - new Date(s.lastSuccess).getTime() > 180000
          ? "数据过期"
          : "运行正常";
}
const bytes = (n: number) =>
  n >= 1073741824
    ? (n / 1073741824).toFixed(1) + " GB"
    : (n / 1048576).toFixed(0) + " MB";
function Servers() {
  const q = useData<ServerRecord[]>("servers");
  const { act, error, busy } = useActions();
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<ServerRecord | null | undefined>();
  const [notice, setNotice] = useState("");
  async function test(s: ServerRecord) {
    await act(async () => {
      const result = await api<{ fingerprint: string; changed: boolean }>(
        "servers/" + s.id + "/test",
        "POST",
      );
      if (
        confirm(
          (result.changed
            ? "主机指纹已变化。请通过可信渠道核对后再确认。\n"
            : "请通过可信渠道核对主机指纹：\n") +
            result.fingerprint +
            "\n是否信任此指纹？",
        )
      ) {
        await api("servers/" + s.id + "/fingerprint", "POST", {
          fingerprint: result.fingerprint,
        });
        setNotice("指纹已保存，可以刷新采集。");
      }
    });
  }
  const items =
    q.data?.filter((s) =>
      [s.name, s.host, s.group, ...s.tags]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <PageTitle title="服务器" subtitle="保持连接，了解每一台机器的近况。">
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          添加服务器
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="搜索服务器"
            placeholder="搜索名称、地址、分组或标签"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">每分钟更新 · 仅保留最新状态</span>
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="server-grid">
        {items.map((s) => (
          <article className="server-card" key={s.id}>
            <div className="card-top">
              <div className="server-icon">
                <Server size={22} />
              </div>
              <span
                className={
                  "badge " + (status(s) === "运行正常" ? "success" : "")
                }
              >
                {status(s)}
              </span>
            </div>
            <h2>{s.name}</h2>
            <p className="muted">
              {s.username}@{s.host}:{s.port}
            </p>
            {s.group && <span className="badge">{s.group}</span>}
            <div className="tags">
              {s.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </div>
            {s.metrics ? (
              <>
                <Meter
                  label="CPU"
                  value={s.metrics.cpu}
                  detail={s.metrics.cpu.toFixed(1) + "%"}
                />
                <Meter
                  label="内存"
                  value={(s.metrics.memory.used / s.metrics.memory.total) * 100}
                  detail={
                    bytes(s.metrics.memory.used) +
                    " / " +
                    bytes(s.metrics.memory.total)
                  }
                />
                {s.metrics.disks.map((d) => (
                  <Meter
                    key={d.mount}
                    label={"磁盘 " + d.mount}
                    value={d.total ? (d.used / d.total) * 100 : 0}
                    detail={bytes(d.used) + " / " + bytes(d.total)}
                  />
                ))}
                <p className="muted">
                  已运行 {Math.floor(s.metrics.uptime / 86400)} 天
                </p>
              </>
            ) : (
              <p className="empty-metrics">确认指纹后，获取运行指标。</p>
            )}
            {s.notes && <p className="excerpt">{s.notes}</p>}
            {s.error && <Feedback error={s.error} />}
            <small className="muted">
              最近尝试：
              {s.lastAttempt
                ? new Date(s.lastAttempt).toLocaleString()
                : "尚未采集"}
              <br />
              最近成功：
              {s.lastSuccess
                ? new Date(s.lastSuccess).toLocaleString()
                : "尚未采集"}
            </small>
            <footer>
              <button disabled={busy} onClick={() => void test(s)}>
                测试连接 / 指纹
              </button>
              <div className="actions">
                <button
                  aria-label="刷新指标"
                  disabled={busy || !s.fingerprint}
                  onClick={() =>
                    void act(async () => {
                      const r = await api<{ status: string; message?: string }>(
                        "servers/" + s.id + "/refresh",
                        "POST",
                      );
                      setNotice(
                        r.status === "ok"
                          ? "指标已更新"
                          : r.message || "当前采集状态：" + r.status,
                      );
                    })
                  }
                >
                  <RefreshCw size={16} />
                </button>
                <button aria-label="编辑服务器" onClick={() => setEditing(s)}>
                  <Pencil size={16} />
                </button>
                <button
                  aria-label="删除服务器"
                  onClick={() => {
                    if (confirm("删除这台服务器的资料？"))
                      void act(() => api("servers/" + s.id, "DELETE"));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
      {q.isPending ? (
        <p>正在加载…</p>
      ) : (
        !items.length && <Empty>添加第一台服务器，把基础设施集中在这里。</Empty>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? "编辑服务器" : "添加服务器"}
          close={() => setEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const data = Object.fromEntries(f);
              if (!data.privateKey) {
                delete data.privateKey;
                delete data.passphrase;
              }
              void act(async () => {
                await api(
                  "servers" + (editing ? "/" + editing.id : ""),
                  editing ? "PUT" : "POST",
                  {
                    ...data,
                    port: Number(f.get("port")),
                    tags: String(f.get("tags"))
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                );
                setEditing(undefined);
              });
            }}
          >
            {[
              ["name", "名称"],
              ["host", "主机地址"],
              ["username", "SSH 用户名"],
              ["group", "分组"],
            ].map(([name, label]) => (
              <Field key={name} label={label!}>
                <input
                  name={name}
                  defaultValue={
                    editing?.[name as "name" | "host" | "username" | "group"]
                  }
                  required={name !== "group"}
                  maxLength={200}
                  autoFocus={name === "name"}
                />
              </Field>
            ))}
            <Field label="SSH 端口">
              <input
                name="port"
                type="number"
                min={1}
                max={65535}
                defaultValue={editing?.port || 22}
                required
              />
            </Field>
            <Field label={editing ? "新私钥（留空保留原凭据）" : "SSH 私钥"}>
              <textarea
                name="privateKey"
                required={!editing}
                autoComplete="off"
                maxLength={50000}
              />
            </Field>
            <Field label="私钥口令（可选，随新私钥一起保存）">
              <input
                name="passphrase"
                type="password"
                autoComplete="new-password"
              />
            </Field>
            <Field label="标签（英文逗号分隔）">
              <input name="tags" defaultValue={editing?.tags.join(", ")} />
            </Field>
            <Field label="备注">
              <textarea name="notes" defaultValue={editing?.notes} />
            </Field>
            <Feedback error={error} />
            <button className="primary" disabled={busy}>
              保存服务器
            </button>
          </form>
        </Modal>
      )}
      <Feedback error={error || q.error?.message || ""} />
    </>
  );
}
function Meter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
      <progress max={100} value={value} aria-label={label} />
    </div>
  );
}
function App() {
  const me = useQuery({
    queryKey: ["auth/me"],
    queryFn: () => api<{ username: string }>("auth/me"),
  });
  const { act, error } = useActions();
  if (me.isPending) return <div className="loading">正在打开 HiveHub…</div>;
  if (me.error) {
    if ((me.error as Error & { status?: number }).status === 401)
      return <Login />;
    return (
      <div className="login">
        <h1>暂时无法连接</h1>
        <Feedback error={me.error.message} />
        <button onClick={() => void me.refetch()}>重试</button>
      </div>
    );
  }
  return (
    <BrowserRouter>
      <aside>
        <NavLink className="brand" to="/">
          <Layers size={27} />
          <span>
            HiveHub<small>个人事务中心</small>
          </span>
        </NavLink>
        <nav>
          {[
            ["/", "概览", LayoutDashboard],
            ["/servers", "服务器", Server],
            ["/tasks", "待办清单", CheckSquare],
            ["/prompts", "提示词模板库", BookOpen],
          ].map(([path, label, Icon]) => (
            <NavLink key={String(path)} to={String(path)} end={path === "/"}>
              {React.createElement(Icon as typeof Layers, { size: 19 })}
              {String(label)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">
            {me.data?.username.slice(0, 1).toUpperCase()}
          </span>
          <span>
            {me.data?.username}
            <small>个人工作空间</small>
          </span>
          <button
            aria-label="退出登录"
            onClick={() =>
              void act(async () => {
                await api("auth/logout", "POST");
                client.clear();
              })
            }
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>个人工作空间</span>
          <span className="private">
            <button
              aria-label="退出当前账户"
              onClick={() =>
                void act(async () => {
                  await api("auth/logout", "POST");
                  client.clear();
                })
              }
            >
              <LogOut size={16} />
            </button>
            <span className="dot good" />
            私有空间
          </span>
        </div>
        <div className="content">
          <Feedback error={error} />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/servers" element={<Servers />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route
              path="*"
              element={<Empty>页面不存在，请通过侧栏访问。</Empty>}
            />
          </Routes>
        </div>
      </main>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
