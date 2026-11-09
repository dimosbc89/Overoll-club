/**
 * Runs the server call a console state is waiting for (`pendingRequest`) and
 * turns the answer into the action to dispatch. No React here, so the whole
 * loop (reducer → request → result) runs in the tests with a fake fetch.
 */
import type { ApiClient } from '../api';
import type { DeviceAuth } from './device';
import type { ConsoleAction, PendingRequest } from './machine';

export interface RunnerDeps {
  api: ApiClient;
  auth: DeviceAuth;
  /** Fresh id for a follow-up request (loading the device after sign-in). */
  newId: () => string;
}

function strip<T extends { ok: true }>(response: T): Omit<T, 'ok'> {
  const { ok: _ok, ...rest } = response;
  return rest;
}

async function run(request: PendingRequest, deps: RunnerDeps): Promise<ConsoleAction> {
  const requestId = request.id;
  switch (request.kind) {
    case 'loadDevice': {
      const result = await deps.auth.loadDevice();
      if (result.status === 'ready') return { type: 'device/loaded', requestId, context: result.context };
      if (result.status === 'signed-out') return { type: 'device/signedOut', requestId };
      if (result.status === 'no-store') return { type: 'device/noStore', requestId };
      return { type: 'device/loadFailed', requestId, error: result.code };
    }
    case 'sendCode': {
      const result = await deps.auth.sendCode(request.email);
      return result.ok ? { type: 'otp/sent', requestId } : { type: 'otp/failed', requestId, error: result.code };
    }
    case 'verifyCode': {
      const result = await deps.auth.verifyCode(request.email, request.code);
      return result.ok
        ? { type: 'otp/verified', requestId, loadRequestId: deps.newId() }
        : { type: 'otp/failed', requestId, error: result.code };
    }
    case 'verifyPin': {
      const { storeId, employeeId, pin } = request;
      const result = await deps.api.verifyPin({ storeId, employeeId, pin });
      return result.ok
        ? { type: 'pin/verified', requestId, employee: result.employee }
        : { type: 'pin/failed', requestId, error: result.code };
    }
    case 'scan': {
      const result = await deps.api.scan({ storeId: request.storeId, token: request.token });
      return result.ok
        ? { type: 'scan/succeeded', requestId, member: strip(result) }
        : { type: 'scan/failed', requestId, error: result.code };
    }
    case 'award': {
      const result = await deps.api.award(request.input);
      return result.ok
        ? { type: 'award/succeeded', requestId, result: strip(result) }
        : { type: 'award/failed', requestId, error: result.code };
    }
    case 'undo': {
      const result = await deps.api.undo(request.input);
      return result.ok
        ? { type: 'undo/succeeded', requestId, result: strip(result) }
        : { type: 'undo/failed', requestId, error: result.code };
    }
    case 'redeem': {
      const result = await deps.api.useRedemption(request.input);
      return result.ok
        ? { type: 'redeem/succeeded', requestId, result: strip(result) }
        : { type: 'redeem/failed', requestId, error: result.code };
    }
  }
}

/** The failure action for a request that threw (a bug or a broken network stack). */
function failure(request: PendingRequest, error: string): ConsoleAction {
  const requestId = request.id;
  switch (request.kind) {
    case 'loadDevice':
      return { type: 'device/loadFailed', requestId, error };
    case 'sendCode':
    case 'verifyCode':
      return { type: 'otp/failed', requestId, error };
    case 'verifyPin':
      return { type: 'pin/failed', requestId, error };
    case 'scan':
      return { type: 'scan/failed', requestId, error };
    case 'award':
      return { type: 'award/failed', requestId, error };
    case 'undo':
      return { type: 'undo/failed', requestId, error };
    case 'redeem':
      return { type: 'redeem/failed', requestId, error };
  }
}

export async function runRequest(request: PendingRequest, deps: RunnerDeps): Promise<ConsoleAction> {
  try {
    return await run(request, deps);
  } catch (error) {
    console.error('console request failed', request.kind, error);
    return failure(request, 'network_error');
  }
}
