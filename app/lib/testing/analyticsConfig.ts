import {
  ANALYTICS_EVENT_CONFIG_MAP,
  DEFAULT_ANALYTICS_TRACKING_CONFIG,
  type AnalyticsEventName,
  type AnalyticsTrackingConfig,
} from '@/constants/analyticsEvents';
import { getSystemSetting, setSystemSetting } from '@/utils/dbHelpers';

export const ANALYTICS_TRACKING_CONFIG_KEY = 'analyticsTrackingConfig';
export const SYSTEM_TEST_RESULTS_KEY = 'systemTestResults';

export async function getAnalyticsTrackingConfig(): Promise<AnalyticsTrackingConfig> {
  return getSystemSetting<AnalyticsTrackingConfig>(
    ANALYTICS_TRACKING_CONFIG_KEY,
    DEFAULT_ANALYTICS_TRACKING_CONFIG
  );
}

export async function saveAnalyticsTrackingConfig(
  config: AnalyticsTrackingConfig
): Promise<void> {
  await setSystemSetting(
    ANALYTICS_TRACKING_CONFIG_KEY,
    config,
    'Analytics tracking toggles for main user actions'
  );
}

export async function isAnalyticsEventEnabled(
  eventName: AnalyticsEventName | string
): Promise<boolean> {
  const config = await getAnalyticsTrackingConfig();
  if (!config.enabled) return false;

  const configKey = ANALYTICS_EVENT_CONFIG_MAP[eventName as AnalyticsEventName];
  if (!configKey) return true;
  return Boolean(config[configKey]);
}

export async function saveSystemTestResults(results: unknown): Promise<void> {
  await setSystemSetting(
    SYSTEM_TEST_RESULTS_KEY,
    { ranAt: new Date().toISOString(), results },
    'Latest manual system test run from admin panel'
  );
}

export async function getSystemTestResults(): Promise<{
  ranAt: string | null;
  results: unknown;
}> {
  const stored = await getSystemSetting<{ ranAt?: string; results?: unknown }>(
    SYSTEM_TEST_RESULTS_KEY,
    {}
  );
  return {
    ranAt: stored.ranAt ?? null,
    results: stored.results ?? null,
  };
}
