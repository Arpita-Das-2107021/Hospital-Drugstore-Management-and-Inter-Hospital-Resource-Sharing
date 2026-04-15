import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  inventoryModuleApi,
  pharmacyCsvApi,
  type CsvAssistantIssue,
  type CsvAssistantResponsePayload,
} from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/components/layout/LanguageToggle';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Languages,
  Loader2,
  MessageSquare,
  RefreshCcw,
  Sparkles,
  Upload,
} from 'lucide-react';

type ImportMode = 'MERGE' | 'REPLACE_UPLOADED_SCOPE' | 'FULL_REPLACE';
type LanguageCode = 'en' | 'bn';
type CsvModule = 'inventory' | 'pharmacy';
type PharmacyDataset = 'sales' | 'staff' | 'movement';
type SessionDataset = 'inventory' | PharmacyDataset;
type ApiRequestError = Error & { status?: number; payload?: unknown };

interface CsvRowError {
  row_number?: number | string;
  field_name?: string;
  error_code?: string;
  message?: string;
}

interface ValidationSummary {
  fileId: string;
  fileHash: string;
  language: LanguageCode;
  totalRows: number;
  validRows: number;
  errorRows: number;
  jobId?: string;
  rowErrors: CsvRowError[];
  expectedColumns: string[];
}

interface CsvChatResponse {
  fileId: string;
  language: LanguageCode;
  response: CsvAssistantResponsePayload;
}

interface SessionChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt?: string;
  outOfScope?: boolean;
  replyMode?: string;
  response?: CsvAssistantResponsePayload;
}

interface SessionReplyPayload {
  response: CsvAssistantResponsePayload;
  outOfScope: boolean;
  replyMode?: string;
}

const ASSISTANT_RESPONSE_FALLBACK_SUMMARY =
  'We could not process the assistant response. Please try again in a moment.';

const ASSISTANT_RESPONSE_FALLBACK_RECOMMENDATION =
  'Review the CSV row data and retry validation.';

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  return [];
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const normalizeLanguage = (value: unknown): LanguageCode => {
  return String(value).toLowerCase() === 'bn' ? 'bn' : 'en';
};

const readColumns = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeExpectedColumns = (payload: Record<string, unknown>): string[] => {
  const summary = asRecord(payload.summary);
  const data = asRecord(payload.data);
  const result = asRecord(payload.result);

  const candidates = [
    payload.expected_columns,
    payload.expected_fields,
    payload.columns,
    summary.expected_columns,
    summary.expected_fields,
    summary.columns,
    data.expected_columns,
    data.expected_fields,
    data.columns,
    result.expected_columns,
    result.expected_fields,
    result.columns,
  ];

  for (const candidate of candidates) {
    const parsed = readColumns(candidate);
    if (parsed.length > 0) return parsed;
  }

  return [];
};

const normalizeErrors = (data: Record<string, unknown>): CsvRowError[] => {
  const candidates = [
    data.row_errors,
    data.errors,
    data.validation_errors,
    asRecord(data.summary).row_errors,
    asRecord(data.data).row_errors,
    asRecord(data.result).row_errors,
  ];

  for (const candidate of candidates) {
    const list = asArray(candidate);
    if (list.length === 0) continue;

    return list.map((item) => {
      const row = asRecord(item);
      const rawRowNumber = row.row_number ?? row.row ?? row.line_number;
      const rowNumber = typeof rawRowNumber === 'number' || typeof rawRowNumber === 'string'
        ? rawRowNumber
        : undefined;
      return {
        row_number: rowNumber,
        field_name: String(row.field_name ?? row.field ?? row.column ?? ''),
        error_code: String(row.error_code ?? row.code ?? ''),
        message: String(row.message ?? row.error ?? row.detail ?? 'Validation error'),
      };
    });
  }

  return [];
};

const normalizeValidation = (payload: unknown): ValidationSummary => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const summary = asRecord(data.summary);
  const nested = asRecord(data.result);

  const fileId = String(
    data.file_id ?? summary.file_id ?? nested.file_id ?? root.file_id ?? ''
  );
  const fileHash = String(
    data.file_hash ?? summary.file_hash ?? nested.file_hash ?? root.file_hash ?? ''
  );
  const language = normalizeLanguage(
    data.language ?? summary.language ?? nested.language ?? root.language ?? 'en'
  );
  const totalRows = toNumber(data.total_rows ?? summary.total_rows ?? nested.total_rows ?? 0);
  const validRows = toNumber(data.valid_rows ?? summary.valid_rows ?? nested.valid_rows ?? 0);
  const errorRows = toNumber(data.error_rows ?? summary.error_rows ?? nested.error_rows ?? 0);
  const jobId = String(data.job_id ?? summary.job_id ?? nested.job_id ?? root.job_id ?? '') || undefined;
  const expectedColumns = normalizeExpectedColumns({ ...root, data, summary, result: nested });
  const rowErrorSource = { ...root, data, summary, result: nested, row_errors: data.row_errors ?? root.row_errors };

  return {
    fileId,
    fileHash,
    language,
    totalRows,
    validRows,
    errorRows,
    jobId,
    rowErrors: normalizeErrors(rowErrorSource),
    expectedColumns,
  };
};

const hasAssistantLikeFields = (value: unknown): boolean => {
  const node = asRecord(value);
  return (
    Object.prototype.hasOwnProperty.call(node, 'success') ||
    Object.prototype.hasOwnProperty.call(node, 'summary') ||
    Object.prototype.hasOwnProperty.call(node, 'issues') ||
    Object.prototype.hasOwnProperty.call(node, 'recommendation') ||
    Object.prototype.hasOwnProperty.call(node, 'explanation') ||
    Object.prototype.hasOwnProperty.call(node, 'classified_errors') ||
    Object.prototype.hasOwnProperty.call(node, 'classifiedErrors') ||
    Object.prototype.hasOwnProperty.call(node, 'reply') ||
    Object.prototype.hasOwnProperty.call(node, 'answer')
  );
};

const parseStrictAssistantIssue = (value: unknown): CsvAssistantIssue | null => {
  const issue = asRecord(value);
  const row = Number(issue.row);
  const message = toText(issue.message);
  const recommendation = toText(issue.recommendation);

  if (!Number.isFinite(row) || !message || !recommendation) {
    return null;
  }

  return {
    row,
    message,
    recommendation,
  };
};

const parseStrictAssistantPayload = (value: unknown): CsvAssistantResponsePayload | null => {
  const payload = asRecord(value);

  if (typeof payload.success !== 'boolean') {
    return null;
  }
  if (typeof payload.summary !== 'string') {
    return null;
  }
  if (!Array.isArray(payload.issues)) {
    return null;
  }

  const parsedIssues: CsvAssistantIssue[] = [];
  for (const issue of payload.issues) {
    const parsedIssue = parseStrictAssistantIssue(issue);
    if (!parsedIssue) {
      return null;
    }
    parsedIssues.push(parsedIssue);
  }

  return {
    success: payload.success,
    summary: payload.summary.trim(),
    issues: parsedIssues,
  };
};

const mapLegacyAssistantIssue = (value: unknown, index: number): CsvAssistantIssue | null => {
  const issue = asRecord(value);
  const message = toText(issue.message ?? issue.detail ?? issue.description ?? issue.error ?? issue.code);
  if (!message) {
    return null;
  }

  const rowCandidate = issue.row ?? issue.row_number ?? issue.line_number ?? index + 1;
  const row = Number(rowCandidate);

  return {
    row: Number.isFinite(row) ? row : index + 1,
    message,
    recommendation:
      toText(issue.recommendation ?? issue.fix ?? issue.suggestion ?? issue.action) ||
      ASSISTANT_RESPONSE_FALLBACK_RECOMMENDATION,
  };
};

const mapLegacyAssistantPayload = (value: unknown): CsvAssistantResponsePayload | null => {
  const payload = asRecord(value);
  const summary =
    toText(payload.explanation) ||
    toText(payload.reply) ||
    toText(payload.answer) ||
    toText(payload.message);

  const classified = asArray(payload.classified_errors ?? payload.classifiedErrors);
  const mappedIssues = classified
    .map((issue, index) => mapLegacyAssistantIssue(issue, index))
    .filter((issue): issue is CsvAssistantIssue => issue !== null);

  if (!summary && mappedIssues.length === 0) {
    return null;
  }

  return {
    success: mappedIssues.length === 0,
    summary:
      summary ||
      (mappedIssues.length > 0
        ? 'Detected row-level issues from legacy assistant response.'
        : 'No row-level issues were returned.'),
    issues: mappedIssues,
  };
};

const normalizeAssistantPayload = (payload: unknown, contextLabel: string): CsvAssistantResponsePayload => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const candidates = [
    data.response,
    root.response,
    payload,
    data,
    root,
  ];

  for (const candidate of candidates) {
    const strict = parseStrictAssistantPayload(candidate);
    if (strict) {
      return strict;
    }
  }

  for (const candidate of candidates) {
    const legacy = mapLegacyAssistantPayload(candidate);
    if (legacy) {
      console.warn('[CSV assistant] Using legacy response shim.', {
        context: contextLabel,
      });
      return legacy;
    }
  }

  console.warn('[CSV assistant] Malformed response payload. Using fallback response.', {
    context: contextLabel,
  });
  return {
    success: false,
    summary: ASSISTANT_RESPONSE_FALLBACK_SUMMARY,
    issues: [],
  };
};

const normalizeChatResponse = (
  payload: unknown,
  fallbackFileId: string,
  fallbackLanguage: LanguageCode,
  contextLabel: string,
): CsvChatResponse => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const resolved = Object.keys(data).length > 0 ? data : root;

  return {
    fileId: toText(resolved.file_id ?? root.file_id ?? fallbackFileId),
    language: normalizeLanguage(resolved.language ?? root.language ?? fallbackLanguage),
    response: normalizeAssistantPayload(payload, contextLabel),
  };
};

const toMessageList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const normalizeFieldErrors = (payload: unknown): Record<string, string[]> => {
  const root = asRecord(payload);
  const error = asRecord(root.error);

  const candidates = [
    error.details,
    root.errors,
    root.detail,
    asRecord(root.data).errors,
    asRecord(root.data).detail,
  ];

  for (const candidate of candidates) {
    const item = asRecord(candidate);
    const entries = Object.entries(item)
      .map(([field, value]) => [field, toMessageList(value)] as const)
      .filter(([, messages]) => messages.length > 0);

    if (entries.length > 0) {
      return Object.fromEntries(entries);
    }
  }

  return {};
};

const extractErrorCode = (payload: unknown): string => {
  const root = asRecord(payload);
  const error = asRecord(root.error);
  return String(error.code ?? root.code ?? '').trim().toLowerCase();
};

const parseCommitJobId = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return String(data.job_id ?? root.job_id ?? data.id ?? root.id ?? '') || undefined;
};

const buildSessionContextKey = (
  moduleType: CsvModule,
  dataset: SessionDataset,
  fileId: string,
) => `${moduleType}:${dataset}:${fileId}`;

const parseSessionId = (payload: unknown): string => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return toText(data.id ?? data.session_id ?? root.id ?? root.session_id);
};

const extractAssistantCandidate = (value: unknown): unknown => {
  const node = asRecord(value);
  const data = asRecord(node.data);

  if (Object.keys(data).length > 0 && Object.prototype.hasOwnProperty.call(data, 'response')) {
    return data.response;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'response')) {
    return node.response;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'assistant_response')) {
    return node.assistant_response;
  }
  return value;
};

const tryNormalizeAssistantPayload = (value: unknown, contextLabel: string): CsvAssistantResponsePayload | null => {
  const candidate = extractAssistantCandidate(value);
  if (!hasAssistantLikeFields(candidate)) {
    return null;
  }
  return normalizeAssistantPayload(candidate, contextLabel);
};

const normalizeSessionReply = (payload: unknown): SessionReplyPayload => {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const node = Object.keys(data).length > 0 ? data : root;

  return {
    response: normalizeAssistantPayload(payload, 'session-message'),
    outOfScope: toBoolean(node.out_of_scope ?? node.is_out_of_scope),
    replyMode: toText(node.reply_mode) || undefined,
  };
};

const normalizeSessionHistory = (payload: unknown): SessionChatMessage[] => {
  const root = asRecord(payload);
  const data = asRecord(root.data);

  const candidates = [
    root.data,
    root.results,
    data.results,
    data.messages,
    root.messages,
    Array.isArray(payload) ? payload : null,
  ];

  const historyList = candidates.find((candidate) => Array.isArray(candidate));
  const list = Array.isArray(historyList) ? historyList : [];

  const output: SessionChatMessage[] = [];

  list.forEach((item, index) => {
    const row = asRecord(item);
    const baseId = toText(row.id) || `history-${index}`;
    const createdAt =
      toText(row.created_at) ||
      toText(row.timestamp) ||
      toText(row.sent_at) ||
      undefined;
    const outOfScope = toBoolean(row.out_of_scope ?? row.is_out_of_scope);
    const replyMode = toText(row.reply_mode) || undefined;

    const role = toText(row.role).toLowerCase();
    const directText =
      toText(row.content) ||
      toText(row.message) ||
      toText(row.text);

    if (role === 'user' || role === 'assistant') {
      const structured = role === 'assistant'
        ? tryNormalizeAssistantPayload(row, 'session-history-assistant')
        : null;
      const fallbackText =
        role === 'user'
          ? toText(row.query ?? row.question ?? row.user_message)
          : toText(row.reply ?? row.answer ?? row.explanation ?? row.assistant_message);

      const text =
        role === 'assistant'
          ? structured?.summary || directText || fallbackText
          : directText || fallbackText;
      if (text) {
        output.push({
          id: `${baseId}-${role}`,
          role: role as 'user' | 'assistant',
          text,
          createdAt,
          outOfScope: role === 'assistant' ? outOfScope : undefined,
          replyMode: role === 'assistant' ? replyMode : undefined,
          response: role === 'assistant' ? structured ?? undefined : undefined,
        });
      }
      return;
    }

    const queryText =
      toText(row.query) ||
      toText(row.question) ||
      toText(row.user_message) ||
      toText(asRecord(row.user).message);
    const structured = tryNormalizeAssistantPayload(row, 'session-history-message');
    const replyText =
      structured?.summary ||
      toText(row.reply) ||
      toText(row.answer) ||
      toText(row.response) ||
      toText(row.assistant_message) ||
      toText(row.explanation) ||
      directText;

    if (queryText) {
      output.push({
        id: `${baseId}-user`,
        role: 'user',
        text: queryText,
        createdAt,
      });
    }

    if (replyText) {
      output.push({
        id: `${baseId}-assistant`,
        role: 'assistant',
        text: replyText,
        createdAt,
        outOfScope,
        replyMode,
        response: structured ?? undefined,
      });
    }
  });

  return output;
};

const InventoryCsvImportCenter = () => {
  const { toast } = useToast();
  const { language: appLanguage } = useLanguage();

  const [csvModule, setCsvModule] = useState<CsvModule>('inventory');
  const [pharmacyDataset, setPharmacyDataset] = useState<PharmacyDataset>('sales');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('MERGE');
  const [confirmFullReplace, setConfirmFullReplace] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [language, setLanguage] = useState<LanguageCode>(normalizeLanguage(appLanguage));

  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [committedJobId, setCommittedJobId] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [chatResponse, setChatResponse] = useState<CsvChatResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<SessionChatMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const [showScopeHint, setShowScopeHint] = useState(false);
  const [chatFieldErrors, setChatFieldErrors] = useState<Record<string, string[]>>({});
  const [sessionRegistry, setSessionRegistry] = useState<Record<string, string>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [lastChatRequest, setLastChatRequest] = useState<{
    fileId: string;
    query: string;
    language: LanguageCode;
    moduleType: CsvModule;
    dataset: PharmacyDataset;
  } | null>(null);

  useEffect(() => {
    setLanguage(normalizeLanguage(appLanguage));
  }, [appLanguage]);

  const activeDataset: SessionDataset = csvModule === 'inventory' ? 'inventory' : pharmacyDataset;

  const activeSessionKey = useMemo(() => {
    if (!validation?.fileId) return '';
    return buildSessionContextKey(csvModule, activeDataset, validation.fileId);
  }, [csvModule, activeDataset, validation?.fileId]);

  useEffect(() => {
    if (!activeSessionKey) {
      setActiveSessionId(null);
      return;
    }

    setActiveSessionId(sessionRegistry[activeSessionKey] || null);
  }, [activeSessionKey, sessionRegistry]);

  const fieldHints = useMemo(() => {
    if (!validation) return { label: '', fields: [] as string[], source: 'none' as const };
    if (validation.expectedColumns.length > 0) {
      return { label: 'Expected Fields', fields: validation.expectedColumns, source: 'backend' as const };
    }
    const uniqueFields = Array.from(
      new Set(validation.rowErrors.map((error) => error.field_name || '').filter(Boolean))
    );
    return { label: 'Fields Referenced in Errors', fields: uniqueFields, source: 'errors' as const };
  }, [validation]);

  const canCommit = useMemo(() => {
    if (!validation) return false;
    if (!file) return false;
    if (csvModule === 'inventory') {
      if (!validation.fileHash) return false;
      if (mode === 'FULL_REPLACE' && !confirmFullReplace) return false;
    }
    return true;
  }, [validation, file, mode, confirmFullReplace, csvModule]);

  const canOpenChat = useMemo(() => {
    return Boolean(validation?.fileId);
  }, [validation?.fileId]);

  const validationHealth = useMemo(() => {
    if (!validation || validation.totalRows <= 0) return 0;
    return Math.round((validation.validRows / validation.totalRows) * 100);
  }, [validation]);

  const displayedRowErrors = useMemo(() => {
    return validation?.rowErrors.slice(0, 50) ?? [];
  }, [validation?.rowErrors]);

  const resetChatSurface = () => {
    setChatMessages([]);
    setChatResponse(null);
    setChatError('');
    setChatFieldErrors({});
    setLastChatRequest(null);
    setShowScopeHint(false);
    setActiveSessionId(null);
  };

  const onModuleChange = (value: string) => {
    const next = value === 'pharmacy' ? 'pharmacy' : 'inventory';
    setCsvModule(next);
    setValidation(null);
    setCommittedJobId(null);
    resetChatSurface();
  };

  const onDatasetChange = (value: string) => {
    const normalized: PharmacyDataset =
      value === 'staff' || value === 'movement' ? (value as PharmacyDataset) : 'sales';
    setPharmacyDataset(normalized);
    setValidation(null);
    setCommittedJobId(null);
    resetChatSurface();
  };

  const loadSessionHistory = useCallback(async (
    sessionId: string,
    moduleType: CsvModule,
    _dataset: PharmacyDataset,
  ): Promise<SessionChatMessage[]> => {
    setHistoryLoading(true);
    try {
      const response =
        moduleType === 'inventory'
          ? await inventoryModuleApi.getChatSessionMessages(sessionId, {
              page: '1',
              page_size: '100',
            })
          : await pharmacyCsvApi.getChatSessionMessages(sessionId, {
              page: '1',
              page_size: '100',
            });

      const history = normalizeSessionHistory(response);
      setChatMessages(history);

      const latestStructured = [...history]
        .reverse()
        .find((message) => message.role === 'assistant' && message.response);

      if (latestStructured?.response) {
        setChatResponse({
          fileId: validation?.fileId || '',
          language,
          response: latestStructured.response,
        });
      }

      return history;
    } finally {
      setHistoryLoading(false);
    }
  }, [language, validation?.fileId]);

  const ensureSessionId = async (
    fileId: string,
    requestLanguage: LanguageCode,
    moduleType: CsvModule,
    dataset: PharmacyDataset,
  ): Promise<string> => {
    const datasetKey: SessionDataset = moduleType === 'inventory' ? 'inventory' : dataset;
    const sessionKey = buildSessionContextKey(moduleType, datasetKey, fileId);
    const existingSession = sessionRegistry[sessionKey];
    if (existingSession) {
      setActiveSessionId(existingSession);
      return existingSession;
    }

    const sessionResponse =
      moduleType === 'inventory'
        ? await inventoryModuleApi.createChatSession({
            file_id: fileId,
            language: requestLanguage,
          })
        : await pharmacyCsvApi.createChatSession({
            file_id: fileId,
            language: requestLanguage,
          });

    const sessionId = parseSessionId(sessionResponse);
    if (!sessionId) {
      throw new Error('Unable to start chat session.');
    }

    setSessionRegistry((prev) => ({
      ...prev,
      [sessionKey]: sessionId,
    }));
    setActiveSessionId(sessionId);
    return sessionId;
  };

  const runLegacyInventoryChat = async (
    fileId: string,
    query: string,
    requestLanguage: LanguageCode,
  ) => {
    const response = await inventoryModuleApi.chatImportErrors({
      file_id: fileId,
      query,
      language: requestLanguage,
    });

    const parsed = normalizeChatResponse(
      response,
      fileId,
      requestLanguage,
      'legacy-chat-endpoint',
    );
    const assistantText =
      parsed.response.summary ||
      ASSISTANT_RESPONSE_FALLBACK_SUMMARY;

    setShowScopeHint(false);
    setChatResponse(parsed);

    setChatMessages((prev) => [
      ...prev,
      {
        id: `legacy-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        text: query,
      },
      {
        id: `legacy-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        text: assistantText,
        response: parsed.response,
      },
    ]);
  };

  const openChatPanel = () => {
    if (!validation?.fileId) {
      toast({
        title: 'Validation context missing',
        description: 'Re-validate the CSV to generate file context for AI chat.',
        variant: 'destructive',
      });
      return;
    }

    setChatOpen(true);

    if (activeSessionId) {
      void loadSessionHistory(activeSessionId, csvModule, pharmacyDataset).catch(() => undefined);
    }
  };

  const requestChatExplanation = async (
    request?: {
      fileId: string;
      query: string;
      language: LanguageCode;
      moduleType: CsvModule;
      dataset: PharmacyDataset;
    }
  ) => {
    const fileId = request?.fileId || validation?.fileId || '';
    const query = request?.query || chatQuery.trim();
    const requestLanguage = request?.language || language;
    const moduleType = request?.moduleType || csvModule;
    const dataset = request?.dataset || pharmacyDataset;

    if (!fileId) {
      setChatError('Validation context not found, re-validate file.');
      return;
    }

    if (!query) {
      setChatError('Enter a question to ask the AI assistant.');
      return;
    }

    const requestPayload = {
      fileId,
      query,
      language: requestLanguage,
      moduleType,
      dataset,
    };
    setLastChatRequest(requestPayload);

    try {
      setChatLoading(true);
      setChatError('');
      setChatFieldErrors({});
      setShowScopeHint(false);

      let sessionId = '';
      try {
        sessionId = await ensureSessionId(
          requestPayload.fileId,
          requestPayload.language,
          requestPayload.moduleType,
          requestPayload.dataset,
        );
      } catch (sessionError) {
        const apiSessionError = sessionError as ApiRequestError;
        if (
          requestPayload.moduleType === 'inventory' &&
          [404, 405, 501].includes(apiSessionError.status ?? 0)
        ) {
          await runLegacyInventoryChat(
            requestPayload.fileId,
            requestPayload.query,
            requestPayload.language,
          );
          return;
        }
        throw sessionError;
      }

      const messageResponse =
        requestPayload.moduleType === 'inventory'
          ? await inventoryModuleApi.sendChatSessionMessage(sessionId, {
              query: requestPayload.query,
              language: requestPayload.language,
            })
          : await pharmacyCsvApi.sendChatSessionMessage(sessionId, {
              query: requestPayload.query,
              language: requestPayload.language,
            });

      const replyPayload = normalizeSessionReply(messageResponse);
      setChatResponse({
        fileId: requestPayload.fileId,
        language: requestPayload.language,
        response: replyPayload.response,
      });
      setShowScopeHint(replyPayload.outOfScope);

      const history = await loadSessionHistory(
        sessionId,
        requestPayload.moduleType,
        requestPayload.dataset,
      );

      const latestStructured = [...history]
        .reverse()
        .find((message) => message.role === 'assistant' && message.response);

      if (latestStructured?.response) {
        setChatResponse({
          fileId: requestPayload.fileId,
          language: requestPayload.language,
          response: latestStructured.response,
        });
      }

      if (history.length === 0) {
        const assistantText =
          replyPayload.response.summary ||
          ASSISTANT_RESPONSE_FALLBACK_SUMMARY;

        setChatMessages([
          {
            id: `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            text: requestPayload.query,
          },
          {
            id: `local-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: 'assistant',
            text: assistantText,
            outOfScope: replyPayload.outOfScope,
            replyMode: replyPayload.replyMode,
            response: replyPayload.response,
          },
        ]);
      }
    } catch (error) {
      const apiError = error as ApiRequestError;
      const status = apiError.status;
      const payload = apiError.payload;
      const errorCode = extractErrorCode(payload);
      const fieldErrors = status === 400 ? normalizeFieldErrors(payload) : {};
      setChatFieldErrors(fieldErrors);

      if (
        requestPayload.moduleType === 'inventory' &&
        [404, 405, 501].includes(status ?? 0)
      ) {
        try {
          await runLegacyInventoryChat(
            requestPayload.fileId,
            requestPayload.query,
            requestPayload.language,
          );
          return;
        } catch {
          // Continue with normal error mapping if fallback also fails.
        }
      }

      let message = apiError.message || 'Unable to fetch AI explanation.';
      if (status === 403) {
        message = 'Access denied for this file/session context.';
      } else if (status === 404) {
        message = 'File/session not found. Re-validate file and start a new chat.';
      } else if (status === 503 || errorCode === 'ai_service_error') {
        message = 'AI assistant temporarily unavailable, please retry.';
      } else if (status === 400 && Object.keys(fieldErrors).length > 0) {
        message = 'Please correct the highlighted fields and retry.';
      }

      setChatError(message);
    } finally {
      setChatLoading(false);
    }
  };

  const onValidate = async () => {
    if (!file) {
      toast({ title: 'CSV file required', description: 'Select a CSV before validation.', variant: 'destructive' });
      return;
    }

    if (csvModule === 'inventory' && mode === 'FULL_REPLACE' && !confirmFullReplace) {
      toast({
        title: 'Confirmation required',
        description: 'FULL_REPLACE requires confirmation before validation/commit.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setValidating(true);
      setCommittedJobId(null);
      resetChatSurface();

      const response =
        csvModule === 'inventory'
          ? await inventoryModuleApi.validateImport(
              file,
              {
                mode,
                confirm_full_replace: mode === 'FULL_REPLACE' ? confirmFullReplace : undefined,
                idempotency_key: idempotencyKey || undefined,
                language,
              },
              idempotencyKey || undefined,
            )
          : await pharmacyCsvApi.validateImport(
              pharmacyDataset,
              file,
              {
                language,
                idempotency_key: idempotencyKey || undefined,
              },
              idempotencyKey || undefined,
            );

      const parsed = normalizeValidation(response);
      setValidation(parsed);
      setLanguage(parsed.language);

      if (parsed.fileId) {
        const datasetKey: SessionDataset =
          csvModule === 'inventory' ? 'inventory' : pharmacyDataset;
        const existingSession =
          sessionRegistry[buildSessionContextKey(csvModule, datasetKey, parsed.fileId)];
        if (existingSession) {
          setActiveSessionId(existingSession);
        }
      }

      toast({
        title: 'Validation complete',
        description:
          parsed.errorRows > 0
            ? `${parsed.errorRows} row error(s) found. Review before commit.`
            : 'No row-level errors detected.',
      });
    } catch (error) {
      toast({
        title: 'Validation failed',
        description: error instanceof Error ? error.message : 'Unable to validate CSV file.',
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  const onCommit = async () => {
    if (!canCommit || !validation || !file) {
      toast({ title: 'Nothing to commit', description: 'Validate a file first.', variant: 'destructive' });
      return;
    }

    try {
      setCommitting(true);
      const response =
        csvModule === 'inventory'
          ? await inventoryModuleApi.commitImport(
              file,
              {
                mode,
                confirm_full_replace: mode === 'FULL_REPLACE' ? confirmFullReplace : undefined,
                idempotency_key: idempotencyKey || undefined,
              },
              idempotencyKey || undefined,
            )
          : await pharmacyCsvApi.commitImport(
              pharmacyDataset,
              file,
              {
                language,
                idempotency_key: idempotencyKey || undefined,
              },
              idempotencyKey || undefined,
            );

      const jobId = parseCommitJobId(response);
      setCommittedJobId(jobId ?? null);

      toast({
        title: 'Import committed',
        description: jobId
          ? `Import job ${jobId} queued.`
          : csvModule === 'inventory'
            ? 'CSV import has been submitted.'
            : `${pharmacyDataset.toUpperCase()} CSV import has been submitted.`,
      });
    } catch (error) {
      toast({
        title: 'Commit failed',
        description: error instanceof Error ? error.message : 'Unable to commit import job.',
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
    }
  };

  useEffect(() => {
    if (!chatOpen || !activeSessionId) return;

    void loadSessionHistory(activeSessionId, csvModule, pharmacyDataset).catch(() => undefined);
  }, [chatOpen, activeSessionId, csvModule, pharmacyDataset, loadSessionHistory]);

  return (
    <AppLayout title="CSV Import Center">
      <div className="mx-auto max-w-[1440px] space-y-6 pb-24">
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/15 via-background to-emerald-500/15 p-6">
          <div className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Import Workflow</p>
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  Validate, fix, and commit CSV updates with confidence
                </h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {csvModule === 'inventory'
                    ? 'Inventory import supports MERGE, REPLACE_UPLOADED_SCOPE, and FULL_REPLACE.'
                    : 'Pharmacy import supports sales, staff, and movement datasets.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="px-3 py-1">
                  Module: {csvModule === 'inventory' ? 'Inventory' : 'Pharmacy'}
                </Badge>
                {csvModule === 'pharmacy' ? (
                  <Badge variant="outline" className="px-3 py-1">
                    Dataset: {pharmacyDataset}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="px-3 py-1 uppercase">
                  Language: {language}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Step 1</p>
                <p className="mt-1 text-sm font-medium">Upload CSV</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Step 2</p>
                <p className="mt-1 text-sm font-medium">Validate and inspect row errors</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Step 3</p>
                <p className="mt-1 text-sm font-medium">Commit import and track job</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <Card className="border-border/70">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Upload and Validate</CardTitle>
              <CardDescription>
                Configure module options, validate your CSV, and commit only when quality checks pass.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <Label>CSV Module</Label>
                  <Select value={csvModule} onValueChange={onModuleChange}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inventory">Inventory CSV</SelectItem>
                      <SelectItem value="pharmacy">Pharmacy CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <Label>Language</Label>
                  <Select value={language} onValueChange={(value) => setLanguage(normalizeLanguage(value))}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (en)</SelectItem>
                      <SelectItem value="bn">বাংলা (bn)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    This language is sent to both validation and AI chat requests.
                  </p>
                </div>
              </div>

              {csvModule === 'pharmacy' ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <Label>Pharmacy Dataset</Label>
                  <Select value={pharmacyDataset} onValueChange={onDatasetChange}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="movement">Movement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="rounded-xl border border-dashed bg-muted/10 p-4">
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="mt-2"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setValidation(null);
                    setCommittedJobId(null);
                    resetChatSurface();
                  }}
                />
                {file ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                    <span className="truncate">Selected: {file.name}</span>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Choose a CSV file to begin validation.</p>
                )}
              </div>

              {csvModule === 'inventory' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <Label>Import Mode</Label>
                    <Select value={mode} onValueChange={(value) => setMode(value as ImportMode)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MERGE">MERGE</SelectItem>
                        <SelectItem value="REPLACE_UPLOADED_SCOPE">REPLACE_UPLOADED_SCOPE</SelectItem>
                        <SelectItem value="FULL_REPLACE">FULL_REPLACE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-start gap-2">
                      <Input
                        id="confirm-full-replace"
                        type="checkbox"
                        checked={confirmFullReplace}
                        onChange={(event) => setConfirmFullReplace(event.target.checked)}
                        className="mt-0.5 h-4 w-4"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="confirm-full-replace" className="text-sm leading-5">
                          Confirm full replace
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Required only when import mode is FULL_REPLACE.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                  Pharmacy CSV validates and commits using the selected dataset endpoint.
                </div>
              )}

              <div className="rounded-xl border bg-muted/20 p-4">
                <Label htmlFor="idempotency-key">Idempotency Key (optional)</Label>
                <Input
                  id="idempotency-key"
                  className="mt-2"
                  placeholder="reuse-key-when-retrying"
                  value={idempotencyKey}
                  onChange={(event) => setIdempotencyKey(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Reuse the same key if you need to retry the same submission safely.
                </p>
              </div>

              <div className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap gap-3">
                  <Button onClick={onValidate} disabled={validating || !file}>
                    {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Validate CSV
                  </Button>
                  <Button variant="secondary" onClick={onCommit} disabled={committing || !canCommit}>
                    {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
                    Commit Import
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Validate first, then commit only after reviewing summary metrics and row-level issues.
                </p>
              </div>

              {committedJobId ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
                  <p className="font-medium text-emerald-700">Import job created</p>
                  <p className="mt-1 text-emerald-700/90">
                    Job ID: <span className="font-mono">{committedJobId}</span>
                  </p>
                  <Link className="mt-2 inline-block text-sm font-medium underline" to={`/inventory/imports/${committedJobId}`}>
                    View details
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Validation Result</CardTitle>
              <CardDescription>Review summary metrics and row-level errors before commit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {!validation ? (
                <div className="flex min-h-[540px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">No validation result yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Validate a CSV to view summary metrics, required fields, and row-level errors.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Module</p>
                      <p className="text-sm font-semibold capitalize">{csvModule}</p>
                      {csvModule === 'pharmacy' ? (
                        <p className="mt-1 text-xs text-muted-foreground">Dataset: {pharmacyDataset}</p>
                      ) : null}
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Total Rows</p>
                      <p className="text-2xl font-semibold">{validation.totalRows}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Response Language</p>
                      <p className="text-sm font-semibold uppercase">{validation.language}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Valid Rows</p>
                      <p className="text-2xl font-semibold text-emerald-600">{validation.validRows}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">Error Rows</p>
                      <p className="text-2xl font-semibold text-destructive">{validation.errorRows}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/10 p-3">
                      <p className="text-xs text-muted-foreground">File ID</p>
                      <p className="font-mono text-xs break-all">{validation.fileId || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <p className="text-xs text-muted-foreground">File Hash</p>
                    <p className="mt-1 font-mono text-xs break-all">{validation.fileHash || 'N/A'}</p>
                  </div>

                  <div className="rounded-xl border p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant={validation.errorRows > 0 ? 'destructive' : 'default'}>
                        {validation.errorRows > 0 ? 'Needs correction' : 'Ready to commit'}
                      </Badge>
                      {validation.jobId ? (
                        <span className="text-xs text-muted-foreground">Validation job: {validation.jobId}</span>
                      ) : null}
                      {activeSessionId ? (
                        <span className="text-xs text-muted-foreground">Session: {activeSessionId}</span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Validation health</span>
                        <span>{validationHealth}% valid rows</span>
                      </div>
                      <Progress value={validationHealth} className="h-2" />
                    </div>
                  </div>

                  <Alert>
                    <Bot className="h-4 w-4" />
                    <AlertTitle>AI Assistant</AlertTitle>
                    <AlertDescription>
                      Use the Ask AI Assistant button to open chat for this validated file context.
                      {!canOpenChat ? ' Re-validate CSV first to enable chat.' : ''}
                    </AlertDescription>
                  </Alert>

                  {fieldHints.fields.length > 0 ? (
                    <div className="rounded-xl border p-4">
                      <p className="text-sm font-medium">{fieldHints.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {fieldHints.source === 'backend'
                          ? 'Headers must match exactly (case-sensitive).'
                          : 'Use these field names to align your CSV headers.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fieldHints.fields.map((field) => (
                          <Badge key={field} variant="outline">{field}</Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
                      Expected columns were not returned by the backend. Use the Field column in errors to adjust your CSV headers.
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Row Errors</p>
                      <Badge variant="outline">{validation.rowErrors.length} rows</Badge>
                    </div>
                    {validation.rowErrors.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        No row-level errors returned.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border">
                        <ScrollArea className="max-h-[340px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Row</TableHead>
                                <TableHead>Field</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Message</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayedRowErrors.map((error, index) => (
                                <TableRow key={`${error.row_number}-${error.field_name}-${index}`}>
                                  <TableCell>{error.row_number ?? '-'}</TableCell>
                                  <TableCell>{error.field_name || '-'}</TableCell>
                                  <TableCell>{error.error_code || '-'}</TableCell>
                                  <TableCell>{error.message || 'Validation error'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        <Button
          type="button"
          onClick={openChatPanel}
          disabled={!canOpenChat}
          className="h-12 rounded-full border border-primary/30 bg-primary px-5 shadow-lg shadow-primary/30"
        >
          <Bot className="mr-2 h-4 w-4" />
          Ask AI Assistant
        </Button>
        {!canOpenChat ? (
          <p className="rounded-md border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
            Validate CSV to enable chat
          </p>
        ) : null}
      </div>

      <Drawer open={chatOpen} onOpenChange={setChatOpen}>
        <DrawerContent className="mx-auto max-h-[92vh] w-full max-w-5xl border-border/70">
          <DrawerHeader className="px-4 pb-3">
            <DrawerTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              CSV Error AI Assistant
            </DrawerTitle>
            <DrawerDescription>
              Ask how to fix validation errors for this file context using
              {csvModule === 'inventory' ? ' inventory session chat' : ` pharmacy ${pharmacyDataset} session chat`}.
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 border-b bg-muted/20 px-4 pb-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">File ID</p>
                <p className="font-mono text-xs break-all">{validation?.fileId || 'N/A'}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Session ID</p>
                <p className="font-mono text-xs break-all">{activeSessionId || 'Not started'}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Language</p>
                <div className="mt-2 flex items-center gap-2">
                  <Languages className="h-4 w-4 text-muted-foreground" />
                  <Select value={language} onValueChange={(value) => setLanguage(normalizeLanguage(value))}>
                    <SelectTrigger className="h-8 w-full max-w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (en)</SelectItem>
                      <SelectItem value="bn">বাংলা (bn)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-background p-3">
              <div className="space-y-2">
                <Label htmlFor="csv-chat-query">Ask a question</Label>
                <Textarea
                  id="csv-chat-query"
                  rows={3}
                  value={chatQuery}
                  onChange={(event) => setChatQuery(event.target.value)}
                  placeholder="Example: Why did negative quantity rows fail and how should I fix them?"
                />
              </div>
            </div>
          </div>

          <ScrollArea className="h-[50vh] px-4 py-4 sm:h-[56vh]">
            <div className="space-y-4 pr-3">
              {chatError ? (
                <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Unable to get AI explanation</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{chatError}</p>
                    {Object.keys(chatFieldErrors).length > 0 ? (
                      <div className="space-y-2 rounded-md border border-destructive/40 bg-background p-2 text-xs text-foreground">
                        {Object.entries(chatFieldErrors).map(([field, messages]) => (
                          <p key={field}>
                            <span className="font-semibold">{field}:</span> {messages.join(' ')}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (lastChatRequest) {
                          void requestChatExplanation(lastChatRequest);
                        }
                      }}
                      disabled={chatLoading || !lastChatRequest}
                    >
                      <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {showScopeHint ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  CSV scope only: assistant responses are grounded in the validated file context.
                </div>
              ) : null}

              {historyLoading ? (
                <div className="flex items-center justify-center rounded-md border border-dashed py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2 text-sm">Loading chat history...</span>
                </div>
              ) : null}

              {chatMessages.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Conversation History</p>
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-xl border px-3 py-2 text-sm leading-6 sm:max-w-[85%] ${
                          message.role === 'user'
                            ? 'border-primary/50 bg-primary/10'
                            : 'border-border bg-background'
                        }`}
                      >
                        <p className="break-words whitespace-pre-wrap">{message.text}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="uppercase tracking-wide">{message.role}</span>
                          {message.createdAt ? <span>{new Date(message.createdAt).toLocaleString()}</span> : null}
                          {message.replyMode ? <span>mode: {message.replyMode}</span> : null}
                        </div>
                        {message.role === 'assistant' && message.outOfScope ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">CSV scope only</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {chatResponse ? (
                <div className="space-y-3 rounded-xl border bg-background p-4">
                  <p className="text-sm font-medium">Assistant Summary</p>
                  <p
                    className="text-sm leading-6 break-words"
                    lang={chatResponse.language === 'bn' ? 'bn' : 'en'}
                  >
                    {chatResponse.response.summary || ASSISTANT_RESPONSE_FALLBACK_SUMMARY}
                  </p>

                  {chatResponse.response.issues.length === 0 ? (
                    chatResponse.response.success ? (
                      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
                        No row-level issues found for this request.
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        Assistant returned no issue rows for this response.
                      </div>
                    )
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Row Issues</p>
                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Row</TableHead>
                              <TableHead>Message</TableHead>
                              <TableHead>Recommendation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {chatResponse.response.issues.map((issue, index) => (
                              <TableRow key={`${issue.row}-${index}`}>
                                <TableCell>{issue.row}</TableCell>
                                <TableCell>{issue.message}</TableCell>
                                <TableCell>{issue.recommendation}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              ) : chatMessages.length === 0 && !historyLoading ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Ask a question and click Get Assistant Response to receive structured guidance.
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <DrawerFooter className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setChatOpen(false)}>
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void requestChatExplanation()}
                disabled={chatLoading || !validation?.fileId || !chatQuery.trim()}
              >
                {chatLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                Get Assistant Response
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </AppLayout>
  );
};

export default InventoryCsvImportCenter;
