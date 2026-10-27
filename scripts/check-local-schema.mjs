import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

// Read metadata only. Schema changes remain a separate, explicit operation.
try {
  const [configPath, container] = process.argv.slice(2)
  if (!configPath || container !== 'longbeach-perfis-test') throw new Error('Informe a configuração e o contêiner da prévia local.')
  const env = parseEnv(readFileSync(configPath, 'utf8'))
  const connection = env.ConnectionStrings__LongBeach ?? ''
  // Parse quoted values without evaluating shell or exposing the connection.
  const fields = new Map()
  let start = 0
  let quote = ''
  for (let index = 0; index <= connection.length; index++) {
    const character = connection[index]
    if (quote && character === quote && connection[index + 1] === quote) { index++; continue }
    if (character === quote) quote = ''
    else if (!quote && (character === '"' || character === "'")) {
      const prefix = connection.slice(start, index)
      const equal = prefix.indexOf('=')
      if (equal >= 0 && !prefix.slice(equal + 1).trim()) quote = character
    }
    if ((!quote && character === ';') || index === connection.length) {
      const entry = connection.slice(start, index)
      const equal = entry.indexOf('=')
      if (equal > 0) {
        const key = entry.slice(0, equal).trim().toLowerCase()
        if (fields.has(key) || ['server', 'db', 'user name', 'userid', 'user id', 'uid'].includes(key)) {
          throw new Error('Use Host, Port, Database e Username uma única vez, sem aliases de conexão.')
        }
        fields.set(key, entry.slice(equal + 1).trim().replace(/^(["'])(.*)\1$/, '$2'))
      }
      start = index + 1
    }
  }
  const username = fields.get('username')
  if (quote || !['localhost', '127.0.0.1'].includes(fields.get('host')) || fields.get('port') !== '55439'
    || fields.get('database') !== 'longbeach_profiles_preview' || !/^[a-z_][a-z0-9_]*$/i.test(username ?? '')) {
    throw new Error('A conferência aceita somente a configuração da prévia local.')
  }
  const docker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim()
  const label = docker(['inspect', '--format', '{{index .Config.Labels "com.longbeach.environment"}}', container])
  if (label !== 'homologacao-local') throw new Error('O contêiner não tem a identificação da prévia local.')
  const ports = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]))
  if (!ports['5432/tcp']?.some(binding => ['127.0.0.1', '::1'].includes(binding.HostIp) && binding.HostPort === '55439')) {
    throw new Error('O contêiner da prévia deve publicar PostgreSQL em loopback na porta 55439.')
  }
  const applied = new Set(docker(['exec', container, 'psql', '-X', '-qAt', '--no-password', '-U', username,
    '-d', 'longbeach_profiles_preview', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY "MigrationId";']).split('\n').filter(Boolean))
  const directory = fileURLToPath(new URL('../backend/src/LongBeach.Infrastructure/Persistence/Migrations/', import.meta.url))
  const expected = new Set(readdirSync(directory).filter(name => /^\d{14}_.+\.cs$/.test(name) && !name.endsWith('.Designer.cs')).map(name => name.slice(0, -3)))
  const pending = [...expected].filter(name => !applied.has(name)).sort()
  const extra = [...applied].filter(name => !expected.has(name)).sort()
  if (pending.length || extra.length) {
    console.error(`A prévia precisa de conferência de schema: ${pending.length} migrations pendentes, ${extra.length} extras.`)
    for (const name of pending) console.error(`Pendente: ${name}`)
    for (const name of extra) console.error(`Extra: ${name}`)
    console.error('Nenhuma migration foi aplicada. Consulte docs/operacao/estrutura-local.md antes de atualizar o banco.')
    process.exitCode = 2
  } else console.log(`Schema da prévia conferido: ${expected.size} migrations, sem mudanças no banco.`)
} catch (error) {
  // Child-process errors may contain runtime details; never print config or env.
  console.error(error?.status !== undefined ? 'Não foi possível consultar o schema da prévia local.' : error.message)
  process.exitCode = 1
}
