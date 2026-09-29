/**
 * Shared constants for the jeeves-runner OpenClaw plugin.
 *
 * @module constants
 */

/** Plugin identifier used for config resolution and error guidance. */
export const PLUGIN_ID = 'jeeves-runner-openclaw';

/** Environment variable consulted when `configRoot` is absent from plugin config. */
export const CONFIG_ROOT_ENV_VAR = 'JEEVES_CONFIG_ROOT';

/** Tool error returned when a tool needing `configRoot` runs before it is set. */
export const CONFIG_ROOT_MISSING_MESSAGE = `configRoot not configured — set it in plugin config (plugins.entries.${PLUGIN_ID}.config.configRoot) or via the ${CONFIG_ROOT_ENV_VAR} env var`;

/** Warning logged once at registration when `configRoot` is not yet set. */
export const CONFIG_ROOT_UNSET_WARNING = `[${PLUGIN_ID}] configRoot not configured yet — tools that need it will be unavailable until it is set in plugin config or ${CONFIG_ROOT_ENV_VAR}`;
