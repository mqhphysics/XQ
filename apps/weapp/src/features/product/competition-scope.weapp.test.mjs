import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
const catalog = {
  seasons: [
    { id: 'real', isDemo: false },
    { id: 'demo', isDemo: true },
  ],
  competitions: [
    { id: 'm', gender: 'MALE' },
    { id: 'w', gender: 'FEMALE' },
  ],
  tournaments: [
    {
      id: 'men',
      seasonId: 'real',
      competitionDefinitionId: 'm',
      name: '男足',
      status: 'PUBLISHED',
    },
    {
      id: 'women',
      seasonId: 'real',
      competitionDefinitionId: 'w',
      name: '女足',
      status: 'PUBLISHED',
    },
    {
      id: 'old-demo',
      seasonId: 'demo',
      competitionDefinitionId: 'm',
      name: '演示',
      status: 'PUBLISHED',
    },
  ],
}
function subject(linkedPlayer, isWomen) {
  const module = { exports: {} }
  const code = ts.transpileModule(
    readFileSync(new URL('./competition-scope.weapp.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    Set,
    require: (name) =>
      name.includes('campus.repository')
        ? { campusRepository: { catalog: async () => catalog } }
        : name === './session'
          ? { readSession: () => ({ user: { linkedPlayer } }) }
          : {
              productRepository: {
                getPlayer: async () =>
                  isWomen
                    ? { rosterSource: 'OFFICIAL_SNAPSHOT', tournamentName: '女足' }
                    : { rosterSource: 'TEAM_MEMBERSHIP', tournamentName: null },
              },
            },
  })
  return module.exports
}
test('all schedules include both real competitions and exclude demo seasons', () => {
  const api = subject(null, false)
  assert.deepEqual(
    Array.from(api.realTournaments(catalog), (item) => item.id),
    ['men', 'women'],
  )
})
test('data defaults use confirmed women player participation; ordinary users and other players use men', async () => {
  assert.equal(await subject(null, false).viewerDataTournament(), 'men')
  assert.equal(await subject({ id: 'male-player' }, false).viewerDataTournament(), 'men')
  assert.equal(await subject({ id: 'women-player' }, true).viewerDataTournament(), 'women')
})
