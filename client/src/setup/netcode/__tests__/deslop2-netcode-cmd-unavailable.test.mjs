import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  emitCmd,
  getClientSeq,
  resetClientSeq,
  setCommandsModuleLoaderForTests,
} from '../cmd-emitter.js';
import * as commands from '../../../../../shared/engine/commands.mjs';

afterEach(() => {
  setCommandsModuleLoaderForTests(null);
  resetClientSeq(0);
});

const socketWithLog = () => {
  const emitted = [];
  return { emitted, emit: (event, data) => emitted.push({ event, data }) };
};

test('emitCmd refuses to send when the shared commands module cannot be loaded', async () => {
  setCommandsModuleLoaderForTests(async () => null);
  const socket = socketWithLog();
  const result = await emitCmd({ socket, roomId: 'r1', type: 'pass', payload: {} });
  assert.deepEqual(result, { success: false, error: 'commands_module_unavailable' });
  assert.equal(socket.emitted.length, 0);
  assert.equal(getClientSeq(), 0, 'a refused command does not spend a sequence number');
});

test('emitCmd refuses when the module has a validator but no protocol version', async () => {
  setCommandsModuleLoaderForTests(async () => ({
    validateCommandShape: commands.validateCommandShape,
  }));
  const socket = socketWithLog();
  const result = await emitCmd({ socket, roomId: 'r1', type: 'pass', payload: {} });
  assert.equal(result.error, 'commands_module_unavailable');
  assert.equal(socket.emitted.length, 0);
});

test('emitCmd sends with the protocol version when the module loads', async () => {
  const socket = socketWithLog();
  const result = await emitCmd({ socket, roomId: 'r1', type: 'pass', payload: {} });
  assert.equal(result.success, true);
  assert.equal(socket.emitted[0].data.protocolVersion, commands.PROTOCOL_VERSION);
});
