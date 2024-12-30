// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import assert from 'assert'
import { ROOM_STATUS } from '@/constants/status'
import type * as Party from 'partykit/server'
import { type Ctx, type Game, PrimeDaifugoGame } from './game-rule'
import { GameParty } from './game-rule/game-party'
import type { PrimeDaifugoGameState } from './game-rule/game-state'
import { MessageManager } from './message-manager'
import { ServerMessenger } from './server-messenger'

export const messageHandler = new MessageManager({
  onChat: (room, message, sender) => {
    ServerMessenger.broadcastMessage({
      room,
      message: message,
      from: sender.id,
    })
  },

  onSetName: (room, name, sender) => {
    assert(sender.state)
    sender.setState({ ...sender.state, name: name })
    ServerMessenger.broadcastPresence({ room })
  },

  onSetReady: (room, sender) => {
    assert(sender.state)
    sender.setState({ ...sender.state, status: 'ready' })
    ServerMessenger.broadcastPresence({ room })
  },

  onUnsetReady: (room, sender) => {
    assert(sender.state)
    sender.setState({ ...sender.state, status: 'not-ready' })
    ServerMessenger.broadcastPresence({ room })
  },

  onStartGame: async (room, sender) => {
    assert(sender.state)
    await room.storage.put('roomStatus', ROOM_STATUS.playing)
    const party = new GameParty({
      game: PrimeDaifugoGame,
      playerIds: Array.from(room.getConnections()).map((conn) => conn.id),
    })

    await room.storage.put('gameState', party.getState())
    await room.storage.put('gameCtx', party.ctx)
    ServerMessenger.broadcastSystemEvent({
      room,
      content: {
        event: 'system',
        action: 'game-start',
        gameState: party.getState(),
        ctx: party.ctx,
        commander: {
          id: sender.id,
          name: sender.state.name,
        },
      },
    })
    ServerMessenger.broadcastRoomStatus({ room, status: ROOM_STATUS.playing })
  },

  onDraw: async (room, sender) => {
    partyStorageMiddleware(room, (party) => {
      assert(sender.state)
      party.moves.draw(sender.id)
      party.ctx
      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'draw',
          gameState: party.getState(),
          ctx: party.ctx,
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
        },
      })
    })
  },

  onPass: async (room, sender) => {
    partyStorageMiddleware(room, (party) => {
      assert(sender.state)
      party.moves.pass(sender.id)
      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'pass',
          gameState: party.getState(),
          ctx: party.ctx,
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
        },
      })
    })
  },

  onSubmit: async (room, sender, submitCardSet) => {
    partyStorageMiddleware(room, (party) => {
      assert(sender.state)
      party.moves.submit(sender.id, submitCardSet)
      ServerMessenger.broadcastSystemEvent({
        room,
        content: {
          event: 'system',
          action: 'submit',
          gameState: party.getState(),
          ctx: party.ctx,
          commander: {
            id: sender.id,
            name: sender.state.name,
          },
          submissionResult: {
            submitCardSet: submitCardSet,
            result: party.getState().deckTopPlayer === sender.id ? 'success' : 'failure',
          },
        },
      })
    })
  },
})

const partyStorageMiddleware = async (
  room: Party.Room,
  callback: (party: GameParty<Game<PrimeDaifugoGameState>>) => void,
) => {
  const gameState = await room.storage.get<PrimeDaifugoGameState>('gameState')
  const gameCtx = await room.storage.get<Ctx>('gameCtx')
  assert(gameState)
  assert(gameCtx)

  const party = new GameParty({
    game: PrimeDaifugoGame,
    activePlayers: gameCtx.activePlayers,
    currentPlayer: gameCtx.currentPlayer,
    playOrder: gameCtx.playOrder,
    state: gameState,
  })

  callback(party)

  await room.storage.put('gameState', party.getState())
  await room.storage.put('gameCtx', party.ctx)
}
