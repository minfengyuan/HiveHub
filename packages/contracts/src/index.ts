import { Type, type Static } from "@sinclair/typebox";
const text = (maxLength = 200) => Type.String({ maxLength });
const title = Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" });
export const Login = Type.Object(
  { username: title, password: Type.String({ minLength: 1, maxLength: 1024 }) },
  { additionalProperties: false },
);
export const Named = Type.Object(
  { name: title },
  { additionalProperties: false },
);
export const Task = Type.Object(
  {
    title,
    notes: Type.Optional(text(20000)),
    listId: Type.String({ format: "uuid" }),
    completed: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export const Prompt = Type.Object(
  {
    title,
    body: text(100000),
    categoryId: Type.Optional(
      Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    ),
    tags: Type.Optional(Type.Array(text(60), { maxItems: 30 })),
    favorite: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export const Server = Type.Object(
  {
    name: title,
    host: Type.String({
      minLength: 1,
      maxLength: 253,
      pattern: "^[a-zA-Z0-9.:_-]+$",
    }),
    port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
    username: Type.String({
      minLength: 1,
      maxLength: 128,
      pattern: "^[a-zA-Z0-9_.-]+$",
    }),
    privateKey: Type.Optional(text(50000)),
    passphrase: Type.Optional(text(1000)),
    group: Type.Optional(text()),
    tags: Type.Optional(Type.Array(text(60), { maxItems: 30 })),
    notes: Type.Optional(text(20000)),
  },
  { additionalProperties: false },
);
export interface Metrics {
  cpu: number;
  memory: { used: number; total: number };
  disks: { mount: string; used: number; total: number }[];
  uptime: number;
}
export interface ServerRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  group: string;
  tags: string[];
  notes: string;
  fingerprint: string | null;
  hasPrivateKey: boolean;
  metrics: Metrics | null;
  lastSuccess: string | null;
  lastAttempt: string | null;
  error: string | null;
}
export type TaskInput = Static<typeof Task>;
export type PromptInput = Static<typeof Prompt>;
export type ServerInput = Static<typeof Server>;
export interface TaskRecord extends TaskInput {
  id: string;
  completed: boolean;
  createdAt: string;
}
export interface PromptRecord extends PromptInput {
  id: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
}
export interface NamedRecord {
  id: string;
  name: string;
  inbox?: boolean;
}
