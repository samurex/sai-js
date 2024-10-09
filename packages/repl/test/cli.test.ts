import type * as CliApp from '@effect/cli/CliApp';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import { describe, expect, it, vi } from 'vitest';
import * as MockConsole from './services/MockConsole';
import * as MockTerminal from './services/MockTerminal';
import { mainPrompt, SessionManager } from '../cli';
import { AuthorizationAgent } from '@janeirodigital/interop-authorization-agent';

const addSocialAgentRegistration = vi.fn();

const SessionManagerMock = Layer.succeed(
  SessionManager,
  SessionManager.of({
    getSession: () =>
      Effect.succeed({
        registrySet: {
          hasAgentRegistry: {
            addSocialAgentRegistration
          }
        }
      } as unknown as AuthorizationAgent)
  })
);

const MainLive = Effect.gen(function* () {
  const console = yield* MockConsole.make;
  return Layer.mergeAll(Console.setConsole(console), NodeFileSystem.layer, MockTerminal.layer, NodePath.layer);
}).pipe(Layer.unwrapEffect);

const runEffect = <E, A>(self: Effect.Effect<A, E, CliApp.CliApp.Environment>): Promise<A> =>
  Effect.provide(self, MainLive).pipe(Effect.runPromise);

describe('cli', () => {
  describe('mainPrompt', () => {
    it('should generate data registration', () =>
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(Effect.provide(mainPrompt, SessionManagerMock));
        // select first account
        yield* MockTerminal.inputKey('enter');
        // select first action
        yield* MockTerminal.inputKey('enter');
        yield* MockTerminal.inputText('https://example.com/webid');
        yield* MockTerminal.inputKey('enter');
        yield* MockTerminal.inputText('alice');
        yield* MockTerminal.inputKey('enter');
        // note is empty
        yield* MockTerminal.inputKey('enter');

        yield* Fiber.join(fiber);

        expect(addSocialAgentRegistration).toHaveBeenCalledWith('https://example.com/webid', 'alice', '');
      }).pipe(runEffect));
  });
});
