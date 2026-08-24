import { access, readFile } from 'node:fs/promises'

const requiredFiles = [
  '.env.example',
  'package-lock.json',
  'public/manifest.json',
  'public/sw.js',
  'scripts/build-service-worker.mjs',
  'docs/DISASTER_RECOVERY.md',
  'supabase-secure-rls-v2.sql',
  'supabase-bank-snapshots.sql',
  'supabase-accounting-ledger.sql',
  'supabase-mastercard-ledger.sql',
  'supabase-protected-settings.sql',
]

const requiredEnvironmentVariables = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_HOUSEHOLD_ID',
]

const failures = []

for (const file of requiredFiles) {
  try {
    await access(file)
  } catch {
    failures.push(`Fichier indispensable absent : ${file}`)
  }
}

try {
  const example = await readFile('.env.example', 'utf8')
  for (const variable of requiredEnvironmentVariables) {
    if (!new RegExp(`^${variable}=`, 'm').test(example)) {
      failures.push(`Variable absente de .env.example : ${variable}`)
    }
  }
} catch {
  // L'absence du fichier est déjà signalée ci-dessus.
}

if (failures.length) {
  console.error('Vérification de reprise échouée :')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Plan de reprise vérifié : ${requiredFiles.length} fichiers et ${requiredEnvironmentVariables.length} variables documentés.`)
}
