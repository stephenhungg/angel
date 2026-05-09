/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentState from "../agentState.js";
import type * as crons from "../crons.js";
import type * as discord_functions from "../discord/functions.js";
import type * as discord_interactions from "../discord/interactions.js";
import type * as discord_orchestrator from "../discord/orchestrator.js";
import type * as http from "../http.js";
import type * as memoryMirror from "../memoryMirror.js";
import type * as observability from "../observability.js";
import type * as sms_functions from "../sms/functions.js";
import type * as sms_index from "../sms/index.js";
import type * as sms_orchestrator from "../sms/orchestrator.js";
import type * as sms_sendblue from "../sms/sendblue.js";
import type * as sms_twilio from "../sms/twilio.js";
import type * as tasks from "../tasks.js";
import type * as turns from "../turns.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentState: typeof agentState;
  crons: typeof crons;
  "discord/functions": typeof discord_functions;
  "discord/interactions": typeof discord_interactions;
  "discord/orchestrator": typeof discord_orchestrator;
  http: typeof http;
  memoryMirror: typeof memoryMirror;
  observability: typeof observability;
  "sms/functions": typeof sms_functions;
  "sms/index": typeof sms_index;
  "sms/orchestrator": typeof sms_orchestrator;
  "sms/sendblue": typeof sms_sendblue;
  "sms/twilio": typeof sms_twilio;
  tasks: typeof tasks;
  turns: typeof turns;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
