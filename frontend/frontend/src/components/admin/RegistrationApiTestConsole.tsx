import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PlayCircle,
  RefreshCw,
  ServerCog,
} from 'lucide-react';
import registrationService, {
  type RegistrationApiCheckData,
  type RegistrationApiCheckResultItem,
  type SupportedRegistrationApiName,
} from '@/services/registrationService';

type ApiStatus = 'not_tested' | 'pending' | 'passed' | 'failed' | 'not_checked';
type VisibleRegistrationApiName = 'resources' | 'bed' | 'blood' | 'staff' | 'sales';

interface ApiTarget {
  key: VisibleRegistrationApiName;
  label: string;
}

interface ApiCheckSummaryState {
  total?: number;
  success?: number;
  failed?: number;
  schemaFailed?: number;
  connectivityFailed?: number;
}

interface ApiColumnValidationView {
  columnsOk?: boolean;
  additionalColumnsAllowed?: boolean;
  containerRequiredGroups: string[][];
  containerMissingRequiredGroups: string[][];
  containerPresentColumns: string[];
  containerAdditionalColumns: string[];
  itemChecked?: boolean;
  itemStatus?: string;
  itemColumnsOk?: boolean;
  itemRequiredGroups: string[][];
  itemMissingRequiredGroups: string[][];
  itemAdditionalColumns: string[];
}

interface ApiTestResult {
  status: ApiStatus;
  connectivityStatus: ApiStatus;
  schemaStatus: ApiStatus;
  schemaFailureByMissingRequiredColumns: boolean;
  rawStatus?: string;
  statusCode?: number;
  responseTimeMs?: number;
  attemptedUrls?: string[];
  errorMessage?: string;
  testedAt?: string;
  columnValidation: ApiColumnValidationView;
}

export interface RegistrationApiConfig {
  api_base_url?: string | null;
  api_auth_type?: string | null;
}

interface RegistrationApiTestConsoleProps {
  registrationId: string;
  registration: RegistrationApiConfig;
  onFailedApisChange?: (failedApiKeys: string[]) => void;
}

type ApplyMode = 'replace' | 'merge';

interface ApplyOptions {
  mode?: ApplyMode;
  mergeApiNames?: VisibleRegistrationApiName[];
}

const BULK_CHECK_TIMEOUT_SECONDS = 15;
const SINGLE_CHECK_TIMEOUT_SECONDS = 10;
const NO_SNAPSHOT_STATUS_CODE = 404;

const API_TEST_TARGETS: ApiTarget[] = [
  { key: 'resources', label: 'Resources' },
  { key: 'bed', label: 'Bed' },
  { key: 'blood', label: 'Blood' },
  { key: 'staff', label: 'Staff' },
  { key: 'sales', label: 'Sales' },
];

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const asString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text : undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  return undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
};

const asGroupArray = (value: unknown): string[][] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((group) => {
      if (Array.isArray(group)) {
        return group.map((item) => String(item).trim()).filter(Boolean);
      }

      const single = String(group).trim();
      return single ? [single] : [];
    })
    .filter((group) => group.length > 0);
};

const normalizeApiKey = (rawKey: string): VisibleRegistrationApiName | null => {
  const normalized = rawKey.trim().toLowerCase().replace(/[^a-z]/g, '');

  if (normalized === 'resources' || normalized === 'resource') return 'resources';
  if (normalized === 'bed' || normalized === 'beds') return 'bed';
  if (normalized === 'blood') return 'blood';
  if (normalized === 'staff') return 'staff';
  if (normalized === 'sales' || normalized === 'sale') return 'sales';
  return null;
};

const normalizeFailedApiKeys = (apiNames: string[]): VisibleRegistrationApiName[] =>
  Array.from(
    new Set(
      apiNames
        .map((apiName) => normalizeApiKey(apiName))
        .filter((apiName): apiName is VisibleRegistrationApiName => apiName !== null),
    ),
  );

const normalizeApiNames = (apiNames: string[]): VisibleRegistrationApiName[] =>
  Array.from(
    new Set(
      apiNames
        .map((apiName) => normalizeApiKey(apiName))
        .filter((apiName): apiName is VisibleRegistrationApiName => apiName !== null),
    ),
  );

const normalizeStatus = (status?: string): ApiStatus => {
  const normalized = (status || '').trim().toLowerCase();
  if (!normalized) return 'not_tested';

  if (['success', 'passed', 'pass', 'ok'].includes(normalized)) return 'passed';
  if (['failed', 'fail', 'error'].includes(normalized)) return 'failed';
  if (['pending', 'running', 'inprogress', 'in_progress'].includes(normalized)) return 'pending';
  if (['not_checked', 'notchecked'].includes(normalized)) return 'not_checked';

  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('timeout')) {
    return 'failed';
  }

  if (normalized.includes('success') || normalized.includes('pass')) {
    return 'passed';
  }

  if (normalized.includes('not checked') || normalized.includes('not_checked')) {
    return 'not_checked';
  }

  return 'not_tested';
};

const isMissingRequiredColumnsError = (error?: string) => {
  return (error || '').trim().toLowerCase() === 'missing_required_columns';
};

const isNoRowsStatus = (status?: string) => {
  const normalized = (status || '').trim().toLowerCase().replace(/\s+/g, '_');
  return [
    'no_rows',
    'no_data',
    'empty_rows',
    'not_checked_no_rows',
    'not_checked_no_data',
  ].includes(normalized);
};

const buildColumnValidationView = (rawColumnValidation: unknown): ApiColumnValidationView => {
  const validation = asRecord(rawColumnValidation);
  const container = asRecord(validation.container);
  const item = asRecord(validation.item);

  return {
    columnsOk: asBoolean(validation.columns_ok),
    additionalColumnsAllowed: asBoolean(validation.additional_columns_allowed),
    containerRequiredGroups: asGroupArray(container.required_groups),
    containerMissingRequiredGroups: asGroupArray(container.missing_required_groups),
    containerPresentColumns: asStringArray(container.present_columns),
    containerAdditionalColumns: asStringArray(container.additional_columns),
    itemChecked: asBoolean(item.checked),
    itemStatus: asString(item.status),
    itemColumnsOk: asBoolean(item.columns_ok),
    itemRequiredGroups: asGroupArray(item.required_groups),
    itemMissingRequiredGroups: asGroupArray(item.missing_required_groups),
    itemAdditionalColumns: asStringArray(item.additional_columns),
  };
};

const resolveConnectivityStatus = (
  status: string | undefined,
  statusCode: number | undefined,
  error: string | undefined,
): ApiStatus => {
  const normalized = normalizeStatus(status);
  if (normalized === 'pending') return 'pending';

  if (typeof statusCode === 'number') {
    return statusCode >= 200 && statusCode < 300 ? 'passed' : 'failed';
  }

  if (error) return 'failed';

  if (normalized === 'passed' || normalized === 'failed') return normalized;
  if (normalized === 'not_checked') return 'not_checked';

  return 'not_tested';
};

const resolveSchemaStatus = (
  rawStatus: string | undefined,
  error: string | undefined,
  connectivityStatus: ApiStatus,
  validation: ApiColumnValidationView,
): ApiStatus => {
  if (connectivityStatus === 'pending') return 'pending';
  if (connectivityStatus === 'failed') return 'not_checked';

  if (isMissingRequiredColumnsError(error)) return 'failed';

  if (typeof validation.columnsOk === 'boolean') {
    return validation.columnsOk ? 'passed' : 'failed';
  }

  if (validation.containerMissingRequiredGroups.length > 0 || validation.itemMissingRequiredGroups.length > 0) {
    return 'failed';
  }

  if (typeof validation.itemColumnsOk === 'boolean') {
    return validation.itemColumnsOk ? 'passed' : 'failed';
  }

  if (validation.itemChecked === false || isNoRowsStatus(validation.itemStatus)) {
    return 'not_checked';
  }

  const normalized = normalizeStatus(rawStatus);
  if (normalized === 'passed' || normalized === 'failed') return normalized;

  return 'not_tested';
};

const emptyColumnValidation = (): ApiColumnValidationView => ({
  columnsOk: undefined,
  additionalColumnsAllowed: undefined,
  containerRequiredGroups: [],
  containerMissingRequiredGroups: [],
  containerPresentColumns: [],
  containerAdditionalColumns: [],
  itemChecked: undefined,
  itemStatus: undefined,
  itemColumnsOk: undefined,
  itemRequiredGroups: [],
  itemMissingRequiredGroups: [],
  itemAdditionalColumns: [],
});

const initialResult = (): ApiTestResult => ({
  status: 'not_tested',
  connectivityStatus: 'not_tested',
  schemaStatus: 'not_tested',
  schemaFailureByMissingRequiredColumns: false,
  rawStatus: undefined,
  statusCode: undefined,
  responseTimeMs: undefined,
  attemptedUrls: [],
  errorMessage: undefined,
  testedAt: undefined,
  columnValidation: emptyColumnValidation(),
});

const initialResults = (): Record<VisibleRegistrationApiName, ApiTestResult> =>
  API_TEST_TARGETS.reduce<Record<VisibleRegistrationApiName, ApiTestResult>>((acc, target) => {
    acc[target.key] = initialResult();
    return acc;
  }, {} as Record<VisibleRegistrationApiName, ApiTestResult>);

const toApiTestResult = (
  backendResult: RegistrationApiCheckResultItem | undefined,
  checkedAt?: string,
): ApiTestResult => {
  if (!backendResult) return initialResult();

  const rawStatus = asString(backendResult.status);
  const statusCode = typeof backendResult.status_code === 'number' ? backendResult.status_code : undefined;
  const errorMessage = asString(backendResult.error);
  const columnValidation = buildColumnValidationView(backendResult.column_validation);
  const connectivityStatus = resolveConnectivityStatus(rawStatus, statusCode, errorMessage);
  const schemaStatus = resolveSchemaStatus(rawStatus, errorMessage, connectivityStatus, columnValidation);

  let status = normalizeStatus(rawStatus);
  if (status === 'not_tested') {
    if (connectivityStatus === 'pending' || schemaStatus === 'pending') {
      status = 'pending';
    } else if (connectivityStatus === 'failed' || schemaStatus === 'failed') {
      status = 'failed';
    } else if (connectivityStatus === 'passed' && (schemaStatus === 'passed' || schemaStatus === 'not_checked')) {
      status = 'passed';
    } else if (schemaStatus === 'not_checked') {
      status = 'not_checked';
    }
  }

  return {
    status,
    connectivityStatus,
    schemaStatus,
    schemaFailureByMissingRequiredColumns: isMissingRequiredColumnsError(errorMessage),
    rawStatus,
    statusCode,
    responseTimeMs:
      typeof backendResult.response_time_ms === 'number' ? backendResult.response_time_ms : undefined,
    attemptedUrls: asStringArray(backendResult.attempted_urls),
    errorMessage,
    testedAt: checkedAt,
    columnValidation,
  };
};

const formatFieldErrors = (errors?: Record<string, string[]>): string => {
  if (!errors) return '';

  return Object.entries(errors)
    .map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages.join(' ') : String(messages || '');
      return text ? `${field}: ${text}` : '';
    })
    .filter(Boolean)
    .join(' | ');
};

const statusText = (status: ApiStatus) => {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'pending') return 'Pending';
  if (status === 'not_checked') return 'Not Checked';
  return 'Not Tested';
};

const renderColumnGroups = (groups: string[][], emptyLabel: string, missing = false) => {
  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-1">
      {groups.map((group, index) => (
        <p key={`${group.join('|')}-${index}`} className={`text-xs ${missing ? 'text-rose-700' : 'text-muted-foreground'}`}>
          Group {index + 1}: {group.join(' OR ')}
        </p>
      ))}
    </div>
  );
};

const statusBadge = (label: string, status: ApiStatus) => {
  if (status === 'passed') {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-900">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        {label}: Passed
      </Badge>
    );
  }

  if (status === 'failed') {
    return (
      <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-900">
        <AlertCircle className="mr-1 h-3.5 w-3.5" />
        {label}: Failed
      </Badge>
    );
  }

  if (status === 'pending') {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        {label}: Pending
      </Badge>
    );
  }

  if (status === 'not_checked') {
    return (
      <Badge variant="outline" className="border-sky-300 bg-sky-100 text-sky-900">
        {label}: Not Checked
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
      {label}: Not Tested
    </Badge>
  );
};

const deriveFailureListsFromResults = (resultMap: Record<VisibleRegistrationApiName, ApiTestResult>) => {
  const failedApiKeys: VisibleRegistrationApiName[] = [];
  const schemaFailedApiKeys: VisibleRegistrationApiName[] = [];
  const connectivityFailedApiKeys: VisibleRegistrationApiName[] = [];

  for (const target of API_TEST_TARGETS) {
    const result = resultMap[target.key];
    if (result.connectivityStatus === 'failed') {
      connectivityFailedApiKeys.push(target.key);
    }
    if (result.schemaStatus === 'failed') {
      schemaFailedApiKeys.push(target.key);
    }
    if (
      result.status === 'failed' ||
      result.connectivityStatus === 'failed' ||
      result.schemaStatus === 'failed'
    ) {
      failedApiKeys.push(target.key);
    }
  }

  return {
    failedApiKeys,
    schemaFailedApiKeys,
    connectivityFailedApiKeys,
  };
};

const deriveSummaryFromResults = (resultMap: Record<VisibleRegistrationApiName, ApiTestResult>): ApiCheckSummaryState => {
  let total = 0;
  let success = 0;
  let failed = 0;
  let schemaFailed = 0;
  let connectivityFailed = 0;

  for (const target of API_TEST_TARGETS) {
    const result = resultMap[target.key];

    if (result.status !== 'not_tested') {
      total += 1;
    }
    if (result.status === 'passed') {
      success += 1;
    }
    if (result.status === 'failed') {
      failed += 1;
    }
    if (result.schemaStatus === 'failed') {
      schemaFailed += 1;
    }
    if (result.connectivityStatus === 'failed') {
      connectivityFailed += 1;
    }
  }

  return {
    total,
    success,
    failed,
    schemaFailed,
    connectivityFailed,
  };
};

const RegistrationApiTestConsole = ({
  registrationId,
  registration,
  onFailedApisChange,
}: RegistrationApiTestConsoleProps) => {
  const { toast } = useToast();

  const [results, setResults] = useState<Record<VisibleRegistrationApiName, ApiTestResult>>(() => initialResults());
  const [expandedOutput, setExpandedOutput] = useState<Record<string, boolean>>({});
  const [runningChecks, setRunningChecks] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [serverErrorMessage, setServerErrorMessage] = useState('');
  const [latestCheckedAt, setLatestCheckedAt] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<ApiCheckSummaryState>({});
  const [failedApiKeys, setFailedApiKeys] = useState<VisibleRegistrationApiName[]>([]);
  const [schemaFailedApiKeys, setSchemaFailedApiKeys] = useState<VisibleRegistrationApiName[]>([]);
  const [connectivityFailedApiKeys, setConnectivityFailedApiKeys] = useState<VisibleRegistrationApiName[]>([]);
  const resultsRef = useRef(results);
  const onFailedApisChangeRef = useRef(onFailedApisChange);

  useEffect(() => {
    onFailedApisChangeRef.current = onFailedApisChange;
  }, [onFailedApisChange]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const submittedBaseUrl = (registration.api_base_url || '').trim();
  const submittedAuthType = useMemo(() => {
    const normalized = (registration.api_auth_type || 'none').trim().toLowerCase();
    return normalized || 'none';
  }, [registration.api_auth_type]);

  const anyRunning = snapshotLoading || runningAll || Object.keys(runningChecks).length > 0;

  const getErrorDescription = useCallback(
    (message: string, errors?: Record<string, string[]>) => {
      const validationMessage = formatFieldErrors(errors);
      return validationMessage ? `${message} ${validationMessage}` : message;
    },
    [],
  );

  const applyApiCheckData = useCallback((data?: RegistrationApiCheckData, options?: ApplyOptions) => {
    const mode = options?.mode ?? 'replace';

    if (!data) {
      setResults(initialResults());
      setLatestCheckedAt(undefined);
      setSummary({});
      setFailedApiKeys([]);
      setSchemaFailedApiKeys([]);
      setConnectivityFailedApiKeys([]);
      onFailedApisChangeRef.current?.([]);
      return;
    }

    const checkedAt = asString(data.checked_at);
    const checkedApisFromPayload = normalizeApiNames(asStringArray(data.checked_apis));
    const mergeApiNames =
      options?.mergeApiNames && options.mergeApiNames.length > 0
        ? options.mergeApiNames
        : checkedApisFromPayload.length > 0
          ? checkedApisFromPayload
          : normalizeApiNames(Object.keys(data.results || {}));
    const mergeApiNameSet = new Set<VisibleRegistrationApiName>(mergeApiNames);

    const normalizedFailedApis = normalizeFailedApiKeys(asStringArray(data.failed_apis));
    const normalizedSchemaFailedApis = normalizeFailedApiKeys(asStringArray(data.schema_failed_apis));
    const normalizedConnectivityFailedApis = normalizeFailedApiKeys(asStringArray(data.connectivity_failed_apis));

    const baseResults = mode === 'merge' ? resultsRef.current : initialResults();
    const nextResults = { ...baseResults };

    for (const target of API_TEST_TARGETS) {
      const backendResult = data.results?.[target.key];
      if (backendResult) {
        if (mode === 'merge' && !mergeApiNameSet.has(target.key)) {
          continue;
        }
        nextResults[target.key] = toApiTestResult(
          backendResult,
          checkedAt || nextResults[target.key].testedAt,
        );
      } else if (mode === 'replace') {
        nextResults[target.key] = initialResult();
      }
    }

    for (const apiName of normalizedConnectivityFailedApis) {
      if (mode === 'merge' && !mergeApiNameSet.has(apiName)) {
        continue;
      }
      const existing = nextResults[apiName];
      nextResults[apiName] = {
        ...existing,
        status: existing.status === 'not_tested' ? 'failed' : existing.status,
        connectivityStatus: 'failed',
        schemaStatus: existing.schemaStatus === 'not_tested' ? 'not_checked' : existing.schemaStatus,
        testedAt: existing.testedAt || checkedAt,
      };
    }

    for (const apiName of normalizedSchemaFailedApis) {
      if (mode === 'merge' && !mergeApiNameSet.has(apiName)) {
        continue;
      }
      const existing = nextResults[apiName];
      nextResults[apiName] = {
        ...existing,
        status: existing.status === 'not_tested' ? 'failed' : existing.status,
        schemaStatus: 'failed',
        schemaFailureByMissingRequiredColumns:
          existing.schemaFailureByMissingRequiredColumns ||
          isMissingRequiredColumnsError(existing.errorMessage),
        testedAt: existing.testedAt || checkedAt,
      };
    }

    for (const apiName of normalizedFailedApis) {
      if (mode === 'merge' && !mergeApiNameSet.has(apiName)) {
        continue;
      }
      const existing = nextResults[apiName];
      if (existing.status === 'not_tested') {
        nextResults[apiName] = {
          ...existing,
          status: 'failed',
          rawStatus: existing.rawStatus || 'failed',
          testedAt: existing.testedAt || checkedAt,
        };
      }
    }

    resultsRef.current = nextResults;
    setResults(nextResults);

    const derivedFailureLists = deriveFailureListsFromResults(nextResults);
    const derivedSummary = deriveSummaryFromResults(nextResults);

    setLatestCheckedAt((previous) => checkedAt || previous);
    setSummary({
      total:
        mode === 'replace' && typeof data.summary?.total === 'number'
          ? data.summary.total
          : derivedSummary.total,
      success:
        mode === 'replace' && typeof data.summary?.success === 'number'
          ? data.summary.success
          : derivedSummary.success,
      failed:
        mode === 'replace' && typeof data.summary?.failed === 'number'
          ? data.summary.failed
          : derivedSummary.failed,
      schemaFailed:
        mode === 'replace' && typeof data.summary?.schema_failed === 'number'
          ? data.summary.schema_failed
          : derivedSummary.schemaFailed,
      connectivityFailed:
        mode === 'replace' && typeof data.summary?.connectivity_failed === 'number'
          ? data.summary.connectivity_failed
          : derivedSummary.connectivityFailed,
    });
    setFailedApiKeys(derivedFailureLists.failedApiKeys);
    setSchemaFailedApiKeys(derivedFailureLists.schemaFailedApiKeys);
    setConnectivityFailedApiKeys(derivedFailureLists.connectivityFailedApiKeys);
    onFailedApisChangeRef.current?.(derivedFailureLists.failedApiKeys);
  }, []);

  const loadLatestSnapshot = useCallback(
    async (showToastOnFailure: boolean) => {
      setSnapshotLoading(true);
      setServerErrorMessage('');

      try {
        const response = await registrationService.getHospitalRegistrationApiCheckResults(registrationId);
        if (!response.success) {
          if (response.status_code === NO_SNAPSHOT_STATUS_CODE) {
            applyApiCheckData(undefined);
            return;
          }

          const message = getErrorDescription(
            response.message || 'Failed to load API verification snapshot.',
            response.errors,
          );
          setServerErrorMessage(message);
          if (showToastOnFailure) {
            toast({
              title: 'Unable to load API checks',
              description: message,
              variant: 'destructive',
            });
          }
          return;
        }

        applyApiCheckData(response.data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unexpected error while loading API verification snapshot.';
        setServerErrorMessage(message);
        if (showToastOnFailure) {
          toast({
            title: 'Unable to load API checks',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        setSnapshotLoading(false);
      }
    },
    [applyApiCheckData, getErrorDescription, registrationId, toast],
  );

  useEffect(() => {
    setExpandedOutput({});
    void loadLatestSnapshot(false);
  }, [loadLatestSnapshot]);

  const runAllChecks = async () => {
    const previousResults = results;
    setServerErrorMessage('');
    setRunningAll(true);

    setResults((prev) => {
      const next = { ...prev };
      for (const target of API_TEST_TARGETS) {
        next[target.key] = {
          ...next[target.key],
          status: 'pending',
          connectivityStatus: 'pending',
          schemaStatus: 'pending',
          errorMessage: undefined,
        };
      }
      return next;
    });

    try {
      const response = await registrationService.checkHospitalRegistrationApis(registrationId, {
        api_names: API_TEST_TARGETS.map((target) => target.key),
        timeout_seconds: BULK_CHECK_TIMEOUT_SECONDS,
      });

      if (!response.success) {
        const message = getErrorDescription(
          response.message || 'Failed to run API verification.',
          response.errors,
        );
        setServerErrorMessage(message);
        setResults(previousResults);
        toast({
          title: 'API check failed',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      applyApiCheckData(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error while running API checks.';
      setServerErrorMessage(message);
      setResults(previousResults);
      toast({
        title: 'API check failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setRunningAll(false);
    }
  };

  const runSingleCheck = async (apiName: VisibleRegistrationApiName) => {
    const previousResult = results[apiName];
    setServerErrorMessage('');
    setRunningChecks((prev) => ({ ...prev, [apiName]: true }));
    setResults((prev) => ({
      ...prev,
      [apiName]: {
        ...prev[apiName],
        status: 'pending',
        connectivityStatus: 'pending',
        schemaStatus: 'pending',
        errorMessage: undefined,
      },
    }));

    try {
      const response = await registrationService.checkHospitalRegistrationApi(registrationId, apiName, {
        timeout_seconds: SINGLE_CHECK_TIMEOUT_SECONDS,
      });

      if (!response.success) {
        const message = getErrorDescription(
          response.message || `Failed to verify ${apiName} API.`,
          response.errors,
        );
        setServerErrorMessage(message);
        setResults((prev) => ({
          ...prev,
          [apiName]: {
            ...previousResult,
            status: 'failed',
            connectivityStatus: 'failed',
            schemaStatus: 'not_checked',
            errorMessage: message,
            testedAt: new Date().toISOString(),
          },
        }));
        toast({
          title: `Unable to check ${apiName}`,
          description: message,
          variant: 'destructive',
        });
        return;
      }

      applyApiCheckData(response.data, { mode: 'merge', mergeApiNames: [apiName] });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unexpected error while checking ${apiName}.`;
      setServerErrorMessage(message);
      setResults((prev) => ({
        ...prev,
        [apiName]: {
          ...previousResult,
          status: 'failed',
          connectivityStatus: 'failed',
          schemaStatus: 'not_checked',
          errorMessage: message,
          testedAt: new Date().toISOString(),
        },
      }));
      toast({
        title: `Unable to check ${apiName}`,
        description: message,
        variant: 'destructive',
      });
    } finally {
      setRunningChecks((prev) => {
        const next = { ...prev };
        delete next[apiName];
        return next;
      });
    }
  };

  const toggleOutput = (apiName: VisibleRegistrationApiName) => {
    setExpandedOutput((prev) => ({ ...prev, [apiName]: !prev[apiName] }));
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ServerCog className="h-4 w-4" />
          API Verification Console
        </CardTitle>
        <CardDescription>
          Backend-driven verification and required-column diagnostics for Resources, Bed, Blood, Staff, and Sales APIs.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Checks are executed by platform backend endpoints and persisted for reloads.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Submitted API Base URL</Label>
            <Input value={submittedBaseUrl} readOnly placeholder="No API base URL submitted" />
          </div>
          <div className="space-y-1">
            <Label>Submitted Auth Type</Label>
            <Input value={submittedAuthType} readOnly />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <div className="text-muted-foreground">
            {latestCheckedAt ? `Last checked: ${new Date(latestCheckedAt).toLocaleString()}` : 'No stored API checks yet.'}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>Total: {typeof summary.total === 'number' ? summary.total : 'N/A'}</span>
            <span>Passed: {typeof summary.success === 'number' ? summary.success : 'N/A'}</span>
            <span>Failed: {typeof summary.failed === 'number' ? summary.failed : 'N/A'}</span>
            <span>Schema Failed: {typeof summary.schemaFailed === 'number' ? summary.schemaFailed : 'N/A'}</span>
            <span>Connectivity Failed: {typeof summary.connectivityFailed === 'number' ? summary.connectivityFailed : 'N/A'}</span>
          </div>
        </div>

        {serverErrorMessage ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {serverErrorMessage}
          </div>
        ) : null}

        {failedApiKeys.length > 0 ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            Failed APIs: {failedApiKeys.join(', ')}
          </div>
        ) : null}

        {schemaFailedApiKeys.length > 0 ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            Schema Failed APIs: {schemaFailedApiKeys.join(', ')}
          </div>
        ) : null}

        {connectivityFailedApiKeys.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Connectivity Failed APIs: {connectivityFailedApiKeys.join(', ')}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void loadLatestSnapshot(true)} disabled={anyRunning}>
            {snapshotLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh Saved Results
          </Button>

          <Button type="button" variant="outline" onClick={runAllChecks} disabled={anyRunning}>
            {runningAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Check All APIs
          </Button>
        </div>

        <div className="space-y-3">
          {API_TEST_TARGETS.map((target) => {
            const result = results[target.key] || initialResult();
            const isRunning = Boolean(runningChecks[target.key]);
            const canShowOutput = result.status !== 'not_tested' || result.connectivityStatus !== 'not_tested' || result.schemaStatus !== 'not_tested';
            const noRowsForItems = isNoRowsStatus(result.columnValidation.itemStatus);

            return (
              <div key={target.key} className="rounded-lg border p-3 space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-sm">{target.label}</p>
                      {statusBadge('Overall', result.status)}
                      {statusBadge('Connectivity', result.connectivityStatus)}
                      {statusBadge('Schema', result.schemaStatus)}
                      {result.schemaFailureByMissingRequiredColumns ? (
                        <Badge variant="outline" className="border-rose-300 bg-rose-100 text-rose-900">
                          Schema Failed: Missing Required Columns
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Backend endpoint: POST /api/v1/admin/hospital-registrations/{registrationId}/check-api/{target.key}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => runSingleCheck(target.key)} disabled={anyRunning}>
                      {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                      {result.status === 'failed' ? 'Retry' : 'Check API'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleOutput(target.key)}
                      disabled={!canShowOutput}
                    >
                      {expandedOutput[target.key] ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                      {expandedOutput[target.key] ? 'Hide Output' : 'Show Output'}
                    </Button>
                  </div>
                </div>

                {expandedOutput[target.key] && canShowOutput ? (
                  <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                    <div className="rounded-md border bg-background p-3 space-y-2">
                      <p className="text-xs font-medium">Connectivity Diagnostics</p>
                      <div className="grid gap-2 text-xs md:grid-cols-2">
                        <p>
                          <span className="font-medium">Connectivity Status:</span> {statusText(result.connectivityStatus)}
                        </p>
                        <p>
                          <span className="font-medium">HTTP Status:</span>{' '}
                          {typeof result.statusCode === 'number' ? result.statusCode : 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">Response Time:</span>{' '}
                          {typeof result.responseTimeMs === 'number' ? `${result.responseTimeMs} ms` : 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">Checked At:</span>{' '}
                          {result.testedAt ? new Date(result.testedAt).toLocaleString() : 'N/A'}
                        </p>
                      </div>

                      {result.errorMessage ? (
                        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                          Error: {result.errorMessage}
                        </div>
                      ) : null}

                      {result.attemptedUrls && result.attemptedUrls.length > 0 ? (
                        <div className="rounded-md border bg-background px-3 py-2 text-xs">
                          <p className="font-medium mb-1">Attempted URLs</p>
                          <ul className="space-y-1">
                            {result.attemptedUrls.map((attemptedUrl) => (
                              <li key={attemptedUrl} className="break-all text-muted-foreground">
                                {attemptedUrl}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-md border bg-background p-3 space-y-3">
                      <p className="text-xs font-medium">Required Columns</p>

                      <div className="grid gap-2 text-xs md:grid-cols-2">
                        <p>
                          <span className="font-medium">Schema Status:</span> {statusText(result.schemaStatus)}
                        </p>
                        <p>
                          <span className="font-medium">Columns OK:</span>{' '}
                          {typeof result.columnValidation.columnsOk === 'boolean'
                            ? result.columnValidation.columnsOk ? 'Yes' : 'No'
                            : 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">Additional Columns Allowed:</span>{' '}
                          {typeof result.columnValidation.additionalColumnsAllowed === 'boolean'
                            ? result.columnValidation.additionalColumnsAllowed ? 'Yes' : 'No'
                            : 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">Raw Backend Status:</span> {result.rawStatus || 'N/A'}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium">Container Required Alternative Groups</p>
                        {renderColumnGroups(
                          result.columnValidation.containerRequiredGroups,
                          'No container required groups returned.',
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-rose-700">Container Missing Required Groups</p>
                        {renderColumnGroups(
                          result.columnValidation.containerMissingRequiredGroups,
                          'No missing container groups.',
                          true,
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium">Container Present Columns</p>
                        <p className="text-xs text-muted-foreground">
                          {result.columnValidation.containerPresentColumns.length > 0
                            ? result.columnValidation.containerPresentColumns.join(', ')
                            : 'No container present-columns reported.'}
                        </p>
                      </div>

                      <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 space-y-1">
                        <p className="text-xs font-medium text-sky-900">Additional Columns (Informational)</p>
                        <p className="text-xs text-sky-900">
                          {result.columnValidation.containerAdditionalColumns.length > 0
                            ? result.columnValidation.containerAdditionalColumns.join(', ')
                            : 'No additional container columns.'}
                        </p>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                        <p className="text-xs font-medium">Item-Level Validation</p>
                        <div className="grid gap-2 text-xs md:grid-cols-2">
                          <p>
                            <span className="font-medium">Checked:</span>{' '}
                            {typeof result.columnValidation.itemChecked === 'boolean'
                              ? result.columnValidation.itemChecked ? 'Yes' : 'No'
                              : 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium">Item Status:</span>{' '}
                            {result.columnValidation.itemStatus || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium">Columns OK:</span>{' '}
                            {typeof result.columnValidation.itemColumnsOk === 'boolean'
                              ? result.columnValidation.itemColumnsOk ? 'Yes' : 'No'
                              : 'N/A'}
                          </p>
                        </div>

                        {noRowsForItems ? (
                          <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                            Item-level schema check was not checked due to no rows in backend sample data.
                          </div>
                        ) : null}

                        <div className="space-y-1">
                          <p className="text-xs font-medium">Item Required Alternative Groups</p>
                          {renderColumnGroups(
                            result.columnValidation.itemRequiredGroups,
                            'No item required groups returned.',
                          )}
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-rose-700">Item Missing Required Groups</p>
                          {renderColumnGroups(
                            result.columnValidation.itemMissingRequiredGroups,
                            'No missing item groups.',
                            true,
                          )}
                        </div>

                        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 space-y-1">
                          <p className="text-xs font-medium text-sky-900">Item Additional Columns (Informational)</p>
                          <p className="text-xs text-sky-900">
                            {result.columnValidation.itemAdditionalColumns.length > 0
                              ? result.columnValidation.itemAdditionalColumns.join(', ')
                              : 'No additional item columns.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default RegistrationApiTestConsole;
