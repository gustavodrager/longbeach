import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('./check-local-schema.mjs', import.meta.url))
const migrations = readdirSync(new URL('../backend/src/LongBeach.Infrastructure/Persistence/Migrations/', import.meta.url))
  .filter(name => /^\d{14}_.+\.cs$/.test(name) && !name.endsWith('.Designer.cs')).map(name => name.slice(0, -3))
const local = 'Host=127.0.0.1;Port=55439;Database=longbeach_profiles_preview;Username=fixture;Password=synthetic'

function check(connection = local, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'longbeach-schema-guard-'))
  try {
    const config = join(directory, 'local.env')
    writeFileSync(config, `ConnectionStrings__LongBeach=${JSON.stringify(connection)}\n`, { mode: 0o600 })
    writeFileSync(join(directory, 'docker'), `#!${process.execPath}\nconst args=process.argv.slice(2);if(args[0]==='inspect')console.log(args[2].includes('Ports')?process.env.FAKE_PORTS:process.env.FAKE_LABEL);else if(args[0]==='exec')console.log(process.env.FAKE_MIGRATIONS);else process.exit(90);\n`, { mode: 0o700 })
    return spawnSync(process.execPath, [script, config, 'longbeach-perfis-test'], {
      encoding: 'utf8', env: { ...process.env, PATH: directory, FAKE_LABEL: options.label ?? 'homologacao-local',
        FAKE_PORTS: JSON.stringify({ '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: options.port ?? '55439' }] }),
        FAKE_MIGRATIONS: (options.applied ?? migrations).join('\n') },
    })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('schema alinhado aceita configuração local com senha delimitada', () => {
  const result = check(local.replace('Password=synthetic', 'Password="synthetic;quoted=value"'))
  assert.equal(result.status, 0, result.stderr)
})

test('schema pendente bloqueia a inicialização sem executar migration', () => {
  const result = check(local, { applied: migrations.slice(1) })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /1 migrations pendentes/)
  assert.match(result.stderr, /Nenhuma migration foi aplicada/)
})

test('aliases de destino e campos duplicados não passam como conexão local', () => {
  for (const suffix of [';Server=remote.invalid', ';DB=other', ';host=remote.invalid', ';User ID=other']) {
    const result = check(local + suffix)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /sem aliases/)
    assert.doesNotMatch(result.stderr, /remote\.invalid|synthetic/)
  }
})

test('destino remoto, label ou publicação de porta divergente são recusados', () => {
  for (const result of [check(local.replace('127.0.0.1', 'remote.invalid')), check(local, { label: 'other' }), check(local, { port: '5432' })]) {
    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stderr, /remote\.invalid|synthetic/)
  }
})
